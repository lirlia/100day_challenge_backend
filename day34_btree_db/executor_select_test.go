package rdbms

import (
	"fmt"
	"strings"
	"testing"
)

// setupTable is a helper function to create and populate a table for SELECT tests
func setupTableForSelect(t *testing.T, db *Database, tableName string) {
	t.Helper()
	createSQL := fmt.Sprintf(`CREATE TABLE %s (id INTEGER PRIMARY KEY, name TEXT, value INTEGER)`, tableName)
	_, err := db.ExecuteSQL(createSQL)
	if err != nil {
		t.Fatalf("Setup failed: Could not create table %s for SELECT test: %v", tableName, err)
	}
	inserts := []string{
		fmt.Sprintf(`INSERT INTO %s (id, name, value) VALUES (2, 'B', 200)`, tableName),
		fmt.Sprintf(`INSERT INTO %s (id, name, value) VALUES (1, 'A', 100)`, tableName),
		fmt.Sprintf(`INSERT INTO %s (id, name, value) VALUES (3, 'C', 300)`, tableName),
	}
	for _, insertSQL := range inserts {
		_, err := db.ExecuteSQL(insertSQL)
		if err != nil {
			t.Fatalf("Setup failed: INSERT error for SELECT test: %v", err)
		}
	}
}

func TestExecuteSQL_SelectByID(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "select_id_test"
	setupTableForSelect(t, db, tableName)

	// 3. SELECT WHERE id = (existing)
	selectSQL1 := fmt.Sprintf(`SELECT name, value FROM %s WHERE id = 1`, tableName)
	result, err := db.ExecuteSQL(selectSQL1)
	if err != nil {
		t.Fatalf("SELECT WHERE id=1 failed: %v", err)
	}
	if !strings.Contains(result, "name: A") || !strings.Contains(result, "value: 100") {
		t.Errorf("SELECT WHERE id=1 result missing expected data:\n%s", result)
	}
	if strings.Contains(result, "id:") {
		t.Errorf("SELECT WHERE id=1 result unexpectedly contains 'id:':\n%s", result)
	}

	// --- Test SELECT non-existent ID ---
	selectSQL_nonexist := fmt.Sprintf("SELECT * FROM %s WHERE id = 999", tableName)
	result, err = db.ExecuteSQL(selectSQL_nonexist)
	if err != nil {
		// ExecuteSQL itself shouldn't error, just return empty result
		t.Fatalf("ExecuteSQL SELECT non-existent ID failed unexpectedly: %v", err)
	}

	// Check that the result indicates no rows found
	expectedResult := "(0 rows)\n"
	if result != expectedResult {
		t.Errorf("SELECT non-existent ID should have returned '%s', but got:\n%s", expectedResult, result)
	}
}

func TestExecuteSQL_SelectScan(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "select_scan_test"
	setupTableForSelect(t, db, tableName) // Uses the same setup helper

	// --- Test SELECT * ---
	selectAllSQL := fmt.Sprintf(`SELECT * FROM %s`, tableName)
	resultAll, err := db.ExecuteSQL(selectAllSQL)
	if err != nil {
		t.Fatalf("ExecuteSQL (SELECT *) failed: %v", err)
	}
	expectedSnippetsAll := []string{
		"id: 1", "name: A", "value: 100", // Row 1
		"id: 2", "name: B", "value: 200", // Row 2
		"id: 3", "name: C", "value: 300", // Row 3
	}
	for _, snippet := range expectedSnippetsAll {
		if !strings.Contains(resultAll, snippet) {
			t.Errorf("ExecuteSQL (SELECT *) result missing expected snippet: '%s'\nResult:\n%s", snippet, resultAll)
		}
	}
	if !strings.Contains(resultAll, "--- Row 1 ---") || !strings.Contains(resultAll, "--- Row 2 ---") || !strings.Contains(resultAll, "--- Row 3 ---") {
		t.Errorf("ExecuteSQL (SELECT *) result missing row separators.\nResult:\n%s", resultAll)
	}

	// --- Test SELECT specific columns ---
	selectColsSQL := fmt.Sprintf(`SELECT name, id FROM %s`, tableName)
	resultCols, err := db.ExecuteSQL(selectColsSQL)
	if err != nil {
		t.Fatalf("ExecuteSQL (SELECT name, id) failed: %v", err)
	}
	expectedSnippetsCols := []string{
		"id: 1", "name: A",
		"id: 2", "name: B",
		"id: 3", "name: C",
	}
	for _, snippet := range expectedSnippetsCols {
		if !strings.Contains(resultCols, snippet) {
			t.Errorf("ExecuteSQL (SELECT name, id) result missing expected snippet: '%s'\nResult:\n%s", snippet, resultCols)
		}
	}
	if strings.Contains(resultCols, "value:") {
		t.Errorf("ExecuteSQL (SELECT name, id) result unexpectedly contains 'value:' column.\nResult:\n%s", resultCols)
	}
	if !strings.Contains(resultCols, "--- Row 1 ---") || !strings.Contains(resultCols, "--- Row 2 ---") || !strings.Contains(resultCols, "--- Row 3 ---") {
		t.Errorf("ExecuteSQL (SELECT name, id) result missing row separators.\nResult:\n%s", resultCols)
	}

	// --- Test SELECT on empty table ---
	emptyTable := "exec_empty_scan_select"
	_, err = db.ExecuteSQL(fmt.Sprintf(`CREATE TABLE %s (id INTEGER PRIMARY KEY)`, emptyTable))
	if err != nil {
		t.Fatalf("Setup failed for empty table test: %v", err)
	}
	resultEmpty, err := db.ExecuteSQL(fmt.Sprintf(`SELECT * FROM %s`, emptyTable))
	if err != nil {
		t.Fatalf("ExecuteSQL (SELECT *) on empty table failed: %v", err)
	}
	expectedEmpty := "(0 rows)\n"
	if resultEmpty != expectedEmpty {
		t.Errorf("ExecuteSQL (SELECT *) on empty table: got '%s', want '%s'", resultEmpty, expectedEmpty)
	}
}

