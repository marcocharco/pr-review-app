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
func Start(ctx context.Context, generator SessionGenerator, frontendFS fs.FS) (*Server, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("/session", func(w http.ResponseWriter, r *http.Request) {
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
	}

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return nil, err
	}

	srv := &http.Server{Handler: mux}
	go func() {
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
