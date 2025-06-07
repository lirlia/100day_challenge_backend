package compaction

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/sstable"
)

func TestCompactionEngine_Basic(t *testing.T) {
	tmpDir := t.TempDir()

	// Create test SSTables
	sstable1Path := filepath.Join(tmpDir, "level_0_000001.sst")
	sstable2Path := filepath.Join(tmpDir, "level_0_000002.sst")
	outputPath := filepath.Join(tmpDir, "level_1_000001.sst")

	// Write first SSTable
	writer1, err := sstable.NewSSTableWriter(sstable1Path, 0, 3)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer 1: %v", err)
	}

	entries1 := []sstable.SSTableEntry{
		{Key: "key1", Value: []byte("value1"), Timestamp: 1000},
		{Key: "key3", Value: []byte("value3"), Timestamp: 1000},
		{Key: "key5", Value: []byte("value5"), Timestamp: 1000},
	}

	for _, entry := range entries1 {
		if err := writer1.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry to SSTable 1: %v", err)
		}
	}
	writer1.Close()

	// Write second SSTable
	writer2, err := sstable.NewSSTableWriter(sstable2Path, 0, 3)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer 2: %v", err)
	}

	entries2 := []sstable.SSTableEntry{
		{Key: "key2", Value: []byte("value2"), Timestamp: 1000},
		{Key: "key4", Value: []byte("value4"), Timestamp: 1000},
		{Key: "key6", Value: []byte("value6"), Timestamp: 1000},
	}

	for _, entry := range entries2 {
		if err := writer2.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry to SSTable 2: %v", err)
		}
	}
	writer2.Close()

	// Create compaction engine
	strategy := NewSizeTieredStrategy()
	engine := NewCompactionEngine(tmpDir, strategy)

	// Execute manual compaction
	job := CompactionJob{
		SourceLevel:   0,
		TargetLevel:   1,
		InputSSTables: []string{sstable1Path, sstable2Path},
		OutputSSTable: outputPath,
	}

	err = engine.executeCompaction(job)
	if err != nil {
		t.Fatalf("Compaction failed: %v", err)
	}

	// Verify output SSTable
	reader, err := sstable.NewSSTableReader(outputPath)
	if err != nil {
		t.Fatalf("Failed to open output SSTable: %v", err)
	}
	defer reader.Close()

	// Check that all keys are present and in order
	expectedKeys := []string{"key1", "key2", "key3", "key4", "key5", "key6"}
	iterator, err := reader.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator: %v", err)
	}
	defer iterator.Close()

	i := 0
	for iterator.HasNext() {
		entry, ok := iterator.Next()
		if !ok {
			break
		}

		if i >= len(expectedKeys) {
			t.Errorf("More entries than expected")
			break
		}

		if entry.Key != expectedKeys[i] {
			t.Errorf("Entry %d: expected key %s, got %s", i, expectedKeys[i], entry.Key)
		}
		i++
	}

	if i != len(expectedKeys) {
		t.Errorf("Expected %d entries, got %d", len(expectedKeys), i)
	}

	// Verify input files were removed
	if _, err := os.Stat(sstable1Path); !os.IsNotExist(err) {
		t.Errorf("Input SSTable 1 was not removed")
	}
	if _, err := os.Stat(sstable2Path); !os.IsNotExist(err) {
		t.Errorf("Input SSTable 2 was not removed")
	}
}

func TestCompactionEngine_Deduplication(t *testing.T) {
	tmpDir := t.TempDir()

	// Create test SSTables with overlapping keys
	sstable1Path := filepath.Join(tmpDir, "level_0_000001.sst")
	sstable2Path := filepath.Join(tmpDir, "level_0_000002.sst")
	outputPath := filepath.Join(tmpDir, "level_1_000001.sst")

	// Write first SSTable with older timestamps
	writer1, err := sstable.NewSSTableWriter(sstable1Path, 0, 3)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer 1: %v", err)
	}

	entries1 := []sstable.SSTableEntry{
		{Key: "key1", Value: []byte("old_value1"), Timestamp: 1000},
		{Key: "key2", Value: []byte("old_value2"), Timestamp: 1000},
		{Key: "key3", Value: []byte("value3"), Timestamp: 1000},
	}

	for _, entry := range entries1 {
		if err := writer1.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry to SSTable 1: %v", err)
		}
	}
	writer1.Close()

	// Write second SSTable with newer timestamps for overlapping keys
	writer2, err := sstable.NewSSTableWriter(sstable2Path, 0, 3)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer 2: %v", err)
	}

	entries2 := []sstable.SSTableEntry{
		{Key: "key1", Value: []byte("new_value1"), Timestamp: 2000}, // Newer
		{Key: "key2", Value: []byte("new_value2"), Timestamp: 2000}, // Newer
		{Key: "key4", Value: []byte("value4"), Timestamp: 2000},
	}

	for _, entry := range entries2 {
		if err := writer2.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry to SSTable 2: %v", err)
		}
	}
	writer2.Close()

	// Create compaction engine
	strategy := NewSizeTieredStrategy()
	engine := NewCompactionEngine(tmpDir, strategy)

	// Execute compaction
	job := CompactionJob{
		SourceLevel:   0,
		TargetLevel:   1,
		InputSSTables: []string{sstable1Path, sstable2Path},
		OutputSSTable: outputPath,
	}

	err = engine.executeCompaction(job)
	if err != nil {
		t.Fatalf("Compaction failed: %v", err)
	}

	// Verify output SSTable contains only the newer values
	reader, err := sstable.NewSSTableReader(outputPath)
	if err != nil {
		t.Fatalf("Failed to open output SSTable: %v", err)
	}
	defer reader.Close()

	// Test specific keys
	testCases := []struct {
		key           string
		expectedValue string
	}{
		{"key1", "new_value1"}, // Should be the newer value
		{"key2", "new_value2"}, // Should be the newer value
		{"key3", "value3"},     // Only exists in first SSTable
		{"key4", "value4"},     // Only exists in second SSTable
	}

	for _, tc := range testCases {
		value, found, err := reader.Get(tc.key)
		if err != nil {
			t.Errorf("Error getting key %s: %v", tc.key, err)
		}
		if !found {
			t.Errorf("Key %s not found", tc.key)
		}
		if string(value) != tc.expectedValue {
			t.Errorf("Key %s: expected value %s, got %s", tc.key, tc.expectedValue, string(value))
		}
	}
}

