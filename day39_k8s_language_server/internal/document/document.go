package document

import (
	"sync"

	"gopkg.in/yaml.v3"
	// TODO: Consider adding a specific YAML AST node type if needed for advanced analysis
)

// Document represents a single text document managed by the LSP server.
// It holds the URI, content, version, and potentially parsed YAML representation.
type Document struct {
	URI     string // Document URI (e.g., file:///path/to/your/file.yaml)
	Content string // Full content of the document
	Version int32  // Version number from the client, used for synchronization

	// ParsedYAMLRoot is the root node of the parsed YAML content.
	// This can be populated lazily or upon specific events (e.g., didOpen, didChange).
	// Access to this should be synchronized if concurrent access is possible.
	parsedYAMLRoot *yaml.Node
	parseErr       error // Stores any error that occurred during the last parse attempt
	mu             sync.RWMutex
}

// NewDocument creates a new Document instance.
func NewDocument(uri string, content string, version int32) *Document {
	d := &Document{
		URI:     uri,
		Content: content,
		Version: version,
	}
	// Optionally, parse YAML immediately upon creation or do it lazily.
	// d.TryParseYAML()
	return d
}

// Update updates the document's content and version.
// It also re-parses the YAML content.
func (d *Document) Update(content string, version int32) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.Content = content
	d.Version = version
	d.tryParseYAMLUnsafe() // Re-parse after update
}

// TryParseYAML attempts to parse the document's content into a YAML AST.
// The result (or error) is stored within the Document struct.
// This method is safe for concurrent use.
func (d *Document) TryParseYAML() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.tryParseYAMLUnsafe()
}

// tryParseYAMLUnsafe is the non-thread-safe version of TryParseYAML.
// It must be called with d.mu held.
func (d *Document) tryParseYAMLUnsafe() {
	var root yaml.Node
	err := yaml.Unmarshal([]byte(d.Content), &root)
	if err != nil {
		d.parsedYAMLRoot = nil
		d.parseErr = err
		return
	}
	d.parsedYAMLRoot = &root
	d.parseErr = nil
}

// GetParsedYAML returns the parsed YAML root node and any parsing error.
// It's safe for concurrent use.
func (d *Document) GetParsedYAML() (*yaml.Node, error) {
	d.mu.RLock()
	defer d.mu.RUnlock()
	// If parsing hasn't been attempted yet, try it now.
	// This implements lazy parsing if not done at creation/update.
	if d.parsedYAMLRoot == nil && d.parseErr == nil && d.Content != "" {
		// Need to release RLock and acquire Lock to modify
		d.mu.RUnlock()
		d.mu.Lock()
		d.tryParseYAMLUnsafe() // Check again in case another goroutine did it
		d.mu.Unlock()
		d.mu.RLock() // Re-acquire RLock
	}
	return d.parsedYAMLRoot, d.parseErr
}
