package rdbms

import (
	"bytes"
	"path/filepath"
	"reflect"
	"sort"
	"testing"
)

// Helper function to setup BTree with DiskManager for scan testing
func setupBTreeWithDiskManagerScan(t *testing.T, degree int) (*BTree, *DiskManager) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test_scan.db")
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

// TestBTreeScanAll tests scanning all elements in the tree.
func TestBTreeScanAll(t *testing.T) {
	tree, dm := setupBTreeWithDiskManagerScan(t, DefaultDegree)
	defer dm.Close()
	tableName := "test_table" // Use the same table name

	// Insert some data
	inserts := map[KeyType]ValueType{
		10: []byte("val10"),
		5:  []byte("val5"),
		15: []byte("val15"),
		20: []byte("val20"),
		1:  []byte("val1"),
	}
	var expectedKeys []KeyType
	for k, v := range inserts {
		if err := tree.Insert(tableName, k, v); err != nil { // Add tableName
			t.Fatalf("Insert failed for key %d: %v", k, err)
		}
		expectedKeys = append(expectedKeys, k)
	}
	sort.Slice(expectedKeys, func(i, j int) bool { return expectedKeys[i] < expectedKeys[j] })

	// Scan all
	results, err := tree.ScanAll()
	if err != nil {
		t.Fatalf("ScanAll failed: %v", err)
	}

	// Verify results
	if len(results) != len(expectedKeys) {
		t.Errorf("ScanAll returned wrong number of items. Got %d, want %d", len(results), len(expectedKeys))
	}

	for i, pair := range results {
		if pair.Key != expectedKeys[i] {
			t.Errorf("ScanAll result key mismatch at index %d. Got %d, want %d", i, pair.Key, expectedKeys[i])
		}
		expectedValue := inserts[pair.Key]
		if !bytes.Equal(pair.Value, expectedValue) {
			t.Errorf("ScanAll result value mismatch for key %d. Got %s, want %s", pair.Key, pair.Value, expectedValue)
		}
	}
}

// TestBTreeScanRange tests scanning a range of elements.
func TestBTreeScanRange(t *testing.T) {
	tree, dm := setupBTreeWithDiskManagerScan(t, DefaultDegree)
	defer dm.Close()
	tableName := "test_table" // Use the same table name

	// Insert data
	inserts := map[KeyType]ValueType{
		10: []byte("val10"), 20: []byte("val20"), 30: []byte("val30"),
		40: []byte("val40"), 50: []byte("val50"),
	}
	for k, v := range inserts {
		if err := tree.Insert(tableName, k, v); err != nil { // Add tableName
			t.Fatalf("Insert failed for key %d: %v", k, err)
		}
	}

	tests := []struct {
		name         string
		startKey     KeyType
		endKey       KeyType
		includeStart bool
		includeEnd   bool
		expectedKeys []KeyType
	}{
		{
			name:         "Range 20 to 40 (exclusive end)",
			startKey:     20,
			endKey:       40,
			includeStart: true,  // >= 20
			includeEnd:   false, // < 40
			expectedKeys: []KeyType{20, 30},
		},
		{
			name:         "Range start from beginning (<= 30)",
			startKey:     0,  // Assuming ScanRange handles 0 as start
			endKey:       30, // <= 30
			includeStart: true,
			includeEnd:   true,
			expectedKeys: []KeyType{10, 20, 30},
		},
		{
			name:         "Range until end (>= 30)",
			startKey:     30,
			endKey:       100,  // Large enough to include all remaining
			includeStart: true, // >= 30
			includeEnd:   true, // <= 100 (effectively no upper bound)
			expectedKeys: []KeyType{30, 40, 50},
		},
		{
			name:         "Range single element (20)",
			startKey:     20,
			endKey:       20,
			includeStart: true, // >= 20
			includeEnd:   true, // <= 20
			expectedKeys: []KeyType{20},
		},
		{
			name:         "Range empty (35-39)",
			startKey:     35,
			endKey:       39,
			includeStart: true,  // >= 35
			includeEnd:   false, // < 39
			expectedKeys: []KeyType{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			results, err := tree.ScanRange(tt.startKey, tt.endKey, tt.includeStart, tt.includeEnd)
			if err != nil {
				t.Fatalf("ScanRange failed: %v", err)
			}

			var gotKeys []KeyType
			for _, pair := range results {
				gotKeys = append(gotKeys, pair.Key)
				// Verify value as well
				expectedValue := inserts[pair.Key]
				if !bytes.Equal(pair.Value, expectedValue) {
					t.Errorf("ScanRange value mismatch for key %d. Got %s, want %s", pair.Key, pair.Value, expectedValue)
				}
			}

			// Ensure gotKeys is not nil if expectedKeys is empty for DeepEqual
			if gotKeys == nil && len(tt.expectedKeys) == 0 {
				gotKeys = []KeyType{}
			}

			if !reflect.DeepEqual(gotKeys, tt.expectedKeys) {
				t.Errorf("ScanRange key mismatch. Got %v, want %v", gotKeys, tt.expectedKeys)
			}
		})
	}
}

// TODO: Add tests for ScanRange boundaries if inclusivity is added.
