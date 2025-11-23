package lsp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/marcocharco/pr-review-app/cli/internal/types"
)

type Client struct {
	cmd     *exec.Cmd
	stdin   io.WriteCloser
	stdout  io.ReadCloser
	seq     int
	mu      sync.Mutex
	pending map[int]chan json.RawMessage
}

func NewClient(cmdName string, args ...string) (*Client, error) {
	cmd := exec.Command(cmdName, args...)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}

	if err := cmd.Start(); err != nil {
		return nil, err
	}

	c := &Client{
		cmd:     cmd,
		stdin:   stdin,
		stdout:  stdout,
		pending: make(map[int]chan json.RawMessage),
	}

	go c.readLoop()

	return c, nil
}

func (c *Client) readLoop() {
	reader := bufio.NewReader(c.stdout)
	for {
		// Read Header
		var contentLength int
		for {
			line, err := reader.ReadString('\n')
			if err != nil {
				return
			}
			line = strings.TrimSpace(line)
			if line == "" {
				break
			}
			if after, ok := strings.CutPrefix(line, "Content-Length: "); ok {
				contentLength, _ = strconv.Atoi(after)
			}
		}

		if contentLength == 0 {
			continue
		}

		// Read Body
		body := make([]byte, contentLength)
		_, err := io.ReadFull(reader, body)
		if err != nil {
			return
		}

		var msg struct {
			ID     *int            `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  json.RawMessage `json:"error"`
		}
		if err := json.Unmarshal(body, &msg); err != nil {
			continue
		}

		if msg.ID != nil {
			c.mu.Lock()
			ch, ok := c.pending[*msg.ID]
			if ok {
				delete(c.pending, *msg.ID)
			}
			c.mu.Unlock()

			if ok {
				ch <- msg.Result
				close(ch)
			}
		}
	}
}

func (c *Client) Call(method string, params any) (json.RawMessage, error) {
	c.mu.Lock()
	c.seq++
	id := c.seq
	ch := make(chan json.RawMessage, 1)
	c.pending[id] = ch
	c.mu.Unlock()

	req := struct {
		JSONRPC string `json:"jsonrpc"`
		ID      int    `json:"id"`
		Method  string `json:"method"`
		Params  any    `json:"params"`
	}{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	msg := fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(body), body)
	if _, err := c.stdin.Write([]byte(msg)); err != nil {
		return nil, err
	}

	select {
	case res := <-ch:
		return res, nil
	case <-time.After(10 * time.Second):
		return nil, fmt.Errorf("timeout waiting for response to %s", method)
	}
}

func (c *Client) Notify(method string, params any) error {
	req := struct {
		JSONRPC string `json:"jsonrpc"`
		Method  string `json:"method"`
		Params  any    `json:"params"`
	}{
		JSONRPC: "2.0",
		Method:  method,
		Params:  params,
	}

	body, err := json.Marshal(req)
	if err != nil {
		return err
	}

	msg := fmt.Sprintf("Content-Length: %d\r\n\r\n%s", len(body), body)
	if _, err := c.stdin.Write([]byte(msg)); err != nil {
		return err
	}
	return nil
}

func (c *Client) Close() error {
	c.stdin.Close()
	return c.cmd.Wait()
}

type InitializeParams struct {
	ProcessID    int            `json:"processId"`
	RootURI      string         `json:"rootUri"`
	Capabilities map[string]any `json:"capabilities"`
}

type TextDocumentIdentifier struct {
	URI string `json:"uri"`
}

type Position struct {
	Line      int `json:"line"`
	Character int `json:"character"`
}

type ReferenceParams struct {
	TextDocument TextDocumentIdentifier `json:"textDocument"`
	Position     Position               `json:"position"`
	Context      struct {
		IncludeDeclaration bool `json:"includeDeclaration"`
	} `json:"context"`
}

type Location struct {
	URI   string `json:"uri"`
	Range struct {
		Start Position `json:"start"`
		End   Position `json:"end"`
	} `json:"range"`
}

func URIFromFile(path string) string {
	if !strings.HasPrefix(path, "/") {
		abs, _ := filepath.Abs(path)
		path = abs
	}
	return "file://" + path
}

func FileFromURI(uri string) string {
	return strings.TrimPrefix(uri, "file://")
}

func FindReferences(ctx context.Context, root string, spans []types.ChangedSpan, filePath string) ([]types.ChangedSpan, error) {
	// Determine which LSP to use
	var cmd string
	var args []string

	if strings.HasSuffix(filePath, ".go") {
		cmd = "gopls"
	} else if strings.HasSuffix(filePath, ".ts") || strings.HasSuffix(filePath, ".tsx") || strings.HasSuffix(filePath, ".js") {
		// or vtsls
		cmd = "typescript-language-server"
		args = []string{"--stdio"}
	} else {
		return spans, nil
	}

	client, err := NewClient(cmd, args...)
	if err != nil {
		return spans, fmt.Errorf("failed to start lsp: %w", err)
	}
	defer client.Close()

	// Initialize
	initParams := InitializeParams{
		ProcessID:    os.Getpid(),
		RootURI:      URIFromFile(root),
		Capabilities: map[string]any{},
	}

	if _, err := client.Call("initialize", initParams); err != nil {
		return spans, fmt.Errorf("failed to initialize lsp: %w", err)
	}
	client.Notify("initialized", struct{}{})

	// Open the file (optional if on disk, but good practice)
	content, err := os.ReadFile(filepath.Join(root, filePath))
	if err == nil {
		client.Notify("textDocument/didOpen", struct {
			TextDocument struct {
				URI        string `json:"uri"`
				LanguageID string `json:"languageId"`
				Version    int    `json:"version"`
				Text       string `json:"text"`
			} `json:"textDocument"`
		}{
			TextDocument: struct {
				URI        string `json:"uri"`
				LanguageID string `json:"languageId"`
				Version    int    `json:"version"`
				Text       string `json:"text"`
			}{
				URI:        URIFromFile(filepath.Join(root, filePath)),
				LanguageID: "go", // simplify
				Version:    1,
				Text:       string(content),
			},
		})
	}

	// Query references
	for i, span := range spans {
		if span.RefLine == 0 && span.RefCol == 0 {
			continue
		}

		params := ReferenceParams{
			TextDocument: TextDocumentIdentifier{URI: URIFromFile(filepath.Join(root, filePath))},
			Position: Position{
				Line:      span.RefLine,
				Character: span.RefCol,
			},
			Context: struct {
				IncludeDeclaration bool `json:"includeDeclaration"`
			}{IncludeDeclaration: false},
		}

		res, err := client.Call("textDocument/references", params)
		if err != nil {
			continue
		}

		var locations []Location
		if err := json.Unmarshal(res, &locations); err != nil {
			continue
		}

		for _, loc := range locations {
			spans[i].References = append(spans[i].References, types.Reference{
				Path:  FileFromURI(loc.URI),
				Line:  loc.Range.Start.Line + 1,
				Start: loc.Range.Start.Character,
				End:   loc.Range.End.Character,
			})
		}
	}

	return spans, nil
}
