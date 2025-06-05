package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// InitDB initializes and returns a SQLite database connection.
// dbPath is the path to the SQLite file (e.g., "./db/orders.db").
// schemaCreationQuery is a SQL string to create tables if they don't exist.
func InitDB(dbPath string, schemaCreationQuery string) (*sql.DB, error) {
	dbDir := filepath.Dir(dbPath)
	if err := os.MkdirAll(dbDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create database directory %s: %w", dbDir, err)
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database at %s: %w", dbPath, err)
	}

	if err = db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database at %s: %w", dbPath, err)
	}

	// Create tables if they don't exist
	if schemaCreationQuery != "" {
		_, err = db.Exec(schemaCreationQuery)
		if err != nil {
			db.Close()
			return nil, fmt.Errorf("failed to execute schema creation query: %w", err)
		}
	}

	log.Printf("Database initialized successfully at %s", dbPath)
	return db, nil
}
