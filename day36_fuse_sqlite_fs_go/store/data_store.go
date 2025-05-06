package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// ReadData reads data from a file node at a specific offset and size.
func (s *sqlStore) ReadData(inodeID int64, offset int64, size int) ([]byte, error) {
	// Check if node exists and is a file
	node, err := s.GetNode(inodeID)
	if err != nil {
		return nil, err // Return os.ErrNotExist or other errors from GetNode
	}
	if node.IsDir {
		// FUSE might return EISDIR, translate later
		return nil, fmt.Errorf("cannot read data from a directory (inode %d)", inodeID)
	}

	// Handle offset and size relative to actual file size
	if offset < 0 {
		offset = 0
	}
	if offset >= node.Size {
		return []byte{}, nil // Read past EOF returns empty slice
	}

	// Adjust size if requested read goes beyond EOF
	maxReadSize := node.Size - offset
	if size < 0 || int64(size) > maxReadSize {
		size = int(maxReadSize)
	}

	if size == 0 {
		return []byte{}, nil // Nothing to read
	}

	var data []byte
	// SQLite doesn't have great support for reading partial BLOBs directly.
	// We fetch the whole BLOB and slice it in Go.
	// For very large files, this is inefficient. Consider chunking in DB if needed.
	query := `SELECT data FROM file_data WHERE inode_id = ?`
	err = s.DB.QueryRow(query, inodeID).Scan(&data)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// This shouldn't happen if inode exists and Size > 0, but handle defensively.
			return []byte{}, nil
		}
		return nil, fmt.Errorf("failed to read file data for inode %d: %w", inodeID, err)
	}

	// Ensure the retrieved data isn't shorter than expected (though offset check should prevent this)
	if int64(len(data)) < offset+int64(size) {
		// This might indicate data corruption or inconsistency
		// Adjust size to what's actually available
		size = len(data) - int(offset)
		if size < 0 {
			size = 0
		}
		// Log a warning? Return an error?
		fmt.Printf("Warning: ReadData inconsistency for inode %d. Requested offset %d + size %d, but data length is %d\n", inodeID, offset, size, len(data))
	}

	// Slice the data according to offset and size
	return data[offset : offset+int64(size)], nil
}

// WriteData writes data to a file node at a specific offset.
// It updates the node's size and mtime.
func (s *sqlStore) WriteData(inodeID int64, offset int64, data []byte) (bytesWritten int, err error) {
	// Check if node exists and is a file
	node, err := s.GetNode(inodeID)
	if err != nil {
		return 0, err
	}
	if node.IsDir {
		return 0, fmt.Errorf("cannot write data to a directory (inode %d)", inodeID)
	}
	if offset < 0 {
		return 0, fmt.Errorf("negative offset not allowed for writing")
	}

	newDataLen := int64(len(data))
	if newDataLen == 0 {
		return 0, nil // Nothing to write
	}

	tx, err := s.DB.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback() // Rollback if commit fails or function panics

	// Fetch existing data
	var existingData []byte
	selectQuery := `SELECT data FROM file_data WHERE inode_id = ?`
	err = tx.QueryRow(selectQuery, inodeID).Scan(&existingData)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return 0, fmt.Errorf("failed to read existing file data for inode %d: %w", inodeID, err)
	}

	// Calculate the required capacity for the new data buffer
	requiredCapacity := offset + newDataLen
	var combinedData []byte

	if int64(len(existingData)) >= requiredCapacity {
		// Existing buffer is large enough, reuse it (or a copy)
		combinedData = existingData
	} else {
		// Need to allocate a new buffer
		combinedData = make([]byte, requiredCapacity)
		copy(combinedData, existingData)
	}

	// Copy the new data into the combined buffer at the specified offset
	copy(combinedData[offset:], data)

	// Write the combined data back to the database
	writeQuery := `REPLACE INTO file_data (inode_id, data) VALUES (?, ?)`
	_, err = tx.Exec(writeQuery, inodeID, combinedData)
	if err != nil {
		return 0, fmt.Errorf("failed to write file data for inode %d: %w", inodeID, err)
	}

	// Update inode metadata (size and mtime)
	newSize := int64(len(combinedData))
	newMtime := time.Now()
	updateQuery := `UPDATE inodes SET size = ?, mtime = ?, atime = ? WHERE id = ?`
	_, err = tx.Exec(updateQuery, newSize, newMtime.Unix(), newMtime.Unix(), inodeID)
	if err != nil {
		return 0, fmt.Errorf("failed to update inode metadata for inode %d: %w", inodeID, err)
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return int(newDataLen), nil
}

// DeleteData removes the content associated with a file node.
// This is often handled by ON DELETE CASCADE, but we provide an explicit method.
func (s *sqlStore) DeleteData(inodeID int64) error {
	// Check if node exists and is a file first?
	// GetNode(inodeID) ...

	// The FOREIGN KEY constraint with ON DELETE CASCADE in the schema
	// should handle deletion when the inode is deleted via DeleteNode.
	// However, if we need to truncate a file (set size to 0) or explicitly clear data,
	// this method could be used.
	query := `UPDATE file_data SET data = ? WHERE inode_id = ?`
	_, err := s.DB.Exec(query, []byte{}, inodeID) // Set data to empty byte slice
	if err != nil {
		return fmt.Errorf("failed to clear file data for inode %d: %w", inodeID, err)
	}

	// Also update the inode size to 0 and modification time
	now := time.Now()
	updateInodeQuery := `UPDATE inodes SET size = 0, mtime = ?, atime = ? WHERE id = ? AND is_dir = FALSE`
	_, err = s.DB.Exec(updateInodeQuery, now.Unix(), now.Unix(), inodeID)
	if err != nil {
		return fmt.Errorf("failed to update inode size after clearing data for inode %d: %w", inodeID, err)
	}

	return nil
}
