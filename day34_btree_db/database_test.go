package rdbms

import (
	"os"
	"testing"
)

// setupTestDB moved to test_helper.go

// TestNewDatabase tests the Database constructor.
func TestNewDatabase(t *testing.T) {
	db, dbPath := setupTestDB(t) // Use helper
	defer func() {
		if db != nil && db.dm != nil { // Add nil check before Close()
			db.dm.Close()
		}
		os.Remove(dbPath)
	}()

	if db == nil {
		t.Fatal("NewDatabase returned nil")
	}
	if db.dm == nil {
		t.Fatal("Database DiskManager is nil")
	}
	if db.defaultDegree != DefaultDegree {
		t.Errorf("Expected default degree %d, got %d", DefaultDegree, db.defaultDegree)
	}
	if len(db.schemas) != 0 {
		t.Errorf("Expected initial schemas map to be empty")
	}
	// Check if file exists
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Errorf("Database file %s was not created", dbPath)
	}
}

// TestCreateTable moved to operations_test.go

func TestGetTable_NotFound(t *testing.T) {
	db, dbPath := setupTestDB(t) // Use helper
	defer func() {
		if db != nil && db.dm != nil { // Add nil check before Close()
			db.dm.Close()
		}
		os.Remove(dbPath)
	}()

	_, err := db.GetTable("non_existent_table")
	if err == nil {
		t.Errorf("Expected error when getting non-existent table, but got nil")
	} else {
		expectedError := "table 'non_existent_table' not found"
		if err.Error() != expectedError {
			t.Errorf("Expected error message '%s', got '%s'", expectedError, err.Error())
		}
	}
}

// TestSerialization moved to operations_test.go

// TestInsertRow moved to operations_test.go

// TestSearchRow moved to operations_test.go

// convertToKeyType moved to operations_test.go

// TestUpdateRow moved to operations_test.go

// TestScanTable moved to operations_test.go

// TestScanTableRange moved to operations_test.go

// TestDeleteRow moved to operations_test.go

// TestDatabase_InsertAndSearchRow_Duplicate moved to operations_test.go
