package schema

import (
	"testing"
)

func TestSchema_FindTable(t *testing.T) {
	schema := SampleSchema()

	table, err := schema.FindTable("users")
	if err != nil {
		t.Errorf("FindTable('users') returned error: %v", err)
	}
	if table == nil {
		t.Errorf("FindTable('users') returned nil table")
	}
	if table.Name != "users" {
		t.Errorf("Expected table name 'users', got %s", table.Name)
	}

	_, err = schema.FindTable("non_existent_table")
	if err == nil {
		t.Errorf("FindTable('non_existent_table') did not return an error")
	}
}

func TestTable_FindColumn(t *testing.T) {
	schema := SampleSchema()
	table, _ := schema.FindTable("products")

	col, err := table.FindColumn("price")
	if err != nil {
		t.Errorf("FindColumn('price') returned error: %v", err)
	}
	if col == nil {
		t.Errorf("FindColumn('price') returned nil column")
	}
	if col.Name != "price" {
		t.Errorf("Expected column name 'price', got %s", col.Name)
	}
	if col.Type != IntegerType {
		t.Errorf("Expected column type 'INTEGER', got %s", col.Type)
	}

	_, err = table.FindColumn("non_existent_column")
	if err == nil {
		t.Errorf("FindColumn('non_existent_column') did not return an error")
	}
}
