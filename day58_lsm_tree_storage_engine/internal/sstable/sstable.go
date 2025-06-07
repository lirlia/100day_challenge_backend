package sstable

import (
	"bufio"
	"encoding/binary"
	"fmt"
	"io"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
)

// SSTableEntry represents a single entry in an SSTable
type SSTableEntry struct {
	Key       string
	Value     []byte
	Deleted   bool
	Timestamp int64
}

// SSTable represents a Sorted String Table
type SSTable struct {
	filePath string
	index    *SSTableIndex
	metadata SSTableMetadata
}

// SSTableIndex represents the index for fast key lookups
type SSTableIndex struct {
	entries []IndexEntry
}

// IndexEntry represents a single index entry
type IndexEntry struct {
	Key    string
	Offset int64
}

// SSTableMetadata contains metadata about the SSTable
type SSTableMetadata struct {
	Level       int
	MinKey      string
	MaxKey      string
	EntryCount  int64
	DataSize    int64 // Size of data section (excluding metadata and index)
	CreatedAt   time.Time
	BloomFilter []byte // Bloom filter data (will be implemented later)
}

// SSTableWriter is used to write SSTable files
type SSTableWriter struct {
	file       *os.File
	writer     *bufio.Writer
	index      []IndexEntry
	entryCount int64
	minKey     string
	maxKey     string
	level      int
}

// SSTableReader is used to read SSTable files
type SSTableReader struct {
	file     *os.File
	index    *SSTableIndex
	metadata SSTableMetadata
}

const (
	footerSize = 16 // metadataLen(8) + indexLen(8)
)

// NewSSTableWriter creates a new SSTable writer
func NewSSTableWriter(filePath string, level int) (*SSTableWriter, error) {
	file, err := os.Create(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create SSTable file: %w", err)
	}

	return &SSTableWriter{
		file:   file,
		writer: bufio.NewWriter(file),
		index:  make([]IndexEntry, 0),
		level:  level,
	}, nil
}

// WriteEntry writes an entry to the SSTable
func (w *SSTableWriter) WriteEntry(entry SSTableEntry) error {
	// Record current position for index
	currentPos, err := w.file.Seek(0, io.SeekCurrent)
	if err != nil {
		return fmt.Errorf("failed to get current position: %w", err)
	}

	// Adjust for buffered data
	currentPos += int64(w.writer.Buffered())

	// Add to index (sample every N entries to keep index size reasonable)
	if len(w.index) == 0 || w.entryCount%100 == 0 {
		w.index = append(w.index, IndexEntry{
			Key:    entry.Key,
			Offset: currentPos,
		})
	}

	// Update min/max keys
	if w.entryCount == 0 {
		w.minKey = entry.Key
	}
	w.maxKey = entry.Key

	// Serialize and write the entry
	data, err := w.serializeEntry(entry)
	if err != nil {
		return fmt.Errorf("failed to serialize entry: %w", err)
	}

	if _, err := w.writer.Write(data); err != nil {
		return fmt.Errorf("failed to write entry: %w", err)
	}

	w.entryCount++
	return nil
}

