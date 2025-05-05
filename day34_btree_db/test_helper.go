package rdbms

import (
	"fmt"
	"path/filepath"
	"reflect"
	"testing"
)

// compareRows は、型が異なる可能性があるマップ（行データ）を比較します。
// 特に KeyType(int64) と int64 の比較を行います。
func compareRows(row1, row2 map[string]interface{}) bool {
	if len(row1) != len(row2) {
		fmt.Printf("compareRows: Length mismatch (%d vs %d)\n", len(row1), len(row2))
		return false
	}

	for key, val1 := range row1 {
		val2, ok := row2[key]
		if !ok {
			fmt.Printf("compareRows: Key '%s' not found in second map\n", key)
			return false
		}

		// 型を考慮した比較
		switch v1 := val1.(type) {
		case KeyType: // Expected is KeyType
			switch v2 := val2.(type) {
			case KeyType:
				if v1 != v2 {
					fmt.Printf("compareRows: Key '%s' mismatch (KeyType vs KeyType): %v != %v\n", key, v1, v2)
					return false
				}
			case int64: // Actual might be int64 from deserialization
				if int64(v1) != v2 {
					fmt.Printf("compareRows: Key '%s' mismatch (KeyType vs int64): %v != %v\n", key, v1, v2)
					return false
				}
			case int:
				if int64(v1) != int64(v2) {
					fmt.Printf("compareRows: Key '%s' mismatch (KeyType vs int): %v != %v\n", key, v1, v2)
					return false
				}
			default:
				fmt.Printf("compareRows: Key '%s' type mismatch (KeyType vs %T)\n", key, val2)
				return false
			}
		case int64: // Expected is int64
			switch v2 := val2.(type) {
			case KeyType:
				if v1 != int64(v2) {
					fmt.Printf("compareRows: Key '%s' mismatch (int64 vs KeyType): %v != %v\n", key, v1, v2)
					return false
				}
			case int64:
				if v1 != v2 {
					fmt.Printf("compareRows: Key '%s' mismatch (int64 vs int64): %v != %v\n", key, v1, v2)
					return false
				}
			case int:
				if v1 != int64(v2) {
					fmt.Printf("compareRows: Key '%s' mismatch (int64 vs int): %v != %v\n", key, v1, v2)
					return false
				}
			default:
				fmt.Printf("compareRows: Key '%s' type mismatch (int64 vs %T)\n", key, val2)
				return false
			}
		case int: // Expected is int
			switch v2 := val2.(type) {
			case KeyType:
				if int64(v1) != int64(v2) {
					fmt.Printf("compareRows: Key '%s' mismatch (int vs KeyType): %v != %v\n", key, v1, v2)
					return false
				}
			case int64:
				if int64(v1) != v2 {
					fmt.Printf("compareRows: Key '%s' mismatch (int vs int64): %v != %v\n", key, v1, v2)
					return false
				}
			case int:
				if v1 != v2 {
					fmt.Printf("compareRows: Key '%s' mismatch (int vs int): %v != %v\n", key, v1, v2)
					return false
				}
			default:
				fmt.Printf("compareRows: Key '%s' type mismatch (int vs %T)\n", key, val2)
				return false
			}
		case string:
			v2Str, ok := val2.(string)
			if !ok || v1 != v2Str {
				fmt.Printf("compareRows: Key '%s' mismatch (string vs %T): %v != %v\n", key, val2, v1, val2)
				return false
			}
		default: // Other types - use DeepEqual as fallback
			if !reflect.DeepEqual(val1, val2) {
				fmt.Printf("compareRows: Key '%s' mismatch (DeepEqual): %v != %v\n", key, val1, val2)
				return false
			}
		}
	}
	return true
}

// compareRowSlices compares two slices of map[string]interface{}
// using the compareRows helper for each element.
func compareRowSlices(slice1, slice2 []map[string]interface{}) bool {
	if len(slice1) != len(slice2) {
		return false
	}
	// Note: This assumes the slices are sorted in the same order (by primary key).
	// If order is not guaranteed, a more complex comparison is needed.
	for i := range slice1 {
		if !compareRows(slice1[i], slice2[i]) {
			return false
		}
	}
	return true
}

