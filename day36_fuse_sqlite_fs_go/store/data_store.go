package store

import (
	"database/sql"
	"errors"
	"fmt"
	"time"
)

// ReadData reads data from a file node at a specific offset and size.
func (s *sqlStore) ReadData(inodeID int64, offset int64, size int64) ([]byte, error) {
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
	if size < 0 || size > maxReadSize {
		size = maxReadSize
	}

	if size == 0 {
		return []byte{}, nil // Nothing to read
	}

	var data []byte
	// SQLite doesn't have great support for reading partial BLOBs directly.
	// We fetch the whole BLOB and slice it in Go.
	// For very large files, this is inefficient. Consider chunking in DB if needed.
	query := `SELECT data FROM file_data WHERE node_id = ?`
	err = s.db.QueryRow(query, inodeID).Scan(&data)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			// This shouldn't happen if inode exists and Size > 0, but handle defensively.
			return []byte{}, nil
		}
		return nil, fmt.Errorf("failed to read file data for inode %d: %w", inodeID, err)
	}

	// Ensure the retrieved data isn't shorter than expected (though offset check should prevent this)
	if int64(len(data)) < offset+size {
		// This might indicate data corruption or inconsistency
		// Adjust size to what's actually available
		newSize := int64(len(data)) - offset
		if newSize < 0 {
			newSize = 0
		}
		fmt.Printf("Warning: ReadData inconsistency for inode %d. Requested offset %d + size %d, but data length is %d. Reading %d bytes.\n", inodeID, offset, size, len(data), newSize)
		size = newSize
	}

	// Slice the data according to offset and size
	end := offset + size
	if end > int64(len(data)) {
		end = int64(len(data))
	}
	if offset >= end {
		// Handle cases where offset is at or beyond the end after adjustments
		return []byte{}, nil
	}
	return data[offset:end], nil
}

// WriteData writes data to a file node at a specific offset.
// It updates the node's size and mtime.
func (s *sqlStore) WriteData(inodeID int64, offset int64, data []byte) (newSize int64, err error) {
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

	tx, err := s.db.Begin()
	if err != nil {
		return 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback() // Rollback if commit fails or function panics

	// Fetch existing data
	var existingData []byte
	selectQuery := `SELECT data FROM file_data WHERE node_id = ?`
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
	writeQuery := `REPLACE INTO file_data (node_id, data) VALUES (?, ?)`
	_, err = tx.Exec(writeQuery, inodeID, combinedData)
	if err != nil {
		return 0, fmt.Errorf("failed to write file data for inode %d: %w", inodeID, err)
	}

	// Update inode metadata (size and mtime)
	calculatedNewSize := int64(len(combinedData)) // Use the actual length of the final data
	newMtime := time.Now()
	newTimeUnix := newMtime.Unix() // Get Unix timestamp
	// Update ctime as well, as metadata is changing
	updateQuery := `UPDATE nodes SET size = ?, mtime = ?, ctime = ? WHERE id = ?`
	_, err = tx.Exec(updateQuery, calculatedNewSize, newTimeUnix, newTimeUnix, inodeID)
	if err != nil {
		return 0, fmt.Errorf("failed to update inode metadata for inode %d: %w", inodeID, err)
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	// Return the new size of the file
	return calculatedNewSize, nil // Return the calculated new size (int64)
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
	query := `UPDATE file_data SET data = ? WHERE node_id = ?`
	_, err := s.db.Exec(query, []byte{}, inodeID) // Use s.db (lowercase)
	if err != nil {
		return fmt.Errorf("failed to clear file data for inode %d: %w", inodeID, err)
	}

	// Also update the inode size to 0 and modification time
	now := time.Now()
	updateInodeQuery := `UPDATE inodes SET size = 0, mtime = ?, atime = ? WHERE id = ? AND is_dir = FALSE`
	_, err = s.db.Exec(updateInodeQuery, now.Unix(), now.Unix(), inodeID) // Use s.db (lowercase)
	if err != nil {
		return fmt.Errorf("failed to update inode size after clearing data for inode %d: %w", inodeID, err)
	}

	return nil
}

// TruncateFile truncates the content of a file node to a specified size.
// It updates the node's size and mtime.
func (s *sqlStore) TruncateFile(inodeID int64, size int64) error {
	if size < 0 {
		return fmt.Errorf("truncate size cannot be negative: %d", size)
	}

	// Check if node exists and is a file
	node, err := s.GetNode(inodeID)
	if err != nil {
		return err // Propagate errors like ErrNotFound
	}
	if node.IsDir {
		return fmt.Errorf("cannot truncate a directory (inode %d)", inodeID)
	}

	tx, err := s.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction for truncate: %w", err)
	}
	defer tx.Rollback()

	// Update file_data table: Read existing data, slice it, write it back
	// This is inefficient but necessary with standard SQLite blob handling.
	var existingData []byte
	selectQuery := `SELECT data FROM file_data WHERE node_id = ?`
	err = tx.QueryRow(selectQuery, inodeID).Scan(&existingData)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return fmt.Errorf("failed to read existing data for truncate (inode %d): %w", inodeID, err)
	}

	var truncatedData []byte
	if size == 0 {
		truncatedData = []byte{}
	} else if int64(len(existingData)) > size {
		truncatedData = existingData[:size]
	} else {
		// If size >= current size, pad with null bytes? Or just keep existing?
		// Standard truncate usually doesn't extend files.
		// If size > current, we just keep the existing data (effectively no change to data blob).
		// The size in the inode table will be updated later.
		truncatedData = existingData // Keep existing if size >= current length
		// If we needed to *extend* with null bytes:
		/*
			truncatedData = make([]byte, size)
			copy(truncatedData, existingData)
		*/
	}

	// Only write back if the size actually changed the data blob
	if size < int64(len(existingData)) || (size == 0 && len(existingData) > 0) {
		writeQuery := `REPLACE INTO file_data (node_id, data) VALUES (?, ?)`
		_, err = tx.Exec(writeQuery, inodeID, truncatedData)
		if err != nil {
			return fmt.Errorf("failed to write truncated data for inode %d: %w", inodeID, err)
		}
	} else if size > 0 && errors.Is(err, sql.ErrNoRows) {
		// Handle case where file_data row didn't exist but size > 0 (e.g., truncating an empty file to non-zero)
		// We might need to insert an empty blob or pad with zeros depending on desired behavior.
		// For now, let's insert an empty blob if the row didn't exist and size > 0
		// but the primary effect will be updating the inode size.
		writeQuery := `REPLACE INTO file_data (node_id, data) VALUES (?, ?)`
		_, err = tx.Exec(writeQuery, inodeID, []byte{}) // Insert empty blob
		if err != nil {
			return fmt.Errorf("failed to insert empty data row for truncate (inode %d): %w", inodeID, err)
		}
	}

	// Update inode metadata (size and mtime)
	newMtime := time.Now()
	newTimeUnix := newMtime.Unix() // Get Unix timestamp
	updateQuery := `UPDATE nodes SET size = ?, mtime = ?, ctime = ? WHERE id = ?`
	// Use size passed to the function, not len(truncatedData), as truncate can conceptually extend size
	_, err = tx.Exec(updateQuery, size, newTimeUnix, newTimeUnix, inodeID)
	if err != nil {
		return fmt.Errorf("failed to update inode metadata after truncate for inode %d: %w", inodeID, err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction for truncate: %w", err)
	}

	return nil
}
