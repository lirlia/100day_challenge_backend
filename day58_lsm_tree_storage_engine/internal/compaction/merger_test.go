package compaction

import (
	"path/filepath"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/sstable"
)

func TestKWayMerger_Basic(t *testing.T) {
	tmpDir := t.TempDir()

	// Create test SSTables
	sstable1Path := filepath.Join(tmpDir, "test1.sst")
	sstable2Path := filepath.Join(tmpDir, "test2.sst")

	// Write first SSTable
	writer1, err := sstable.NewSSTableWriter(sstable1Path, 0, 3)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer 1: %v", err)
	}

	entries1 := []sstable.SSTableEntry{
		{Key: "a", Value: []byte("value_a"), Timestamp: 1000},
		{Key: "c", Value: []byte("value_c"), Timestamp: 1000},
		{Key: "e", Value: []byte("value_e"), Timestamp: 1000},
	}

	for _, entry := range entries1 {
		if err := writer1.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry: %v", err)
		}
	}
	writer1.Close()

	// Write second SSTable
	writer2, err := sstable.NewSSTableWriter(sstable2Path, 0, 3)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer 2: %v", err)
	}

	entries2 := []sstable.SSTableEntry{
		{Key: "b", Value: []byte("value_b"), Timestamp: 1000},
		{Key: "d", Value: []byte("value_d"), Timestamp: 1000},
		{Key: "f", Value: []byte("value_f"), Timestamp: 1000},
	}

	for _, entry := range entries2 {
		if err := writer2.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry: %v", err)
		}
	}
	writer2.Close()

	// Open readers and create iterators
	reader1, err := sstable.NewSSTableReader(sstable1Path)
	if err != nil {
		t.Fatalf("Failed to open SSTable 1: %v", err)
	}
	defer reader1.Close()

	reader2, err := sstable.NewSSTableReader(sstable2Path)
	if err != nil {
		t.Fatalf("Failed to open SSTable 2: %v", err)
	}
	defer reader2.Close()

	iter1, err := reader1.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator 1: %v", err)
	}
	defer iter1.Close()

	iter2, err := reader2.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator 2: %v", err)
	}
	defer iter2.Close()

	// Create merger
	merger := NewKWayMerger([]*sstable.SSTableIterator{iter1, iter2})

	// Verify merged order
	expectedKeys := []string{"a", "b", "c", "d", "e", "f"}
	var actualKeys []string

	for merger.HasNext() {
		entry, err := merger.Next()
		if err != nil {
			t.Fatalf("Merge error: %v", err)
		}
		actualKeys = append(actualKeys, entry.Key)
	}

	if len(actualKeys) != len(expectedKeys) {
		t.Errorf("Expected %d keys, got %d", len(expectedKeys), len(actualKeys))
	}

	for i, key := range expectedKeys {
		if i >= len(actualKeys) || actualKeys[i] != key {
			t.Errorf("Position %d: expected key %s, got %s", i, key, actualKeys[i])
		}
	}
}

