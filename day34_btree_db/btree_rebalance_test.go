package rdbms

import (
	"fmt"
	"path/filepath"
	"reflect"
	"slices"
	"testing"
)

// Helper function to setup BTree with DiskManager for rebalance testing
// (Copied from btree_delete_test.go, could be shared in test_helper.go if needed more broadly)
func setupBTreeWithDiskManagerRebalance(t *testing.T, degree int) (*BTree, *DiskManager) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_rebalance.db")
	tableName := "test_rebalance_table"
	dm, err := NewDiskManager(dbPath)
	if err != nil {
		t.Fatalf("Failed to create DiskManager: %v", err)
	}

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

	tree, err := NewBTree(dm, initialRootPageID, degree)
	if err != nil {
		dm.Close()
		t.Fatalf("Failed to create BTree: %v", err)
	}
	return tree, dm
}

// TestBorrowFromSiblingInternal tests the borrowFromSibling logic for internal nodes.
func TestBorrowFromSiblingInternal(t *testing.T) {
	degree := 3
	tableName := "test_table" // Use the same table name

	initialKeys := make([]KeyType, 0, 20)
	for i := 1; i <= 20; i++ {
		initialKeys = append(initialKeys, KeyType(i))
	}

	t.Log("--- Initial Tree Structure Analysis --- Borrower Internal --- ")
	// Use rebalance helper for setup
	treeForAnalysis, dmForAnalysis := setupBTreeWithDiskManagerRebalance(t, degree)
	for _, key := range initialKeys {
		if err := treeForAnalysis.Insert(tableName, key, []byte(fmt.Sprintf("val%d", key))); err != nil { // Add tableName
			dmForAnalysis.Close()
			t.Fatalf("Insert failed during setup for analysis: %v", err)
		}
	}
	rootNodeForPrint, err := dmForAnalysis.ReadNode(treeForAnalysis.rootPageID)
	if err != nil {
		dmForAnalysis.Close()
		t.Fatalf("Failed to read root node for printing: %v", err)
	}
	printTreeHelper(t, dmForAnalysis, rootNodeForPrint, "") // Assumes printTreeHelper is available (e.g., in test_helper.go)
	dmForAnalysis.Close()
	t.Log("--- End Initial Tree Structure Analysis --- Borrower Internal --- ")

	tests := []struct {
		name                    string
		targetParentPageID      PageID // PageID of the parent internal node
		childIndexWithinParent  int    // Index of the child internal node needing borrow
		borrowFromLeft          bool
		expectedParentKeys      []KeyType
		expectedChildKeys       []KeyType
		expectedChildChildren   []PageID
		expectedSiblingKeys     []KeyType
		expectedSiblingChildren []PageID
	}{
		{
			name:                   "Borrow from Right Internal Sibling",
			targetParentPageID:     8, // From analysis: Parent node ID
			childIndexWithinParent: 0, // Index of child needing borrow (node 2)
			borrowFromLeft:         false,
			// Expected state AFTER borrow from right (Node 9 -> Node 2 under Parent 8)
			// Parent 8: Keys [7] -> [9]
			// Child 2: Keys [3 5] -> [3 5 7], Children [L1 L3 L4] -> [L1 L3 L4 L5]
			// Sibling 9: Keys [9 11 13 15 17] -> [11 13 15 17], Children [L5 L6 L7 L10 L11 L12] -> [L6 L7 L10 L11 L12]
			expectedParentKeys:      []KeyType{9},               // Parent key 7 replaced by 9 from sibling
			expectedChildKeys:       []KeyType{3, 5, 7},         // Parent key 7 added
			expectedChildChildren:   []PageID{1, 3, 4, 5},       // Sibling child L5 added
			expectedSiblingKeys:     []KeyType{11, 13, 15, 17},  // Key 9 moved up
			expectedSiblingChildren: []PageID{6, 7, 10, 11, 12}, // Child L5 removed
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Use rebalance helper for setup
			tree, dm := setupBTreeWithDiskManagerRebalance(t, degree)
			defer dm.Close()
			for _, key := range initialKeys {
				if err := tree.Insert(tableName, key, []byte(fmt.Sprintf("val%d", key))); err != nil { // Add tableName
					t.Fatalf("Insert failed during test setup: %v", err)
				}
			}

			// --- Find target nodes --- (Based on PageIDs from analysis)
			parentRead, err := dm.ReadNode(tt.targetParentPageID)
			if err != nil {
				t.Fatalf("Failed to read parent node %d: %v", tt.targetParentPageID, err)
			}
			parentNode := parentRead.(*InternalNode)

			childPageID := parentNode.children[tt.childIndexWithinParent]
			var siblingPageID PageID
			if tt.borrowFromLeft {
				siblingPageID = parentNode.children[tt.childIndexWithinParent-1]
			} else {
				siblingPageID = parentNode.children[tt.childIndexWithinParent+1]
			}

			// --- Call borrowFromSibling ---
			err = tree.borrowFromSibling(parentNode, tt.childIndexWithinParent, tt.borrowFromLeft)
			if err != nil {
				t.Fatalf("borrowFromSibling failed: %v", err)
			}

			// --- Verification ---
			// Read nodes again after borrow
			parentAfter, err := dm.ReadNode(tt.targetParentPageID)
			if err != nil {
				t.Fatalf("Failed to read parent node %d after borrow: %v", tt.targetParentPageID, err)
			}
			parentInternalAfter := parentAfter.(*InternalNode)

			childAfter, err := dm.ReadNode(childPageID)
			if err != nil {
				t.Fatalf("Failed to read child node %d after borrow: %v", childPageID, err)
			}
			childInternalAfter := childAfter.(*InternalNode)

			siblingAfter, err := dm.ReadNode(siblingPageID)
			if err != nil {
				t.Fatalf("Failed to read sibling node %d after borrow: %v", siblingPageID, err)
			}
			siblingInternalAfter := siblingAfter.(*InternalNode)

			// Check parent keys
			if !reflect.DeepEqual(parentInternalAfter.keys, tt.expectedParentKeys) {
				t.Errorf("Parent keys mismatch. Got %v, want %v", parentInternalAfter.keys, tt.expectedParentKeys)
			}
			// Check child keys and children
			if !reflect.DeepEqual(childInternalAfter.keys, tt.expectedChildKeys) {
				t.Errorf("Child keys mismatch. Got %v, want %v", childInternalAfter.keys, tt.expectedChildKeys)
			}
			if !reflect.DeepEqual(childInternalAfter.children, tt.expectedChildChildren) {
				t.Errorf("Child children mismatch. Got %v, want %v", childInternalAfter.children, tt.expectedChildChildren)
			}
			// Check sibling keys and children
			if !reflect.DeepEqual(siblingInternalAfter.keys, tt.expectedSiblingKeys) {
				t.Errorf("Sibling keys mismatch. Got %v, want %v", siblingInternalAfter.keys, tt.expectedSiblingKeys)
			}
			if !reflect.DeepEqual(siblingInternalAfter.children, tt.expectedSiblingChildren) {
				t.Errorf("Sibling children mismatch. Got %v, want %v", siblingInternalAfter.children, tt.expectedSiblingChildren)
			}
		})
	}
}

