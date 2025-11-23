package types

// RepoInfo holds basic git context for the session.
type RepoInfo struct {
	Root     string `json:"root"`
	Branch   string `json:"branch"`
	Head     string `json:"head"`
	Remote   string `json:"remote"`
	RepoName string `json:"repoName"`
	RepoLink string `json:"repoLink"`
	PRTitle  string `json:"prTitle"`
	PRNumber int    `json:"prNumber"`
	PRLink   string `json:"prLink"`
	PRStatus string `json:"prStatus"`
}

// ChangedSpan represents a span of code that has changed.
type ChangedSpan struct {
	Name  string `json:"name"`
	Kind  string `json:"kind"`
	Start int    `json:"start"`
	End   int    `json:"end"`
	// Identifier position for LSP
	RefLine int `json:"refLine"`
	RefCol  int `json:"refCol"`

	References []Reference `json:"references,omitempty"`
}

type Reference struct {
	Path    string `json:"path"`
	Line    int    `json:"line"`
	Start   int    `json:"start"`
	End     int    `json:"end"`
	Context string `json:"context"`
	ContextStartLine int `json:"contextStartLine"`
}

// FileDiff captures a single file's patch and current content.
type FileDiff struct {
	Path         string        `json:"path"`
	Status       string        `json:"status"`
	Language     string        `json:"language,omitempty"`
	Patch        string        `json:"patch"`
	ChangedSpans []ChangedSpan `json:"changedSpans,omitempty"`
}

// Summary holds aggregate stats.
type Summary struct {
	Files int `json:"files"`
	Add   int `json:"add"`
	Del   int `json:"del"`
}

// User represents a GitHub user.
type User struct {
	Login     string `json:"login"`
	AvatarURL string `json:"avatar_url"`
	HTMLURL   string `json:"html_url"`
}

// Comment represents a GitHub PR review comment.
type Comment struct {
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

// Session is the payload exposed to the viewer.
type Session struct {
	Repo      RepoInfo   `json:"repo"`
	Files     []FileDiff `json:"files"`
	Comments  []Comment  `json:"comments"`
	Summary   Summary    `json:"summary"`
	Generated string     `json:"generatedAt"`
}
