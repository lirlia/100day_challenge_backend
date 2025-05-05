package rdbms

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// compareRows は test_helper.go に移動したため削除
/*
func compareRows(t *testing.T, expected, actual map[string]interface{}, message string) {
	t.Helper()
	if len(expected) != len(actual) {
		t.Fatalf("%s: Row length mismatch. Expected %d fields, got %d. Expected: %v, Actual: %v", message, len(expected), len(actual), expected, actual)
	}

	for key, expectedValue := range expected {
		actualValue, ok := actual[key]
		if !ok {
			t.Fatalf("%s: Key '%s' not found in actual row. Expected: %v, Actual: %v", message, key, expected, actual)
		}

		// 型を考慮した比較
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
*/

func TestDatabasePersistence(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "persistence_test.db")
	tableName := "users"

	// --- Phase 1: Create DB, Table, Insert Data, Close ---
	t.Log("--- Phase 1: Create, Insert, Close ---")
	db1, err := NewDatabase(dbPath, 3)
	if err != nil {
		t.Fatalf("Phase 1: Failed to create database: %v", err)
	}

	// Create table
	createSQL := fmt.Sprintf("CREATE TABLE %s (id INTEGER PRIMARY KEY, name TEXT, age INTEGER)", tableName)
	_, err = db1.ExecuteSQL(createSQL)
	if err != nil {
		db1.dm.Close()
		t.Fatalf("Phase 1: Failed to execute CREATE TABLE: %v", err)
	}
	t.Logf("Phase 1: Table '%s' created.", tableName)

	// Insert data
	insertData := []map[string]interface{}{
		{"id": KeyType(1), "name": "Alice", "age": 30},
		{"id": KeyType(2), "name": "Bob", "age": 25},
		{"id": KeyType(3), "name": "Charlie", "age": 35},
	}
	for _, row := range insertData {
		err = db1.InsertRow(tableName, row)
		if err != nil {
			db1.dm.Close()
			t.Fatalf("Phase 1: Failed to insert row %v: %v", row["id"], err)
		}
	}
	t.Log("Phase 1: Data inserted.")

	// Close the database (this should write metadata)
	err = db1.dm.Close()
	if err != nil {
		t.Fatalf("Phase 1: Failed to close database: %v", err)
	}
	t.Log("Phase 1: Database closed.")

	// --- Phase 2: Reopen DB, Verify Table and Data, Delete Data, Close ---
	t.Log("--- Phase 2: Reopen, Verify, Delete, Close ---")
	db2, err := NewDatabase(dbPath, 3) // Reopen with the same path
	if err != nil {
		t.Fatalf("Phase 2: Failed to reopen database: %v", err)
	}

	// Verify table exists (using GetTableNames)
	tableNames := db2.GetTableNames()
	foundTable := false
	for _, name := range tableNames {
		if name == tableName {
			foundTable = true
			break
		}
	}
	if !foundTable {
		db2.dm.Close()
		t.Fatalf("Phase 2: Table '%s' not found after reopening. Found tables: %v", tableName, tableNames)
	}
	t.Logf("Phase 2: Table '%s' found.", tableName)

	// Verify data exists (using ScanTable)
	selectSQL := fmt.Sprintf("SELECT * FROM %s", tableName)
	resultStr, err := db2.ExecuteSQL(selectSQL)
	if err != nil {
		db2.dm.Close()
		t.Fatalf("Phase 2: Failed to execute SELECT *: %v", err)
	}
	t.Logf("Phase 2: SELECT result:\n%s", resultStr)

	// More rigorous check using ScanTable
	rows, err := db2.ScanTable(tableName)
	if err != nil {
		db2.dm.Close()
		t.Fatalf("Phase 2: Failed to ScanTable: %v", err)
	}
	if len(rows) != len(insertData) {
		db2.dm.Close()
		t.Fatalf("Phase 2: Data count mismatch after reopening. Expected %d, got %d rows.", len(insertData), len(rows))
	}
	// Optionally compare each row content (needs sorting or map lookup)
	expectedRowsMap := make(map[KeyType]map[string]interface{})
	for _, row := range insertData {
		expectedRowsMap[row["id"].(KeyType)] = row
	}
	for _, actualRow := range rows {
		id, ok := actualRow["id"].(int64) // Deserialized as int64
		if !ok {
			db2.dm.Close()
			t.Fatalf("Phase 2: Row missing or has invalid 'id' type: %v", actualRow)
		}
		expectedRow, found := expectedRowsMap[KeyType(id)]
		if !found {
			db2.dm.Close()
			t.Fatalf("Phase 2: Unexpected row found with id %d: %v", id, actualRow)
		}
		// Use compareRows for type-aware comparison (db_test.go で定義されているはず)
		compareRowsForTest(t, expectedRow, actualRow, fmt.Sprintf("Phase 2 comparison for id %d", id)) // Use compareRowsForTest from helper
		delete(expectedRowsMap, KeyType(id))                                                           // Mark as found
	}
	if len(expectedRowsMap) > 0 {
		db2.dm.Close()
		t.Fatalf("Phase 2: Not all expected rows were found after reopening. Missing IDs: %v", expectedRowsMap)
	}
	t.Log("Phase 2: Data verified.")

	// Delete a row
	idToDelete := KeyType(2)
	deleteSQL := fmt.Sprintf("DELETE FROM %s WHERE id = %d", tableName, idToDelete)
	_, err = db2.ExecuteSQL(deleteSQL)
	if err != nil {
		db2.dm.Close()
		t.Fatalf("Phase 2: Failed to execute DELETE: %v", err)
	}
	t.Logf("Phase 2: Deleted row with id %d.", idToDelete)

	// Close the database again
	err = db2.dm.Close()
	if err != nil {
		t.Fatalf("Phase 2: Failed to close database: %v", err)
	}
	t.Log("Phase 2: Database closed.")

	// --- Phase 3: Reopen DB, Verify Deletion ---
	t.Log("--- Phase 3: Reopen, Verify Deletion ---")
	db3, err := NewDatabase(dbPath, 3) // Reopen again
	if err != nil {
		t.Fatalf("Phase 3: Failed to reopen database: %v", err)
	}

	// Verify data count after deletion
	rowsAfterDelete, err := db3.ScanTable(tableName)
	if err != nil {
		db3.dm.Close()
		t.Fatalf("Phase 3: Failed to ScanTable after deletion: %v", err)
	}
	expectedCountAfterDelete := len(insertData) - 1
	if len(rowsAfterDelete) != expectedCountAfterDelete {
		db3.dm.Close()
		t.Fatalf("Phase 3: Data count mismatch after deletion. Expected %d, got %d rows.", expectedCountAfterDelete, len(rowsAfterDelete))
	}

	// Verify the correct row was deleted
	foundDeletedID := false
	remainingIDs := []KeyType{}
	for _, row := range rowsAfterDelete {
		id := row["id"].(int64) // Assuming id is int64 after deserialization
		remainingIDs = append(remainingIDs, KeyType(id))
		if KeyType(id) == idToDelete {
			foundDeletedID = true
		}
	}
	if foundDeletedID {
		db3.dm.Close()
		t.Fatalf("Phase 3: Deleted ID %d was found in table after reopening. Remaining IDs: %v", idToDelete, remainingIDs)
	}
	t.Logf("Phase 3: Deletion of ID %d verified. Remaining IDs: %v", idToDelete, remainingIDs)

	// Final Close
	err = db3.dm.Close()
	if err != nil {
		t.Fatalf("Phase 3: Failed to close database: %v", err)
	}
	t.Log("Phase 3: Database closed.")

	// Check if the db file exists (it should)
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Errorf("Database file %s does not exist after test completion.", dbPath)
	}

	t.Log("--- Persistence Test Successful ---")
}