// serializeEntry converts an SSTable entry to binary format
func (w *SSTableWriter) serializeEntry(entry SSTableEntry) ([]byte, error) {
	// Format: [Length:4][Deleted:1][Timestamp:8][KeyLen:4][Key][ValueLen:4][Value]
	keyBytes := []byte(entry.Key)

	totalLen := 1 + 8 + 4 + len(keyBytes) + 4 + len(entry.Value)
	buffer := make([]byte, 4+totalLen)

	offset := 0

	// Total length (excluding this field)
	binary.LittleEndian.PutUint32(buffer[offset:], uint32(totalLen))
	offset += 4

	// Deleted flag
	if entry.Deleted {
		buffer[offset] = 1
	} else {
		buffer[offset] = 0
	}
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

// Close finalizes the SSTable file
func (w *SSTableWriter) Close() error {
	if err := w.writer.Flush(); err != nil {
		return fmt.Errorf("failed to flush writer: %w", err)
	}

	dataSize, err := w.file.Seek(0, io.SeekCurrent)
	if err != nil {
		return fmt.Errorf("failed to get data size: %w", err)
	}

	metadataBytes, err := w.serializeMetadata(SSTableMetadata{
		Level: w.level, MinKey: w.minKey, MaxKey: w.maxKey,
		EntryCount: w.entryCount, DataSize: dataSize,
		CreatedAt: time.Now(),
	})
	if err != nil {
		return err
	}

	indexBytes, err := w.serializeIndex()
	if err != nil {
		return err
	}

	// Write metadata and index
	metadataOffset := dataSize
	if _, err := w.file.Write(metadataBytes); err != nil {
		return err
	}

	indexOffset := metadataOffset + int64(len(metadataBytes))
	if _, err := w.file.Write(indexBytes); err != nil {
		return err
	}

	// Write footer
	footer := make([]byte, footerSize)
	binary.LittleEndian.PutUint64(footer[0:8], uint64(metadataOffset))
	binary.LittleEndian.PutUint64(footer[8:16], uint64(indexOffset))
	if _, err := w.file.Write(footer); err != nil {
		return err
	}

	return w.file.Close()
}

// serializeMetadata converts metadata to binary format
func (w *SSTableWriter) serializeMetadata(metadata SSTableMetadata) ([]byte, error) {
	// Simple serialization for metadata
	minKeyBytes := []byte(metadata.MinKey)
	maxKeyBytes := []byte(metadata.MaxKey)

	totalLen := 4 + 4 + len(minKeyBytes) + 4 + len(maxKeyBytes) + 8 + 8 + 8 + 8
	buffer := make([]byte, totalLen)

	offset := 0

	// Level
	binary.LittleEndian.PutUint32(buffer[offset:], uint32(metadata.Level))
	offset += 4

	// MinKey
	binary.LittleEndian.PutUint32(buffer[offset:], uint32(len(minKeyBytes)))
	offset += 4
	copy(buffer[offset:], minKeyBytes)
	offset += len(minKeyBytes)

	// MaxKey
	binary.LittleEndian.PutUint32(buffer[offset:], uint32(len(maxKeyBytes)))
	offset += 4
	copy(buffer[offset:], maxKeyBytes)
	offset += len(maxKeyBytes)

	// EntryCount
	binary.LittleEndian.PutUint64(buffer[offset:], uint64(metadata.EntryCount))
	offset += 8

	// DataSize
	binary.LittleEndian.PutUint64(buffer[offset:], uint64(metadata.DataSize))
	offset += 8

	// CreatedAt (Unix timestamp)
	binary.LittleEndian.PutUint64(buffer[offset:], uint64(metadata.CreatedAt.Unix()))

	return buffer, nil
}

// serializeIndex converts index to binary format
func (w *SSTableWriter) serializeIndex() ([]byte, error) {
	if len(w.index) == 0 {
		return []byte{}, nil
	}

	// Calculate total size
	totalSize := 4 // entry count
	for _, entry := range w.index {
		totalSize += 4 + len(entry.Key) + 8 // keyLen + key + offset
	}

	buffer := make([]byte, totalSize)
	offset := 0

	// Entry count
	binary.LittleEndian.PutUint32(buffer[offset:], uint32(len(w.index)))
	offset += 4

	// Index entries
	for _, entry := range w.index {
		keyBytes := []byte(entry.Key)

		// Key length
		binary.LittleEndian.PutUint32(buffer[offset:], uint32(len(keyBytes)))
		offset += 4

		// Key
		copy(buffer[offset:], keyBytes)
		offset += len(keyBytes)

		// Offset
		binary.LittleEndian.PutUint64(buffer[offset:], uint64(entry.Offset))
		offset += 8
	}

	return buffer, nil
}

// NewSSTableReader creates a new SSTable reader
func NewSSTableReader(filePath string) (*SSTableReader, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open SSTable file: %w", err)
	}

	reader := &SSTableReader{file: file}

	if err := reader.readFooterAndLoad(); err != nil {
		file.Close()
		return nil, fmt.Errorf("failed to read footer: %w", err)
	}
	return reader, nil
}

