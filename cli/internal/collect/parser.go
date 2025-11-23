package collect

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"github.com/marcocharco/pr-review-app/cli/internal/types"
	sitter "github.com/smacker/go-tree-sitter"
	"github.com/smacker/go-tree-sitter/golang"
	"github.com/smacker/go-tree-sitter/javascript"
	"github.com/smacker/go-tree-sitter/typescript/tsx"
	"github.com/smacker/go-tree-sitter/typescript/typescript"
)

func ParsePatch(patch string) ([]int, error) {
	var lines []int
	// Regex to match @@ -old,count +new,count @@
	re := regexp.MustCompile(`^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@`)

	linesInPatch := strings.Split(patch, "\n")
	currentLine := 0

	for _, line := range linesInPatch {
		if strings.HasPrefix(line, "@@") {
			matches := re.FindStringSubmatch(line)
			if len(matches) > 1 {
				start, _ := strconv.Atoi(matches[1])
				currentLine = start
			}
			continue
		}

		if strings.HasPrefix(line, "+") {
			lines = append(lines, currentLine)
			currentLine++
		} else if strings.HasPrefix(line, " ") {
			currentLine++
		} else if strings.HasPrefix(line, "-") {
			// Deleted lines don't exist in the new file, so we skip incrementing currentLine
			// But wait, we are mapping to the NEW file.
			// In unified diff:
			// " " -> present in both, increment both counters (we only track new)
			// "+" -> present in new, increment new counter
			// "-" -> present in old, do not increment new counter
		}
	}
	return lines, nil
}

func AnalyzeFile(ctx context.Context, filePath string, content []byte, changedLines []int) ([]types.ChangedSpan, error) {
	lang := getLanguage(filePath)
	if lang == nil {
		return nil, nil
	}

	parser := sitter.NewParser()
	parser.SetLanguage(lang)

	tree, err := parser.ParseCtx(ctx, nil, content)
	if err != nil {
		return nil, err
	}
	defer tree.Close()

	root := tree.RootNode()
	var spans []types.ChangedSpan

	// We need to find the smallest named node that encloses the changed lines.
	// Or maybe the top-level declaration?

	// For each changed line, find the node at that position.
	// Then traverse up to find a relevant "symbol" node (Function, Class, Method, etc.).
	// Deduplicate spans.

	seen := make(map[string]bool)

	for _, line := range changedLines {
		// Tree-sitter uses 0-based indexing for rows.
		// changedLines are 1-based (usually).
		row := uint32(line - 1)

		// Find node at this row.
		p := sitter.Point{Row: row, Column: 0}
		node := root.NamedDescendantForPointRange(p, p)

		if node == nil {
			continue
		}

		symbolNode := findEnclosingSymbol(node)
		if symbolNode != nil {
			// Create a unique key for deduplication
			key := fmt.Sprintf("%s-%d-%d", symbolNode.Type(), symbolNode.StartByte(), symbolNode.EndByte())
			if seen[key] {
				continue
			}
			seen[key] = true

			name, nameNode := getNodeName(content, symbolNode)

			refLine := 0
			refCol := 0
			if nameNode != nil {
				refLine = int(nameNode.StartPoint().Row)
				refCol = int(nameNode.StartPoint().Column)
			}

			spans = append(spans, types.ChangedSpan{
				Name:    name,
				Kind:    symbolNode.Type(),
				Start:   int(symbolNode.StartPoint().Row) + 1,
				End:     int(symbolNode.EndPoint().Row) + 1,
				RefLine: refLine,
				RefCol:  refCol,
			})
		}
	}

	return spans, nil
}

func getLanguage(filename string) *sitter.Language {
	if isGenerated(filename) {
		return nil
	}

	if strings.HasSuffix(filename, ".go") {
		return golang.GetLanguage()
	}
	if strings.HasSuffix(filename, ".js") {
		return javascript.GetLanguage()
	}
	if strings.HasSuffix(filename, ".ts") {
		return typescript.GetLanguage()
	}
	if strings.HasSuffix(filename, ".tsx") {
		return tsx.GetLanguage()
	}
	return nil
}

func isGenerated(filename string) bool {
	// Common generated file patterns
	if strings.HasSuffix(filename, ".min.js") ||
		strings.HasSuffix(filename, ".pb.go") ||
		strings.HasSuffix(filename, "_gen.go") ||
		strings.HasSuffix(filename, "generated.go") {
		return true
	}

	// Common lock files (though usually not matching extension checks above, added for completeness)
	if strings.HasSuffix(filename, "package-lock.json") ||
		strings.HasSuffix(filename, "yarn.lock") ||
		strings.HasSuffix(filename, "pnpm-lock.yaml") ||
		strings.HasSuffix(filename, "go.sum") {
		return true
	}

	return false
}

func findEnclosingSymbol(node *sitter.Node) *sitter.Node {
	// Traverse up until we find a node of interest
	curr := node
	for curr != nil {
		t := curr.Type()
		// Go
		if t == "function_declaration" || t == "method_declaration" || t == "type_spec" {
			return curr
		}
		// TypeScript/JavaScript
		if t == "function_declaration" || t == "class_declaration" || t == "interface_declaration" || t == "method_definition" || t == "variable_declarator" {
			return curr
		}
		curr = curr.Parent()
	}
	return nil
}

func getNodeName(content []byte, node *sitter.Node) (string, *sitter.Node) {
	// Try to find a child named "name" or similar
	// This is language specific.

	switch node.Type() {
	// Go & JS/TS shared types or specific ones
	case "function_declaration", "method_declaration", "type_spec",
		"class_declaration", "interface_declaration", "method_definition", "variable_declarator":
		if nameNode := node.ChildByFieldName("name"); nameNode != nil {
			return nameNode.Content(content), nameNode
		}
	}

	// Fallback: try "name" field
	if nameNode := node.ChildByFieldName("name"); nameNode != nil {
		return nameNode.Content(content), nameNode
	}

	return node.Type(), nil // Fallback
}
