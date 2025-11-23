package github

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

type Client struct {
	Token string
}

type PRFile struct {
	SHA         string `json:"sha"`
	Filename    string `json:"filename"`
	Status      string `json:"status"`
	Additions   int    `json:"additions"`
	Deletions   int    `json:"deletions"`
	Changes     int    `json:"changes"`
	BlobURL     string `json:"blob_url"`
	RawURL      string `json:"raw_url"`
	ContentsURL string `json:"contents_url"`
	Patch       string `json:"patch"`
}

type User struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	HTMLURL   string `json:"html_url"`
}

type PRComment struct {
	ID          int64  `json:"id"`
	Body        string `json:"body"`
	Path        string `json:"path"`
	Line        int    `json:"line"`
	StartLine   *int   `json:"start_line,omitempty"`
	Side        string `json:"side"`
	User        User   `json:"user"`
	CreatedAt   string `json:"created_at"`
	UpdatedAt   string `json:"updated_at"`
	CommitID    string `json:"commit_id"`
	InReplyToID *int64 `json:"in_reply_to_id,omitempty"`
}

type CommentRequest struct {
	Body        string `json:"body"`
	Path        string `json:"path,omitempty"`
	Line        *int   `json:"line,omitempty"`
	StartLine   *int   `json:"start_line,omitempty"`
	Side        string `json:"side,omitempty"`
	CommitID    string `json:"commit_id,omitempty"`
	InReplyToID *int64 `json:"in_reply_to_id,omitempty"`
	SubjectType string `json:"subject_type,omitempty"`
}

type PullRequest struct {
	Number  int    `json:"number"`
	Title   string `json:"title"`
	HTMLURL string `json:"html_url"`
	State   string `json:"state"`
	Draft   bool   `json:"draft"`
	Merged  bool   `json:"merged"`
	Head    Commit `json:"head"`
}

type Commit struct {
	SHA string `json:"sha"`
	Ref string `json:"ref"`
}

func NewClient(token string) *Client {
	return &Client{Token: token}
}

func (c *Client) FetchPR(ctx context.Context, owner, repo string, prNumber int) (*PullRequest, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d", owner, repo, prNumber)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api error: %s", resp.Status)
	}

	var pr PullRequest
	if err := json.NewDecoder(resp.Body).Decode(&pr); err != nil {
		return nil, err
	}

	return &pr, nil
}

func (c *Client) FetchPRFiles(ctx context.Context, owner, repo string, prNumber int) ([]PRFile, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d/files?per_page=100", owner, repo, prNumber)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api error: %s", resp.Status)
	}

	var files []PRFile
	if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
		return nil, err
	}

	return files, nil
}

func (c *Client) FetchPRComments(ctx context.Context, owner, repo string, prNumber int) ([]PRComment, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d/comments?per_page=100", owner, repo, prNumber)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("github api error: %s", resp.Status)
	}

	var comments []PRComment
	if err := json.NewDecoder(resp.Body).Decode(&comments); err != nil {
		return nil, err
	}

	return comments, nil
}

func (c *Client) PostComment(ctx context.Context, owner, repo string, prNumber int, commentReq CommentRequest) (*PRComment, error) {
	var url string
	var bodyBytes []byte
	var err error

	// If InReplyToID is set, use the Reply endpoint
	if commentReq.InReplyToID != nil && *commentReq.InReplyToID != 0 {
		url = fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d/comments/%d/replies", owner, repo, prNumber, *commentReq.InReplyToID)
		// For replies, only body is required. Create a smaller payload.
		replyReq := struct {
			Body string `json:"body"`
		}{
			Body: commentReq.Body,
		}
		bodyBytes, err = json.Marshal(replyReq)
	} else {
		// Standard Create Comment endpoint
		url = fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d/comments", owner, repo, prNumber)
		bodyBytes, err = json.Marshal(commentReq)
	}

	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return nil, err
	}

	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		// Try to read error message
		var errResp struct {
			Message string `json:"message"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&errResp)
		// Return the raw error message from GitHub which usually explains the 403 or validation error
		return nil, fmt.Errorf("github api error: %s - %s", resp.Status, errResp.Message)
	}

	var comment PRComment
	if err := json.NewDecoder(resp.Body).Decode(&comment); err != nil {
		return nil, err
	}

	return &comment, nil
}

func ParseRemote(remote string) (string, string, error) {
	// Supports:
	// https://github.com/owner/repo.git
	// https://github.com/owner/repo
	// git@github.com:owner/repo.git

	// Handle trailing slashes which can cause empty repo names
	remote = strings.TrimRight(remote, "/")
	remote = strings.TrimSuffix(remote, ".git")
	// Trim again in case of repo.git/
	remote = strings.TrimRight(remote, "/")

	var owner, repo string

	if strings.HasPrefix(remote, "https://") || strings.HasPrefix(remote, "http://") {
		parts := strings.Split(remote, "/")
		if len(parts) < 2 {
			return "", "", fmt.Errorf("invalid http remote url: %s", remote)
		}
		repo = parts[len(parts)-1]
		owner = parts[len(parts)-2]
	} else if strings.HasPrefix(remote, "git@") {
		// git@github.com:owner/repo
		parts := strings.Split(remote, ":")
		if len(parts) != 2 {
			return "", "", fmt.Errorf("invalid ssh remote url: %s", remote)
		}
		path := parts[1]
		pathParts := strings.Split(path, "/")
		if len(pathParts) != 2 {
			return "", "", fmt.Errorf("invalid ssh remote path: %s", path)
		}
		owner = pathParts[0]
		repo = pathParts[1]
	} else {
		return "", "", fmt.Errorf("unsupported remote url format: %s", remote)
	}

	return owner, repo, nil
}