// compareRowsForTest は compareRows と似ていますが、 testing.T を受け取り、
// 不一致の場合に t.Errorf を呼び出して詳細なエラーメッセージを出力します。
// persistence_test.go で使います。
func compareRowsForTest(t *testing.T, expected, actual map[string]interface{}, message string) {
	t.Helper()
	if len(expected) != len(actual) {
		t.Fatalf("%s: Row length mismatch. Expected %d fields, got %d. Expected: %v, Actual: %v", message, len(expected), len(actual), expected, actual)
	}

	for key, expectedValue := range expected {
		actualValue, ok := actual[key]
		if !ok {
			t.Fatalf("%s: Key '%s' not found in actual row. Expected: %v, Actual: %v", message, key, expected, actual)
		}

		// 型を考慮した比較 (compareRows からコピーして t.Fatalf を使うように変更)
		switch exp := expectedValue.(type) {
		case KeyType: // Expected is KeyType
			switch act := actualValue.(type) {
			case KeyType:
				if exp != act {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected KeyType(%v), got KeyType(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			case int64: // Actual might be int64 from deserialization
				if int64(exp) != act {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected KeyType(%v), got int64(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			case int: // Actual might be int from literal
				if int64(exp) != int64(act) {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected KeyType(%v), got int(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			default:
				t.Fatalf("%s: Type mismatch for key '%s'. Expected KeyType, got %T. Expected: %v, Actual: %v", message, key, actualValue, expected, actual)
			}
		case int64: // Expected is int64
			switch act := actualValue.(type) {
			case KeyType:
				if exp != int64(act) {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected int64(%v), got KeyType(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			case int64:
				if exp != act {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected int64(%v), got int64(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			case int:
				if exp != int64(act) {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected int64(%v), got int(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			default:
				t.Fatalf("%s: Type mismatch for key '%s'. Expected int64, got %T. Expected: %v, Actual: %v", message, key, actualValue, expected, actual)
			}
		case int: // Expected is int
			switch act := actualValue.(type) {
			case KeyType:
				if int64(exp) != int64(act) {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected int(%v), got KeyType(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			case int64:
				if int64(exp) != act {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected int(%v), got int64(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			case int:
				if exp != act {
					t.Fatalf("%s: Value mismatch for key '%s'. Expected int(%v), got int(%v). Expected: %v, Actual: %v", message, key, exp, act, expected, actual)
				}
			default:
				t.Fatalf("%s: Type mismatch for key '%s'. Expected int, got %T. Expected: %v, Actual: %v", message, key, actualValue, expected, actual)
			}
		case string:
			actStr, ok := actualValue.(string)
			if !ok || exp != actStr {
				t.Fatalf("%s: Value mismatch for key '%s'. Expected string(%v), got %T(%v). Expected: %v, Actual: %v", message, key, exp, actualValue, actualValue, expected, actual)
			}
		default: // Other types - use DeepEqual as fallback
			if !reflect.DeepEqual(expectedValue, actualValue) {
				t.Fatalf("%s: Value mismatch for key '%s' (using DeepEqual). Expected %T(%v), got %T(%v). Expected: %v, Actual: %v", message, key, expectedValue, expectedValue, actualValue, actualValue, expected, actual)
			}
		}
	}
}

// --- B+Tree Test Helpers ---

// printTreeHelper は、デバッグ用にB+Treeの構造を再帰的に出力します。
// testing.T を使用してログを出力します。
func printTreeHelper(t *testing.T, dm *DiskManager, node Node, prefix string) {
	t.Helper()
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
				printTreeHelper(t, dm, childNode, newPrefix)
			}
		}
	}
}

// getAllKeysInTree traverses the leaf nodes and returns all keys in order.
// テスト検証用に使用します。
func getAllKeysInTree(tree *BTree, dm *DiskManager) ([]KeyType, error) {
	var keys []KeyType
	currentNodeID := tree.rootPageID
	if currentNodeID == InvalidPageID {
		return keys, nil // Empty tree
	}

	// Find the first leaf node
	for {
		node, err := dm.ReadNode(currentNodeID)
		if err != nil {
			return nil, fmt.Errorf("failed to read node %d during traversal: %w", currentNodeID, err)
		}
		if node.isLeaf() {
			break // Found the first leaf (or root is leaf)
		}
		internal := node.(*InternalNode)
		if len(internal.children) == 0 {
			return nil, fmt.Errorf("internal node %d has no children", currentNodeID)
		}
		currentNodeID = internal.children[0]
	}

	// Traverse the leaf nodes using the next pointer
	for currentNodeID != InvalidPageID {
		node, err := dm.ReadNode(currentNodeID)
		if err != nil {
			return nil, fmt.Errorf("failed to read leaf node %d during scan: %w", currentNodeID, err)
		}
		if !node.isLeaf() {
			// Should not happen if tree structure is correct
			return nil, fmt.Errorf("encountered non-leaf node %d during leaf scan", currentNodeID)
		}
		leaf := node.(*LeafNode)
		keys = append(keys, leaf.keys...)
		currentNodeID = leaf.next
	}

	return keys, nil
}

// --- Database Test Helpers ---

// setupTestDB は、テスト用に一時ファイルを使用するDatabaseを作成するヘルパー関数です。
func setupTestDB(t *testing.T) (*Database, string) {
	t.Helper()
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "testdb.db")
	db, err := NewDatabase(dbPath, DefaultDegree) // Pass path and degree
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}
	return db, dbPath // Return dbPath for cleanup check if needed
}

// Helper to convert interface{} to KeyType for tests
// Needed because map values are interface{}
func convertToKeyType(value interface{}) (KeyType, error) {
	switch v := value.(type) {
	case int:
		return KeyType(v), nil
	case int64:
		return KeyType(v), nil
	case KeyType:
		return v, nil
	default:
		return 0, fmt.Errorf("cannot convert type %T to KeyType", value)
	}
}
