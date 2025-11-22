package github

import (
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

func NewClient(token string) *Client {
	return &Client{Token: token}
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

func ParseRemote(remote string) (string, string, error) {
	// Supports:
	// https://github.com/owner/repo.git
	// https://github.com/owner/repo
	// git@github.com:owner/repo.git

	remote = strings.TrimSuffix(remote, ".git")

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
