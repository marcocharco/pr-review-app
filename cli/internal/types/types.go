package types

// RepoInfo holds basic git context for the session.
type RepoInfo struct {
	Root     string `json:"root"`
	Branch   string `json:"branch"`
	Head     string `json:"head"`
	Remote   string `json:"remote"`
	RepoName string `json:"repoName"`
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
	Path  string `json:"path"`
	Line  int    `json:"line"`
	Start int    `json:"start"`
	End   int    `json:"end"`
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

// Session is the payload exposed to the viewer.
type Session struct {
	Repo      RepoInfo   `json:"repo"`
	Files     []FileDiff `json:"files"`
	Summary   Summary    `json:"summary"`
	Generated string     `json:"generatedAt"`
}
