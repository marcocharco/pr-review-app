package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/marcocharco/pr-review-app/cli/internal/browser"
	"github.com/marcocharco/pr-review-app/cli/internal/server"
)

var osInterruptSignals = []os.Signal{syscall.SIGINT, syscall.SIGTERM}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), osInterruptSignals...)
	defer stop()

	srv, err := server.Start(ctx)
	if err != nil {
		log.Fatalf("failed to start server: %v", err)
	}

	url := srv.BaseURL + "/view"
	log.Printf("session ready: %s", url)
	if err := browser.Open(url); err != nil {
		log.Printf("warning: could not open browser automatically: %v", err)
	}

	<-ctx.Done()
}
