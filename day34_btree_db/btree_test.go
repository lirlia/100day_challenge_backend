package rdbms

import (
	"path/filepath"
	"testing"
)

// Helper to create a BTree with DiskManager for testing
func setupBTree(t *testing.T, degree int) (*BTree, *DiskManager) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_btree.db")
	tableName := "test_table" // Define a table name for the test
	dm, err := NewDiskManager(dbPath)
	if err != nil {
		t.Fatalf("Failed to create DiskManager: %v", err)
	}

	// Create initial root page for the test table
	initialRootPageID, err := dm.AllocatePage()
	if err != nil {
		dm.Close()
		t.Fatalf("Failed to allocate initial root page: %v", err)
	}
	emptyRootNode := NewLeafNode(initialRootPageID, degree)
	if err := dm.WriteNode(emptyRootNode); err != nil {
		dm.Close()
		t.Fatalf("Failed to write initial empty root node: %v", err)
	}
	if err := dm.SetTableRoot(tableName, initialRootPageID); err != nil {
		dm.Close()
		t.Fatalf("Failed to set initial table root metadata: %v", err)
	}

	// Now create BTree instance with the initial root page ID
	tree, err := NewBTree(dm, initialRootPageID, degree) // Pass the obtained rootPageID
	if err != nil {
		dm.Close()
		t.Fatalf("Failed to create BTree: %v", err)
	}
	return tree, dm
}

// TestNewBTree は NewBTree 関数の基本的なテストです。
func TestNewBTree(t *testing.T) {
	degree := 3
	tree, dm := setupBTree(t, degree) // Use helper
	defer dm.Close()

	if tree == nil {
		t.Fatal("NewBTree returned nil")
	}
	if tree.degree != degree {
		t.Errorf("Expected degree %d, got %d", degree, tree.degree)
	}
	if tree.rootPageID == InvalidPageID || tree.rootPageID == 0 { // Check against InvalidPageID (0)
		t.Errorf("Expected a valid root PageID, got %d", tree.rootPageID)
	}
	// Verify the root node is actually a leaf node initially
	rootNode, err := dm.ReadNode(tree.rootPageID)
	if err != nil {
		t.Fatalf("Failed to read root node %d: %v", tree.rootPageID, err)
	}
	if !rootNode.isLeaf() {
		t.Errorf("Expected initial root node to be a leaf, but it wasn't")
	}
}

// TODO: Add tests for the main Delete method once rebalancing/merging is implemented.
