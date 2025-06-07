package sstable

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestSSTable_WriteAndRead(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "test.sst")

	// Write SSTable
	writer, err := NewSSTableWriter(filePath, 0)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	// Write test entries
	entries := []SSTableEntry{
		{Key: "key1", Value: []byte("value1"), Timestamp: time.Now().UnixNano()},
		{Key: "key2", Value: []byte("value2"), Timestamp: time.Now().UnixNano()},
		{Key: "key3", Value: []byte("value3"), Deleted: true, Timestamp: time.Now().UnixNano()},
		{Key: "key4", Value: []byte("value4"), Timestamp: time.Now().UnixNano()},
	}

	for _, entry := range entries {
		err = writer.WriteEntry(entry)
		if err != nil {
			t.Errorf("Failed to write entry: %v", err)
		}
	}

	err = writer.Close()
	if err != nil {
		t.Errorf("Failed to close writer: %v", err)
	}

	// Read SSTable
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		// Add debug info on failure
		fileInfo, statErr := os.Stat(filePath)
		if statErr == nil {
			t.Logf("DEBUG: File size on disk is %d", fileInfo.Size())
		}
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	// Test Get operations
	value, found, err := reader.Get("key1")
	if err != nil {
		t.Errorf("Failed to get key1: %v", err)
	}
	if !found {
		t.Errorf("Expected to find key1")
	}
	if string(value) != "value1" {
		t.Errorf("Expected value1, got %s", string(value))
	}

	// Test deleted key
	_, found, err = reader.Get("key3")
	if err != nil {
		t.Errorf("Failed to get key3: %v", err)
	}
	if found {
		t.Errorf("Expected key3 to be deleted")
	}

	// Test non-existent key
	_, found, err = reader.Get("nonexistent")
	if err != nil {
		t.Errorf("Failed to get nonexistent key: %v", err)
	}
	if found {
		t.Errorf("Expected nonexistent key to not be found")
	}

	// Test metadata
	metadata := reader.GetMetadata()
	if metadata.Level != 0 {
		t.Errorf("Expected level 0, got %d", metadata.Level)
	}
	if metadata.MinKey != "key1" {
		t.Errorf("Expected min key 'key1', got '%s'", metadata.MinKey)
	}
	if metadata.MaxKey != "key4" {
		t.Errorf("Expected max key 'key4', got '%s'", metadata.MaxKey)
	}
	if metadata.EntryCount != 4 {
		t.Errorf("Expected 4 entries, got %d", metadata.EntryCount)
	}
}

func TestSSTable_Iterator(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "test_iter.sst")

	// Write SSTable
	writer, err := NewSSTableWriter(filePath, 0)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	// Write test entries in sorted order
	entries := []SSTableEntry{
		{Key: "apple", Value: []byte("fruit1"), Timestamp: time.Now().UnixNano()},
		{Key: "banana", Value: []byte("fruit2"), Timestamp: time.Now().UnixNano()},
		{Key: "cherry", Value: []byte("fruit3"), Timestamp: time.Now().UnixNano()},
		{Key: "date", Value: []byte("fruit4"), Deleted: true, Timestamp: time.Now().UnixNano()},
		{Key: "elderberry", Value: []byte("fruit5"), Timestamp: time.Now().UnixNano()},
	}

	for _, entry := range entries {
		writer.WriteEntry(entry)
	}
	writer.Close()

	// Read and iterate
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	iterator, err := reader.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator: %v", err)
	}
	defer iterator.Close()

	var retrievedEntries []SSTableEntry
	for iterator.HasNext() {
		entry, ok := iterator.Next()
		if !ok {
			break
		}
		retrievedEntries = append(retrievedEntries, entry)
	}

	if iterator.Error() != nil {
		t.Errorf("Iterator error: %v", iterator.Error())
	}

	if len(retrievedEntries) != len(entries) {
		t.Errorf("Expected %d entries, got %d", len(entries), len(retrievedEntries))
	}

	// Verify entries are in correct order
	for i, entry := range retrievedEntries {
		expected := entries[i]
		if entry.Key != expected.Key {
			t.Errorf("Entry %d: Expected key '%s', got '%s'", i, expected.Key, entry.Key)
		}
		if string(entry.Value) != string(expected.Value) {
			t.Errorf("Entry %d: Expected value '%s', got '%s'", i, string(expected.Value), string(entry.Value))
		}
		if entry.Deleted != expected.Deleted {
			t.Errorf("Entry %d: Expected deleted %v, got %v", i, expected.Deleted, entry.Deleted)
		}
	}
}

func TestSSTable_LargeDataset(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "test_large.sst")

	// Write SSTable with many entries
	writer, err := NewSSTableWriter(filePath, 1)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	numEntries := 1000
	for i := 0; i < numEntries; i++ {
		entry := SSTableEntry{
			Key:       fmt.Sprintf("key_%06d", i),
			Value:     []byte(fmt.Sprintf("value_%d", i)),
			Timestamp: time.Now().UnixNano(),
		}
		writer.WriteEntry(entry)
	}
	writer.Close()

	// Read and verify
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	// Test random access
	testKeys := []int{0, 100, 500, 999}
	for _, i := range testKeys {
		key := fmt.Sprintf("key_%06d", i)
		expectedValue := fmt.Sprintf("value_%d", i)

		value, found, err := reader.Get(key)
		if err != nil {
			t.Errorf("Failed to get key %s: %v", key, err)
		}
		if !found {
			t.Errorf("Expected to find key %s", key)
		}
		if string(value) != expectedValue {
			t.Errorf("Expected value %s, got %s", expectedValue, string(value))
		}
	}

	// Test metadata
	metadata := reader.GetMetadata()
	if metadata.EntryCount != int64(numEntries) {
		t.Errorf("Expected %d entries, got %d", numEntries, metadata.EntryCount)
	}
	if metadata.Level != 1 {
		t.Errorf("Expected level 1, got %d", metadata.Level)
	}
}

