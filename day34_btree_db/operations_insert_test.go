package rdbms

import (
	"errors"
	"testing"
)

func TestInsertRow(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "users"
	columns := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "name", Type: TypeText},
		{Name: "age", Type: TypeInteger},
	}
	err := db.CreateTable(tableName, columns)
	if err != nil {
		t.Fatalf("Setup failed: CreateTable error: %v", err)
	}

	// --- Test successful insertion ---
	row1 := map[string]interface{}{
		"id":   1,
		"name": "Alice",
		"age":  int64(30), // Use int64 for consistency
	}
	err = db.InsertRow(tableName, row1)
	if err != nil {
		t.Errorf("InsertRow failed for valid row1: %v", err)
	}

	row2 := map[string]interface{}{
		"id":   KeyType(2), // Test with KeyType directly
		"name": "Bob",
		// Age is optional in this insert
	}
	err = db.InsertRow(tableName, row2)
	if err != nil {
		t.Errorf("InsertRow failed for valid row2 (missing age): %v", err)
	}

	// --- Test error cases ---
	testCases := []struct {
		name     string
		table    string
		row      map[string]interface{}
		expError bool
	}{
		{
			name:     "Insert into non-existent table",
			table:    "non_existent",
			row:      map[string]interface{}{"id": 3, "data": "test"},
			expError: true,
		},
		{
			name:     "Missing primary key",
			table:    tableName,
			row:      map[string]interface{}{"name": "Charlie"},
			expError: true,
		},
		{
			name:     "Wrong type for primary key",
			table:    tableName,
			row:      map[string]interface{}{"id": "not_an_int", "name": "David"},
			expError: true,
		},
		{
			name:     "Wrong type for other column",
			table:    tableName,
			row:      map[string]interface{}{"id": 4, "name": "Eve", "age": "thirty"},
			expError: true,
		},
		{
			name:     "Column not in schema",
			table:    tableName,
			row:      map[string]interface{}{"id": 5, "extra_field": "some_data"},
			expError: true, // Should fail because "extra_field" is not in schema
		},
		{
			name:  "Duplicate primary key (should overwrite)",
			table: tableName,
			row: map[string]interface{}{
				"id":   1, // Duplicate of row1
				"name": "Alice Updated",
			},
			expError: false, // BTree Insert should overwrite
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			err := db.InsertRow(tc.table, tc.row)
			if tc.expError && err == nil {
				t.Errorf("Expected error but got nil")
			} else if !tc.expError && err != nil {
				t.Errorf("Expected no error but got: %v", err)
			}
		})
	}
}

// TestDatabase_InsertAndSearchRow_Duplicate tests inserting duplicate keys and searching.
func TestDatabase_InsertAndSearchRow_Duplicate(t *testing.T) {
	db, _ := setupTestDB(t)
	defer db.dm.Close()

	tableName := "customers_dup"
	columns := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "name", Type: TypeText},
	}
	err := db.CreateTable(tableName, columns)
	if err != nil {
		t.Fatalf("Setup failed: CreateTable error: %v", err)
	}

	// Insert initial row
	row1 := map[string]interface{}{"id": 1, "name": "Alice"}
	if err := db.InsertRow(tableName, row1); err != nil {
		t.Fatalf("InsertRow failed for initial row: %v", err)
	}

	// Insert duplicate row (should overwrite)
	row1Dup := map[string]interface{}{"id": 1, "name": "Alice V2"}
	if err := db.InsertRow(tableName, row1Dup); err != nil {
		t.Fatalf("InsertRow failed for duplicate row (overwrite): %v", err)
	}

	// Insert another row
	row2 := map[string]interface{}{"id": 2, "name": "Bob"}
	if err := db.InsertRow(tableName, row2); err != nil {
		t.Fatalf("InsertRow failed for second row: %v", err)
	}

	// --- Search and Verify ---

	// Search for the overwritten row
	foundRow1, err := db.SearchRow(tableName, 1)
	if err != nil {
		t.Fatalf("SearchRow failed for overwritten key 1: %v", err)
	}
	expectedRow1 := map[string]interface{}{"id": int64(1), "name": "Alice V2"}
	if !compareRows(expectedRow1, foundRow1) {
		t.Errorf("Search result for overwritten key 1 mismatch. Got %v, want %v", foundRow1, expectedRow1)
	}

	// Search for the second row
	foundRow2, err := db.SearchRow(tableName, 2)
	if err != nil {
		t.Fatalf("SearchRow failed for key 2: %v", err)
	}
	expectedRow2 := map[string]interface{}{"id": int64(2), "name": "Bob"}
	if !compareRows(expectedRow2, foundRow2) {
		t.Errorf("Search result for key 2 mismatch. Got %v, want %v", foundRow2, expectedRow2)
	}

	// Search for a non-existent row
	_, err = db.SearchRow(tableName, 3)
	if !errors.Is(err, ErrNotFound) {
		t.Errorf("SearchRow for non-existent key 3 expected ErrNotFound, got: %v", err)
	}
	t.Logf("SearchRow for non-existent row correctly returned error: %v", err)

}
