package rdbms

import (
	"errors"
	"reflect"
	"testing"
)

func TestDeleteRow(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "tasks"
	columns := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "description", Type: TypeText},
	}
	err := db.CreateTable(tableName, columns)
	if err != nil {
		t.Fatalf("Setup failed: CreateTable error: %v", err)
	}

	// Insert data
	rows := []map[string]interface{}{
		{"id": 1, "description": "Task 1"},
		{"id": 2, "description": "Task 2"},
		{"id": 3, "description": "Task 3"},
	}
	for _, row := range rows {
		if err := db.InsertRow(tableName, row); err != nil {
			t.Fatalf("Setup failed: InsertRow error: %v", err)
		}
	}

	// Delete an existing row
	deleteID := KeyType(2)
	err = db.DeleteRow(tableName, deleteID)
	if err != nil {
		t.Errorf("DeleteRow failed for existing ID %d: %v", deleteID, err)
	}

	// Verify deletion by searching
	_, err = db.SearchRow(tableName, deleteID)
	if err == nil {
		t.Errorf("SearchRow expected error after deleting ID %d, but got nil", deleteID)
	} else if !errors.Is(err, ErrNotFound) {
		t.Errorf("SearchRow after delete expected ErrNotFound, but got: %v", err)
	}
	t.Logf("SearchRow after delete correctly failed for id %d: %v", deleteID, err)

	// Verify deletion by scanning
	results, err := db.ScanTable(tableName)
	if err != nil {
		t.Fatalf("ScanTable failed after delete: %v", err)
	}
	expectedRemainingKeys := []KeyType{1, 3}
	actualRemainingKeys := make([]KeyType, len(results))
	for i, row := range results {
		key, _ := convertToKeyType(row["id"])
		actualRemainingKeys[i] = key
	}
	if !reflect.DeepEqual(expectedRemainingKeys, actualRemainingKeys) {
		t.Errorf("ScanTable keys mismatch after delete. Got %v, want %v", actualRemainingKeys, expectedRemainingKeys)
	}

	// Delete a non-existent row (should ideally not error, or return specific error)
	nonExistentID := KeyType(99)
	err = db.DeleteRow(tableName, nonExistentID)
	// BTree.Delete returns an error if key not found, so we expect an error here.
	if err == nil { // Check if an error occurred
		t.Errorf("DeleteRow for non-existent ID %d expected an error, but got nil", nonExistentID)
	}

	// Delete from non-existent table
	err = db.DeleteRow("non_existent_table", KeyType(1))
	if err == nil {
		t.Errorf("DeleteRow expected error for non-existent table, but got nil")
	}
}
