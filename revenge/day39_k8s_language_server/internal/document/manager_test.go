package document

import (
	"reflect"
	"sort"
	"testing"
)

func TestDocumentManager_New(t *testing.T) {
	dm := NewDocumentManager()
	if dm.documents == nil {
		t.Fatal("NewDocumentManager documents map should be initialized")
	}
	if len(dm.documents) != 0 {
		t.Errorf("NewDocumentManager should have 0 documents initially, got %d", len(dm.documents))
	}
}

func TestDocumentManager_Put_NewDocument(t *testing.T) {
	dm := NewDocumentManager()
	uri := "file:///new_doc.yaml"
	content := "name: test-doc"
	version := int32(1)

	doc := dm.Put(uri, content, version)
	if doc == nil {
		t.Fatal("Put should return the created document")
	}
	if doc.URI != uri || doc.Content != content || doc.Version != version {
		t.Errorf("Put returned document with unexpected fields: URI=%s, Content=%s, Version=%d", doc.URI, doc.Content, doc.Version)
	}

	retrievedDoc, ok := dm.Get(uri)
	if !ok {
		t.Fatal("Get should find document after Put")
	}
	if retrievedDoc != doc { // Should be the same instance
		t.Error("Get returned a different document instance than Put")
	}
	parsed, err := retrievedDoc.GetParsedYAML()
	if err != nil {
		t.Fatalf("YAML parsing failed for new document: %v", err)
	}
	if parsed == nil {
		t.Fatal("Parsed YAML is nil for new document")
	}
}

func TestDocumentManager_Put_UpdateDocument(t *testing.T) {
	dm := NewDocumentManager()
	uri := "file:///update_doc.yaml"
	initialContent := "version: 1"
	dm.Put(uri, initialContent, 1)

	updatedContent := "version: 2"
	updatedVersion := int32(2)
	doc := dm.Put(uri, updatedContent, updatedVersion)

	if doc.Content != updatedContent || doc.Version != updatedVersion {
		t.Errorf("Put (update) did not update fields: Content=%s, Version=%d", doc.Content, doc.Version)
	}

	retrievedDoc, _ := dm.Get(uri)
	if retrievedDoc.Content != updatedContent {
		t.Error("Get after update returned document with old content")
	}
}

func TestDocumentManager_DidOpen(t *testing.T) {
	dm := NewDocumentManager()
	uri := "file:///open.yaml"
	content := "opened: true"
	version := int32(1)

	doc := dm.DidOpen(uri, content, version)
	if doc == nil {
		t.Fatal("DidOpen should return the document")
	}
	_, ok := dm.Get(uri)
	if !ok {
		t.Error("Document not found after DidOpen")
	}
}

func TestDocumentManager_DidChange_Existing(t *testing.T) {
	dm := NewDocumentManager()
	uri := "file:///change.yaml"
	dm.Put(uri, "initial: content", 1)

	newContent := "changed: content"
	newVersion := int32(2)
	doc, ok := dm.DidChange(uri, newContent, newVersion)

	if !ok {
		t.Fatal("DidChange on existing document returned ok=false")
	}
	if doc == nil {
		t.Fatal("DidChange on existing document returned nil document")
	}
	if doc.Content != newContent || doc.Version != newVersion {
		t.Errorf("DidChange did not update content/version. Got Content=%s, Version=%d", doc.Content, doc.Version)
	}
}

func TestDocumentManager_DidChange_NonExisting(t *testing.T) {
	dm := NewDocumentManager()
	uri := "file:///change_nonexist.yaml"

	// Current implementation of DidChange returns nil, false for non-existing doc.
	doc, ok := dm.DidChange(uri, "some content", 1)

	if ok {
		t.Error("DidChange on non-existing document returned ok=true")
	}
	if doc != nil {
		t.Error("DidChange on non-existing document returned non-nil document")
	}
}

func TestDocumentManager_DidClose(t *testing.T) {
	dm := NewDocumentManager()
	uri := "file:///close.yaml"
	dm.Put(uri, "content", 1)

	dm.DidClose(uri)

	_, ok := dm.Get(uri)
	if ok {
		t.Error("Document found after DidClose")
	}
}

func TestDocumentManager_GetAllURIs(t *testing.T) {
	dm := NewDocumentManager()
	uri1 := "file:///doc1.yaml"
	uri2 := "file:///doc2.yaml"
	uri3 := "file:///another.txt"

	dm.Put(uri1, "", 1)
	dm.Put(uri2, "", 1)
	dm.Put(uri3, "", 1)

	expectedURIs := []string{uri1, uri2, uri3}
	actualURIs := dm.GetAllURIs()

	// Sort both slices for consistent comparison
	sort.Strings(expectedURIs)
	sort.Strings(actualURIs)

	if !reflect.DeepEqual(actualURIs, expectedURIs) {
		t.Errorf("GetAllURIs() = %v; want %v", actualURIs, expectedURIs)
	}

	dm.DidClose(uri2)
	expectedURIsAfterClose := []string{uri1, uri3}
	sort.Strings(expectedURIsAfterClose)
	actualURIsAfterClose := dm.GetAllURIs()
	sort.Strings(actualURIsAfterClose)
	if !reflect.DeepEqual(actualURIsAfterClose, expectedURIsAfterClose) {
		t.Errorf("GetAllURIs() after close = %v; want %v", actualURIsAfterClose, expectedURIsAfterClose)
	}
}
