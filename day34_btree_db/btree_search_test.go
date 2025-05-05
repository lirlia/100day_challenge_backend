package rdbms

import (
	"bytes"
	"fmt"
	"testing"
)

// TestBTreeSearch tests the Search method of the BTree.
func TestBTreeSearch(t *testing.T) {
	degree := 3
	tableName := "test_search_table"
	tree, dm := setupBTreeWithDiskManagerDelete(t, degree) // Use helper from delete_test
	defer dm.Close()

	// Test 1: Search in an empty tree
	t.Run("Search_Empty_Tree", func(t *testing.T) {
		val, found := tree.Search(10)
		if found {
			t.Errorf("Search in empty tree should not find key 10")
		}
		if val != nil {
			t.Errorf("Search in empty tree should return nil value, got %v", val)
		}
	})

	// Insert some data
	inserts := map[KeyType]ValueType{
		10: []byte("val10"),
		5:  []byte("val5"),
		15: []byte("val15"),
		20: []byte("val20"),
		1:  []byte("val1"),  // Min key
		30: []byte("val30"), // Max key
		25: []byte("val25"),
	}
	for k, v := range inserts {
		if err := tree.Insert(tableName, k, v); err != nil {
			t.Fatalf("Insert failed for key %d: %v", k, err)
		}
	}

	t.Log("--- Tree Structure After Inserts (Search Test) ---")
	rootNodeForPrint, _ := dm.ReadNode(tree.rootPageID)
	printTreeHelper(t, dm, rootNodeForPrint, "  ")
	t.Log("--- End Tree Structure ---")

	// Test 2: Search for existing keys
	t.Run("Search_Existing_Keys", func(t *testing.T) {
		for k, expectedVal := range inserts {
			t.Run(fmt.Sprintf("Search_Key_%d", k), func(t *testing.T) {
				val, found := tree.Search(k)
				if !found {
					t.Errorf("Expected to find key %d, but not found", k)
				}
				if !bytes.Equal(val, expectedVal) {
					t.Errorf("Value mismatch for key %d. Got %s, want %s", k, val, expectedVal)
				}
			})
		}
	})

	// Test 3: Search for non-existent keys
	t.Run("Search_Non_Existent_Keys", func(t *testing.T) {
		nonExistentKeys := []KeyType{0, 6, 16, 29, 100}
		for _, k := range nonExistentKeys {
			t.Run(fmt.Sprintf("Search_Key_%d", k), func(t *testing.T) {
				val, found := tree.Search(k)
				if found {
					t.Errorf("Expected not to find key %d, but found value %s", k, val)
				}
				if val != nil {
					t.Errorf("Search for non-existent key %d should return nil value, got %v", k, val)
				}
			})
		}
	})
}
