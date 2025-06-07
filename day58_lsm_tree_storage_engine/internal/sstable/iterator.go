package sstable

import (
	"bufio"
	"io"
)

// SSTableIterator represents an iterator for SSTable entries
type SSTableIterator struct {
	reader     *bufio.Reader
	sstable    *SSTableReader
	currentPos int64
	current    *SSTableEntry
	err        error
}

// HasNext checks if there are more entries to iterate
func (it *SSTableIterator) HasNext() bool {
	return it.current != nil && it.err == nil
}

// Next returns the next entry in the SSTable
func (it *SSTableIterator) Next() (SSTableEntry, bool) {
	if !it.HasNext() {
		return SSTableEntry{}, false
	}

	// Return current entry and advance to next
	entry := *it.current
	it.advance()

	return entry, true
}

// advance reads the next entry from the SSTable
func (it *SSTableIterator) advance() {
	if it.err != nil {
		it.current = nil
		return
	}

	if it.currentPos >= it.sstable.metadata.DataSize {
		it.current = nil
		it.err = io.EOF
		return
	}

	entry, bytesRead, err := it.sstable.deserializeEntry(it.reader)
	if err != nil {
		it.current = nil
		it.err = err
		return
	}

	it.currentPos += bytesRead
	it.current = &entry
}

// Error returns any error encountered during iteration
func (it *SSTableIterator) Error() error {
	if it.err == io.EOF {
		return nil
	}
	return it.err
}

// Close closes the iterator
func (it *SSTableIterator) Close() error {
	// Iterator doesn't own the file, so nothing to close
	return nil
}

// Seek seeks to a specific key in the SSTable
func (it *SSTableIterator) Seek(key string) bool {
	// Find the best starting position using index
	startOffset := it.sstable.findStartOffset(key)

	// Seek to the starting position
	if _, err := it.sstable.file.Seek(startOffset, io.SeekStart); err != nil {
		it.err = err
		return false
	}

	// Create new reader from current position
	it.reader = bufio.NewReader(it.sstable.file)
	it.currentPos = startOffset
	it.current = nil
	it.err = nil

	// Advance to first entry
	it.advance()

	return it.HasNext()
}

// Key returns the key of the current entry
func (it *SSTableIterator) Key() string {
	if it.current == nil {
		return ""
	}
	return it.current.Key
}

// Value returns the value of the current entry
func (it *SSTableIterator) Value() []byte {
	if it.current == nil {
		return nil
	}
	return it.current.Value
}

// IsDeleted returns true if the current entry is deleted
func (it *SSTableIterator) IsDeleted() bool {
	if it.current == nil {
		return false
	}
	return it.current.Deleted
}

// Timestamp returns the timestamp of the current entry
func (it *SSTableIterator) Timestamp() int64 {
	if it.current == nil {
		return 0
	}
	return it.current.Timestamp
}
