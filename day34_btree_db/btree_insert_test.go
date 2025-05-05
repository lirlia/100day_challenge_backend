package rdbms

import (
	"bytes"
	"fmt"
	"path/filepath"
	"testing"
	// For printTree debugging
	// Import other necessary packages like reflect if needed
)

// Helper function to print tree structure (for debugging)
func printTree(t *testing.T, node Node, prefix string) {
	// Implement tree printing logic if needed for debugging
	t.Logf("%sNode(%p): %v", prefix, node, node)
	if node == nil || node.isLeaf() {
		return
	}
	internal := node.(*InternalNode)
	for _, child := range internal.children {
		// Correct recursive call to printTree
		// We need a way to get the child Node from PageID using DiskManager for proper printing
		// This printTree is currently not fully functional with PageIDs
		// For now, just print the PageID
		t.Logf("%s  Child PageID: %d", prefix, child)
		// printTree(t, childNode, prefix+"  ") // Requires reading node
	}
}

// Helper function to setup BTree with DiskManager for testing
func setupBTreeWithDiskManager(t *testing.T, degree int) (*BTree, *DiskManager) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_insert.db")
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

// TestBTreeInsertAndSearch tests basic insert and search operations.
func TestBTreeInsertAndSearch(t *testing.T) {
	tree, dm := setupBTreeWithDiskManager(t, DefaultDegree)
	defer dm.Close()
	tableName := "test_table" // Use the same table name

	key1 := KeyType(10)
	val1 := []byte("value1")
	key2 := KeyType(20)
	val2 := []byte("value2")

	// Insert key1
	if err := tree.Insert(tableName, key1, val1); err != nil { // Add tableName
		t.Fatalf("Insert failed for key %d: %v", key1, err)
	}

	// Search for key1
	retVal, found := tree.Search(key1)
	if !found {
		t.Errorf("Search failed to find key %d after insert", key1)
	}
	if !bytes.Equal(retVal, val1) {
		t.Errorf("Search returned incorrect value for key %d. Got %s, want %s", key1, retVal, val1)
	}

	// Insert key2
	if err := tree.Insert(tableName, key2, val2); err != nil { // Add tableName
		t.Fatalf("Insert failed for key %d: %v", key2, err)
	}

	// Search for key2
	retVal, found = tree.Search(key2)
	if !found {
		t.Errorf("Search failed to find key %d after insert", key2)
	}
	if !bytes.Equal(retVal, val2) {
		t.Errorf("Search returned incorrect value for key %d. Got %s, want %s", key2, retVal, val2)
	}

	// Search for key1 again
	retVal, found = tree.Search(key1)
	if !found {
		t.Errorf("Search failed to find key %d after inserting key %d", key1, key2)
	}
	if !bytes.Equal(retVal, val1) {
		t.Errorf("Search returned incorrect value for key %d after inserting key %d. Got %s, want %s", key1, key2, retVal, val1)
	}
}

// TestBTreeInsert_Duplicate tests inserting a duplicate key.
func TestBTreeInsert_Duplicate(t *testing.T) {
	tree, dm := setupBTreeWithDiskManager(t, DefaultDegree)
	defer dm.Close()
	tableName := "test_table" // Use the same table name

	key1 := KeyType(15)
	val1 := []byte("value15")
	newVal1 := []byte("newValue15") // The value used for the second insert

	if err := tree.Insert(tableName, key1, val1); err != nil { // Add tableName
		t.Fatalf("Initial insert failed for key %d: %v", key1, err)
	}

	// Try inserting the same key again with a new value
	err := tree.Insert(tableName, key1, newVal1) // Add tableName
	if err != nil {                              // Insert should now succeed by overwriting
		t.Errorf("Expected Insert to succeed (overwrite) for duplicate key %d, but got error: %v", key1, err)
	}

	// Verify the value was overwritten
	retVal, found := tree.Search(key1)
	if !found {
		t.Errorf("Search failed for key %d after duplicate insert attempt", key1)
	}
	// Check if the value is the new value
	if !bytes.Equal(retVal, newVal1) {
		t.Errorf("Value for key %d was not overwritten correctly. Got %s, want %s", key1, retVal, newVal1)
	}
}

// TestBTreeInsert_Split tests node splitting during insertion.
func TestBTreeInsert_Split(t *testing.T) {
	// Use a small degree to force splits quickly
	degree := 2 // max keys = 2*2 - 1 = 3
	tree, dm := setupBTreeWithDiskManager(t, degree)
	defer dm.Close()
	tableName := "test_table" // Use the same table name

	// Insert keys to cause splits (degree 2 -> max 3 keys/node)
	keys := []KeyType{10, 20, 30, 5, 15, 25}

	for _, key := range keys {
		val := []byte(fmt.Sprintf("val%d", key))
		if err := tree.Insert(tableName, key, val); err != nil { // Add tableName
			t.Fatalf("Insert failed for key %d during split test: %v", key, err)
		}
	}

	// Verify all inserted keys can be found
	for _, key := range keys {
		val := []byte(fmt.Sprintf("val%d", key))
		retVal, found := tree.Search(key)
		if !found {
			t.Errorf("Search failed for key %d after splits", key)
		}
		if !bytes.Equal(retVal, val) {
			t.Errorf("Search returned incorrect value for key %d after splits. Got %s, want %s", key, retVal, val)
		}
	}

	// Use the helper from delete_test if available, or copy it here.
	t.Log("--- Tree Structure After Splits (TestBTreeInsert_Split) ---")
	rootNodeForPrint, err := dm.ReadNode(tree.rootPageID)
	if err != nil {
		t.Fatalf("Failed to read root node for printing: %v", err)
	}
	printTreeHelperInsert(t, dm, rootNodeForPrint, "  ") // Use the copied/adapted helper
	t.Log("--- End Tree Structure ---")
}

// Copied and renamed from btree_delete_test.go
func printTreeHelperInsert(t *testing.T, dm *DiskManager, node Node, prefix string) {
	if node == nil {
		return
	}

	if node.isLeaf() {
		leaf := node.(*LeafNode)
		t.Logf("%sLeaf %d: Keys %v, Next %d", prefix, leaf.getPageID(), leaf.keys, leaf.next)
	} else {
		internal := node.(*InternalNode)
		t.Logf("%sInternal %d: Keys %v", prefix, internal.getPageID(), internal.keys)
		newPrefix := prefix + "  "
		for _, childPageID := range internal.children {
			if childPageID != InvalidPageID {
				childNode, err := dm.ReadNode(childPageID)
				if err != nil {
					t.Logf("%s  Error reading child %d: %v", newPrefix, childPageID, err)
					continue
				}
				printTreeHelperInsert(t, dm, childNode, newPrefix)
			}
		}
	}
}

// Optional: Add a helper function to print the tree structure for debugging
// (Needs adaptation to work with DiskManager by reading nodes)
// func printTree(t *testing.T, tree *BTree, nodeID PageID, indent string) { ... }