func TestCompactionEngine_DeletedEntries(t *testing.T) {
	tmpDir := t.TempDir()

	// Create test SSTable with deleted entries
	sstable1Path := filepath.Join(tmpDir, "level_0_000001.sst")
	outputPath := filepath.Join(tmpDir, "level_1_000001.sst")

	// Write SSTable with some deleted entries
	writer, err := sstable.NewSSTableWriter(sstable1Path, 0, 4)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	entries := []sstable.SSTableEntry{
		{Key: "key1", Value: []byte("value1"), Deleted: false, Timestamp: 1000},
		{Key: "key2", Value: []byte("value2"), Deleted: true, Timestamp: 1000}, // Deleted
		{Key: "key3", Value: []byte("value3"), Deleted: false, Timestamp: 1000},
		{Key: "key4", Value: []byte("value4"), Deleted: true, Timestamp: 1000}, // Deleted
	}

	for _, entry := range entries {
		if err := writer.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry: %v", err)
		}
	}
	writer.Close()

	// Create compaction engine
	strategy := NewSizeTieredStrategy()
	engine := NewCompactionEngine(tmpDir, strategy)

	// Execute compaction
	job := CompactionJob{
		SourceLevel:   0,
		TargetLevel:   1,
		InputSSTables: []string{sstable1Path},
		OutputSSTable: outputPath,
	}

	err = engine.executeCompaction(job)
	if err != nil {
		t.Fatalf("Compaction failed: %v", err)
	}

	// Verify output SSTable only contains non-deleted entries
	reader, err := sstable.NewSSTableReader(outputPath)
	if err != nil {
		t.Fatalf("Failed to open output SSTable: %v", err)
	}
	defer reader.Close()

	// Only key1 and key3 should be present
	_, found, err := reader.Get("key1")
	if err != nil {
		t.Errorf("Error getting key1: %v", err)
	}
	if !found {
		t.Errorf("key1 should be present")
	}

	_, found, err = reader.Get("key3")
	if err != nil {
		t.Errorf("Error getting key3: %v", err)
	}
	if !found {
		t.Errorf("key3 should be present")
	}

	// key2 and key4 should not be present (physically deleted)
	_, found, err = reader.Get("key2")
	if err != nil {
		t.Errorf("Error getting key2: %v", err)
	}
	if found {
		t.Errorf("key2 should have been physically deleted")
	}

	_, found, err = reader.Get("key4")
	if err != nil {
		t.Errorf("Error getting key4: %v", err)
	}
	if found {
		t.Errorf("key4 should have been physically deleted")
	}
}

func TestSizeTieredStrategy(t *testing.T) {
	strategy := NewSizeTieredStrategy()

	// Test case 1: Level 0 with too many files
	levels := []LevelInfo{
		{Level: 0, SSTables: []string{"file1", "file2", "file3", "file4"}, Size: 1000},
		{Level: 1, SSTables: []string{}, Size: 0},
	}

	if !strategy.ShouldCompact(levels) {
		t.Errorf("Should trigger compaction when Level 0 has %d files", len(levels[0].SSTables))
	}

	job := strategy.SelectSSTables(levels)
	if job.SourceLevel != 0 || job.TargetLevel != 1 {
		t.Errorf("Expected compaction from level 0 to 1, got %d to %d", job.SourceLevel, job.TargetLevel)
	}

	// Test case 2: No compaction needed
	levels = []LevelInfo{
		{Level: 0, SSTables: []string{"file1"}, Size: 1000},
		{Level: 1, SSTables: []string{"file2"}, Size: 1000},
	}

	if strategy.ShouldCompact(levels) {
		t.Errorf("Should not trigger compaction when levels are within limits")
	}
}
