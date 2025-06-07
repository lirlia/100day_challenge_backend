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

	// Create SSTable writer
	writer, err := NewSSTableWriter(filePath, 0, 100)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	// Write entries
	entries := []SSTableEntry{
		{Key: "key1", Value: []byte("value1"), Deleted: false, Timestamp: time.Now().UnixNano()},
		{Key: "key2", Value: []byte("value2"), Deleted: false, Timestamp: time.Now().UnixNano()},
		{Key: "key3", Value: []byte("value3"), Deleted: false, Timestamp: time.Now().UnixNano()},
		{Key: "key4", Value: []byte("value4"), Deleted: false, Timestamp: time.Now().UnixNano()},
		{Key: "key5", Value: []byte("value5"), Deleted: false, Timestamp: time.Now().UnixNano()},
	}

	for _, entry := range entries {
		if err := writer.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry: %v", err)
		}
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("Failed to close writer: %v", err)
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

	// Test reading entries
	for _, entry := range entries {
		value, found, err := reader.Get(entry.Key)
		if err != nil {
			t.Errorf("Failed to get key %s: %v", entry.Key, err)
		}
		if !found {
			t.Errorf("Key %s not found", entry.Key)
		}
		if string(value) != string(entry.Value) {
			t.Errorf("Value mismatch for key %s: expected %s, got %s", entry.Key, string(entry.Value), string(value))
		}
	}

	// Test non-existent key
	_, found, err := reader.Get("nonexistent")
	if err != nil {
		t.Errorf("Error getting non-existent key: %v", err)
	}
	if found {
		t.Errorf("Non-existent key was found")
	}
}

func TestSSTable_Iterator(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "test.sst")

	// Write SSTable
	writer, err := NewSSTableWriter(filePath, 0, 100)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	// Write test entries
	entries := []SSTableEntry{
		{Key: "key1", Value: []byte("value1"), Timestamp: time.Now().UnixNano()},
		{Key: "key2", Value: []byte("value2"), Timestamp: time.Now().UnixNano()},
		{Key: "key3", Value: []byte("value3"), Timestamp: time.Now().UnixNano()},
		{Key: "key4", Value: []byte("value4"), Timestamp: time.Now().UnixNano()},
		{Key: "key5", Value: []byte("value5"), Timestamp: time.Now().UnixNano()},
	}

	for _, entry := range entries {
		if err := writer.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry: %v", err)
		}
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("Failed to close writer: %v", err)
	}

	// Read SSTable
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	// Test iterator
	iterator, err := reader.NewIterator()
	if err != nil {
		t.Fatalf("Failed to create iterator: %v", err)
	}
	defer iterator.Close()

	retrievedEntries := make([]SSTableEntry, 0)
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
}

func TestSSTable_LargeDataset(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "large.sst")

	// Write SSTable with many entries
	writer, err := NewSSTableWriter(filePath, 0, 10000)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	numEntries := 10000
	for i := 0; i < numEntries; i++ {
		entry := SSTableEntry{
			Key:       fmt.Sprintf("key%06d", i),
			Value:     []byte(fmt.Sprintf("value%06d", i)),
			Timestamp: time.Now().UnixNano(),
		}
		if err := writer.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry %d: %v", i, err)
		}
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("Failed to close writer: %v", err)
	}

	// Read SSTable
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	// Test random access
	for i := 0; i < 100; i++ {
		key := fmt.Sprintf("key%06d", i*100)
		value, found, err := reader.Get(key)
		if err != nil {
			t.Errorf("Failed to get key %s: %v", key, err)
		}
		if !found {
			t.Errorf("Key %s not found", key)
		}
		expectedValue := fmt.Sprintf("value%06d", i*100)
		if string(value) != expectedValue {
			t.Errorf("Value mismatch for key %s: expected %s, got %s", key, expectedValue, string(value))
		}
	}
}

