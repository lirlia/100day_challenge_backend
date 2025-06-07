package engine

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/compaction"
	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/memtable"
	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/sstable"
	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/wal"
)

// LSMEngineConfig holds configuration for the LSM engine
type LSMEngineConfig struct {
	DataDir              string
	MemTableMaxSize      int64 // Maximum size of MemTable before flush
	WALSegmentMaxSize    int64 // Maximum size of WAL segment before rotation
	CompactionIntervalMs int   // Interval for background compaction in milliseconds
	MaxLevels            int   // Maximum number of levels
}

// DefaultLSMEngineConfig returns a default configuration
func DefaultLSMEngineConfig(dataDir string) LSMEngineConfig {
	return LSMEngineConfig{
		DataDir:              dataDir,
		MemTableMaxSize:      4 * 1024 * 1024,  // 4MB
		WALSegmentMaxSize:    16 * 1024 * 1024, // 16MB
		CompactionIntervalMs: 10000,            // 10 seconds
		MaxLevels:            7,
	}
}

// LSMEngine is the main LSM-Tree storage engine
type LSMEngine struct {
	config            LSMEngineConfig
	memtable          *memtable.MemTable
	wal               *wal.WAL
	compactionEngine  *compaction.CompactionEngine
	mu                sync.RWMutex
	closed            bool
	compactionTicker  *time.Ticker
	compactionDone    chan struct{}
	sequenceGenerator int
	deletedKeys       map[string]bool // Track deleted keys for tombstone markers
}

// NewLSMEngine creates a new LSM engine
func NewLSMEngine(config LSMEngineConfig) (*LSMEngine, error) {
	// Ensure data directory exists
	if err := os.MkdirAll(config.DataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	// Initialize WAL
	walConfig := wal.WALConfig{
		DirPath:     config.DataDir,
		MaxFileSize: config.WALSegmentMaxSize,
	}
	walInstance, err := wal.NewWAL(walConfig)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize WAL: %w", err)
	}

	// Initialize MemTable
	memtableInstance := memtable.NewMemTable()

	// Initialize compaction engine
	strategy := compaction.NewSizeTieredStrategy()
	compactionInstance := compaction.NewCompactionEngine(config.DataDir, strategy)

	engine := &LSMEngine{
		config:            config,
		memtable:          memtableInstance,
		wal:               walInstance,
		compactionEngine:  compactionInstance,
		compactionDone:    make(chan struct{}),
		sequenceGenerator: 1,
		deletedKeys:       make(map[string]bool),
	}

	// Recover from WAL if needed
	if err := engine.recoverFromWAL(); err != nil {
		return nil, fmt.Errorf("failed to recover from WAL: %w", err)
	}

	// Start background compaction
	engine.startBackgroundCompaction()

	return engine, nil
}

// Put stores a key-value pair
func (e *LSMEngine) Put(key string, value []byte) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.closed {
		return fmt.Errorf("engine is closed")
	}

	timestamp := time.Now().UnixNano()

	// Write to WAL first for durability
	entry := wal.WALEntry{
		Type:      wal.EntryTypePut,
		Key:       key,
		Value:     value,
		Timestamp: timestamp,
	}

	if err := e.wal.Append(entry); err != nil {
		return fmt.Errorf("failed to write to WAL: %w", err)
	}

	// Write to MemTable
	if err := e.memtable.Put(key, value); err != nil {
		return fmt.Errorf("failed to write to MemTable: %w", err)
	}

	// Remove from deleted keys if it was previously deleted
	delete(e.deletedKeys, key)

	// Check if MemTable needs to be flushed
	if e.shouldFlushMemTable() {
		if err := e.flushMemTable(); err != nil {
			// Log error but don't fail the put operation
			fmt.Printf("Warning: failed to flush MemTable: %v\n", err)
		}
	}

	return nil
}

