package rdbms

import (
	"testing"
)

func TestUpdateRow(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "widgets"
	columns := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "name", Type: TypeText},
		{Name: "quantity", Type: TypeInteger},
	}
	err := db.CreateTable(tableName, columns)
	if err != nil {
		t.Fatalf("Setup failed: CreateTable error: %v", err)
	}

	// Insert initial row
	initialRow := map[string]interface{}{"id": 1, "name": "Gizmo", "quantity": int64(10)}
	if err := db.InsertRow(tableName, initialRow); err != nil {
		t.Fatalf("Setup failed: InsertRow error: %v", err)
	}

	// Test successful update
	updateData := map[string]interface{}{"name": "Super Gizmo", "quantity": int64(15)}
	err = db.UpdateRow(tableName, 1, updateData)
	if err != nil {
		t.Errorf("UpdateRow failed for valid update: %v", err)
	}

	// Verify update
	updatedRow, err := db.SearchRow(tableName, 1)
	if err != nil {
		t.Fatalf("SearchRow failed after update: %v", err)
	}
	expectedRow := map[string]interface{}{"id": int64(1), "name": "Super Gizmo", "quantity": int64(15)}
	if !compareRows(expectedRow, updatedRow) {
		t.Errorf("Row data mismatch after update. Got %v, want %v", updatedRow, expectedRow)
	}

	// --- Test error cases ---
	// Update non-existent row
	err = db.UpdateRow(tableName, 99, map[string]interface{}{"name": "Ghost Widget"})
	if err == nil {
		t.Errorf("UpdateRow expected error for non-existent row, but got nil")
	}

	// Update in non-existent table
	err = db.UpdateRow("non_existent", 1, map[string]interface{}{"name": "Doesn't Matter"})
	if err == nil {
		t.Errorf("UpdateRow expected error for non-existent table, but got nil")
	}

	// Attempt to update primary key
	err = db.UpdateRow(tableName, 1, map[string]interface{}{"id": 2})
	if err == nil {
		t.Errorf("UpdateRow expected error when updating primary key, but got nil")
	}

	// Update with non-existent column
	err = db.UpdateRow(tableName, 1, map[string]interface{}{"color": "blue"})
	if err == nil {
		t.Errorf("UpdateRow expected error for non-existent column, but got nil")
	}

	// Update with wrong data type
	err = db.UpdateRow(tableName, 1, map[string]interface{}{"quantity": "many"})
	if err == nil {
		t.Errorf("UpdateRow expected error for wrong data type, but got nil")
	}
}
