package store

import (
	"errors"

	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
)

// Custom errors
var (
	ErrNotFound      = errors.New("store: item not found")
	ErrExists        = errors.New("store: item already exists")
	ErrNotEmpty      = errors.New("store: directory not empty")
	ErrNotADirectory = errors.New("store: target is not a directory")
	ErrIsDirectory   = errors.New("store: target is a directory")
)

// Store defines the combined interface for all data store operations.
// We might not need this combined interface if NodeStore and DataStore are always used separately.
type Store interface {
	NodeStore
	DataStore
	InitializeSchema() error
	Close() error
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
	// DeleteNode removes a node (and its data if it's a file) by parent ID and name.
	// Note: For directories, it should typically only delete if empty.
	// isDir helps differentiate between Rmdir and Unlink intentions.
	DeleteNode(parentID int64, name string, isDir bool) error
}

// DataStore defines the interface for file content operations.
type DataStore interface {
	// ReadData reads data from a file node at a specific offset.
	ReadData(inodeID int64, offset int64, size int64) ([]byte, error)
	// WriteData writes data to a file node at a specific offset.
	// It should update the node's size and mtime.
	WriteData(inodeID int64, offset int64, data []byte) (newSize int64, err error)
	// DeleteData removes the content associated with a file node.
	DeleteData(inodeID int64) error
	// TruncateFile truncates the content of a file node to a specified size.
	TruncateFile(inodeID int64, size int64) error
}
