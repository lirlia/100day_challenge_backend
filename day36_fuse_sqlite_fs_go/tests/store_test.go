package tests

import (
	"testing"

	_ "github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/store" // Import for side effects of store funcs
)

func TestDBConnectionAndSchemaInit(t *testing.T) {
	// Test with temporary file database
	t.Run("FileDB", func(t *testing.T) {
		db, cleanup := SetupTestDB(t)
		defer cleanup()

		if err := db.Ping(); err != nil {
			t.Errorf("Failed to ping temporary file DB: %v", err)
		}
		// Check if root node exists (basic schema check)
		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM inodes WHERE id = 1").Scan(&count)
		if err != nil {
			t.Fatalf("Failed to query root node in file DB: %v", err)
		}
		if count != 1 {
			t.Errorf("Expected 1 root node in file DB, got %d", count)
		}
	})

	// Test with in-memory database
	t.Run("InMemoryDB", func(t *testing.T) {
		db, cleanup := SetupInMemoryTestDB(t)
		defer cleanup()

		if err := db.Ping(); err != nil {
			t.Errorf("Failed to ping in-memory DB: %v", err)
		}
		// Check if root node exists (basic schema check)
		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM inodes WHERE id = 1").Scan(&count)
		if err != nil {
			t.Fatalf("Failed to query root node in in-memory DB: %v", err)
		}
		if count != 1 {
			t.Errorf("Expected 1 root node in in-memory DB, got %d", count)
		}
	})
}
