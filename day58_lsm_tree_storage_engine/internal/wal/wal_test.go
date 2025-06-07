package wal

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestWAL_BasicOperations(t *testing.T) {
	tmpDir := t.TempDir()

	config := WALConfig{
		DirPath:     filepath.Join(tmpDir, "wal"),
		MaxFileSize: 1024, // Small size for testing
	}

	wal, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer wal.Close()

	// Test Put entry
	putEntry := WALEntry{
		Type:  EntryTypePut,
		Key:   "test_key",
		Value: []byte("test_value"),
	}

	err = wal.Append(putEntry)
	if err != nil {
		t.Errorf("Failed to append PUT entry: %v", err)
	}

	// Test Delete entry
	deleteEntry := WALEntry{
		Type: EntryTypeDelete,
		Key:  "test_key",
	}

	err = wal.Append(deleteEntry)
	if err != nil {
		t.Errorf("Failed to append DELETE entry: %v", err)
	}

	// Read all entries
	entries, err := wal.ReadAll()
	if err != nil {
		t.Errorf("Failed to read WAL entries: %v", err)
	}

	if len(entries) != 2 {
		t.Errorf("Expected 2 entries, got %d", len(entries))
	}

	// Verify PUT entry
	if entries[0].Type != EntryTypePut {
		t.Errorf("Expected PUT entry type, got %v", entries[0].Type)
	}
	if entries[0].Key != "test_key" {
		t.Errorf("Expected key 'test_key', got '%s'", entries[0].Key)
	}
	if string(entries[0].Value) != "test_value" {
		t.Errorf("Expected value 'test_value', got '%s'", string(entries[0].Value))
	}

	// Verify DELETE entry
	if entries[1].Type != EntryTypeDelete {
		t.Errorf("Expected DELETE entry type, got %v", entries[1].Type)
	}
	if entries[1].Key != "test_key" {
		t.Errorf("Expected key 'test_key', got '%s'", entries[1].Key)
	}
}

func TestWAL_FileRotation(t *testing.T) {
	tmpDir := t.TempDir()

	config := WALConfig{
		DirPath:     filepath.Join(tmpDir, "wal"),
		MaxFileSize: 100, // Very small size to force rotation
	}

	wal, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer wal.Close()

	// Add multiple entries to trigger file rotation
	for i := 0; i < 10; i++ {
		entry := WALEntry{
			Type:  EntryTypePut,
			Key:   fmt.Sprintf("key_%d", i),
			Value: []byte(fmt.Sprintf("value_%d_with_some_extra_data_to_make_it_longer", i)),
		}

		err = wal.Append(entry)
		if err != nil {
			t.Errorf("Failed to append entry %d: %v", i, err)
		}
	}

	// Check that multiple files were created
	files, err := wal.getWALFiles()
	if err != nil {
		t.Errorf("Failed to get WAL files: %v", err)
	}

	if len(files) < 2 {
		t.Errorf("Expected multiple WAL files due to rotation, got %d", len(files))
	}

	// Read all entries and verify
	entries, err := wal.ReadAll()
	if err != nil {
		t.Errorf("Failed to read WAL entries: %v", err)
	}

	if len(entries) != 10 {
		t.Errorf("Expected 10 entries, got %d", len(entries))
	}

	// Verify entries are in correct order
	for i, entry := range entries {
		expectedKey := fmt.Sprintf("key_%d", i)
		if entry.Key != expectedKey {
			t.Errorf("Expected key '%s', got '%s'", expectedKey, entry.Key)
		}
	}
}

