package rdbms

import (
	"errors"
	"reflect"
	"testing"
)

func TestSearchRow(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "products"
	columns := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "name", Type: TypeText},
		{Name: "price", Type: TypeInteger}, // Assume price is integer for simplicity
	}
	err := db.CreateTable(tableName, columns)
	if err != nil {
		t.Fatalf("Setup failed: CreateTable error: %v", err)
	}

	// Insert some data
	rows := []map[string]interface{}{
		{"id": 101, "name": "Laptop", "price": int64(1200)},
		{"id": 102, "name": "Keyboard", "price": int64(75)},
		{"id": 103, "name": "Mouse", "price": int64(25)},
	}
	for _, row := range rows {
		if err := db.InsertRow(tableName, row); err != nil {
			t.Fatalf("Setup failed: InsertRow error: %v", err)
		}
	}

	// Test searching for existing rows
	for _, expectedRow := range rows {
		expectedID, _ := convertToKeyType(expectedRow["id"])
		actualRow, err := db.SearchRow(tableName, expectedID)
		if err != nil {
			t.Errorf("SearchRow for existing key %d failed: %v", expectedID, err)
			continue
		}
		// Use the custom compareRows for type flexibility
		if !compareRows(expectedRow, actualRow) {
			t.Errorf("SearchRow result mismatch for key %d. Got %v, want %v", expectedID, actualRow, expectedRow)
		}
	}

	// Test searching for non-existent row
	nonExistentID := KeyType(999)
	_, err = db.SearchRow(tableName, nonExistentID)
	if err == nil {
		t.Errorf("SearchRow for non-existent key %d expected error, but got nil", nonExistentID)
	} else if !errors.Is(err, ErrNotFound) {
		t.Errorf("SearchRow for non-existent key %d expected ErrNotFound, but got: %v", nonExistentID, err)
		t.Logf("SearchRow for non-existent key correctly failed: %v", err)
	}

	// Test searching in non-existent table
	_, err = db.SearchRow("non_existent_table", KeyType(101))
	if err == nil {
		t.Errorf("SearchRow in non-existent table expected error, but got nil")
	}
}

func TestScanTable(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "data_points"
	columns := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "value", Type: TypeInteger},
	}
	err := db.CreateTable(tableName, columns)
	if err != nil {
		t.Fatalf("Setup failed: CreateTable error: %v", err)
	}

	// Insert data (out of order to test BTree ordering)
	rows := []map[string]interface{}{
		{"id": 3, "value": int64(300)},
		{"id": 1, "value": int64(100)},
		{"id": 2, "value": int64(200)},
	}
	for _, row := range rows {
		if err := db.InsertRow(tableName, row); err != nil {
			t.Fatalf("Setup failed: InsertRow error: %v", err)
		}
	}

	// Scan the table
	results, err := db.ScanTable(tableName)
	if err != nil {
		t.Fatalf("ScanTable failed: %v", err)
	}

	// Verify results (should be ordered by PK 'id')
	expectedResults := []map[string]interface{}{
		{"id": int64(1), "value": int64(100)}, // Expect int64 due to schema
		{"id": int64(2), "value": int64(200)},
		{"id": int64(3), "value": int64(300)},
	}

	if !compareRowSlices(expectedResults, results) {
		t.Errorf("ScanTable results mismatch.")
		t.Logf("Expected: %v", expectedResults)
		t.Logf("Got:      %v", results)
	}

	// Test scanning an empty table
	emptyTableName := "empty_table"
	err = db.CreateTable(emptyTableName, columns) // Use same columns for simplicity
	if err != nil {
		t.Fatalf("Setup failed: CreateTable (empty) error: %v", err)
	}
	emptyResults, err := db.ScanTable(emptyTableName)
	if err != nil {
		t.Errorf("ScanTable failed for empty table: %v", err)
	}
	if len(emptyResults) != 0 {
		t.Errorf("ScanTable for empty table expected 0 results, got %d", len(emptyResults))
	}

	// Test scanning non-existent table
	_, err = db.ScanTable("non_existent_scan")
	if err == nil {
		t.Errorf("ScanTable expected error for non-existent table, but got nil")
	}
}

func TestScanTableRange(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "sensor_readings"
	columns := []ColumnDefinition{
		{Name: "id", Type: TypeInteger, IsPrimaryKey: true},
		{Name: "reading", Type: TypeInteger},
	}
	err := db.CreateTable(tableName, columns)
	if err != nil {
		t.Fatalf("Setup failed: CreateTable error: %v", err)
	}

	// Insert data
	rows := []map[string]interface{}{
		{"id": 10, "reading": int64(100)},
		{"id": 20, "reading": int64(200)},
		{"id": 30, "reading": int64(300)},
		{"id": 40, "reading": int64(400)},
		{"id": 50, "reading": int64(500)},
	}
	for _, row := range rows {
		if err := db.InsertRow(tableName, row); err != nil {
			t.Fatalf("Setup failed: InsertRow error: %v", err)
		}
	}

	// Helper function for range test cases
	rangeTestCase := func(name string, start, end *KeyType, incStart, incEnd bool, expectedKeys []KeyType) {
		t.Run(name, func(t *testing.T) {
			results, err := db.ScanTableRange(tableName, start, end, incStart, incEnd)
			if err != nil {
				t.Fatalf("ScanTableRange failed: %v", err)
			}

			actualKeys := make([]KeyType, len(results))
			for i, row := range results {
				key, _ := convertToKeyType(row["id"])
				actualKeys[i] = key
			}

			if !reflect.DeepEqual(expectedKeys, actualKeys) {
				t.Errorf("Range scan keys mismatch. Got %v, want %v", actualKeys, expectedKeys)
			}
		})
	}

	// --- Test Cases ---
	start20 := KeyType(20)
	end40 := KeyType(40)
	rangeTestCase("Mid range (20 <= id < 40)", &start20, &end40, true, false, []KeyType{20, 30})

	end30 := KeyType(30)
	rangeTestCase("Start range (id < 30)", nil, &end30, false, false, []KeyType{10, 20})

	start40 := KeyType(40)
	rangeTestCase("End range (id >= 40)", &start40, nil, true, false, []KeyType{40, 50})

	start31 := KeyType(31)
	end39 := KeyType(39)
	rangeTestCase("Empty range (31 <= id < 39)", &start31, &end39, true, false, []KeyType{}) // Empty slice

	// Test full range (nil start, nil end)
	rangeTestCase("Full range (nil, nil)", nil, nil, true, true, []KeyType{10, 20, 30, 40, 50})

}
