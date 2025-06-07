package wal

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// WALEntry represents a single entry in the Write-Ahead Log
type WALEntry struct {
	Type      EntryType
	Key       string
	Value     []byte
	Timestamp int64
}

// EntryType represents the type of WAL entry
type EntryType uint8

const (
	EntryTypePut EntryType = iota
	EntryTypeDelete
)

// WAL represents the Write-Ahead Log
type WAL struct {
	dirPath     string
	currentFile *os.File
	writer      *bufio.Writer
	mutex       sync.Mutex
	fileIndex   int
	entries     int64
	size        int64
	maxFileSize int64
}

// WALConfig represents configuration for WAL
type WALConfig struct {
	DirPath     string
	MaxFileSize int64 // Maximum size per WAL file
}

// NewWAL creates a new Write-Ahead Log
func NewWAL(config WALConfig) (*WAL, error) {
	if config.MaxFileSize == 0 {
		config.MaxFileSize = 64 * 1024 * 1024 // 64MB default
	}

	// Create directory if it doesn't exist
	if err := os.MkdirAll(config.DirPath, 0755); err != nil {
		return nil, fmt.Errorf("failed to create WAL directory: %w", err)
	}

	wal := &WAL{
		dirPath:     config.DirPath,
		maxFileSize: config.MaxFileSize,
	}

	// Find the latest WAL file or create new one
	if err := wal.initialize(); err != nil {
		return nil, fmt.Errorf("failed to initialize WAL: %w", err)
	}

	return wal, nil
}

// initialize finds the latest WAL file or creates a new one
func (w *WAL) initialize() error {
	files, err := w.getWALFiles()
	if err != nil {
		return err
	}

	if len(files) == 0 {
		// No existing WAL files, create first one
		return w.createNewFile(0)
	}

	// Find the latest file
	sort.Strings(files)
	latestFile := files[len(files)-1]

	// Extract index from filename
	w.fileIndex, err = w.extractFileIndex(latestFile)
	if err != nil {
		return fmt.Errorf("failed to extract file index: %w", err)
	}

	// Open the latest file for appending
	filePath := filepath.Join(w.dirPath, latestFile)
	w.currentFile, err = os.OpenFile(filePath, os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		return fmt.Errorf("failed to open WAL file: %w", err)
	}

	w.writer = bufio.NewWriter(w.currentFile)

	// Get current file size
	stat, err := w.currentFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to get file stats: %w", err)
	}
	w.size = stat.Size()

	return nil
}

// getWALFiles returns a list of WAL files in the directory
func (w *WAL) getWALFiles() ([]string, error) {
	entries, err := os.ReadDir(w.dirPath)
	if err != nil {
		return nil, err
	}

	var walFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.HasPrefix(entry.Name(), "wal-") && strings.HasSuffix(entry.Name(), ".log") {
			walFiles = append(walFiles, entry.Name())
		}
	}

	return walFiles, nil
}

// extractFileIndex extracts the file index from WAL filename
func (w *WAL) extractFileIndex(filename string) (int, error) {
	// Extract number from "wal-NNNNNN.log"
	name := strings.TrimPrefix(filename, "wal-")
	name = strings.TrimSuffix(name, ".log")
	return strconv.Atoi(name)
}

// createNewFile creates a new WAL file
func (w *WAL) createNewFile(index int) error {
	if w.currentFile != nil {
		w.writer.Flush()
		w.currentFile.Close()
	}

	filename := fmt.Sprintf("wal-%06d.log", index)
	filePath := filepath.Join(w.dirPath, filename)

	var err error
	w.currentFile, err = os.Create(filePath)
	if err != nil {
		return fmt.Errorf("failed to create WAL file: %w", err)
	}

	w.writer = bufio.NewWriter(w.currentFile)
	w.fileIndex = index
	w.size = 0

	return nil
}

// Append adds a new entry to the WAL
func (w *WAL) Append(entry WALEntry) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	// Set timestamp if not provided
	if entry.Timestamp == 0 {
		entry.Timestamp = time.Now().UnixNano()
	}

	// Serialize the entry
	data, err := w.serializeEntry(entry)
	if err != nil {
		return fmt.Errorf("failed to serialize entry: %w", err)
	}

	// Check if we need to rotate to a new file
	if w.size+int64(len(data)) > w.maxFileSize {
		if err := w.rotate(); err != nil {
			return fmt.Errorf("failed to rotate WAL file: %w", err)
		}
	}

	// Write the entry
	if _, err := w.writer.Write(data); err != nil {
		return fmt.Errorf("failed to write WAL entry: %w", err)
	}

	// Flush to ensure durability
	if err := w.writer.Flush(); err != nil {
		return fmt.Errorf("failed to flush WAL: %w", err)
	}

	if err := w.currentFile.Sync(); err != nil {
		return fmt.Errorf("failed to sync WAL: %w", err)
	}

	w.size += int64(len(data))
	w.entries++

	return nil
}