func TestKWayMerger_Deduplication(t *testing.T) {
	tmpDir := t.TempDir()

	// Create test SSTables with overlapping keys
	sstable1Path := filepath.Join(tmpDir, "test1.sst")
	sstable2Path := filepath.Join(tmpDir, "test2.sst")

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
			t.Fatalf("Failed to write entry: %v", err)
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
			t.Fatalf("Failed to write entry: %v", err)
		}
	}
	writer2.Close()

	// Open readers and create iterators
	reader1, err := sstable.NewSSTableReader(sstable1Path)
	if err != nil {
		t.Fatalf("Failed to open SSTable 1: %v", err)
	}
	defer reader1.Close()

	reader2, err := sstable.NewSSTableReader(sstable2Path)
	if err != nil {
		t.Fatalf("Failed to open SSTable 2: %v", err)
	}
	defer reader2.Close()

	iter1, err := reader1.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator 1: %v", err)
	}
	defer iter1.Close()

	iter2, err := reader2.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator 2: %v", err)
	}
	defer iter2.Close()

	// Create merger
	merger := NewKWayMerger([]*sstable.SSTableIterator{iter1, iter2})

	// Collect merged entries
	var mergedEntries []sstable.SSTableEntry
	for merger.HasNext() {
		entry, err := merger.Next()
		if err != nil {
			t.Fatalf("Merge error: %v", err)
		}
		mergedEntries = append(mergedEntries, entry)
	}

	// Verify deduplication: should have 4 unique keys
	expectedEntries := map[string]string{
		"key1": "new_value1", // Should be the newer value
		"key2": "new_value2", // Should be the newer value
		"key3": "value3",     // Only in first SSTable
		"key4": "value4",     // Only in second SSTable
	}

	if len(mergedEntries) != len(expectedEntries) {
		t.Errorf("Expected %d entries, got %d", len(expectedEntries), len(mergedEntries))
	}

	for _, entry := range mergedEntries {
		expectedValue, exists := expectedEntries[entry.Key]
		if !exists {
			t.Errorf("Unexpected key: %s", entry.Key)
			continue
		}
		if string(entry.Value) != expectedValue {
			t.Errorf("Key %s: expected value %s, got %s", entry.Key, expectedValue, string(entry.Value))
		}
	}
}

func TestKWayMerger_EmptyIterators(t *testing.T) {
	tmpDir := t.TempDir()

	// Create an empty SSTable
	sstablePath := filepath.Join(tmpDir, "empty.sst")
	writer, err := sstable.NewSSTableWriter(sstablePath, 0, 0)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}
	writer.Close()

	// Open reader and create iterator
	reader, err := sstable.NewSSTableReader(sstablePath)
	if err != nil {
		t.Fatalf("Failed to open SSTable: %v", err)
	}
	defer reader.Close()

	iter, err := reader.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator: %v", err)
	}
	defer iter.Close()

	// Create merger with empty iterator
	merger := NewKWayMerger([]*sstable.SSTableIterator{iter})

	// Should have no entries
	if merger.HasNext() {
		t.Errorf("Empty merger should not have any entries")
	}
}

func TestKWayMerger_SingleIterator(t *testing.T) {
	tmpDir := t.TempDir()

	// Create test SSTable
	sstablePath := filepath.Join(tmpDir, "single.sst")
	writer, err := sstable.NewSSTableWriter(sstablePath, 0, 3)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	entries := []sstable.SSTableEntry{
		{Key: "key1", Value: []byte("value1"), Timestamp: 1000},
		{Key: "key2", Value: []byte("value2"), Timestamp: 1000},
		{Key: "key3", Value: []byte("value3"), Timestamp: 1000},
	}

	for _, entry := range entries {
		if err := writer.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry: %v", err)
		}
	}
	writer.Close()

	// Open reader and create iterator
	reader, err := sstable.NewSSTableReader(sstablePath)
	if err != nil {
		t.Fatalf("Failed to open SSTable: %v", err)
	}
	defer reader.Close()

	iter, err := reader.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator: %v", err)
	}
	defer iter.Close()

	// Create merger with single iterator
	merger := NewKWayMerger([]*sstable.SSTableIterator{iter})

	// Verify all entries are present
	var actualKeys []string
	for merger.HasNext() {
		entry, err := merger.Next()
		if err != nil {
			t.Fatalf("Merge error: %v", err)
		}
		actualKeys = append(actualKeys, entry.Key)
	}

	expectedKeys := []string{"key1", "key2", "key3"}
	if len(actualKeys) != len(expectedKeys) {
		t.Errorf("Expected %d keys, got %d", len(expectedKeys), len(actualKeys))
	}

	for i, key := range expectedKeys {
		if i >= len(actualKeys) || actualKeys[i] != key {
			t.Errorf("Position %d: expected key %s, got %s", i, key, actualKeys[i])
		}
	}
}