// Get retrieves a value by key
func (e *LSMEngine) Get(key string) ([]byte, bool, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if e.closed {
		return nil, false, fmt.Errorf("engine is closed")
	}

	// Check if key was deleted
	if e.deletedKeys[key] {
		return nil, false, nil
	}

	// 1. Search in MemTable first (most recent data)
	if value, found, err := e.memtable.Get(key); err == nil && found {
		return value, true, nil
	}

	// 2. Search in SSTables (from newest to oldest)
	sstables, err := e.getSortedSSTableFiles()
	if err != nil {
		return nil, false, fmt.Errorf("failed to get SSTable files: %w", err)
	}

	for _, sstablePath := range sstables {
		reader, err := sstable.NewSSTableReader(sstablePath)
		if err != nil {
			continue // Skip corrupted SSTables
		}

		value, found, err := reader.Get(key)
		reader.Close()

		if err != nil {
			continue // Skip on error
		}

		if found {
			return value, true, nil
		}
	}

	return nil, false, nil // Key not found
}

// Delete marks a key as deleted
func (e *LSMEngine) Delete(key string) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.closed {
		return fmt.Errorf("engine is closed")
	}

	timestamp := time.Now().UnixNano()

	// Write to WAL first
	entry := wal.WALEntry{
		Type:      wal.EntryTypeDelete,
		Key:       key,
		Timestamp: timestamp,
	}

	if err := e.wal.Append(entry); err != nil {
		return fmt.Errorf("failed to write to WAL: %w", err)
	}

	// Mark key as deleted
	e.deletedKeys[key] = true

	// Check if MemTable needs to be flushed
	if e.shouldFlushMemTable() {
		if err := e.flushMemTable(); err != nil {
			fmt.Printf("Warning: failed to flush MemTable: %v\n", err)
		}
	}

	return nil
}

// Flush forces a flush of the current MemTable to SSTable
func (e *LSMEngine) Flush() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.closed {
		return fmt.Errorf("engine is closed")
	}

	return e.flushMemTable()
}

// shouldFlushMemTable checks if MemTable should be flushed
func (e *LSMEngine) shouldFlushMemTable() bool {
	return e.memtable.Size() >= e.config.MemTableMaxSize
}

// flushMemTable flushes the current MemTable to an SSTable
func (e *LSMEngine) flushMemTable() error {
	if e.memtable.EntryCount() == 0 && len(e.deletedKeys) == 0 {
		return nil // Nothing to flush
	}

	// Generate unique filename for new SSTable
	filename := sstable.GenerateSSTableFileName(0, e.sequenceGenerator)
	e.sequenceGenerator++
	sstablePath := filepath.Join(e.config.DataDir, filename)

	// Estimate number of entries for Bloom filter
	entryCount := e.memtable.EntryCount() + int64(len(e.deletedKeys))

	// Create SSTable writer
	writer, err := sstable.NewSSTableWriter(sstablePath, 0, uint64(entryCount))
	if err != nil {
		return fmt.Errorf("failed to create SSTable writer: %w", err)
	}
	defer writer.Close()

	// Write all entries from MemTable
	iterator := e.memtable.NewIterator()
	for iterator.HasNext() {
		key, value, hasNext := iterator.Next()
		if !hasNext {
			break
		}

		sstableEntry := sstable.SSTableEntry{
			Key:       key,
			Value:     value,
			Deleted:   false,
			Timestamp: time.Now().UnixNano(),
		}

		if err := writer.WriteEntry(sstableEntry); err != nil {
			return fmt.Errorf("failed to write entry to SSTable: %w", err)
		}
	}

	// Write tombstone entries for deleted keys
	for key := range e.deletedKeys {
		sstableEntry := sstable.SSTableEntry{
			Key:       key,
			Value:     nil,
			Deleted:   true,
			Timestamp: time.Now().UnixNano(),
		}

		if err := writer.WriteEntry(sstableEntry); err != nil {
			return fmt.Errorf("failed to write tombstone to SSTable: %w", err)
		}
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close SSTable writer: %w", err)
	}

	// Clear MemTable and deleted keys after successful flush
	e.memtable = memtable.NewMemTable()
	e.deletedKeys = make(map[string]bool)

	// Note: We don't truncate WAL here to preserve crash recovery capability
	// WAL will be cleaned up during next rotation or explicit cleanup
	fmt.Printf("Flushed MemTable to SSTable: %s\n", filename)
	return nil
}

