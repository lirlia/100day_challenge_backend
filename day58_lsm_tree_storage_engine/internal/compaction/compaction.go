package compaction

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/sstable"
)

// CompactionStrategy defines when and how to compact SSTables
type CompactionStrategy interface {
	ShouldCompact(levels []LevelInfo) bool
	SelectSSTables(levels []LevelInfo) CompactionJob
}

// LevelInfo contains information about SSTables in a level
type LevelInfo struct {
	Level    int
	SSTables []string // File paths
	Size     int64    // Total size in bytes
}

// CompactionJob represents a single compaction operation
type CompactionJob struct {
	SourceLevel   int
	TargetLevel   int
	InputSSTables []string
	OutputSSTable string
}

// CompactionEngine manages the compaction process
type CompactionEngine struct {
	dataDir             string
	strategy            CompactionStrategy
	maxLevel            int
	levelSizeMultiplier int64 // Each level is this many times larger than the previous
}

// NewCompactionEngine creates a new compaction engine
func NewCompactionEngine(dataDir string, strategy CompactionStrategy) *CompactionEngine {
	return &CompactionEngine{
		dataDir:             dataDir,
		strategy:            strategy,
		maxLevel:            7, // Common LSM-Tree configuration
		levelSizeMultiplier: 10,
	}
}

// CompactIfNeeded checks if compaction is needed and performs it
func (ce *CompactionEngine) CompactIfNeeded() error {
	levels, err := ce.analyzeLevels()
	if err != nil {
		return fmt.Errorf("failed to analyze levels: %w", err)
	}

	if !ce.strategy.ShouldCompact(levels) {
		return nil
	}

	job := ce.strategy.SelectSSTables(levels)
	return ce.executeCompaction(job)
}

// analyzeLevels scans the data directory and analyzes SSTable distribution
func (ce *CompactionEngine) analyzeLevels() ([]LevelInfo, error) {
	files, err := sstable.GetSSTableFiles(ce.dataDir)
	if err != nil {
		return nil, err
	}

	// Group files by level
	levelMap := make(map[int][]string)
	for _, file := range files {
		level, _, err := sstable.ParseSSTableFileName(file)
		if err != nil {
			continue // Skip invalid files
		}
		levelMap[level] = append(levelMap[level], filepath.Join(ce.dataDir, file))
	}

	// Convert to LevelInfo slice
	var levels []LevelInfo
	for level := 0; level <= ce.maxLevel; level++ {
		info := LevelInfo{
			Level:    level,
			SSTables: levelMap[level],
		}

		// Calculate total size for this level
		for _, filePath := range info.SSTables {
			reader, err := sstable.NewSSTableReader(filePath)
			if err != nil {
				continue
			}
			metadata := reader.GetMetadata()
			info.Size += metadata.DataSize
			reader.Close()
		}

		levels = append(levels, info)
	}

	return levels, nil
}