func TestMergeChildrenLeaf(t *testing.T) {
	degree := 3
	tableName := "test_table" // Use the same table name
	tests := []struct {
		name                   string
		initialKeys            []KeyType
		mergeIndex             int // Index of the LEFT child in the merge operation
		expectedParentKeys     []KeyType
		expectedMergedLeafKeys []KeyType
		expectedMergedLeafNext PageID // PageID of the node that *should* be next after merge
	}{
		// Insert 1..8 with degree 3. Expected structure:
		//      Root[5]
		//     /     \
		// Int[3]   Int[7]
		// / | \    / | \
		// L[1,2] L[3,4] L[5,6] L[7,8]
		// Let's merge L[1,2] (index 0 of Int[3]) and L[3,4] (index 1 of Int[3])
		// Parent is Root[5] -> children[0] is Int[3]
		// We merge L[1,2] and L[3,4] under Int[3].
		// Int[3] keys: [3]. Children: [L1, L3]. mergeIndex=0.
		// Parent key [3] is removed. Parent children [L1, L3] becomes [MergedL1].
		// Merged Leaf keys: [1,2,3,4].
		{
			name:                   "Merge Two Leaf Nodes (Root is Internal)",
			initialKeys:            []KeyType{1, 2, 3, 4, 5, 6, 7, 8},
			mergeIndex:             0,                     // Merge L1 (child 0) and L3 (child 1) under Parent 2 (keys [3 5])
			expectedParentKeys:     []KeyType{5},          // Parent key [3] removed, [5] remains
			expectedMergedLeafKeys: []KeyType{1, 2, 3, 4}, // Merged keys from L1=[1,2] and L3=[3,4]
			expectedMergedLeafNext: 4,                     // L3's next should have been L4 (ID 4)
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Use rebalance helper for setup
			tree, dm := setupBTreeWithDiskManagerRebalance(t, degree)
			defer dm.Close()
			for _, key := range tt.initialKeys {
				if err := tree.Insert(tableName, key, []byte(fmt.Sprintf("val%d", key))); err != nil {
					t.Fatalf("Insert failed during setup: %v", err)
				}
			}

			// Verify root node ID and type immediately after inserts
			finalRootNode, err := dm.ReadNode(tree.rootPageID)
			if err != nil {
				t.Fatalf("Failed to read final root node %d after inserts: %v", tree.rootPageID, err)
			}
			t.Logf("DEBUG: Final Root Page ID: %d, IsLeaf: %t", tree.rootPageID, finalRootNode.isLeaf())

			// Print tree to verify structure and IDs
			t.Logf("--- Tree Structure After Initial Insertions (%s) ---", tt.name)
			rootNodeForPrint, _ := dm.ReadNode(tree.rootPageID)
			printTreeHelper(t, dm, rootNodeForPrint, "  ") // Assumes printTreeHelper is available
			t.Logf("--- End Tree Structure ---")

			// --- Find parent and children --- (Use Root as parent in this case)
			rootNode, _ := dm.ReadNode(tree.rootPageID)
			parentNode, ok := rootNode.(*InternalNode)
			if !ok {
				t.Fatalf("Root node %d is not internal as expected (IsLeaf=%t)", tree.rootPageID, rootNode.isLeaf())
			}
			parentPageID := parentNode.getPageID()

			if tt.mergeIndex >= len(parentNode.children)-1 {
				t.Fatalf("mergeIndex %d is out of bounds for parent %d children %v", tt.mergeIndex, parentPageID, parentNode.children)
			}

			leftPageID := parentNode.children[tt.mergeIndex]
			rightPageID := parentNode.children[tt.mergeIndex+1]
			leftNode, _ := dm.ReadNode(leftPageID)
			rightNode, _ := dm.ReadNode(rightPageID)
			leftLeaf := leftNode.(*LeafNode)
			rightLeaf := rightNode.(*LeafNode)

			// Calculate expected count *before* merge modifies the parent
			expectedChildrenCountAfterMerge := len(parentNode.children) - 1

			t.Logf("Attempting to merge Left Leaf %d (Keys: %v) and Right Leaf %d (Keys: %v) under Parent %d (Keys: %v) at index %d",
				leftPageID, leftLeaf.keys, rightPageID, rightLeaf.keys, parentPageID, parentNode.keys, tt.mergeIndex)

			// --- Call mergeChildren ---
			err = tree.mergeChildren(parentNode, tt.mergeIndex, leftLeaf, rightLeaf)
			if err != nil {
				t.Fatalf("mergeChildren failed: %v", err)
			}
			// Must write parent after merge!
			if err := dm.WriteNode(parentNode); err != nil {
				t.Fatalf("Failed to write parent node after merge: %v", err)
			}

			// --- Verification ---
			parentAfter, _ := dm.ReadNode(parentPageID) // Read parent again AFTER mergeChildren call
			parentInternalAfter := parentAfter.(*InternalNode)
			if !reflect.DeepEqual(parentInternalAfter.keys, tt.expectedParentKeys) {
				t.Errorf("Parent keys mismatch after merge. Got %v, want %v", parentInternalAfter.keys, tt.expectedParentKeys)
			}
			// Check parent children count
			if len(parentInternalAfter.children) != expectedChildrenCountAfterMerge { // Use the pre-calculated value
				t.Errorf("Parent children count incorrect after merge. Got %d, want %d", len(parentInternalAfter.children), expectedChildrenCountAfterMerge)
			}
			// Check merged left leaf (now at index 0)
			mergedLeafRead, err := dm.ReadNode(leftPageID)
			if err != nil {
				t.Fatalf("Failed to read merged leaf node %d: %v", leftPageID, err)
			}
			mergedLeafNode := mergedLeafRead.(*LeafNode)
			if !reflect.DeepEqual(mergedLeafNode.keys, tt.expectedMergedLeafKeys) {
				t.Errorf("Merged leaf keys mismatch. Got %v, want %v", mergedLeafNode.keys, tt.expectedMergedLeafKeys)
			}
			t.Logf("DEBUG [TestMergeChildrenLeaf]: Read Merged Leaf %d. Keys: %v, Next: %d (Expected Next: %d)", mergedLeafNode.getPageID(), mergedLeafNode.keys, mergedLeafNode.next, tt.expectedMergedLeafNext)
			if mergedLeafNode.next != tt.expectedMergedLeafNext {
				t.Errorf("Merged leaf next pointer mismatch. Got %d, want %d", mergedLeafNode.next, tt.expectedMergedLeafNext)
			}
		})
	}
}