// getSortedSSTableFiles returns SSTable files sorted by level and sequence (newest first)
func (e *LSMEngine) getSortedSSTableFiles() ([]string, error) {
	files, err := sstable.GetSSTableFiles(e.config.DataDir)
	if err != nil {
		return nil, err
	}

	// Convert to full paths and sort by level and sequence (reverse order for newest first)
	var sstablePaths []string
	for i := len(files) - 1; i >= 0; i-- {
		sstablePaths = append(sstablePaths, filepath.Join(e.config.DataDir, files[i]))
	}

	return sstablePaths, nil
}

// recoverFromWAL recovers the MemTable from WAL entries
func (e *LSMEngine) recoverFromWAL() error {
	entries, err := e.wal.ReadAll()
	if err != nil {
		return fmt.Errorf("failed to read WAL entries: %w", err)
	}

	for _, entry := range entries {
		if entry.Type == wal.EntryTypePut {
			if err := e.memtable.Put(entry.Key, entry.Value); err != nil {
				return fmt.Errorf("failed to recover entry to MemTable: %w", err)
			}
		} else if entry.Type == wal.EntryTypeDelete {
			e.deletedKeys[entry.Key] = true
		}
	}

	fmt.Printf("Recovered %d entries from WAL\n", len(entries))
	return nil
}

// startBackgroundCompaction starts the background compaction process
func (e *LSMEngine) startBackgroundCompaction() {
	if e.config.CompactionIntervalMs <= 0 {
		return // Compaction disabled
	}

	interval := time.Duration(e.config.CompactionIntervalMs) * time.Millisecond
	e.compactionTicker = time.NewTicker(interval)

	go func() {
		for {
			select {
			case <-e.compactionTicker.C:
				e.runCompaction()
			case <-e.compactionDone:
				return
			}
		}
	}()
}

// runCompaction runs a compaction cycle
func (e *LSMEngine) runCompaction() {
	// Use a separate read lock to avoid blocking reads/writes
	if err := e.compactionEngine.CompactIfNeeded(); err != nil {
		fmt.Printf("Compaction error: %v\n", err)
	}
}

// Close shuts down the LSM engine gracefully
func (e *LSMEngine) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.closed {
		return nil
	}

	e.closed = true

	// Stop background compaction
	if e.compactionTicker != nil {
		e.compactionTicker.Stop()
		close(e.compactionDone)
	}

	// Flush any remaining data
	if err := e.flushMemTable(); err != nil {
		fmt.Printf("Warning: failed to flush MemTable during close: %v\n", err)
	}

	// Close WAL
	if err := e.wal.Close(); err != nil {
		fmt.Printf("Warning: failed to close WAL: %v\n", err)
	}

	fmt.Println("LSM Engine closed successfully")
	return nil
}

// Stats returns statistics about the engine
func (e *LSMEngine) Stats() EngineStats {
	e.mu.RLock()
	defer e.mu.RUnlock()

	stats := EngineStats{
		MemTableSize:    e.memtable.Size(),
		MemTableEntries: e.memtable.EntryCount(),
		DeletedKeys:     len(e.deletedKeys),
	}

	// Count SSTable files by level
	files, err := sstable.GetSSTableFiles(e.config.DataDir)
	if err == nil {
		stats.SSTableCount = len(files)
		levelCounts := make(map[int]int)

		for _, file := range files {
			level, _, err := sstable.ParseSSTableFileName(file)
			if err == nil {
				levelCounts[level]++
			}
		}
		stats.LevelCounts = levelCounts
	}

	return stats
}

// EngineStats holds statistics about the engine
type EngineStats struct {
	MemTableSize    int64
	MemTableEntries int64
	SSTableCount    int
	LevelCounts     map[int]int
	DeletedKeys     int
}
