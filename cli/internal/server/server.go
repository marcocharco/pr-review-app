package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"github.com/marcocharco/pr-review-app/cli/internal/collect"
	"github.com/marcocharco/pr-review-app/cli/internal/github"
	"github.com/marcocharco/pr-review-app/cli/internal/lsp"
	"github.com/marcocharco/pr-review-app/cli/internal/types"
)

type Server struct {
	BaseURL string
	srv     *http.Server
}

type (
	SessionGenerator func(context.Context) (types.Session, error)
	CommentPoster    func(context.Context, github.CommentRequest) (*github.PRComment, error)
)

// Start serves the given session at /session and the static web assets from frontendFS at /.
// If devMode is true, uses a fixed port (8080) for easier Vite proxying.
func Start(ctx context.Context, generator SessionGenerator, poster CommentPoster, frontendFS fs.FS, devMode bool) (*Server, error) {
	var session types.Session
	var sessionMu sync.RWMutex

	// Generate session once and store it
	s, err := generator(ctx)
	if err != nil {
		return nil, err
	}
	session = s

	mux := http.NewServeMux()

	// CORS middleware helper
	withCORS := func(h http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if devMode {
				w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				if r.Method == "OPTIONS" {
					w.WriteHeader(http.StatusOK)
					return
				}
			}
			h(w, r)
		}
	}

	mux.HandleFunc("/session", withCORS(func(w http.ResponseWriter, r *http.Request) {
		sessionMu.RLock()
		defer sessionMu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(session)
	}))

	mux.HandleFunc("/refresh", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		newSession, err := generator(r.Context())
		if err != nil {
			http.Error(w, fmt.Sprintf("failed to refresh session: %v", err), http.StatusInternalServerError)
			return
		}

		sessionMu.Lock()
		session = newSession
		sessionMu.Unlock()

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(session)
	}))

	mux.HandleFunc("/analyze", withCORS(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req struct {
			Filename string `json:"filename"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		sessionMu.RLock()
		currentSession := session
		sessionMu.RUnlock()

		// Find the file in the session
		var targetFiles []types.FileDiff
		if req.Filename == "" {
			targetFiles = currentSession.Files
		} else {
			for _, f := range currentSession.Files {
				if f.Path == req.Filename {
					targetFiles = append(targetFiles, f)
					break
				}
			}
		}

		var results []types.FileDiff
		for _, f := range targetFiles {
			// Parse patch
			changedLines, err := collect.ParsePatch(f.Patch)
			if err != nil || len(changedLines) == 0 {
				continue
			}

			// Read content
			content, err := os.ReadFile(filepath.Join(currentSession.Repo.Root, f.Path))
			if err != nil {
				continue
			}

			// Analyze
			spans, err := collect.AnalyzeFile(r.Context(), f.Path, content, changedLines)
			if err != nil {
				continue
			}

			// Find references
			spans, err = lsp.FindReferences(r.Context(), currentSession.Repo.Root, spans, f.Path)
			if err != nil {
				log.Printf("LSP error for %s: %v", f.Path, err)
			} else {
				log.Printf("Found %d spans with references for %s", len(spans), f.Path)
			}

			f.ChangedSpans = spans
			results = append(results, f)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(results)
	}))

	mux.HandleFunc("/comments", func(w http.ResponseWriter, r *http.Request) {
		if devMode {
			w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
			w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
		}

		if r.Method != http.MethodPost {
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req github.CommentRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}

		comment, err := poster(r.Context(), req)
		if err != nil {
			status := http.StatusInternalServerError
			if strings.Contains(err.Error(), "403") || strings.Contains(err.Error(), "Forbidden") {
				status = http.StatusForbidden
			}
			http.Error(w, err.Error(), status)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		_ = json.NewEncoder(w).Encode(comment)
	})

	if frontendFS != nil {
		// Serve static files from the embedded frontend filesystem
		fileServer := http.FileServer(http.FS(frontendFS))
		mux.Handle("/", fileServer)
	} else if !devMode {
		// In production without frontend, return 404 for root
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			http.NotFound(w, r)
		})
	}

	var addr string
	if devMode {
		addr = "127.0.0.1:8080"
	} else {
		addr = "127.0.0.1:0"
	}

	ln, err := net.Listen("tcp", addr)
	if err != nil {
		return nil, err
	}

	srv := &http.Server{Handler: mux}
	go func() {
		if devMode {
			log.Printf("API server listening on %s", addr)
		}
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("server error: %v", err)
		}
	}()

	go func() {
		<-ctx.Done()
		_ = srv.Shutdown(context.Background())
	}()

	return &Server{
		BaseURL: fmt.Sprintf("http://%s", ln.Addr().String()),
		srv:     srv,
	}, nil
}
