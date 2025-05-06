package store

import (
	"database/sql"
	"errors"
	"fmt"
	"os"
	"time"

	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
)

// scanNode scans a sql.Row or sql.Rows into a models.Node struct.
func scanNode(scanner interface{ Scan(...interface{}) error }) (*models.Node, error) {
	n := &models.Node{}
	var mode uint32               // Use intermediate uint32 for os.FileMode which is uint32
	var atime, mtime, ctime int64 // Unix timestamps from DB
	err := scanner.Scan(
		&n.ID,
		&n.ParentID,
		&n.Name,
		&n.IsDir,
		&mode, // Scan into uint32
		&n.Size,
		&atime,
		&mtime,
		&ctime,
		&n.UID,
		&n.GID,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, os.ErrNotExist // Use standard error for not found
		}
		return nil, fmt.Errorf("failed to scan node: %w", err)
	}
	n.Mode = os.FileMode(mode) // Convert to os.FileMode
	n.Atime = time.Unix(atime, 0)
	n.Mtime = time.Unix(mtime, 0)
	n.Ctime = time.Unix(ctime, 0)
	return n, nil
}

// GetNode retrieves a node by its ID.
func (s *sqlStore) GetNode(id int64) (*models.Node, error) {
	query := `SELECT id, parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid FROM inodes WHERE id = ?`
	row := s.DB.QueryRow(query, id)
	return scanNode(row)
}

// GetChildNode retrieves a child node by parent ID and name.
func (s *sqlStore) GetChildNode(parentID int64, name string) (*models.Node, error) {
	query := `SELECT id, parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid FROM inodes WHERE parent_id = ? AND name = ?`
	row := s.DB.QueryRow(query, parentID, name)
	return scanNode(row)
}

// ListChildren retrieves all direct children of a node.
func (s *sqlStore) ListChildren(parentID int64) ([]*models.Node, error) {
	query := `SELECT id, parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid FROM inodes WHERE parent_id = ? ORDER BY name`
	rows, err := s.DB.Query(query, parentID)
	if err != nil {
		return nil, fmt.Errorf("failed to query children: %w", err)
	}
	defer rows.Close()

	var children []*models.Node
	for rows.Next() {
		n, err := scanNode(rows)
		if err != nil {
			return nil, err // scanNode already wraps the error
		}
		if n.ID == parentID {
			continue
		}
		children = append(children, n)
	}

	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating children rows: %w", err)
	}

	return children, nil
}

// CreateNode creates a new node (file or directory).
func (s *sqlStore) CreateNode(node *models.Node) (*models.Node, error) {
	now := time.Now()
	node.Atime = now
	node.Mtime = now
	node.Ctime = now

	// Ensure parent exists (except for root, which should already exist)
	if node.ParentID != 1 { // Assuming 1 is the root ID
		_, err := s.GetNode(node.ParentID)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil, fmt.Errorf("parent directory with id %d does not exist", node.ParentID)
			}
			return nil, fmt.Errorf("failed to check parent directory: %w", err)
		}
	}

	query := `INSERT INTO inodes (parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	res, err := s.DB.Exec(query,
		node.ParentID,
		node.Name,
		node.IsDir,
		uint32(node.Mode), // Convert os.FileMode to uint32 for DB
		node.Size,
		node.Atime.Unix(),
		node.Mtime.Unix(),
		node.Ctime.Unix(),
		node.UID,
		node.GID,
	)
	if err != nil {
		// Consider specific error handling for UNIQUE constraint violation (duplicate name)
		return nil, fmt.Errorf("failed to insert node: %w", err)
	}

	id, err := res.LastInsertId()
	if err != nil {
		return nil, fmt.Errorf("failed to get last insert ID: %w", err)
	}

	node.ID = id

	// If it's a file, create an empty entry in file_data
	if !node.IsDir {
		dataQuery := `INSERT INTO file_data (inode_id, data) VALUES (?, ?)`
		if _, err := s.DB.Exec(dataQuery, node.ID, []byte{}); err != nil {
			// Rollback or cleanup? For now, just return the error.
			// Maybe delete the inode we just created?
			// s.DeleteNode(node.ID) // Needs careful transaction handling
			return nil, fmt.Errorf("failed to insert empty file_data entry: %w", err)
		}
	}

	return node, nil
}

// UpdateNode updates an existing node's metadata (e.g., size, times, mode).
// Only updates fields that are commonly changed by FUSE operations (mode, size, times).
func (s *sqlStore) UpdateNode(node *models.Node) error {
	// Only update specific fields to avoid overwriting others unintentionally
	query := `UPDATE inodes SET mode = ?, size = ?, atime = ?, mtime = ?, uid = ?, gid = ? WHERE id = ?`
	_, err := s.DB.Exec(query,
		uint32(node.Mode), // Convert to uint32
		node.Size,
		node.Atime.Unix(),
		node.Mtime.Unix(),
		node.UID,
		node.GID,
		node.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update node %d: %w", node.ID, err)
	}
	return nil
}

// DeleteNode removes a node by ID.
// It automatically removes associated file_data due to FOREIGN KEY ON DELETE CASCADE.
func (s *sqlStore) DeleteNode(id int64) error {
	if id == 1 { // Prevent deleting the root directory
		return fmt.Errorf("cannot delete root directory")
	}

	// For directories, we should ideally check if it's empty first.
	// FUSE usually handles this check before calling Remove, but adding a safeguard here might be good.
	node, err := s.GetNode(id)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil // Already deleted, idempotent
		}
		return fmt.Errorf("failed to get node %d before deletion: %w", id, err)
	}
	if node.IsDir {
		children, err := s.ListChildren(id)
		if err != nil {
			return fmt.Errorf("failed to check if directory %d is empty: %w", id, err)
		}
		if len(children) > 0 {
			// FUSE expects ENOTEMPTY or similar. We use a generic error here.
			// In FUSE layer, this should be translated.
			return fmt.Errorf("directory %d is not empty", id)
		}
	}

	query := `DELETE FROM inodes WHERE id = ?`
	_, err = s.DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete node %d: %w", id, err)
	}
	return nil
}
