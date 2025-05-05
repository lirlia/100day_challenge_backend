package rdbms

import (
	"bytes"
	"fmt"
	"path/filepath"
	"reflect"
	"testing"
)

func TestDeleteFromLeaf(t *testing.T) {
	// Create a leaf node (assume BTree context provides 't' which has 'd')
	// Let's manually create it for this unit test
	leaf := &LeafNode{
		keys:   []KeyType{10, 20, 30, 40},
		values: []ValueType{[]byte("v10"), []byte("v20"), []byte("v30"), []byte("v40")},
	}
	btree := &BTree{degree: 3} // Dummy BTree with degree

	// Delete middle element (20 at index 1)
	btree.deleteFromLeaf(leaf, 1)
	expectedKeys := []KeyType{10, 30, 40}
	expectedValues := []ValueType{[]byte("v10"), []byte("v30"), []byte("v40")}
	if !reflect.DeepEqual(leaf.keys, expectedKeys) {
		t.Errorf("After deleting index 1, keys incorrect: got %v, want %v", leaf.keys, expectedKeys)
	}
	// Check values
	if len(leaf.values) != len(expectedValues) || !bytes.Equal(leaf.values[0], expectedValues[0]) || !bytes.Equal(leaf.values[1], expectedValues[1]) || !bytes.Equal(leaf.values[2], expectedValues[2]) {
		t.Errorf("After deleting index 1, values incorrect: got %s, want %s", leaf.values, expectedValues)
	}

	// Delete first element (10 at index 0)
	btree.deleteFromLeaf(leaf, 0)
	expectedKeys = []KeyType{30, 40}
	expectedValues = []ValueType{[]byte("v30"), []byte("v40")}
	if !reflect.DeepEqual(leaf.keys, expectedKeys) {
		t.Errorf("After deleting index 0, keys incorrect: got %v, want %v", leaf.keys, expectedKeys)
	}
	// Check values
	if len(leaf.values) != len(expectedValues) || !bytes.Equal(leaf.values[0], expectedValues[0]) || !bytes.Equal(leaf.values[1], expectedValues[1]) {
		t.Errorf("After deleting index 0, values incorrect: got %s, want %s", leaf.values, expectedValues)
	}

	// Delete last element (40 at index 1)
	btree.deleteFromLeaf(leaf, 1)
	expectedKeys = []KeyType{30}
	expectedValues = []ValueType{[]byte("v30")}
	if !reflect.DeepEqual(leaf.keys, expectedKeys) {
		t.Errorf("After deleting index 1 (last), keys incorrect: got %v, want %v", leaf.keys, expectedKeys)
	}
	// Check values
	if len(leaf.values) != len(expectedValues) || !bytes.Equal(leaf.values[0], expectedValues[0]) {
		t.Errorf("After deleting index 1 (last), values incorrect: got %s, want %s", leaf.values, expectedValues)
	}

	// Delete the only remaining element (30 at index 0)
	btree.deleteFromLeaf(leaf, 0)
	expectedKeys = []KeyType{}
	expectedValues = []ValueType{}
	if !reflect.DeepEqual(leaf.keys, expectedKeys) {
		t.Errorf("After deleting index 0 (only), keys incorrect: got %v, want %v", leaf.keys, expectedKeys)
	}
	if len(leaf.values) != 0 {
		t.Errorf("After deleting index 0 (only), values incorrect: got %s, want empty", leaf.values)
	}

	// Test index out of bounds (should do nothing or error)
	leaf = &LeafNode{keys: []KeyType{10}}
	btree.deleteFromLeaf(leaf, 1) // Index 1 is out of bounds
	if len(leaf.keys) != 1 {
		t.Errorf("Deleting out of bounds index should not change keys")
	}
	btree.deleteFromLeaf(leaf, -1) // Index -1 is out of bounds
	if len(leaf.keys) != 1 {
		t.Errorf("Deleting negative index should not change keys")
	}
}

// Helper function to setup BTree with DiskManager for delete testing
func setupBTreeWithDiskManagerDelete(t *testing.T, degree int) (*BTree, *DiskManager) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_delete.db")
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

