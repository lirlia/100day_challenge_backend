package store

import (
	"database/sql"

	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
)

// Store defines the combined interface for all data store operations.
// We might not need this combined interface if NodeStore and DataStore are always used separately.
type Store interface {
	NodeStore
	DataStore
}

// NodeStore defines the interface for node (inode/metadata) operations.
type NodeStore interface {
	// GetNode retrieves a node by its ID.
	GetNode(id int64) (*models.Node, error)
	// GetChildNode retrieves a child node by parent ID and name.
	GetChildNode(parentID int64, name string) (*models.Node, error)
	// ListChildren retrieves all direct children of a node.
	ListChildren(parentID int64) ([]*models.Node, error)
	// CreateNode creates a new node (file or directory).
	CreateNode(node *models.Node) (newNode *models.Node, err error)
	// UpdateNode updates an existing node's metadata (e.g., size, times, mode).
	UpdateNode(node *models.Node) error
	// DeleteNode removes a node (and its data if it's a file) by ID.
	// Note: For directories, it should typically only delete if empty.
	DeleteNode(id int64) error
}

// DataStore defines the interface for file content operations.
type DataStore interface {
	// ReadData reads data from a file node at a specific offset.
	ReadData(inodeID int64, offset int64, size int) ([]byte, error)
	// WriteData writes data to a file node at a specific offset.
	// It should update the node's size and mtime.
	WriteData(inodeID int64, offset int64, data []byte) (bytesWritten int, err error)
	// DeleteData removes the content associated with a file node.
	DeleteData(inodeID int64) error
}

// NewSQLStore creates a new store implementation backed by SQL.
type sqlStore struct {
	*sql.DB
}

// NewSQLStore creates a new SQL-backed store.
// It embeds the *sql.DB to make NodeStore and DataStore implementations cleaner.
// TODO: Change return type back to Store after implementing DataStore methods.
func NewSQLStore(db *sql.DB) Store {
	return &sqlStore{db}
}