func TestSSTable_EmptyFile(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "empty.sst")

	// Write empty SSTable
	writer, err := NewSSTableWriter(filePath, 0, 0)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("Failed to close writer: %v", err)
	}

	// Read empty SSTable
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	// Test reading from empty file
	_, found, err := reader.Get("anykey")
	if err != nil {
		t.Errorf("Error getting key from empty file: %v", err)
	}
	if found {
		t.Errorf("Found key in empty file")
	}
}

func TestSSTable_KeyRangeFiltering(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "range.sst")

	// Write SSTable
	writer, err := NewSSTableWriter(filePath, 0, 100)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	// Write entries with specific key range
	entries := []SSTableEntry{
		{Key: "b", Value: []byte("value_b"), Timestamp: time.Now().UnixNano()},
		{Key: "d", Value: []byte("value_d"), Timestamp: time.Now().UnixNano()},
		{Key: "f", Value: []byte("value_f"), Timestamp: time.Now().UnixNano()},
	}

	for _, entry := range entries {
		if err := writer.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry: %v", err)
		}
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("Failed to close writer: %v", err)
	}

	// Read SSTable
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	// Test keys outside range
	_, found, err := reader.Get("a") // Before range
	if err != nil {
		t.Errorf("Error getting key 'a': %v", err)
	}
	if found {
		t.Errorf("Found key 'a' which should be outside range")
	}

	_, found, err = reader.Get("z") // After range
	if err != nil {
		t.Errorf("Error getting key 'z': %v", err)
	}
	if found {
		t.Errorf("Found key 'z' which should be outside range")
	}

	// Test keys within range
	_, found, err = reader.Get("d")
	if err != nil {
		t.Errorf("Error getting key 'd': %v", err)
	}
	if !found {
		t.Errorf("Key 'd' not found")
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

func TestSSTable_BloomFilterEffectiveness(t *testing.T) {
	tmpDir := t.TempDir()
	filePath := filepath.Join(tmpDir, "bloom_test.sst")

	// Write SSTable with known keys
	writer, err := NewSSTableWriter(filePath, 0, 1000)
	if err != nil {
		t.Fatalf("Failed to create SSTable writer: %v", err)
	}

	// Add 1000 keys with a specific pattern
	for i := 0; i < 1000; i++ {
		entry := SSTableEntry{
			Key:       fmt.Sprintf("existing_key_%04d", i),
			Value:     []byte(fmt.Sprintf("value_%d", i)),
			Timestamp: time.Now().UnixNano(),
		}
		if err := writer.WriteEntry(entry); err != nil {
			t.Fatalf("Failed to write entry: %v", err)
		}
	}

	if err := writer.Close(); err != nil {
		t.Fatalf("Failed to close writer: %v", err)
	}

	// Read SSTable
	reader, err := NewSSTableReader(filePath)
	if err != nil {
		t.Fatalf("Failed to create SSTable reader: %v", err)
	}
	defer reader.Close()

	// Test that existing keys are found
	for i := 0; i < 10; i++ {
		key := fmt.Sprintf("existing_key_%04d", i*100)
		_, found, err := reader.Get(key)
		if err != nil {
			t.Errorf("Error getting existing key %s: %v", key, err)
		}
		if !found {
			t.Errorf("Existing key %s not found", key)
		}
	}

	// Test non-existent keys - Bloom filter should filter most of these out
	// We expect some false positives, but the majority should be filtered
	falsePositives := 0
	numTests := 10000
	for i := 0; i < numTests; i++ {
		key := fmt.Sprintf("nonexistent_key_%04d", i)
		_, found, err := reader.Get(key)
		if err != nil {
			t.Errorf("Error getting non-existent key %s: %v", key, err)
		}
		if found {
			falsePositives++
		}
	}

	// Calculate false positive rate
	falsePositiveRate := float64(falsePositives) / float64(numTests)

	// With our Bloom filter settings (0.01 false positive rate), we expect
	// the observed rate to be close to 1%
	if falsePositiveRate > 0.02 { // Allow some tolerance
		t.Errorf("False positive rate too high: %.4f (expected <= 0.02)", falsePositiveRate)
	} else {
		t.Logf("Bloom filter false positive rate: %.4f", falsePositiveRate)
	}
}
