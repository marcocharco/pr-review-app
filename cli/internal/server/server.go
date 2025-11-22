package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"

	"github.com/marcocharco/pr-review-app/cli/internal/types"
)

type Server struct {
	BaseURL string
	srv     *http.Server
}

// Start serves the given session at /session and a placeholder at /.
func Start(ctx context.Context, session types.Session) (*Server, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("/session", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(session)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		msg := "Diff session service is running. Viewer assets not yet wired; fetch /session."
		_, _ = w.Write([]byte(msg))
	})

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
