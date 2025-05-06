package store

import (
	"database/sql"
	"errors"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
)

// scanNode scans a sql.Row or sql.Rows into a models.Node struct.
func scanNode(scanner interface{ Scan(...interface{}) error }) (*models.Node, error) {
	var n models.Node
	var mode uint32
	var atime, mtime, ctime sql.NullInt64 // Read as potentially nullable int64 (Unix timestamp)
	var parentID sql.NullInt64            // Use sql.NullInt64 for parent_id

	err := scanner.Scan(
		&n.ID,
		&parentID, // Scan into sql.NullInt64
		&n.Name,
		&n.IsDir,
		&mode, // Scan into uint32
		&n.Size,
		&atime, // Scan into sql.NullInt64
		&mtime, // Scan into sql.NullInt64
		&ctime, // Scan into sql.NullInt64
		&n.UID,
		&n.GID,
	)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound // Use custom ErrNotFound
		}
		return nil, fmt.Errorf("failed to scan node: %w", err)
	}

	// Handle nullable parentID
	if parentID.Valid {
		n.ParentID = parentID.Int64
	} else {
		// If parentID is NULL, it's likely the root node (or an orphaned node?)
		// Set ParentID to 0 or another indicator if needed.
		n.ParentID = 0 // Assume NULL parent means root or top-level
	}

	n.Mode = os.FileMode(mode) // Convert to os.FileMode
	// Convert int64 timestamp to time.Time, handle NULL case (default to zero time)
	if atime.Valid {
		n.Atime = time.Unix(atime.Int64, 0)
	} else {
		n.Atime = time.Time{} // Or epoch: time.Unix(0, 0)
	}
	if mtime.Valid {
		n.Mtime = time.Unix(mtime.Int64, 0)
	} else {
		n.Mtime = time.Time{}
	}
	if ctime.Valid {
		n.Ctime = time.Unix(ctime.Int64, 0)
	} else {
		n.Ctime = time.Time{}
	}
	return &n, nil
}

// GetNode retrieves a node by its ID.
func (s *sqlStore) GetNode(id int64) (*models.Node, error) {
	// Select Unix timestamps directly
	query := `SELECT id, parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid FROM nodes WHERE id = ?`
	row := s.db.QueryRow(query, id)
	return scanNode(row)
}

// GetChildNode retrieves a child node by parent ID and name.
func (s *sqlStore) GetChildNode(parentID int64, name string) (*models.Node, error) {
	// Select Unix timestamps directly
	query := `SELECT id, parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid FROM nodes WHERE parent_id = ? AND name = ?`
	row := s.db.QueryRow(query, parentID, name)
	return scanNode(row)
}

// ListChildren retrieves all direct children of a node.
func (s *sqlStore) ListChildren(parentID int64) ([]*models.Node, error) {
	// Select Unix timestamps directly
	query := `SELECT id, parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid FROM nodes WHERE parent_id = ?`
	rows, err := s.db.Query(query, parentID)
	if err != nil {
		return nil, fmt.Errorf("failed to query children for parent %d: %w", parentID, err)
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
		return nil, fmt.Errorf("error iterating child rows for parent %d: %w", parentID, err)
	}

	return children, nil
}

