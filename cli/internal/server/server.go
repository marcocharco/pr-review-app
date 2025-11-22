package server

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
)

type Server struct {
	BaseURL string
	srv     *http.Server
}

func Start(ctx context.Context) (*Server, error) {
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		msg := "Diff session service is running"
		_, _ = w.Write([]byte(msg))
	})

	srv := &http.Server{Handler: mux, Addr: "8080"}
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Printf("server error: %v", err)
		}
	}()

	go func() {
		<-ctx.Done()
		_ = srv.Shutdown(context.Background())
	}()

	return &Server{
		BaseURL: fmt.Sprintf("http://%s", srv.Addr),
		srv:     srv,
	}, nil
}