func TestMergeChildrenInternal(t *testing.T) {
	degree := 3
	tableName := "test_table_merge_internal"

	initialKeys := make([]KeyType, 0, 15)
	for i := 1; i <= 15; i++ {
		initialKeys = append(initialKeys, KeyType(i))
	}

	// Use rebalance helper for setup
	tree, dm := setupBTreeWithDiskManagerRebalance(t, degree)
	defer dm.Close()

	for _, key := range initialKeys {
		if err := tree.Insert(tableName, key, []byte(fmt.Sprintf("val%d", key))); err != nil {
			t.Fatalf("Insert failed during setup: %v", err)
		}
	}
	t.Log("--- Tree Structure Before Merge (Internal) ---")
	rootNodeForPrint, _ := dm.ReadNode(tree.rootPageID)
	printTreeHelper(t, dm, rootNodeForPrint, "  ") // Assumes printTreeHelper is available
	t.Log("--- End Tree Structure ---")

	// --- Identification (Based on printed structure for keys 1-15, deg 3) ---
	parentPageID := PageID(8) // Root node
	leftChildIndex := 0       // Index of node 2 under node 8

	parentNodeRead, err := dm.ReadNode(parentPageID)
	if err != nil {
		t.Fatalf("Failed to read parent node %d: %v", parentPageID, err)
	}
	parentNode, ok := parentNodeRead.(*InternalNode)
	if !ok {
		t.Fatalf("Parent node %d is not internal", parentPageID)
	}

	if leftChildIndex >= len(parentNode.children)-1 {
		t.Fatalf("leftChildIndex %d is out of bounds for parent %d children %v", leftChildIndex, parentPageID, parentNode.children)
	}

	leftPageID := parentNode.children[leftChildIndex]
	rightPageID := parentNode.children[leftChildIndex+1]
	leftNode, _ := dm.ReadNode(leftPageID)
	rightNode, _ := dm.ReadNode(rightPageID)

	leftInternal, okL := leftNode.(*InternalNode)
	rightInternal, okR := rightNode.(*InternalNode)
	if !okL || !okR {
		t.Fatalf("Cannot merge: Child %d (type %T) or %d (type %T) is not InternalNode", leftPageID, leftNode, rightPageID, rightNode)
	}

	parentKeyToPullDown := parentNode.keys[leftChildIndex]
	expectedMergedKeys := append([]KeyType{}, leftInternal.keys...)
	expectedMergedKeys = append(expectedMergedKeys, parentKeyToPullDown)
	expectedMergedKeys = append(expectedMergedKeys, rightInternal.keys...)
	expectedMergedChildren := append([]PageID{}, leftInternal.children...)
	expectedMergedChildren = append(expectedMergedChildren, rightInternal.children...)
	expectedParentKeysAfterMerge := slices.Delete(append([]KeyType{}, parentNode.keys...), leftChildIndex, leftChildIndex+1)
	expectedParentChildrenAfterMerge := slices.Delete(append([]PageID{}, parentNode.children...), leftChildIndex+1, leftChildIndex+2)

	t.Logf("Attempting to merge Left Internal %d (Keys: %v) and Right Internal %d (Keys: %v) under Parent %d (Keys: %v) at index %d",
		leftPageID, leftInternal.keys, rightPageID, rightInternal.keys, parentPageID, parentNode.keys, leftChildIndex)

	// --- Call mergeChildren ---
	err = tree.mergeChildren(parentNode, leftChildIndex, leftInternal, rightInternal)
	if err != nil {
		t.Fatalf("mergeChildren failed: %v", err)
	}
	if err := dm.WriteNode(parentNode); err != nil {
		t.Fatalf("Failed to write parent node after merge: %v", err)
	}

	// --- Verification ---
	parentAfter, _ := dm.ReadNode(parentPageID)
	parentInternalAfter := parentAfter.(*InternalNode)

	// Check parent keys, considering nil vs empty slice
	areKeysEqual := false
	if (parentInternalAfter.keys == nil && len(expectedParentKeysAfterMerge) == 0) ||
		(len(parentInternalAfter.keys) == 0 && expectedParentKeysAfterMerge == nil) ||
		reflect.DeepEqual(parentInternalAfter.keys, expectedParentKeysAfterMerge) {
		areKeysEqual = true
	}
	if !areKeysEqual {
		t.Errorf("Parent keys mismatch after merge. Got %v (nil:%t), want %v (nil:%t)",
			parentInternalAfter.keys, parentInternalAfter.keys == nil,
			expectedParentKeysAfterMerge, expectedParentKeysAfterMerge == nil)
	}

	// Check parent children, considering nil vs empty slice
	areChildrenEqual := false
	if (parentInternalAfter.children == nil && len(expectedParentChildrenAfterMerge) == 0) ||
		(len(parentInternalAfter.children) == 0 && expectedParentChildrenAfterMerge == nil) ||
		reflect.DeepEqual(parentInternalAfter.children, expectedParentChildrenAfterMerge) {
		areChildrenEqual = true
	}
	if !areChildrenEqual {
		t.Errorf("Parent children mismatch after merge. Got %v (nil:%t), want %v (nil:%t)",
			parentInternalAfter.children, parentInternalAfter.children == nil,
			expectedParentChildrenAfterMerge, expectedParentChildrenAfterMerge == nil)
	}

	mergedNodeAfter, _ := dm.ReadNode(leftPageID) // Left node should contain the merged result
	mergedInternalAfter := mergedNodeAfter.(*InternalNode)
	if !reflect.DeepEqual(mergedInternalAfter.keys, expectedMergedKeys) {
		t.Errorf("Merged internal keys mismatch. Got %v, want %v", mergedInternalAfter.keys, expectedMergedKeys)
	}
	if !reflect.DeepEqual(mergedInternalAfter.children, expectedMergedChildren) {
		t.Errorf("Merged internal children mismatch. Got %v, want %v", mergedInternalAfter.children, expectedMergedChildren)
	}
}
