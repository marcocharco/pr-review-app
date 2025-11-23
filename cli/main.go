package main

import (
	"bufio"
	"context"
	"embed"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/joho/godotenv"
	"github.com/marcocharco/pr-review-app/cli/internal/auth"
	"github.com/marcocharco/pr-review-app/cli/internal/browser"
	"github.com/marcocharco/pr-review-app/cli/internal/collect"
	"github.com/marcocharco/pr-review-app/cli/internal/git"
	"github.com/marcocharco/pr-review-app/cli/internal/github"
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

	// Check for dev mode (via --dev flag or DEV env var)
	devMode := os.Getenv("DEV") == "true"
	var prNum int
	for _, arg := range os.Args[1:] {
		if arg == "--dev" {
			devMode = true
		} else if prNum == 0 {
			// First non-flag argument is the PR number
			var err error
			prNum, err = strconv.Atoi(arg)
			if err != nil {
				log.Fatalf("invalid PR number argument: %v", err)
			}
		}
	}

	if prNum == 0 {
		log.Fatal("Please provide a PR number as an argument.")
	}

	// Prepare for CommentPoster
	repoInfo, err := git.RepoInfo(ctx)
	if err != nil {
		log.Fatalf("failed to get repo info: %v", err)
	}

	owner, repo, err := github.ParseRemote(repoInfo.Remote)
	if err != nil {
		log.Fatalf("failed to parse remote: %v", err)
	}

	client := github.NewClient(config.AccessToken)

	// Fetch PR to check branch
	pr, err := client.FetchPR(ctx, owner, repo, prNum)
	if err != nil {
		log.Fatalf("failed to fetch PR details: %v", err)
	}

	if pr.Head.Ref != repoInfo.Branch {
		fmt.Printf("You are on branch '%s', but PR #%d is for branch '%s'.\n", repoInfo.Branch, prNum, pr.Head.Ref)
		fmt.Print("Switch to that branch? [Y/n] ")
		reader := bufio.NewReader(os.Stdin)
		response, _ := reader.ReadString('\n')
		response = strings.TrimSpace(response)
		if response == "" || strings.ToLower(response) == "y" || strings.ToLower(response) == "yes" {
			fmt.Println("Fetching latest changes...")
			if err := git.Fetch(ctx); err != nil {
				log.Printf("warning: git fetch failed: %v", err)
			}
			fmt.Printf("Checking out %s...\n", pr.Head.Ref)
			if err := git.Checkout(ctx, pr.Head.Ref); err != nil {
				log.Fatalf("failed to checkout branch: %v", err)
			}
			// Update repoInfo
			repoInfo, err = git.RepoInfo(ctx)
			if err != nil {
				log.Printf("warning: failed to refresh repo info: %v", err)
			}
		}
	}

	var generator server.SessionGenerator
	generator = func(ctx context.Context) (types.Session, error) {
		fmt.Printf("Fetching PR #%d...\n", prNum)
		return collect.BuildPRSession(ctx, prNum, config.AccessToken)
	}

	var poster server.CommentPoster
	poster = func(ctx context.Context, req github.CommentRequest) (*github.PRComment, error) {
		return client.PostComment(ctx, owner, repo, prNum, req)
	}

	var merger server.Merger
	merger = func(ctx context.Context, req github.MergeRequest) (*github.MergeResponse, error) {
		fmt.Printf("Merging PR #%d via %s...\n", prNum, req.MergeMethod)
		return client.MergePR(ctx, owner, repo, prNum, req)
	}

	// Initial fetch to ensure it works
	session, err := generator(ctx)
	if err != nil {
		log.Fatalf("failed to build PR session: %v", err)
	}
	fmt.Printf("Loaded %d files from PR.\n", len(session.Files))

	var frontendFS fs.FS
	if !devMode {
		// Get embedded frontend filesystem for production
		var err error
		frontendFS, err = getFrontendFS()
		if err != nil {
			log.Printf("warning: failed to load embedded frontend: %v", err)
			log.Printf("  The tool will work but the web UI won't be available.")
			frontendFS = nil
		}
	} else {
		fmt.Println("Dev mode: Using Vite dev server for frontend")
		fmt.Println("  Make sure 'npm run dev' is running in the frontend/ directory")
		frontendFS = nil
	}

	srv, err := server.Start(ctx, generator, poster, merger, frontendFS, devMode)
	if err != nil {
		log.Fatalf("failed to start server: %v", err)
	}

	if devMode {
		// In dev mode, tell user to use the Vite dev server
		devURL := "http://localhost:5173"
		fmt.Printf("\n✓ API server running at: %s\n", srv.BaseURL)
		fmt.Printf("✓ Ready for Vite dev server to proxy /session requests\n")
		fmt.Printf("\nNow start the frontend dev server:\n")
		fmt.Printf("  cd ../frontend && npm run dev\n\n")
		fmt.Printf("Then open: %s\n\n", devURL)
	} else {
		url := srv.BaseURL
		fmt.Printf("Server running at: %s\n", url)
		if err := browser.Open(url); err != nil {
			log.Printf("warning: could not open browser automatically: %v", err)
		}
	}

	<-ctx.Done()
}
