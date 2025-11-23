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

	"github.com/marcocharco/pr-review-app/cli/internal/types"
)

type Server struct {
	BaseURL string
	srv     *http.Server
}

type SessionGenerator func(context.Context) (types.Session, error)

// Start serves the given session at /session and the static web assets from frontendFS at /.
// If devMode is true, uses a fixed port (8080) for easier Vite proxying.
func Start(ctx context.Context, generator SessionGenerator, frontendFS fs.FS, devMode bool) (*Server, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("/session", func(w http.ResponseWriter, r *http.Request) {
		// Add CORS headers for dev mode
		if devMode {
			w.Header().Set("Access-Control-Allow-Origin", "http://localhost:5173")
			w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

			// Handle preflight requests
			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}
		}

		session, err := generator(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(session)
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