func TestWAL_Recovery(t *testing.T) {
	tmpDir := t.TempDir()
	walDir := filepath.Join(tmpDir, "wal")

	config := WALConfig{
		DirPath:     walDir,
		MaxFileSize: 1024,
	}

	// Create first WAL instance and add entries
	wal1, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create first WAL: %v", err)
	}

	for i := 0; i < 5; i++ {
		entry := WALEntry{
			Type:  EntryTypePut,
			Key:   fmt.Sprintf("key_%d", i),
			Value: []byte(fmt.Sprintf("value_%d", i)),
		}
		wal1.Append(entry)
	}
	wal1.Close()

	// Create second WAL instance (recovery scenario)
	wal2, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create second WAL: %v", err)
	}
	defer wal2.Close()

	// Add more entries
	for i := 5; i < 10; i++ {
		entry := WALEntry{
			Type:  EntryTypePut,
			Key:   fmt.Sprintf("key_%d", i),
			Value: []byte(fmt.Sprintf("value_%d", i)),
		}
		wal2.Append(entry)
	}

	// Read all entries
	entries, err := wal2.ReadAll()
	if err != nil {
		t.Errorf("Failed to read WAL entries: %v", err)
	}

	if len(entries) != 10 {
		t.Errorf("Expected 10 entries after recovery, got %d", len(entries))
	}

	// Verify all entries
	for i, entry := range entries {
		expectedKey := fmt.Sprintf("key_%d", i)
		expectedValue := fmt.Sprintf("value_%d", i)

		if entry.Key != expectedKey {
			t.Errorf("Expected key '%s', got '%s'", expectedKey, entry.Key)
		}
		if string(entry.Value) != expectedValue {
			t.Errorf("Expected value '%s', got '%s'", expectedValue, string(entry.Value))
		}
	}
}

func TestWAL_Truncate(t *testing.T) {
	tmpDir := t.TempDir()

	config := WALConfig{
		DirPath:     filepath.Join(tmpDir, "wal"),
		MaxFileSize: 50, // Small size to create multiple files
	}

	wal, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer wal.Close()

	// Add entries to create multiple files
	for i := 0; i < 20; i++ {
		entry := WALEntry{
			Type:  EntryTypePut,
			Key:   fmt.Sprintf("key_%d", i),
			Value: []byte(fmt.Sprintf("value_%d", i)),
		}
		wal.Append(entry)
	}

	// Get initial file count
	initialFiles, err := wal.getWALFiles()
	if err != nil {
		t.Errorf("Failed to get initial WAL files: %v", err)
	}

	if len(initialFiles) < 2 {
		t.Errorf("Expected multiple WAL files, got %d", len(initialFiles))
	}

	// Truncate files (remove files with index <= 0)
	err = wal.Truncate(0)
	if err != nil {
		t.Errorf("Failed to truncate WAL: %v", err)
	}

	// Get file count after truncation
	remainingFiles, err := wal.getWALFiles()
	if err != nil {
		t.Errorf("Failed to get remaining WAL files: %v", err)
	}

	if len(remainingFiles) >= len(initialFiles) {
		t.Errorf("Expected fewer files after truncation, initial: %d, remaining: %d",
			len(initialFiles), len(remainingFiles))
	}
}

func TestWAL_Stats(t *testing.T) {
	tmpDir := t.TempDir()

	config := WALConfig{
		DirPath:     filepath.Join(tmpDir, "wal"),
		MaxFileSize: 1024,
	}

	wal, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer wal.Close()

	// Initial stats
	stats, err := wal.GetStats()
	if err != nil {
		t.Errorf("Failed to get initial stats: %v", err)
	}

	if stats.FileCount != 1 {
		t.Errorf("Expected 1 initial file, got %d", stats.FileCount)
	}
	if stats.EntryCount != 0 {
		t.Errorf("Expected 0 initial entries, got %d", stats.EntryCount)
	}

	// Add some entries
	for i := 0; i < 5; i++ {
		entry := WALEntry{
			Type:  EntryTypePut,
			Key:   fmt.Sprintf("key_%d", i),
			Value: []byte(fmt.Sprintf("value_%d", i)),
		}
		wal.Append(entry)
	}

	// Check stats after adding entries
	stats, err = wal.GetStats()
	if err != nil {
		t.Errorf("Failed to get stats after adding entries: %v", err)
	}

	if stats.EntryCount != 5 {
		t.Errorf("Expected 5 entries, got %d", stats.EntryCount)
	}
	if stats.TotalSize <= 0 {
		t.Errorf("Expected positive total size, got %d", stats.TotalSize)
	}
	if stats.CurrentFile == "" {
		t.Errorf("Expected current file name, got empty string")
	}
}