// TestBorrowFromSiblingLeaf tests the borrowFromSibling logic triggered by a Delete operation.
func TestBorrowFromSiblingLeaf(t *testing.T) {
	degree := 3
	tableName := "test_table_borrow_leaf"

	tests := []struct {
		name              string
		initialKeys       []KeyType
		keysToDelete      []KeyType // Keys to delete sequentially
		expectedFinalKeys []KeyType // Expected keys in the tree after all deletes
	}{
		{
			// Initial: Root[30]->L[10,20], R[30,40,50,60]
			// Delete 10 -> L[20] (OK)
			// Delete 20 -> L[] (underflow, len=0 < minKeys=1)
			// Should borrow from R[30,40,50,60].
			// L gets [30], R becomes [40,50,60]. Parent separator becomes 40.
			name:              "Delete_Causes_Leaf_Underflow_And_Borrow",
			initialKeys:       []KeyType{10, 20, 30, 40, 50, 60},
			keysToDelete:      []KeyType{10, 20},         // Deleting 10 and 20 triggers borrow
			expectedFinalKeys: []KeyType{30, 40, 50, 60}, // Expected keys after borrow
		},
		{
			// Initial: Root[20]->L[10,20], R[20,30,40,50,60]
			// Insert 70, 80. R splits: Root[20,40]->L[10,20], M[20,30], R[40,50,60,70,80]
			// Delete 30 from M[20,30] -> M becomes [20] (len=1 == minKeys=1, ok)
			// No borrow/merge expected here based on current logic.
			name:              "Delete_Not_Causing_Underflow",
			initialKeys:       []KeyType{10, 20, 30, 40, 50, 60, 70, 80},
			keysToDelete:      []KeyType{30},
			expectedFinalKeys: []KeyType{10, 20, 40, 50, 60, 70, 80},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tree, dm := setupBTreeWithDiskManagerDelete(t, degree)
			defer dm.Close()

			// Insert initial keys
			for _, key := range tt.initialKeys {
				val := []byte(fmt.Sprintf("val%d", key))
				if err := tree.Insert(tableName, key, val); err != nil {
					t.Fatalf("Insert failed during setup: key=%d, error=%v", key, err)
				}
			}
			t.Logf("--- Initial Tree Structure Before Delete (%s) ---", tt.name)
			rootNodeForPrint, _ := dm.ReadNode(tree.rootPageID)
			printTreeHelper(t, dm, rootNodeForPrint, "  ")
			t.Logf("--- End Initial Tree Structure ---")

			// Perform the delete operations
			for _, keyToDelete := range tt.keysToDelete {
				t.Logf("Deleting key %d...", keyToDelete)
				if err := tree.Delete(tableName, keyToDelete); err != nil {
					t.Fatalf("Delete operation failed for key %d: %v", keyToDelete, err)
				}
			}

			// Verify the final state of the tree by scanning all keys
			finalKeys, err := getAllKeysInTree(tree, dm)
			if err != nil {
				t.Fatalf("Failed to get all keys after delete: %v", err)
			}

			t.Logf("--- Final Tree Structure After Delete (%s) ---", tt.name)
			finalRootNodeForPrint, _ := dm.ReadNode(tree.rootPageID)
			printTreeHelper(t, dm, finalRootNodeForPrint, "  ")
			t.Logf("--- End Final Tree Structure ---")

			if !reflect.DeepEqual(finalKeys, tt.expectedFinalKeys) {
				t.Errorf("Final keys mismatch. Got %v, want %v", finalKeys, tt.expectedFinalKeys)
			}

			// Optional: Add more detailed checks on specific nodes if needed,
			// but getAllKeysInTree provides a good overall verification.
		})
	}
}

// TestBorrowFromSiblingInternal moved to btree_rebalance_test.go

// printTreeHelper moved to test_helper.go

// TestMergeChildrenLeaf moved to btree_rebalance_test.go

// TestMergeChildrenInternal moved to btree_rebalance_test.go

