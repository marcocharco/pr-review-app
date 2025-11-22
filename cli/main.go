package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/marcocharco/pr-review-app/cli/internal/auth"
	"github.com/marcocharco/pr-review-app/cli/internal/browser"
	"github.com/marcocharco/pr-review-app/cli/internal/server"
)

var osInterruptSignals = []os.Signal{syscall.SIGINT, syscall.SIGTERM}

func main() {
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Printf("warning: load .env: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), osInterruptSignals...)
	defer stop()

	// Check for existing auth config
	config, err := auth.LoadConfig()
	if err != nil {
		log.Printf("warning: failed to load config: %v", err)
	}

	if config == nil || config.AccessToken == "" {
		fmt.Println("No access token found. Starting OAuth flow...")
		config, err = auth.Authenticate(ctx)
		if err != nil {
			log.Fatalf("authentication failed: %v", err)
		}
		if err := auth.SaveConfig(config); err != nil {
			log.Printf("warning: failed to save config: %v", err)
		}
		fmt.Printf("Logged in as %s\n", config.User)
	} else {
		fmt.Printf("Logged in as %s\n", config.User)
	}
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
