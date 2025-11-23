package main

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
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

//go:embed embed/frontend/dist
var frontendFS embed.FS

var osInterruptSignals = []os.Signal{syscall.SIGINT, syscall.SIGTERM}

// getFrontendFS returns the embedded frontend filesystem, stripping the "embed/frontend/dist" prefix
func getFrontendFS() (fs.FS, error) {
	// The embed includes "embed/frontend/dist", so we need to strip that prefix
	distFS, err := fs.Sub(frontendFS, "embed/frontend/dist")
	if err != nil {
		return nil, fmt.Errorf("failed to get frontend filesystem: %w", err)
	}
	return distFS, nil
}

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

	// Get embedded frontend filesystem
	frontendFS, err := getFrontendFS()
	if err != nil {
		log.Printf("warning: failed to load embedded frontend: %v", err)
		log.Printf("  The tool will work but the web UI won't be available.")
		frontendFS = nil
	}

	srv, err := server.Start(ctx, generator, frontendFS)
	if err != nil {
		log.Fatalf("failed to start server: %v", err)
	}

	url := srv.BaseURL
	if err := browser.Open(url); err != nil {
		log.Printf("warning: could not open browser automatically: %v", err)
	}

	<-ctx.Done()
}
