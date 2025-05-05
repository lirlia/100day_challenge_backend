package rdbms

import (
	"fmt"
	"testing"
)

func TestExecuteSQL_CreateTable(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "create_ddl_test"

	// 1. CREATE TABLE
	createSQL := fmt.Sprintf(`CREATE TABLE %s (id INTEGER PRIMARY KEY, data TEXT)`, tableName)
	result, err := db.ExecuteSQL(createSQL)
	if err != nil {
		t.Fatalf("CREATE TABLE failed: %v", err)
	}
	expectedCreate := fmt.Sprintf("Table '%s' created successfully.", tableName)
	if result != expectedCreate {
		t.Errorf("CREATE TABLE message mismatch: got '%s', want '%s'", result, expectedCreate)
	}

	// Verify schema and BTree root creation
	// schema, tree, err := db.GetTable(tableName)
	schema, err := db.GetTable(tableName) // Corrected call
	if err != nil {
		t.Fatalf("GetTable failed after creating table: %v", err)
	}
	if schema == nil {
		t.Fatal("GetTable returned nil schema")
	}
	// Tree object is not checked here anymore, check metadata instead
	// if tree == nil {
	// 	t.Fatal("GetTable returned nil tree")
	// }

	rootPageID, exists := db.dm.GetTableRoot(tableName)
	if !exists || rootPageID == InvalidPageID {
		t.Errorf("Table root metadata not found or invalid after CreateTable")
	}

	// Check schema details
	if schema.TableName != tableName {
		t.Errorf("Schema has wrong table name: got %s, want %s", schema.TableName, tableName)
	}
	if len(schema.Columns) != 2 {
		t.Errorf("Schema has wrong number of columns: got %d, want %d", len(schema.Columns), 2)
	}
	// TODO: Add more detailed schema column checks if needed
}

func TestExecuteSQL_CreateTable_Invalid(t *testing.T) {
	db, _ := setupTestDB(t)
	defer db.dm.Close()

	testCases := []struct {
		name     string
		sql      string
		expError bool // True if an error is expected
	}{
		{
			name:     "Duplicate Table",
			sql:      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
			expError: false, // First creation should succeed
		},
		{
			name:     "Duplicate Table Attempt 2",
			sql:      "CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT);",
			expError: true,
		},
		{
			name:     "Unsupported DDL Action",
			sql:      "ALTER TABLE users ADD COLUMN email TEXT;",
			expError: true,
		},
		{
			name:     "Invalid Column Type",
			sql:      "CREATE TABLE products (id INTEGER PRIMARY KEY, price REAL);",
			expError: true,
		},
		{
			name:     "Duplicate Column Name",
			sql:      "CREATE TABLE items (id INTEGER PRIMARY KEY, name TEXT, name INTEGER);",
			expError: true,
		},
		{
			name:     "Missing Primary Key",
			sql:      "CREATE TABLE logs (message TEXT);",
			expError: true,
		},
		{
			name:     "Incorrect Primary Key",
			sql:      "CREATE TABLE configs (key TEXT PRIMARY KEY, value TEXT);",
			expError: true,
		},
	}

	// Run the first valid CREATE to set up for the duplicate test
	if _, err := db.ExecuteSQL(testCases[0].sql); err != nil {
		t.Fatalf("Setup failed: initial %s failed: %v", testCases[0].name, err)
	}

	for _, tc := range testCases[1:] { // Skip the first successful one
		t.Run(tc.name, func(t *testing.T) {
			_, err := db.ExecuteSQL(tc.sql)
			if tc.expError && err == nil {
				t.Errorf("Expected error for SQL \"%s\", but got nil", tc.sql)
			} else if !tc.expError && err != nil {
				t.Errorf("Did not expect error for SQL \"%s\", but got: %v", tc.sql, err)
			}
		})
	}
}

// TODO: Add tests for other DDL (ALTER, DROP) when implemented
