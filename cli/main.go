package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/marcocharco/pr-review-app/cli/internal/auth"
	"github.com/marcocharco/pr-review-app/cli/internal/browser"
	"github.com/marcocharco/pr-review-app/cli/internal/collect"
	"github.com/marcocharco/pr-review-app/cli/internal/server"
	"github.com/marcocharco/pr-review-app/cli/internal/types"
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

	var generator server.SessionGenerator
	if len(os.Args) > 1 {
		arg := os.Args[1]
		prNum, err := strconv.Atoi(arg)
		if err != nil {
			log.Fatalf("invalid PR number argument: %v", err)
		}

		generator = func(ctx context.Context) (types.Session, error) {
			fmt.Printf("Fetching PR #%d...\n", prNum)
			return collect.BuildPRSession(ctx, prNum, config.AccessToken)
		}
	} else {
		log.Fatal("Please provide a PR number as an argument.")
	}

	// Initial fetch to ensure it works
	session, err := generator(ctx)
	if err != nil {
		log.Fatalf("failed to build PR session: %v", err)
	}
	fmt.Printf("Loaded %d files from PR.\n", len(session.Files))

	// Look for frontend/dist relative to the current working directory
	// Assuming we are running from the root or cli/ folder
	webDir := "../frontend/dist"
	if _, err := os.Stat(webDir); os.IsNotExist(err) {
		// Try current directory (if running from root and dist is moved?)
		// Or maybe we are in root and frontend/dist is there
		if _, err := os.Stat("frontend/dist"); err == nil {
			webDir = "frontend/dist"
		} else {
			log.Printf("warning: frontend build not found at %s. Please run 'npm run build' in frontend/", webDir)
			webDir = ""
		}
	}

	srv, err := server.Start(ctx, generator, webDir)
	if err != nil {
		log.Fatalf("failed to start server: %v", err)
	}

	url := srv.BaseURL
	if err := browser.Open(url); err != nil {
		log.Printf("warning: could not open browser automatically: %v", err)
	}

	<-ctx.Done()
}
