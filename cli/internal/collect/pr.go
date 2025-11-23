package collect

import (
	"context"
	"fmt"
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
		files = append(files, types.FileDiff{
			Path:   f.Filename,
			Status: f.Status,
			Patch:  f.Patch,
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
			Base:     repoInfo.Base,
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