// executeCompaction performs the actual compaction
func (ce *CompactionEngine) executeCompaction(job CompactionJob) error {
	if len(job.InputSSTables) == 0 {
		return nil
	}

	// Open all input SSTables
	readers := make([]*sstable.SSTableReader, 0, len(job.InputSSTables))
	for _, filePath := range job.InputSSTables {
		reader, err := sstable.NewSSTableReader(filePath)
		if err != nil {
			// Close any already opened readers
			for _, r := range readers {
				r.Close()
			}
			return fmt.Errorf("failed to open SSTable %s: %w", filePath, err)
		}
		readers = append(readers, reader)
	}
	defer func() {
		for _, reader := range readers {
			reader.Close()
		}
	}()

	// Create iterators for all input SSTables
	iterators := make([]*sstable.SSTableIterator, 0, len(readers))
	for _, reader := range readers {
		iterator, err := reader.NewIterator()
		if err != nil {
			return fmt.Errorf("failed to create iterator: %w", err)
		}
		iterators = append(iterators, iterator)
	}
	defer func() {
		for _, iter := range iterators {
			iter.Close()
		}
	}()

	// Estimate the number of entries for Bloom filter
	totalEntries := uint64(0)
	for _, reader := range readers {
		metadata := reader.GetMetadata()
		totalEntries += uint64(metadata.EntryCount)
	}

	// Create output SSTable writer
	writer, err := sstable.NewSSTableWriter(job.OutputSSTable, job.TargetLevel, totalEntries)
	if err != nil {
		return fmt.Errorf("failed to create output SSTable: %w", err)
	}
	defer writer.Close()

	// Perform k-way merge with deduplication
	merger := NewKWayMerger(iterators)
	for merger.HasNext() {
		entry, err := merger.Next()
		if err != nil {
			return fmt.Errorf("merge error: %w", err)
		}

		// Skip deleted entries during compaction (physical deletion)
		if !entry.Deleted {
			if err := writer.WriteEntry(entry); err != nil {
				return fmt.Errorf("failed to write entry: %w", err)
			}
		}
	}

	if err := writer.Close(); err != nil {
		return fmt.Errorf("failed to close output SSTable: %w", err)
	}

	// Clean up input files after successful compaction
	for _, filePath := range job.InputSSTables {
		if err := ce.removeSSTable(filePath); err != nil {
			// Log error but don't fail the compaction
			fmt.Printf("Warning: failed to remove input SSTable %s: %v\n", filePath, err)
		}
	}

	return nil
}

// removeSSTable safely removes an SSTable file
func (ce *CompactionEngine) removeSSTable(filePath string) error {
	// Simple file removal - in production you might want more sophisticated cleanup
	return os.Remove(filePath)
}

// SizeTieredStrategy implements a size-tiered compaction strategy
type SizeTieredStrategy struct {
	maxL0Files   int   // Maximum files in Level 0 before triggering compaction
	maxLevelSize int64 // Maximum size for each level
}

// NewSizeTieredStrategy creates a new size-tiered compaction strategy
func NewSizeTieredStrategy() *SizeTieredStrategy {
	return &SizeTieredStrategy{
		maxL0Files:   4,
		maxLevelSize: 10 * 1024 * 1024, // 10MB base size
	}
}

// ShouldCompact determines if compaction is needed
func (sts *SizeTieredStrategy) ShouldCompact(levels []LevelInfo) bool {
	// Check Level 0: too many files
	if len(levels) > 0 && len(levels[0].SSTables) >= sts.maxL0Files {
		return true
	}

	// Check other levels: size exceeded
	for i, level := range levels {
		if i == 0 {
			continue // Already checked above
		}
		maxSize := sts.maxLevelSize * int64(1<<(i-1)) // Exponential growth
		if level.Size > maxSize {
			return true
		}
	}

	return false
}

// SelectSSTables selects which SSTables to compact
func (sts *SizeTieredStrategy) SelectSSTables(levels []LevelInfo) CompactionJob {
	// Priority 1: Compact Level 0 if it has too many files
	if len(levels) > 0 && len(levels[0].SSTables) >= sts.maxL0Files {
		return CompactionJob{
			SourceLevel:   0,
			TargetLevel:   1,
			InputSSTables: levels[0].SSTables,
			OutputSSTable: sts.generateOutputFileName(1),
		}
	}

	// Priority 2: Find the first level that exceeds size limit
	for i, level := range levels {
		if i == 0 {
			continue
		}
		maxSize := sts.maxLevelSize * int64(1<<(i-1))
		if level.Size > maxSize {
			return CompactionJob{
				SourceLevel:   i,
				TargetLevel:   i + 1,
				InputSSTables: level.SSTables,
				OutputSSTable: sts.generateOutputFileName(i + 1),
			}
		}
	}

	// No compaction needed
	return CompactionJob{}
}

// generateOutputFileName generates a unique filename for the output SSTable
func (sts *SizeTieredStrategy) generateOutputFileName(level int) string {
	sequence := int(time.Now().UnixNano() % 1000000) // Simple sequence generation
	return sstable.GenerateSSTableFileName(level, sequence)
}