func (r *SSTableReader) readFooterAndLoad() error {
	fileInfo, err := r.file.Stat()
	if err != nil {
		return err
	}
	fileSize := fileInfo.Size()

	if fileSize < footerSize {
		return fmt.Errorf("file too small")
	}

	footer := make([]byte, footerSize)
	if _, err := r.file.ReadAt(footer, fileSize-footerSize); err != nil {
		return err
	}

	metadataOffset := binary.LittleEndian.Uint64(footer[0:8])
	indexOffset := binary.LittleEndian.Uint64(footer[8:16])

	// Read and deserialize metadata
	metadataLen := indexOffset - metadataOffset
	metadataBytes := make([]byte, metadataLen)
	if _, err := r.file.ReadAt(metadataBytes, int64(metadataOffset)); err != nil {
		return err
	}
	if err := r.deserializeMetadata(metadataBytes); err != nil {
		return err
	}

	// Read and deserialize index
	indexLen := fileSize - footerSize - int64(indexOffset)
	indexBytes := make([]byte, indexLen)
	if _, err := r.file.ReadAt(indexBytes, int64(indexOffset)); err != nil {
		return err
	}
	if err := r.deserializeIndex(indexBytes); err != nil {
		return err
	}

	return nil
}

// deserializeMetadata reads metadata from binary format
func (r *SSTableReader) deserializeMetadata(data []byte) error {
	offset := 0

	// Level
	level := binary.LittleEndian.Uint32(data[offset:])
	offset += 4

	// MinKey
	minKeyLen := binary.LittleEndian.Uint32(data[offset:])
	offset += 4
	minKey := string(data[offset : offset+int(minKeyLen)])
	offset += int(minKeyLen)

	// MaxKey
	maxKeyLen := binary.LittleEndian.Uint32(data[offset:])
	offset += 4
	maxKey := string(data[offset : offset+int(maxKeyLen)])
	offset += int(maxKeyLen)

	// EntryCount
	entryCount := binary.LittleEndian.Uint64(data[offset:])
	offset += 8

	// DataSize
	dataSize := binary.LittleEndian.Uint64(data[offset:])
	offset += 8

	// CreatedAt
	createdAtUnix := binary.LittleEndian.Uint64(data[offset:])
	createdAt := time.Unix(int64(createdAtUnix), 0)

	r.metadata = SSTableMetadata{
		Level:      int(level),
		MinKey:     minKey,
		MaxKey:     maxKey,
		EntryCount: int64(entryCount),
		DataSize:   int64(dataSize),
		CreatedAt:  createdAt,
	}

	return nil
}

// deserializeIndex reads index from binary format
func (r *SSTableReader) deserializeIndex(data []byte) error {
	if len(data) == 0 {
		r.index = &SSTableIndex{entries: []IndexEntry{}}
		return nil
	}

	offset := 0

	// Entry count
	entryCount := binary.LittleEndian.Uint32(data[offset:])
	offset += 4

	entries := make([]IndexEntry, entryCount)
	for i := uint32(0); i < entryCount; i++ {
		// Key length
		keyLen := binary.LittleEndian.Uint32(data[offset:])
		offset += 4

		// Key
		key := string(data[offset : offset+int(keyLen)])
		offset += int(keyLen)

		// Offset
		entryOffset := binary.LittleEndian.Uint64(data[offset:])
		offset += 8

		entries[i] = IndexEntry{
			Key:    key,
			Offset: int64(entryOffset),
		}
	}

	r.index = &SSTableIndex{entries: entries}
	return nil
}

// Get retrieves a value by key from the SSTable
func (r *SSTableReader) Get(key string) ([]byte, bool, error) {
	// Check if key is in range
	if len(r.metadata.MinKey) > 0 && len(r.metadata.MaxKey) > 0 {
		if strings.Compare(key, r.metadata.MinKey) < 0 || strings.Compare(key, r.metadata.MaxKey) > 0 {
			return nil, false, nil
		}
	}

	// Find the best starting position using index
	startOffset := r.findStartOffset(key)

	// Seek to the starting position
	if _, err := r.file.Seek(startOffset, io.SeekStart); err != nil {
		return nil, false, fmt.Errorf("failed to seek: %w", err)
	}

	reader := bufio.NewReader(r.file)
	bytesRead := startOffset

	// Scan entries from the starting position
	for bytesRead < r.metadata.DataSize {
		entry, n, err := r.deserializeEntry(reader)
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, false, fmt.Errorf("failed to deserialize entry: %w", err)
		}
		bytesRead += n

		cmp := strings.Compare(entry.Key, key)
		if cmp == 0 {
			// Found the key
			if entry.Deleted {
				return nil, false, nil
			}
			return entry.Value, true, nil
		}
		if cmp > 0 {
			// Passed the key, not found
			return nil, false, nil
		}
	}

	return nil, false, nil
}

