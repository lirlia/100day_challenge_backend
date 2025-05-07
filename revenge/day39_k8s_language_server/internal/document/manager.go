package document

import (
	"sync"
)

// DocumentManager manages a collection of active documents.
// It provides thread-safe access to documents by their URI.
type DocumentManager struct {
	mu        sync.RWMutex
	documents map[string]*Document // Keyed by document URI
}

// NewDocumentManager creates a new DocumentManager.
func NewDocumentManager() *DocumentManager {
	return &DocumentManager{
		documents: make(map[string]*Document),
	}
}

// Get retrieves a document by its URI. Returns the document and true if found,
// otherwise nil and false.
func (dm *DocumentManager) Get(uri string) (*Document, bool) {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	doc, ok := dm.documents[uri]
	return doc, ok
}

// Put adds or updates a document in the manager.
// If the document already exists, its content and version are updated.
// If it does not exist, a new document is created and added.
func (dm *DocumentManager) Put(uri string, content string, version int32) *Document {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	doc, ok := dm.documents[uri]
	if ok {
		// Document exists, update it
		doc.Update(content, version) // Update method in Document handles its own parsing
		return doc
	}

	// Document does not exist, create a new one
	newDoc := NewDocument(uri, content, version)
	// NewDocument can optionally parse YAML. If not, ensure it's parsed for consistency or on demand.
	newDoc.TryParseYAML() // Ensure it's parsed after creation and adding to manager
	dm.documents[uri] = newDoc
	return newDoc
}

// DidOpen handles a new document being opened by the client.
// This is typically a wrapper around Put.
func (dm *DocumentManager) DidOpen(uri string, content string, version int32) *Document {
	return dm.Put(uri, content, version)
}

// DidChange handles a document being changed by the client.
// This is also typically a wrapper around Put, which will update the existing document.
func (dm *DocumentManager) DidChange(uri string, content string, version int32) (*Document, bool) {
	_, ok := dm.Get(uri) // Get is RLock, so safe to call outside dm.mu.Lock()
	if !ok {
		// Document not found, which might be an unexpected state for a DidChange event.
		// Optionally, treat as DidOpen or log an error.
		// For now, let's create it if it doesn't exist, though LSP spec implies it should.
		// return dm.Put(uri, content, version), false // Return false as it was not pre-existing
		return nil, false // Or strictly, return nil, false if it must exist
	}
	// Document exists, update it via Put to ensure proper locking and parsing logic.
	// The Put method will handle the update correctly.
	updatedDoc := dm.Put(uri, content, version)
	return updatedDoc, true
}

// DidClose handles a document being closed by the client.
// This removes the document from the manager.
func (dm *DocumentManager) DidClose(uri string) {
	dm.mu.Lock()
	defer dm.mu.Unlock()
	delete(dm.documents, uri)
}

// GetAllURIs returns a slice of all managed document URIs.
// Useful for iterating over all documents if needed (e.g., for workspace-wide diagnostics).
func (dm *DocumentManager) GetAllURIs() []string {
	dm.mu.RLock()
	defer dm.mu.RUnlock()
	uris := make([]string, 0, len(dm.documents))
	for uri := range dm.documents {
		uris = append(uris, uri)
	}
	return uris
}
