package collect

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/marcocharco/pr-review-app/cli/internal/git"
	"github.com/marcocharco/pr-review-app/cli/internal/github"
	"github.com/marcocharco/pr-review-app/cli/internal/lsp"
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

	// Fetch PR details first to get the head SHA
	pr, err := client.FetchPR(ctx, owner, repo, prNumber)
	if err != nil {
		return types.Session{}, fmt.Errorf("failed to fetch PR details: %w", err)
	}

	prFiles, err := client.FetchPRFiles(ctx, owner, repo, prNumber)
	if err != nil {
		return types.Session{}, fmt.Errorf("failed to fetch PR files: %w", err)
	}

	prComments, err := client.FetchPRComments(ctx, owner, repo, prNumber)
	if err != nil {
		return types.Session{}, fmt.Errorf("failed to fetch PR comments: %w", err)
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
				spans, _ = lsp.FindReferences(ctx, repoInfo.Root, spans, f.Filename)
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

	var comments []types.Comment
	for _, c := range prComments {
		comments = append(comments, types.Comment{
			ID:          c.ID,
			Body:        c.Body,
			Path:        c.Path,
			Line:        c.Line,
			StartLine:   c.StartLine,
			Side:        c.Side,
			User: types.User{
				Login:     c.User.Login,
				AvatarURL: c.User.AvatarURL,
				HTMLURL:   c.User.HTMLURL,
			},
			CreatedAt:   c.CreatedAt,
			UpdatedAt:   c.UpdatedAt,
			CommitID:    c.CommitID,
			InReplyToID: c.InReplyToID,
		})
	}

	prStatus := "open"
	if pr.Merged {
		prStatus = "merged"
	} else if pr.State == "closed" {
		prStatus = "closed"
	} else if pr.Draft {
		prStatus = "draft"
	}

	return types.Session{
		Repo: types.RepoInfo{
			RepoName: repo,
			Root:     repoInfo.Root,
			Branch:   repoInfo.Branch, // This is the local branch, maybe we should use PR branch?
			// Use the PR's head SHA instead of local HEAD
			Head:     pr.Head.SHA,
			Remote:   repoInfo.Remote,
			RepoLink: fmt.Sprintf("https://github.com/%s/%s", owner, repo),
			PRTitle:  pr.Title,
			PRNumber: pr.Number,
			PRLink:   pr.HTMLURL,
			PRStatus: prStatus,
		},
		Files:    files,
		Comments: comments,
		Summary: types.Summary{
			Files: len(files),
			Add:   added,
			Del:   deleted,
		},
		Generated: time.Now().Format(time.RFC3339),
	}, nil
}
