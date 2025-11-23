package collect

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/marcocharco/pr-review-app/cli/internal/git"
	"github.com/marcocharco/pr-review-app/cli/internal/github"
	"github.com/marcocharco/pr-review-app/cli/internal/types"
)

func BuildPRSession(ctx context.Context, prNumber int, token string) (types.Session, error) {
	repoInfo, err := git.RepoInfo(ctx)
	if err != nil {
		return types.Session{}, fmt.Errorf("failed to get repo info: %w", err)
	}

	owner, repo, err := github.ParseRemote(repoInfo.Remote)
	if err != nil {
		return types.Session{}, fmt.Errorf("failed to parse remote: %w", err)
	}

	client := github.NewClient(token)
	prFiles, err := client.FetchPRFiles(ctx, owner, repo, prNumber)
	if err != nil {
		return types.Session{}, fmt.Errorf("failed to fetch PR files: %w", err)
	}

	var files []types.FileDiff
	var added, deleted int

	for _, f := range prFiles {
		var spans []types.ChangedSpan
		changedLines, err := ParsePatch(f.Patch)
		if err == nil && len(changedLines) > 0 {
			content, err := os.ReadFile(filepath.Join(repoInfo.Root, f.Filename))
			if err == nil {
				spans, _ = AnalyzeFile(ctx, f.Filename, content, changedLines)
			}
		}

		files = append(files, types.FileDiff{
			Path:         f.Filename,
			Status:       f.Status,
			Patch:        f.Patch,
			ChangedSpans: spans,
		})
		added += f.Additions
		deleted += f.Deletions
	}

	return types.Session{
		Repo: types.RepoInfo{
			RepoName: repo,
			Root:     repoInfo.Root,
			Branch:   repoInfo.Branch,
			Head:     repoInfo.Head,
			Remote:   repoInfo.Remote,
		},
		Files: files,
		Summary: types.Summary{
			Files: len(files),
			Add:   added,
			Del:   deleted,
		},
		Generated: time.Now().Format(time.RFC3339),
	}, nil
}
