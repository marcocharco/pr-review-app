package git

import (
	"context"
	"fmt"
	"os/exec"
	"strings"

	"github.com/marcocharco/pr-review-app/cli/internal/types"
)

// git command wrapper
func gitcmd(ctx context.Context, dir string, args ...string) (string, error) {
	cmd := exec.CommandContext(ctx, "git", args...)
	if dir != "" {
		cmd.Dir = dir
	}
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("git %s: %w", strings.Join(args, " "), err)
	}
	return strings.TrimSpace(string(out)), nil
}

func RepoInfo(ctx context.Context) (types.RepoInfo, error) {
	root, err := gitcmd(ctx, "", "rev-parse", "--show-toplevel")
	if err != nil {
		return types.RepoInfo{}, fmt.Errorf("not a git repo? %w", err)
	}
	branch, err := gitcmd(ctx, root, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return types.RepoInfo{}, err
	}
	head, err := gitcmd(ctx, root, "rev-parse", "HEAD")
	if err != nil {
		return types.RepoInfo{}, err
	}
	// ref: https://stackoverflow.com/questions/28666357/how-to-get-default-git-branch
	baseBranch, err := gitcmd(ctx, root, "rev-parse", "--abbrev-ref", "origin/HEAD")
	if err != nil {
		return types.RepoInfo{}, fmt.Errorf("failed to determine default branch: %w", err)
	}
	// get merge base hash
	base, err := gitcmd(ctx, root, "merge-base", baseBranch, "HEAD")
	if err != nil {
		return types.RepoInfo{}, fmt.Errorf("failed to find merge-base with %s: %w", baseBranch, err)
	}

	// ref: https://stackoverflow.com/questions/4089430/how-to-determine-the-url-that-a-local-git-repository-was-originally-cloned-from
	remote, err := gitcmd(ctx, root, "config", "--get", "remote.origin.url")
	if err != nil {
		return types.RepoInfo{}, fmt.Errorf("failed to get remote origin url: %w", err)
	}
	return types.RepoInfo{
		Root:   root,
		Branch: branch,
		Head:   head,
		Base:   base,
		Remote: remote,
	}, nil
}