func TestSSTable_EmptyFile(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "test_empty.sst")

	// Write empty SSTable
	writer, err := NewSSTableWriter(filePath, 0)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	err = writer.Close()
	if err != nil {
		t.Errorf("Failed to close empty writer: %v", err)
	}

	// Read empty SSTable
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader for empty file: %v", err)
	}
	defer reader.Close()

	// Test Get on empty file
	_, found, err := reader.Get("any_key")
	if err != nil {
		t.Errorf("Failed to get from empty SSTable: %v", err)
	}
	if found {
		t.Errorf("Expected not to find any key in empty SSTable")
	}

	// Test metadata
	metadata := reader.GetMetadata()
	if metadata.EntryCount != 0 {
		t.Errorf("Expected 0 entries, got %d", metadata.EntryCount)
	}
}

func TestSSTable_KeyRangeFiltering(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "test_range.sst")

	// Write SSTable
	writer, err := NewSSTableWriter(filePath, 0)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	// Write entries with specific key range
	entries := []SSTableEntry{
		{Key: "key_100", Value: []byte("value100"), Timestamp: time.Now().UnixNano()},
		{Key: "key_200", Value: []byte("value200"), Timestamp: time.Now().UnixNano()},
		{Key: "key_300", Value: []byte("value300"), Timestamp: time.Now().UnixNano()},
	}

	for _, entry := range entries {
		writer.WriteEntry(entry)
	}
	writer.Close()

	// Read SSTable
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	// Test keys outside range
	testCases := []struct {
		key      string
		expected bool
	}{
		{"key_050", false}, // Before range
		{"key_100", true},  // In range
		{"key_200", true},  // In range
		{"key_300", true},  // In range
		{"key_400", false}, // After range
	}

	for _, tc := range testCases {
		_, found, err := reader.Get(tc.key)
		if err != nil {
			t.Errorf("Failed to get key %s: %v", tc.key, err)
		}
		if found != tc.expected {
			t.Errorf("Key %s: Expected found=%v, got found=%v", tc.key, tc.expected, found)
		}
	}
}

func TestSSTable_FileNameParsing(t *testing.T) {
	testCases := []struct {
		filename string
		level    int
		sequence int
		valid    bool
	}{
		{"level_0_000001.sst", 0, 1, true},
		{"level_1_000123.sst", 1, 123, true},
		{"level_10_999999.sst", 10, 999999, true},
		{"invalid.sst", 0, 0, false},
		{"level_abc_000001.sst", 0, 0, false},
		{"level_0_abc.sst", 0, 0, false},
	}

	for _, tc := range testCases {
		level, sequence, err := ParseSSTableFileName(tc.filename)

		if tc.valid {
			if err != nil {
				t.Errorf("Expected valid filename %s, got error: %v", tc.filename, err)
			}
			if level != tc.level {
				t.Errorf("Filename %s: Expected level %d, got %d", tc.filename, tc.level, level)
			}
			if sequence != tc.sequence {
				t.Errorf("Filename %s: Expected sequence %d, got %d", tc.filename, tc.sequence, sequence)
			}
		} else {
			if err == nil {
				t.Errorf("Expected invalid filename %s to return error", tc.filename)
			}
		}
	}
}

func TestSSTable_FileNameGeneration(t *testing.T) {
	testCases := []struct {
		level    int
		sequence int
		expected string
	}{
		{0, 1, "level_0_000001.sst"},
		{1, 123, "level_1_000123.sst"},
		{10, 999999, "level_10_999999.sst"},
	}

	for _, tc := range testCases {
		filename := GenerateSSTableFileName(tc.level, tc.sequence)
		if filename != tc.expected {
			t.Errorf("Expected filename %s, got %s", tc.expected, filename)
		}
	}
}

func TestSSTable_GetSSTableFiles(t *testing.T) {
	tmpDir := t.TempDir()

	// Create some SSTable files
	sstFiles := []string{
		"level_0_000001.sst",
		"level_0_000002.sst",
		"level_1_000001.sst",
		"other_file.txt",
	}

	for _, filename := range sstFiles {
		filePath := filepath.Join(tmpDir, filename)
		file, err := os.Create(filePath)
		if err != nil {
			t.Fatalf("Failed to create test file %s: %v", filename, err)
		}
		file.Close()
	}

	// Get SSTable files
	files, err := GetSSTableFiles(tmpDir)
	if err != nil {
		t.Fatalf("Failed to get SSTable files: %v", err)
	}

	// Should only return .sst files
	expectedFiles := []string{
		"level_0_000001.sst",
		"level_0_000002.sst",
		"level_1_000001.sst",
	}

	if len(files) != len(expectedFiles) {
		t.Errorf("Expected %d SSTable files, got %d", len(expectedFiles), len(files))
	}

	for i, file := range files {
		if file != expectedFiles[i] {
			t.Errorf("Expected file %s, got %s", expectedFiles[i], file)
		}
	}
}
