package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

const schemaSQL = `
-- Filesystem Nodes (Inodes)
CREATE TABLE IF NOT EXISTS inodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    is_dir BOOLEAN NOT NULL DEFAULT FALSE,
    mode INTEGER NOT NULL DEFAULT 0644, -- File permissions (e.g., 0755 for dir, 0644 for file)
    size INTEGER NOT NULL DEFAULT 0,    -- Size in bytes
    atime INTEGER NOT NULL,             -- Last access time (Unix timestamp)
    mtime INTEGER NOT NULL,             -- Last modification time (Unix timestamp)
    ctime INTEGER NOT NULL,             -- Creation time / Last metadata change time (Unix timestamp)
    uid INTEGER NOT NULL DEFAULT 0,     -- User ID (defaulting to root for simplicity)
    gid INTEGER NOT NULL DEFAULT 0,     -- Group ID (defaulting to root for simplicity)
    FOREIGN KEY (parent_id) REFERENCES inodes(id) ON DELETE CASCADE,
    UNIQUE (parent_id, name) -- Ensure unique names within a directory
);

-- File Content Blocks
CREATE TABLE IF NOT EXISTS file_data (
    inode_id INTEGER PRIMARY KEY,
    data BLOB,
    FOREIGN KEY (inode_id) REFERENCES inodes(id) ON DELETE CASCADE
);

-- Create the root directory if it doesn't exist
-- parent_id = 1 points to itself for the root
INSERT OR IGNORE INTO inodes (id, parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid)
VALUES (1, 1, '', TRUE, 0755, 0, strftime('%s', 'now'), strftime('%s', 'now'), strftime('%s', 'now'), 0, 0);
`

// NewDBConnection establishes a connection to the SQLite database.
// It ensures the database directory exists.
func NewDBConnection(dataSourceName string) (*sql.DB, error) {
	// Ensure the directory exists
	dir := filepath.Dir(dataSourceName)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory %s: %w", dir, err)
	}

	db, err := sql.Open("sqlite3", dataSourceName+"?_foreign_keys=on") // Enable foreign key support
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Check the connection
	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	return db, nil
}

// InitializeSchema executes the embedded schema SQL against the database.
func InitializeSchema(db *sql.DB) error {
	// schemaPath := filepath.Join("store", "schema.sql") // Assume schema.sql is in the store directory relative to execution path
	// schemaBytes, err := os.ReadFile(schemaPath)
	// if err != nil {
	// 	// Try relative path from project root if potentially running tests from root
	// 	schemaPathAlt := filepath.Join("day36_fuse_sqlite_fs_go", "store", "schema.sql")
	// 	schemaBytes, err = os.ReadFile(schemaPathAlt)
	// 	if err != nil {
	// 		return fmt.Errorf("failed to read schema file from %s or %s: %w", schemaPath, schemaPathAlt, err)
	// 	}
	// }
	// schemaSQL := string(schemaBytes)
	if _, err := db.Exec(schemaSQL); err != nil {
		return fmt.Errorf("failed to execute schema initialization script: %w", err)
	}

	fmt.Println("Database schema initialized successfully.")
	return nil
}
