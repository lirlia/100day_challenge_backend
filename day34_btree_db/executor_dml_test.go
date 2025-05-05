package rdbms

import (
	"fmt"
	"strings"
	"testing"
)

// setupTable is a helper function to create a table for DML tests
func setupTableForDML(t *testing.T, db *Database, tableName string) {
	t.Helper()
	createSQL := fmt.Sprintf(`CREATE TABLE %s (id INTEGER PRIMARY KEY, data TEXT)`, tableName)
	_, err := db.ExecuteSQL(createSQL)
	if err != nil {
		t.Fatalf("Setup failed: Could not create table %s for DML test: %v", tableName, err)
	}
}

func TestExecuteSQL_Insert(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "insert_dml_test"
	setupTableForDML(t, db, tableName)

	// 2. INSERT
	insertSQL1 := fmt.Sprintf(`INSERT INTO %s (id, data) VALUES (10, 'Data A')`, tableName)
	result, err := db.ExecuteSQL(insertSQL1)
	if err != nil {
		t.Fatalf("INSERT 1 failed: %v", err)
	}
	if result != "1 row inserted." {
		t.Errorf("INSERT 1 message mismatch: got '%s', want '1 row inserted.'", result)
	}

	insertSQL2 := fmt.Sprintf(`INSERT INTO %s (id, data) VALUES (20, 'Data B')`, tableName)
	result, err = db.ExecuteSQL(insertSQL2)
	if err != nil {
		t.Fatalf("INSERT 2 failed: %v", err)
	}
	if result != "1 row inserted." {
		t.Errorf("INSERT 2 message mismatch: got '%s', want '1 row inserted.'", result)
	}

	// Test inserting duplicate key (should overwrite)
	insertSQL_dup := fmt.Sprintf(`INSERT INTO %s (id, data) VALUES (10, 'Data A Updated')`, tableName)
	result, err = db.ExecuteSQL(insertSQL_dup) // Insert 10 again with different data
	if err != nil {
		// Since BTree Insert now overwrites, this should succeed at the DB level
		t.Errorf("Expected INSERT with duplicate key to succeed (overwrite), but got error: %v", err)
	}
	if result != "1 row inserted." { // Assuming INSERT returns this even on overwrite
		t.Errorf("INSERT duplicate message mismatch: got '%s', want '1 row inserted.'", result)
	}

	// Verify overwrite by selecting
	selectSQL_dup := fmt.Sprintf(`SELECT data FROM %s WHERE id = 10`, tableName)
	result, err = db.ExecuteSQL(selectSQL_dup)
	if err != nil {
		t.Fatalf("SELECT after duplicate insert failed: %v", err)
	}
	if !strings.Contains(result, "Data A Updated") {
		t.Errorf("Data was not updated after duplicate key insert. Got result: %s", result)
	}

	// Test insert with missing required column (if implemented)
	// Test insert with wrong type (if strict type checking is implemented)
}

func TestExecuteSQL_DeleteByID(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "delete_dml_test"
	setupTableForDML(t, db, tableName)

	// Insert data first
	insertSQL := fmt.Sprintf(`INSERT INTO %s (id, data) VALUES (50, 'ToDelete')`, tableName)
	_, err := db.ExecuteSQL(insertSQL)
	if err != nil {
		t.Fatalf("Setup failed: INSERT failed: %v", err)
	}

	// Delete an existing row
	_, err = db.ExecuteSQL("DELETE FROM delete_dml_test WHERE id = 50")
	if err != nil {
		t.Fatalf("ExecuteSQL DELETE failed: %v", err)
	}

	// Verify deletion by selecting the ID
	result, err := db.ExecuteSQL("SELECT * FROM delete_dml_test WHERE id = 50")
	if err != nil {
		// We expect no error from ExecuteSQL itself, but an empty result
		t.Fatalf("ExecuteSQL SELECT after delete failed unexpectedly: %v", err)
	}

	// Check that the result indicates no rows found
	expectedResult := "(0 rows)\n"
	if result != expectedResult {
		t.Errorf("SELECT deleted ID should have returned '%s', but got:\n%s", expectedResult, result)
	}

	// 7. DELETE WHERE id = (non-existent)
	deleteSQL_non := fmt.Sprintf(`DELETE FROM %s WHERE id = 99`, tableName)
	_, err = db.ExecuteSQL(deleteSQL_non)
	if err == nil {
		t.Fatalf("DELETE non-existent ID should have failed, but got no error")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Errorf("DELETE non-existent ID error message mismatch: %v", err)
	}
}

// TODO: Add tests for UPDATE DML when implemented