func TestWAL_Serialization(t *testing.T) {
	tmpDir := t.TempDir()

	config := WALConfig{
		DirPath:     filepath.Join(tmpDir, "wal"),
		MaxFileSize: 1024,
	}

	wal, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer wal.Close()

	// Test various data types
	testCases := []WALEntry{
		{
			Type:  EntryTypePut,
			Key:   "simple_key",
			Value: []byte("simple_value"),
		},
		{
			Type:  EntryTypePut,
			Key:   "unicode_key_日本語",
			Value: []byte("unicode_value_こんにちは"),
		},
		{
			Type:  EntryTypePut,
			Key:   "empty_value",
			Value: []byte{},
		},
		{
			Type:  EntryTypePut,
			Key:   "binary_data",
			Value: []byte{0x00, 0x01, 0x02, 0x03, 0xFF, 0xFE, 0xFD},
		},
		{
			Type: EntryTypeDelete,
			Key:  "delete_key",
		},
	}

	// Add all test entries
	for _, entry := range testCases {
		err = wal.Append(entry)
		if err != nil {
			t.Errorf("Failed to append entry: %v", err)
		}
	}

	// Read back and verify
	entries, err := wal.ReadAll()
	if err != nil {
		t.Errorf("Failed to read entries: %v", err)
	}

	if len(entries) != len(testCases) {
		t.Errorf("Expected %d entries, got %d", len(testCases), len(entries))
	}

	for i, entry := range entries {
		expected := testCases[i]

		if entry.Type != expected.Type {
			t.Errorf("Entry %d: Expected type %v, got %v", i, expected.Type, entry.Type)
		}
		if entry.Key != expected.Key {
			t.Errorf("Entry %d: Expected key '%s', got '%s'", i, expected.Key, entry.Key)
		}
		if string(entry.Value) != string(expected.Value) {
			t.Errorf("Entry %d: Expected value '%v', got '%v'", i, expected.Value, entry.Value)
		}
		if entry.Timestamp <= 0 {
			t.Errorf("Entry %d: Expected positive timestamp, got %d", i, entry.Timestamp)
		}
	}
}

func TestWAL_ConcurrentWrites(t *testing.T) {
	tmpDir := t.TempDir()

	config := WALConfig{
		DirPath:     filepath.Join(tmpDir, "wal"),
		MaxFileSize: 1024 * 1024, // Large enough to avoid rotation during test
	}

	wal, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create WAL: %v", err)
	}
	defer wal.Close()

	// Test concurrent writes
	numGoroutines := 5
	entriesPerGoroutine := 20
	done := make(chan bool, numGoroutines)

	for g := 0; g < numGoroutines; g++ {
		go func(goroutineID int) {
			for i := 0; i < entriesPerGoroutine; i++ {
				entry := WALEntry{
					Type:  EntryTypePut,
					Key:   fmt.Sprintf("goroutine_%d_key_%d", goroutineID, i),
					Value: []byte(fmt.Sprintf("goroutine_%d_value_%d", goroutineID, i)),
				}

				err := wal.Append(entry)
				if err != nil {
					t.Errorf("Goroutine %d: Failed to append entry %d: %v", goroutineID, i, err)
				}

				// Small delay to increase chance of concurrent access
				time.Sleep(time.Microsecond)
			}
			done <- true
		}(g)
	}

	// Wait for all goroutines to complete
	for i := 0; i < numGoroutines; i++ {
		<-done
	}

	// Verify all entries were written
	entries, err := wal.ReadAll()
	if err != nil {
		t.Errorf("Failed to read entries after concurrent writes: %v", err)
	}

	expectedCount := numGoroutines * entriesPerGoroutine
	if len(entries) != expectedCount {
		t.Errorf("Expected %d entries after concurrent writes, got %d", expectedCount, len(entries))
	}
}

func TestWAL_EmptyDirectory(t *testing.T) {
	tmpDir := t.TempDir()
	walDir := filepath.Join(tmpDir, "empty_wal")

	// Don't create the directory - let WAL create it
	config := WALConfig{
		DirPath:     walDir,
		MaxFileSize: 1024,
	}

	wal, err := NewWAL(config)
	if err != nil {
		t.Fatalf("Failed to create WAL in non-existent directory: %v", err)
	}
	defer wal.Close()

	// Verify directory was created
	if _, err := os.Stat(walDir); os.IsNotExist(err) {
		t.Errorf("WAL directory was not created")
	}

	// Add an entry to verify functionality
	entry := WALEntry{
		Type:  EntryTypePut,
		Key:   "test_key",
		Value: []byte("test_value"),
	}

	err = wal.Append(entry)
	if err != nil {
		t.Errorf("Failed to append entry to new WAL: %v", err)
	}

	// Verify entry can be read back
	entries, err := wal.ReadAll()
	if err != nil {
		t.Errorf("Failed to read entries from new WAL: %v", err)
	}

	if len(entries) != 1 {
		t.Errorf("Expected 1 entry, got %d", len(entries))
	}
}
