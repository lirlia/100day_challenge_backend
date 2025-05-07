package document

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestNewDocument(t *testing.T) {
	uri := "file:///test.yaml"
	content := "key: value"
	version := int32(1)

	doc := NewDocument(uri, content, version)
	if doc.URI != uri {
		t.Errorf("NewDocument URI = %q; want %q", doc.URI, uri)
	}
	if doc.Content != content {
		t.Errorf("NewDocument Content = %q; want %q", doc.Content, content)
	}
	if doc.Version != version {
		t.Errorf("NewDocument Version = %d; want %d", doc.Version, version)
	}
	if doc.parsedYAMLRoot != nil {
		t.Error("NewDocument parsedYAMLRoot should be nil initially if not explicitly parsed")
	}
	if doc.parseErr != nil {
		t.Errorf("NewDocument parseErr should be nil initially, got %v", doc.parseErr)
	}
}

func TestDocument_Update(t *testing.T) {
	doc := NewDocument("file:///update.yaml", "old: content", 1)

	newContent := "new: content"
	newVersion := int32(2)
	doc.Update(newContent, newVersion)

	if doc.Content != newContent {
		t.Errorf("Update Content = %q; want %q", doc.Content, newContent)
	}
	if doc.Version != newVersion {
		t.Errorf("Update Version = %d; want %d", doc.Version, newVersion)
	}

	// Check if YAML is re-parsed
	parsed, err := doc.GetParsedYAML() // GetParsedYAML also triggers parsing if not done
	if err != nil {
		t.Fatalf("doc.GetParsedYAML after Update failed: %v", err)
	}
	if parsed == nil {
		t.Fatal("doc.GetParsedYAML after Update returned nil root")
	}
	// Check the first key of the root mapping node
	if parsed.Content[0] == nil || len(parsed.Content[0].Content) < 1 || parsed.Content[0].Content[0].Value != "new" {
		t.Errorf("Updated document YAML does not seem to reflect new content. Expected first key 'new', got something else or structure was unexpected.")
	}
}

func TestDocument_TryParseYAML_Valid(t *testing.T) {
	content := `
apiVersion: v1
kind: ConfigMap
metadata:
  name: my-cm
data:
  key: value
`
	doc := NewDocument("file:///valid.yaml", content, 1)
	doc.TryParseYAML() // Explicitly parse

	parsed, err := doc.GetParsedYAML()
	if err != nil {
		t.Fatalf("TryParseYAML for valid YAML failed: %v", err)
	}
	if parsed == nil {
		t.Fatal("TryParseYAML for valid YAML returned nil root")
	}

	// Basic verification of parsed structure
	if parsed.Kind != yaml.DocumentNode || len(parsed.Content) != 1 {
		t.Fatalf("Expected DocumentNode with one MappingNode, got kind %v, content len %d", parsed.Kind, len(parsed.Content))
	}
	rootMap := parsed.Content[0]
	if rootMap.Kind != yaml.MappingNode {
		t.Fatalf("Expected root content to be MappingNode, got %v", rootMap.Kind)
	}
	var foundKind bool
	for i := 0; i < len(rootMap.Content); i += 2 {
		if rootMap.Content[i].Value == "kind" && rootMap.Content[i+1].Value == "ConfigMap" {
			foundKind = true
			break
		}
	}
	if !foundKind {
		t.Error("Could not find 'kind: ConfigMap' in parsed YAML")
	}
}

func TestDocument_TryParseYAML_Invalid(t *testing.T) {
	content := "key: value: another_value" // Invalid YAML
	doc := NewDocument("file:///invalid.yaml", content, 1)
	doc.TryParseYAML()

	parsed, err := doc.GetParsedYAML()
	if err == nil {
		t.Fatal("TryParseYAML for invalid YAML expected error, got nil")
	}
	if parsed != nil {
		t.Error("TryParseYAML for invalid YAML should return nil root")
	}
	if !strings.Contains(err.Error(), "mapping values are not allowed in this context") {
		t.Errorf("Expected error to contain 'mapping values are not allowed', got: %v", err)
	}
}

func TestDocument_GetParsedYAML_LazyParsing(t *testing.T) {
	content := "item: test"
	doc := NewDocument("file:///lazy.yaml", content, 1)

	// Access mu and parsedYAMLRoot directly for this specific test setup (not typical)
	doc.mu.Lock() // Lock to check initial state safely
	if doc.parsedYAMLRoot != nil || doc.parseErr != nil {
		doc.mu.Unlock()
		t.Fatal("Document should not have parsed YAML yet for lazy parsing test")
	}
	doc.mu.Unlock()

	parsed, err := doc.GetParsedYAML() // This should trigger parsing
	if err != nil {
		t.Fatalf("GetParsedYAML (triggering lazy parse) failed: %v", err)
	}
	if parsed == nil {
		t.Fatal("GetParsedYAML (triggering lazy parse) returned nil root")
	}

	doc.mu.RLock() // Check internal state again
	defer doc.mu.RUnlock()
	if doc.parsedYAMLRoot == nil {
		t.Error("parsedYAMLRoot should be populated after lazy parsing")
	}
	if doc.parseErr != nil {
		t.Errorf("parseErr should be nil after successful lazy parsing, got %v", doc.parseErr)
	}
}