// serializeEntry converts a WAL entry to binary format
func (w *WAL) serializeEntry(entry WALEntry) ([]byte, error) {
	// Format: [Length:4][Type:1][Timestamp:8][KeyLen:4][Key][ValueLen:4][Value]
	keyBytes := []byte(entry.Key)

	totalLen := 1 + 8 + 4 + len(keyBytes) + 4 + len(entry.Value)
	buffer := make([]byte, 4+totalLen)

	offset := 0

	// Total length (excluding this field)
	binary.LittleEndian.PutUint32(buffer[offset:], uint32(totalLen))
	offset += 4

	// Entry type
	buffer[offset] = uint8(entry.Type)
	offset++

	// Timestamp
	binary.LittleEndian.PutUint64(buffer[offset:], uint64(entry.Timestamp))
	offset += 8

	// Key length and key
	binary.LittleEndian.PutUint32(buffer[offset:], uint32(len(keyBytes)))
	offset += 4
	copy(buffer[offset:], keyBytes)
	offset += len(keyBytes)

	// Value length and value
	binary.LittleEndian.PutUint32(buffer[offset:], uint32(len(entry.Value)))
	offset += 4
	copy(buffer[offset:], entry.Value)

	return buffer, nil
}

// rotate creates a new WAL file
func (w *WAL) rotate() error {
	return w.createNewFile(w.fileIndex + 1)
}

// ReadAll reads all entries from WAL files
func (w *WAL) ReadAll() ([]WALEntry, error) {
	files, err := w.getWALFiles()
	if err != nil {
		return nil, err
	}

	sort.Strings(files)

	var entries []WALEntry
	for _, filename := range files {
		filePath := filepath.Join(w.dirPath, filename)
		fileEntries, err := w.readEntriesFromFile(filePath)
		if err != nil {
			return nil, fmt.Errorf("failed to read entries from %s: %w", filename, err)
		}
		entries = append(entries, fileEntries...)
	}

	return entries, nil
}

// readEntriesFromFile reads all entries from a single WAL file
func (w *WAL) readEntriesFromFile(filePath string) ([]WALEntry, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	reader := bufio.NewReader(file)
	var entries []WALEntry

	for {
		entry, err := w.deserializeEntry(reader)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to deserialize entry: %w", err)
		}
		entries = append(entries, entry)
	}

	return entries, nil
}

// deserializeEntry reads and deserializes a WAL entry from a reader
func (w *WAL) deserializeEntry(reader *bufio.Reader) (WALEntry, error) {
	// Read total length
	lengthBytes := make([]byte, 4)
	if _, err := io.ReadFull(reader, lengthBytes); err != nil {
		return WALEntry{}, err
	}
	totalLen := binary.LittleEndian.Uint32(lengthBytes)

	// Read the rest of the entry
	entryBytes := make([]byte, totalLen)
	if _, err := io.ReadFull(reader, entryBytes); err != nil {
		return WALEntry{}, err
	}

	offset := 0

	// Entry type
	entryType := EntryType(entryBytes[offset])
	offset++

	// Timestamp
	timestamp := int64(binary.LittleEndian.Uint64(entryBytes[offset:]))
	offset += 8

	// Key
	keyLen := binary.LittleEndian.Uint32(entryBytes[offset:])
	offset += 4
	key := string(entryBytes[offset : offset+int(keyLen)])
	offset += int(keyLen)

	// Value
	valueLen := binary.LittleEndian.Uint32(entryBytes[offset:])
	offset += 4
	value := make([]byte, valueLen)
	copy(value, entryBytes[offset:offset+int(valueLen)])

	return WALEntry{
		Type:      entryType,
		Key:       key,
		Value:     value,
		Timestamp: timestamp,
	}, nil
}

// Truncate removes WAL files up to and including the specified file index
func (w *WAL) Truncate(beforeFileIndex int) error {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	files, err := w.getWALFiles()
	if err != nil {
		return err
	}

	for _, filename := range files {
		index, err := w.extractFileIndex(filename)
		if err != nil {
			continue
		}

		if index <= beforeFileIndex {
			filePath := filepath.Join(w.dirPath, filename)
			if err := os.Remove(filePath); err != nil {
				return fmt.Errorf("failed to remove WAL file %s: %w", filename, err)
			}
		}
	}

	return nil
}

// Close closes the WAL
func (w *WAL) Close() error {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	if w.writer != nil {
		w.writer.Flush()
	}

	if w.currentFile != nil {
		return w.currentFile.Close()
	}

	return nil
}

// Stats returns statistics about the WAL
type WALStats struct {
	FileCount   int
	TotalSize   int64
	EntryCount  int64
	CurrentFile string
}

// GetStats returns current WAL statistics
func (w *WAL) GetStats() (WALStats, error) {
	w.mutex.Lock()
	defer w.mutex.Unlock()

	files, err := w.getWALFiles()
	if err != nil {
		return WALStats{}, err
	}

	var totalSize int64
	for _, filename := range files {
		filePath := filepath.Join(w.dirPath, filename)
		stat, err := os.Stat(filePath)
		if err != nil {
			continue
		}
		totalSize += stat.Size()
	}

	currentFileName := ""
	if w.currentFile != nil {
		currentFileName = filepath.Base(w.currentFile.Name())
	}

	return WALStats{
		FileCount:   len(files),
		TotalSize:   totalSize,
		EntryCount:  w.entries,
		CurrentFile: currentFileName,
	}, nil
}
