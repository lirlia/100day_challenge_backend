package store

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// sqlStore implements the Store interface using SQLite.
type sqlStore struct {
	db *sql.DB
}

// NewSQLStore creates a new SQLite store instance.
func NewSQLStore(dataSourceName string) (Store, error) {
	db, err := sql.Open("sqlite3", dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Enable foreign key constraints
	_, err = db.Exec("PRAGMA foreign_keys = ON;")
	if err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	s := &sqlStore{db: db}

	// Initialize schema here if needed, or call separately
	if err := s.InitializeSchema(); err != nil {
		db.Close() // Close db if schema init fails
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return s, nil
}

// InitializeSchema creates the necessary tables if they don't exist.
func (s *sqlStore) InitializeSchema() error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback() // Rollback on error, commit on success

	// Create nodes table
	_, err = tx.Exec(`
	CREATE TABLE IF NOT EXISTS nodes (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		parent_id INTEGER,
		name TEXT NOT NULL,
		is_dir BOOLEAN NOT NULL,
		mode INTEGER NOT NULL,
		size INTEGER NOT NULL DEFAULT 0,
		uid INTEGER NOT NULL,
		gid INTEGER NOT NULL,
		atime INTEGER NOT NULL DEFAULT 0, -- Store as Unix Epoch seconds
		mtime INTEGER NOT NULL DEFAULT 0, -- Store as Unix Epoch seconds
		ctime INTEGER NOT NULL DEFAULT 0, -- Store as Unix Epoch seconds
		UNIQUE (parent_id, name)
	);
	`)
	if err != nil {
		return fmt.Errorf("failed to create nodes table: %w", err)
	}

	// Create file_data table
	_, err = tx.Exec(`
	CREATE TABLE IF NOT EXISTS file_data (
		node_id INTEGER PRIMARY KEY,
		data BLOB,
		FOREIGN KEY (node_id) REFERENCES nodes (id) ON DELETE CASCADE
	);
	`)
	if err != nil {
		return fmt.Errorf("failed to create file_data table: %w", err)
	}

	// Create the root directory if it doesn't exist
	var rootExists int
	err = tx.QueryRow(`SELECT COUNT(*) FROM nodes WHERE id = 1`).Scan(&rootExists)
	if err != nil && err != sql.ErrNoRows {
		return fmt.Errorf("failed to check for root node: %w", err)
	}

	if rootExists == 0 {
		log.Println("Root node not found, creating...")
		now := time.Now()
		nowUnix := now.Unix()                         // Get Unix timestamp
		rootMode := uint32(0775) | uint32(os.ModeDir) // rwxrwxr-x for root
		uid := os.Getuid()                            // Get current user's UID
		gid := os.Getgid()                            // Get current user's GID
		_, err = tx.Exec(`
		INSERT INTO nodes (id, parent_id, name, is_dir, mode, size, uid, gid, atime, mtime, ctime)
		VALUES (1, NULL, '', TRUE, ?, 0, ?, ?, ?, ?, ?);
		`, rootMode, uid, gid, nowUnix, nowUnix, nowUnix) // Use uid, gid
		if err != nil {
			return fmt.Errorf("failed to insert root node: %w", err)
		}
		log.Printf("Root node created successfully with UID=%d, GID=%d.", uid, gid)
	} else {
		log.Println("Root node already exists.")
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit schema initialization: %w", err)
	}

	log.Println("Database schema initialized successfully.")
	return nil
}

// Close the database connection.
func (s *sqlStore) Close() error {
	log.Println("Closing database connection...")
	return s.db.Close()
}
