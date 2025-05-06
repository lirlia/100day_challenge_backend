package tests

import (
	"database/sql"
	"os"
	"path/filepath"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/store"
	_ "github.com/mattn/go-sqlite3"
)

// SetupTestDB creates a temporary database for testing and initializes the schema.
func SetupTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	// Create a temporary directory for the database
	tempDir, err := os.MkdirTemp("", "fuse_test_db_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir for test DB: %v", err)
	}

	dbPath := filepath.Join(tempDir, "test.db")

	db, err := store.NewDBConnection(dbPath)
	if err != nil {
		os.RemoveAll(tempDir) // Clean up if connection fails
		t.Fatalf("Failed to connect to test DB: %v", err)
	}

	if err := store.InitializeSchema(db); err != nil {
		db.Close()
		os.RemoveAll(tempDir)
		t.Fatalf("Failed to initialize schema for test DB: %v", err)
	}

	// Return the db connection and a cleanup function
	cleanup := func() {
		db.Close()
		os.RemoveAll(tempDir)
	}

	return db, cleanup
}

// SetupInMemoryTestDB creates an in-memory SQLite database for testing.
func SetupInMemoryTestDB(t *testing.T) (*sql.DB, func()) {
	t.Helper()

	// Use :memory: for in-memory database
	db, err := store.NewDBConnection(":memory:")
	if err != nil {
		t.Fatalf("Failed to connect to in-memory test DB: %v", err)
	}

	if err := store.InitializeSchema(db); err != nil {
		db.Close()
		t.Fatalf("Failed to initialize schema for in-memory test DB: %v", err)
	}

	// Return the db connection and a cleanup function
	cleanup := func() {
		db.Close()
	}

	return db, cleanup
}