func TestExecuteSQL_SelectRange(t *testing.T) {
	db, _ := setupTestDB(t) // Use helper
	defer db.dm.Close()

	tableName := "select_range_test"
	setupTableForSelect(t, db, tableName) // Uses the same setup helper

	tests := []struct {
		name             string
		sql              string
		expectedCount    int
		shouldContain    []string
		shouldNotContain []string
	}{
		{
			name:             "id > 1",
			sql:              fmt.Sprintf(`SELECT * FROM %s WHERE id > 1`, tableName),
			expectedCount:    2,
			shouldContain:    []string{"id: 2", "id: 3", "--- Row 1 ---", "--- Row 2 ---"},
			shouldNotContain: []string{"id: 1"},
		},
		{
			name:             "id >= 2",
			sql:              fmt.Sprintf(`SELECT name FROM %s WHERE id >= 2`, tableName),
			expectedCount:    2,
			shouldContain:    []string{"name: B", "name: C"},
			shouldNotContain: []string{"name: A", "id:", "value:"},
		},
		{
			name:             "id < 3",
			sql:              fmt.Sprintf(`SELECT id, value FROM %s WHERE id < 3`, tableName),
			expectedCount:    2,
			shouldContain:    []string{"id: 1", "value: 100", "id: 2", "value: 200"},
			shouldNotContain: []string{"id: 3", "name:"},
		},
		{
			name:             "id <= 1",
			sql:              fmt.Sprintf(`SELECT * FROM %s WHERE id <= 1`, tableName),
			expectedCount:    1,
			shouldContain:    []string{"id: 1", "name: A", "value: 100", "--- Row 1 ---"},
			shouldNotContain: []string{"id: 2", "id: 3", "--- Row 2 ---"},
		},
		{
			name:             "id > 1 AND id < 3",
			sql:              fmt.Sprintf(`SELECT name FROM %s WHERE id > 1 AND id < 3`, tableName),
			expectedCount:    1,
			shouldContain:    []string{"name: B", "--- Row 1 ---"},
			shouldNotContain: []string{"name: A", "name: C", "id:", "value:", "--- Row 2 ---"},
		},
		{
			name:             "id >= 1 AND id <= 2",
			sql:              fmt.Sprintf(`SELECT * FROM %s WHERE id >= 1 AND id <= 2`, tableName),
			expectedCount:    2,
			shouldContain:    []string{"id: 1", "name: A", "id: 2", "name: B"},
			shouldNotContain: []string{"id: 3"},
		},
		{
			name:             "id = 2",
			sql:              fmt.Sprintf(`SELECT * FROM %s WHERE id = 2`, tableName),
			expectedCount:    1,
			shouldContain:    []string{"id: 2", "name: B", "value: 200"},
			shouldNotContain: []string{"id: 1", "id: 3"},
		},
		{
			name:             "Empty result: id > 10",
			sql:              fmt.Sprintf(`SELECT * FROM %s WHERE id > 10`, tableName),
			expectedCount:    0,
			shouldContain:    []string{"(0 rows)"},
			shouldNotContain: []string{"id:"},
		},
		{
			name:             "Empty result: id > 1 AND id < 2",
			sql:              fmt.Sprintf(`SELECT * FROM %s WHERE id > 1 AND id < 2`, tableName),
			expectedCount:    0,
			shouldContain:    []string{"(0 rows)"},
			shouldNotContain: []string{"id:"},
		},
		{
			name:          "Conflicting: id >= 3 AND id < 2",
			sql:           fmt.Sprintf(`SELECT * FROM %s WHERE id >= 3 AND id < 2`, tableName),
			expectedCount: -1, // Indicates error expected
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := db.ExecuteSQL(tt.sql)

			if tt.expectedCount == -1 { // Error case
				if err == nil {
					t.Fatalf("Expected error for SQL: %s, but got nil result", tt.sql)
				}
				t.Logf("Got expected error for '%s': %v", tt.sql, err) // Log the error
				return                                                 // Skip further checks for error cases
			}

			if err != nil {
				t.Fatalf("ExecuteSQL failed for SQL: %s\nError: %v", tt.sql, err)
			}

			// Basic check for row count (count the "---" separators)
			actualCount := strings.Count(result, "--- Row")
			if tt.expectedCount == 0 && !strings.Contains(result, "(0 rows)") {
				t.Errorf("Expected '(0 rows)' for SQL: %s, but got:\n%s", tt.sql, result)
			}
			if tt.expectedCount > 0 && actualCount != tt.expectedCount {
				t.Errorf("Expected %d rows for SQL: %s, but counted %d separators in result:\n%s", tt.expectedCount, tt.sql, actualCount, result)
			}

			// Check for presence of expected snippets
			for _, snippet := range tt.shouldContain {
				if !strings.Contains(result, snippet) {
					t.Errorf("Result for SQL: %s\nMissing expected snippet: '%s'\nResult:\n%s", tt.sql, snippet, result)
				}
			}

			// Check for absence of unexpected snippets
			for _, snippet := range tt.shouldNotContain {
				if strings.Contains(result, snippet) {
					t.Errorf("Result for SQL: %s\nUnexpectedly contains snippet: '%s'\nResult:\n%s", tt.sql, snippet, result)
				}
			}
		})
	}
}
