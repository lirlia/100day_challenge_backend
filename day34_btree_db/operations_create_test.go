package rdbms

import (
	"testing"
)

// TestCreateTable tests table creation logic.
func TestCreateTable(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper from test_helper.go
	defer db.dm.Close()

	tableName := "users"
	columns := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "name", Type: TypeText},
	}

	err := db.CreateTable(tableName, columns)
	if err != nil {
		t.Fatalf("CreateTable failed: %v", err)
	}

	// Check if schema exists (in memory)
	if _, schemaExists := db.schemas[tableName]; !schemaExists {
		t.Errorf("Schema for table '%s' not found after creation", tableName)
	}

	// Test creating duplicate table
	err = db.CreateTable(tableName, columns)
	if err == nil {
		t.Errorf("Expected error when creating duplicate table '%s', but got nil", tableName)
	}

	// Test invalid column type
	columnsInvalidType := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "data", Type: "BLOB"}, // Invalid type
	}
	err = db.CreateTable("invalid_type_table", columnsInvalidType)
	if err == nil {
		t.Errorf("Expected error for invalid column type, but got nil")
	}

	// Test duplicate column name
	columnsDuplicateName := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "name", Type: TypeText},
		{Name: "name", Type: TypeInteger},
	}
	err = db.CreateTable("duplicate_col_table", columnsDuplicateName)
	if err == nil {
		t.Errorf("Expected error for duplicate column name, but got nil")
	}

	// Test missing primary key
	columnsNoPK := []ColumnDefinition{
		{Name: "username", Type: TypeText},
	}
	err = db.CreateTable("no_pk_table", columnsNoPK)
	if err == nil {
		t.Errorf("Expected error for missing primary key, but got nil")
	}
}