// findStartOffset finds the best starting offset for a key using the index
func (r *SSTableReader) findStartOffset(key string) int64 {
	if r.index == nil || len(r.index.entries) == 0 {
		return 0
	}

	// Binary search in index
	left, right := 0, len(r.index.entries)-1
	bestOffset := int64(0)

	for left <= right {
		mid := (left + right) / 2
		cmp := strings.Compare(r.index.entries[mid].Key, key)

		if cmp <= 0 {
			bestOffset = r.index.entries[mid].Offset
			left = mid + 1
		} else {
			right = mid - 1
		}
	}

	return bestOffset
}

// deserializeEntry reads and deserializes an SSTable entry from a reader
func (r *SSTableReader) deserializeEntry(reader *bufio.Reader) (SSTableEntry, int64, error) {
	// Read total length
	lengthBytes := make([]byte, 4)
	if _, err := io.ReadFull(reader, lengthBytes); err != nil {
		return SSTableEntry{}, 0, err
	}
	totalLen := binary.LittleEndian.Uint32(lengthBytes)

	// Read the rest of the entry
	entryBytes := make([]byte, totalLen)
	if _, err := io.ReadFull(reader, entryBytes); err != nil {
		return SSTableEntry{}, 4, err
	}

	bytesConsumed := int64(4 + totalLen)
	offset := 0

	// Deleted flag
	deleted := entryBytes[offset] == 1
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

	return SSTableEntry{
		Key:       key,
		Value:     value,
		Deleted:   deleted,
		Timestamp: timestamp,
	}, bytesConsumed, nil
}

// NewIterator creates a new iterator for the SSTable
func (r *SSTableReader) NewIterator() (*SSTableIterator, error) {
	// Seek to the beginning of data (skip metadata and index)
	if _, err := r.file.Seek(0, io.SeekStart); err != nil {
		return nil, fmt.Errorf("failed to seek to start: %w", err)
	}

	iterator := &SSTableIterator{
		reader:     bufio.NewReader(r.file),
		sstable:    r,
		currentPos: 0,
	}

	// Pre-load the first entry
	iterator.advance()

	return iterator, nil
}

// calculateDataEnd calculates where the data section ends
func (r *SSTableReader) calculateDataEnd() int64 {
	// Return the actual data size from metadata
	return r.metadata.DataSize
}

// Close closes the SSTable reader
func (r *SSTableReader) Close() error {
	return r.file.Close()
}

// GetMetadata returns the SSTable metadata
func (r *SSTableReader) GetMetadata() SSTableMetadata {
	return r.metadata
}

// GetSSTableFiles returns a list of SSTable files in a directory
func GetSSTableFiles(dirPath string) ([]string, error) {
	entries, err := os.ReadDir(dirPath)
	if err != nil {
		return nil, err
	}

	var sstableFiles []string
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		if strings.HasSuffix(entry.Name(), ".sst") {
			sstableFiles = append(sstableFiles, entry.Name())
		}
	}

	sort.Strings(sstableFiles)
	return sstableFiles, nil
}

// GenerateSSTableFileName generates a filename for an SSTable
func GenerateSSTableFileName(level int, sequence int) string {
	return fmt.Sprintf("level_%d_%06d.sst", level, sequence)
}

// ParseSSTableFileName parses level and sequence from SSTable filename
func ParseSSTableFileName(filename string) (level int, sequence int, err error) {
	// Remove .sst extension
	name := strings.TrimSuffix(filename, ".sst")

	// Split by underscore
	parts := strings.Split(name, "_")
	if len(parts) != 3 || parts[0] != "level" {
		return 0, 0, fmt.Errorf("invalid SSTable filename format: %s", filename)
	}

	level, err = strconv.Atoi(parts[1])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid level in filename: %w", err)
	}

	sequence, err = strconv.Atoi(parts[2])
	if err != nil {
		return 0, 0, fmt.Errorf("invalid sequence in filename: %w", err)
	}

	return level, sequence, nil
}