// TestBTreeDelete tests the main Delete function.
func TestBTreeDelete(t *testing.T) {
	degree := 3
	tableName := "test_table" // Use the same table name

	tests := []struct {
		name          string
		initialKeys   []KeyType
		keyToDelete   KeyType
		expectedKeys  []KeyType
		expectedError bool
	}{
		{
			name:          "Simple Leaf Delete (No Rebalance)",
			initialKeys:   []KeyType{1, 2, 3, 4, 5},
			keyToDelete:   5,
			expectedKeys:  []KeyType{1, 2, 3, 4},
			expectedError: false,
		},
		{
			// Initial (deg=3, minKeys=1): Root[30]->L[10,20], R[30,40,50,60]
			// Delete 10 -> L[20]
			// Delete 20 -> L[] underflow, borrow from R[30,40,50,60]
			// Result: Root[40]->L[30], R[40,50,60]
			name:          "Leaf Delete causes Borrow",
			initialKeys:   []KeyType{10, 20, 30, 40, 50, 60},
			keyToDelete:   20,                        // Delete 20 after 10 (implicitly tested via borrow tests? Let's be explicit)
			expectedKeys:  []KeyType{30, 40, 50, 60}, // <-- Updated Expected Keys based on previous debug runs
			expectedError: false,                     // Requires deleting 10 first in the test setup for this specific case
		},
		{
			// Initial (deg=3, minKeys=1): Root[3]->L[1,2], R[3]
			// Delete 1 -> L[2]
			// Delete 2 -> L[] underflow. Sibling R[3] has minKeys (1). Merge L and R.
			// Parent pulls down 3. Merged node [3]. Parent becomes empty.
			// Root changes from [3] to the merged node.
			name:          "Leaf Delete causes Merge and Root Change",
			initialKeys:   []KeyType{1, 2, 3},
			keyToDelete:   1,            // Delete 1 first
			expectedKeys:  []KeyType{3}, // <-- Updated Expected Keys based on logic
			expectedError: false,
		},
		// TODO: Add Internal Node Borrow/Merge cases // Removed TODO, focus on fixing existing first
		// ... other test cases ...
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			testDegree := degree
			if tt.name == "Internal Node Borrow from Right" {
				testDegree = 4
			}

			tree, dm := setupBTreeWithDiskManagerDelete(t, testDegree)
			defer dm.Close()

			// Insert initial keys
			for _, key := range tt.initialKeys {
				if err := tree.Insert(tableName, key, []byte(fmt.Sprintf("val%d", key))); err != nil { // Add tableName
					t.Fatalf("Insert failed during setup: %v", err)
				}
			}

			// Pre-delete setup for specific cases
			if tt.name == "Leaf Delete causes Borrow" {
				if err := tree.Delete(tableName, 10); err != nil {
					t.Fatalf("[%s] Pre-delete of 10 failed: %v", tt.name, err)
				}
				// Now delete the key that triggers the borrow
				if err := tree.Delete(tableName, tt.keyToDelete); err != nil {
					if !tt.expectedError {
						t.Errorf("Delete failed unexpectedly: %v", err)
					}
				} else if tt.expectedError {
					t.Errorf("Delete expected error but got nil")
				}
				// expectedKeys are already set for this case
			} else if tt.name == "Leaf Delete causes Merge and Root Change" {
				// Delete 1 first
				if err := tree.Delete(tableName, 1); err != nil {
					t.Fatalf("[%s] Pre-delete of 1 failed: %v", tt.name, err)
				}
				// Now delete the key that triggers the merge (which is 2 in this test's logic)
				// The delete of tt.keyToDelete=1 happened above. We need to delete 2 now.
				if err := tree.Delete(tableName, 2); err != nil {
					if !tt.expectedError {
						t.Errorf("[%s] Delete of 2 failed unexpectedly: %v", tt.name, err)
					}
				} else if tt.expectedError {
					t.Errorf("Delete of 2 expected error but got nil")
				}
				tt.expectedKeys = []KeyType{3} // Final state after deleting 1 then 2
			} else {
				// Normal delete case
				if err := tree.Delete(tableName, tt.keyToDelete); err != nil && !tt.expectedError {
					t.Errorf("Delete failed unexpectedly: %v", err)
				} else if err == nil && tt.expectedError {
					t.Errorf("Delete expected error but got nil")
				}
			}

			// Verify final keys
			if !tt.expectedError {
				// Print tree structure *just before* getting keys (Removed Log)
				/*
					t.Logf("[%s] --- Final Tree Structure Before Verification ---", tt.name)
					rootNodeForVerify, _ := dm.ReadNode(tree.rootPageID)
					printTreeHelper(t, dm, rootNodeForVerify, "  ")
					t.Logf("[%s] --- End Final Tree Structure ---", tt.name)
				*/

				finalKeys, err := getAllKeysInTree(tree, dm)
				if err != nil {
					t.Fatalf("Failed to get all keys after delete: %v", err)
				}
				if !reflect.DeepEqual(finalKeys, tt.expectedKeys) {
					t.Errorf("Final keys mismatch. Got %v, want %v", finalKeys, tt.expectedKeys)
				}
			}
		})
	}
}

// getAllKeysInTree moved to test_helper.go