// CreateNode creates a new node (file or directory).
func (s *sqlStore) CreateNode(node *models.Node) (*models.Node, error) {
	now := time.Now()
	nowUnix := now.Unix()

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

	query := `INSERT INTO nodes (parent_id, name, is_dir, mode, size, atime, mtime, ctime, uid, gid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
	res, err := s.db.Exec(query,
		node.ParentID,
		node.Name,
		node.IsDir,
		uint32(node.Mode), // Convert os.FileMode to uint32 for DB
		node.Size,
		nowUnix, // Store as int64
		nowUnix, // Store as int64
		nowUnix, // Store as int64
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
		dataQuery := `INSERT INTO file_data (node_id, data) VALUES (?, ?)`
		if _, err := s.db.Exec(dataQuery, node.ID, []byte{}); err != nil {
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
	// Update timestamps using int64 Unix epoch values
	// We need to be careful here. If node.{A,M,C}time are zero values, node.Unix() might be negative.
	// FUSE usually provides specific timestamps to set (e.g., Setattr).
	// If UpdateNode is called with a newly read Node model, its times are already converted from DB.
	// If UpdateNode is meant to update times based on operations (like Write), we need the current time.
	// Let's assume FUSE calls Setattr, which modifies the node model *before* calling UpdateNode.
	// Therefore, we use the Unix() value from the potentially updated node model.
	query := `UPDATE nodes SET mode = ?, size = ?, atime = ?, mtime = ?, ctime = ?, uid = ?, gid = ? WHERE id = ?`
	_, err := s.db.Exec(query,
		uint32(node.Mode), // Convert to uint32
		node.Size,
		node.Atime.Unix(), // Pass int64
		node.Mtime.Unix(), // Pass int64
		node.Ctime.Unix(), // Pass int64 (Ctime should also be updated on metadata change)
		node.UID,
		node.GID,
		node.ID,
	)
	if err != nil {
		return fmt.Errorf("failed to update node %d: %w", node.ID, err)
	}
	return nil
}

// DeleteNode removes a node (and its data if it's a file via cascade).
// Takes parentID and name for directory check, isDir to check type.
func (s *sqlStore) DeleteNode(parentID int64, name string, isDir bool) error {
	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction for delete: %w", err)
	}
	defer tx.Rollback()

	// 1. Find the node to be deleted
	var nodeID int64
	var nodeIsDir bool
	// Use NULL-safe equality for parent_id if root (parent_id NULL) can be listed
	// Though deleting root shouldn't be allowed typically.
	findQuery := `SELECT id, is_dir FROM nodes WHERE parent_id = ? AND name = ?`
	if parentID == 0 { // Handle root potentially having NULL parent_id if needed
		// Adjust query if root's parent_id is NULL in DB
		// findQuery = `SELECT id, is_dir FROM nodes WHERE parent_id IS NULL AND name = ?`
		// However, our schema uses parent_id INTEGER, not NULLable easily unless root is special case
		// Assuming parentID 0 is not used for actual parents and root is ID 1 with ParentID maybe 0 or NULL?
		// Let's stick to parent_id = ? for now, assuming root won't be deleted via this path.
	}
	err = tx.QueryRow(findQuery, parentID, name).Scan(&nodeID, &nodeIsDir)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("failed to find node '%s' in parent %d for delete: %w", name, parentID, err)
	}

	// Prevent deleting root (ID 1)
	if nodeID == 1 {
		return fmt.Errorf("cannot delete root directory")
	}

	// 2. Type check (ensure caller's expectation matches reality)
	if isDir && !nodeIsDir {
		return ErrNotADirectory // Expected dir, found file
	} else if !isDir && nodeIsDir {
		return ErrIsDirectory // Expected file, found dir
	}

	// 3. If it's a directory, check if it's empty
	if nodeIsDir {
		var childCount int
		checkEmptyQuery := `SELECT COUNT(*) FROM nodes WHERE parent_id = ?`
		err = tx.QueryRow(checkEmptyQuery, nodeID).Scan(&childCount)
		if err != nil {
			// Check for ErrNoRows just in case? Should return 0 count.
			return fmt.Errorf("failed to check if directory %d is empty: %w", nodeID, err)
		}
		if childCount > 0 {
			return ErrNotEmpty
		}
	}

	// 4. Delete the node (cascade should handle file_data)
	deleteQuery := `DELETE FROM nodes WHERE id = ?`
	result, err := tx.Exec(deleteQuery, nodeID)
	if err != nil {
		return fmt.Errorf("failed to delete node %d ('%s'): %w", nodeID, name, err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		// Log warning, but proceed if delete likely worked
		log.Printf("WARN: Failed to get rows affected after deleting node %d ('%s'): %v", nodeID, name, err)
	}
	if rowsAffected == 0 {
		// This indicates the node was already deleted between the find and delete queries.
		// Return NotFound or OK? Let's return NotFound for consistency.
		return ErrNotFound
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction for delete: %w", err)
	}

	return nil
}

// parseDBTime parses the time string retrieved from SQLite.
// SQLite often stores time as TEXT in ISO8601 or similar formats.
// DEPRECATED: We now store timestamps as INTEGER (Unix epoch)
func parseDBTime(timeStr string) (time.Time, error) {
	// Try different common formats SQLite might use
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05.999999999-07:00", // Go default format
		"2006-01-02 15:04:05",                 // Without fractional seconds/timezone
	}
	for _, format := range formats {
		t, err := time.Parse(format, timeStr)
		if err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("failed to parse time string: %s", timeStr)
}
