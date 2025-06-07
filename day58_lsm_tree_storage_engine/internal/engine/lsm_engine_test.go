package engine

import (
	"fmt"
	"testing"
	"time"
)

func TestLSMEngine_BasicOperations(t *testing.T) {
	tmpDir := t.TempDir()

	config := DefaultLSMEngineConfig(tmpDir)
	config.CompactionIntervalMs = 0 // Disable background compaction for this test

	engine, err := NewLSMEngine(config)
	if err != nil {
		t.Fatalf("Failed to create LSM engine: %v", err)
	}
	defer engine.Close()

	// Test Put
	testData := map[string][]byte{
		"key1": []byte("value1"),
		"key2": []byte("value2"),
		"key3": []byte("value3"),
	}

	for key, value := range testData {
		if err := engine.Put(key, value); err != nil {
			t.Errorf("Failed to put key %s: %v", key, err)
		}
	}

	// Test Get
	for key, expectedValue := range testData {
		value, found, err := engine.Get(key)
		if err != nil {
			t.Errorf("Error getting key %s: %v", key, err)
		}
		if !found {
			t.Errorf("Key %s not found", key)
		}
		if string(value) != string(expectedValue) {
			t.Errorf("Key %s: expected %s, got %s", key, expectedValue, value)
		}
	}

	// Test Get non-existent key
	_, found, err := engine.Get("nonexistent")
	if err != nil {
		t.Errorf("Error getting non-existent key: %v", err)
	}
	if found {
		t.Errorf("Non-existent key should not be found")
	}

	// Test Delete
	if err := engine.Delete("key2"); err != nil {
		t.Errorf("Failed to delete key2: %v", err)
	}

	// Verify deletion
	_, found, err = engine.Get("key2")
	if err != nil {
		t.Errorf("Error getting deleted key: %v", err)
	}
	if found {
		t.Errorf("Deleted key should not be found")
	}

	// Verify other keys still exist
	_, found, err = engine.Get("key1")
	if err != nil {
		t.Errorf("Error getting key1: %v", err)
	}
	if !found {
		t.Errorf("Key1 should still exist")
	}
}

func TestLSMEngine_MemTableFlush(t *testing.T) {
	tmpDir := t.TempDir()

	config := DefaultLSMEngineConfig(tmpDir)
	config.MemTableMaxSize = 1024   // Small size to force flush
	config.CompactionIntervalMs = 0 // Disable background compaction

	engine, err := NewLSMEngine(config)
	if err != nil {
		t.Fatalf("Failed to create LSM engine: %v", err)
	}
	defer engine.Close()

	// Add enough data to trigger flush
	largeValue := make([]byte, 200)
	for i := range largeValue {
		largeValue[i] = byte('A' + (i % 26))
	}

	for i := 0; i < 10; i++ {
		key := fmt.Sprintf("key%d", i)
		if err := engine.Put(key, largeValue); err != nil {
			t.Errorf("Failed to put %s: %v", key, err)
		}
	}

	// Force a flush
	if err := engine.Flush(); err != nil {
		t.Errorf("Failed to flush: %v", err)
	}

	// Verify all data is still accessible
	for i := 0; i < 10; i++ {
		key := fmt.Sprintf("key%d", i)
		value, found, err := engine.Get(key)
		if err != nil {
			t.Errorf("Error getting %s: %v", key, err)
		}
		if !found {
			t.Errorf("Key %s not found after flush", key)
		}
		if string(value) != string(largeValue) {
			t.Errorf("Value mismatch for %s after flush", key)
		}
	}
}

func TestLSMEngine_WALRecovery(t *testing.T) {
	tmpDir := t.TempDir()

	config := DefaultLSMEngineConfig(tmpDir)
	config.CompactionIntervalMs = 0 // Disable background compaction

	// Create engine and add some data
	engine, err := NewLSMEngine(config)
	if err != nil {
		t.Fatalf("Failed to create LSM engine: %v", err)
	}

	testData := map[string][]byte{
		"recover1": []byte("value1"),
		"recover2": []byte("value2"),
		"recover3": []byte("value3"),
	}

	for key, value := range testData {
		if err := engine.Put(key, value); err != nil {
			t.Errorf("Failed to put key %s: %v", key, err)
		}
	}

	// Delete one key
	if err := engine.Delete("recover2"); err != nil {
		t.Errorf("Failed to delete recover2: %v", err)
	}

	// Close engine without flush
	engine.Close()

	// Create new engine from same directory (should recover from WAL)
	engine2, err := NewLSMEngine(config)
	if err != nil {
		t.Fatalf("Failed to create LSM engine for recovery: %v", err)
	}
	defer engine2.Close()

	// Verify data recovery
	_, found, err := engine2.Get("recover1")
	if err != nil {
		t.Errorf("Error getting recover1: %v", err)
	}
	if !found {
		t.Errorf("recover1 not found after recovery")
	}

	// Verify deleted key is still deleted
	_, found, err = engine2.Get("recover2")
	if err != nil {
		t.Errorf("Error getting deleted recover2: %v", err)
	}
	if found {
		t.Errorf("Deleted key recover2 should not be found after recovery")
	}

	_, found, err = engine2.Get("recover3")
	if err != nil {
		t.Errorf("Error getting recover3: %v", err)
	}
	if !found {
		t.Errorf("recover3 not found after recovery")
	}
}

func TestLSMEngine_MultiLevelRead(t *testing.T) {
	tmpDir := t.TempDir()

	config := DefaultLSMEngineConfig(tmpDir)
	config.MemTableMaxSize = 512    // Small size to force multiple flushes
	config.CompactionIntervalMs = 0 // Disable background compaction

	engine, err := NewLSMEngine(config)
	if err != nil {
		t.Fatalf("Failed to create LSM engine: %v", err)
	}
	defer engine.Close()

	// Add data and flush multiple times to create multiple SSTables
	largeValue := make([]byte, 100)
	for i := range largeValue {
		largeValue[i] = byte('A')
	}

	// First batch
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("batch1_key%d", i)
		if err := engine.Put(key, largeValue); err != nil {
			t.Errorf("Failed to put %s: %v", key, err)
		}
	}
	engine.Flush()

	// Second batch
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("batch2_key%d", i)
		if err := engine.Put(key, largeValue); err != nil {
			t.Errorf("Failed to put %s: %v", key, err)
		}
	}
	engine.Flush()

	// Third batch (stays in MemTable)
	for i := 0; i < 3; i++ {
		key := fmt.Sprintf("batch3_key%d", i)
		if err := engine.Put(key, largeValue); err != nil {
			t.Errorf("Failed to put %s: %v", key, err)
		}
	}

	// Test reading from all levels
	testKeys := []string{
		"batch1_key0", // From first SSTable
		"batch2_key0", // From second SSTable
		"batch3_key0", // From MemTable
	}

	for _, key := range testKeys {
		value, found, err := engine.Get(key)
		if err != nil {
			t.Errorf("Error getting %s: %v", key, err)
		}
		if !found {
			t.Errorf("Key %s not found", key)
		}
		if string(value) != string(largeValue) {
			t.Errorf("Value mismatch for %s", key)
		}
	}
}

func TestLSMEngine_OverwriteAndDelete(t *testing.T) {
	tmpDir := t.TempDir()

	config := DefaultLSMEngineConfig(tmpDir)
	config.CompactionIntervalMs = 0 // Disable background compaction

	engine, err := NewLSMEngine(config)
	if err != nil {
		t.Fatalf("Failed to create LSM engine: %v", err)
	}
	defer engine.Close()

	// Initial value
	if err := engine.Put("test_key", []byte("value1")); err != nil {
		t.Errorf("Failed to put initial value: %v", err)
	}

	// Verify initial value
	value, found, err := engine.Get("test_key")
	if err != nil {
		t.Errorf("Error getting initial value: %v", err)
	}
	if !found || string(value) != "value1" {
		t.Errorf("Initial value incorrect")
	}

	// Overwrite with new value
	if err := engine.Put("test_key", []byte("value2")); err != nil {
		t.Errorf("Failed to overwrite value: %v", err)
	}

	// Verify overwritten value
	value, found, err = engine.Get("test_key")
	if err != nil {
		t.Errorf("Error getting overwritten value: %v", err)
	}
	if !found || string(value) != "value2" {
		t.Errorf("Overwritten value incorrect: got %s", string(value))
	}

	// Delete the key
	if err := engine.Delete("test_key"); err != nil {
		t.Errorf("Failed to delete key: %v", err)
	}

	// Verify deletion
	_, found, err = engine.Get("test_key")
	if err != nil {
		t.Errorf("Error getting deleted key: %v", err)
	}
	if found {
		t.Errorf("Deleted key should not be found")
	}

	// Re-insert the key
	if err := engine.Put("test_key", []byte("value3")); err != nil {
		t.Errorf("Failed to re-insert key: %v", err)
	}

	// Verify re-inserted value
	value, found, err = engine.Get("test_key")
	if err != nil {
		t.Errorf("Error getting re-inserted value: %v", err)
	}
	if !found || string(value) != "value3" {
		t.Errorf("Re-inserted value incorrect")
	}
}

func TestLSMEngine_Stats(t *testing.T) {
	tmpDir := t.TempDir()

	config := DefaultLSMEngineConfig(tmpDir)
	config.CompactionIntervalMs = 0 // Disable background compaction

	engine, err := NewLSMEngine(config)
	if err != nil {
		t.Fatalf("Failed to create LSM engine: %v", err)
	}
	defer engine.Close()

	// Initial stats
	stats := engine.Stats()
	if stats.MemTableEntries != 0 {
		t.Errorf("Initial MemTable entries should be 0, got %d", stats.MemTableEntries)
	}

	// Add some data
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("stats_key%d", i)
		value := []byte(fmt.Sprintf("value%d", i))
		if err := engine.Put(key, value); err != nil {
			t.Errorf("Failed to put %s: %v", key, err)
		}
	}

	// Check stats after puts
	stats = engine.Stats()
	if stats.MemTableEntries != 5 {
		t.Errorf("MemTable entries should be 5, got %d", stats.MemTableEntries)
	}

	// Delete a key
	if err := engine.Delete("stats_key2"); err != nil {
		t.Errorf("Failed to delete key: %v", err)
	}

	// Check stats after delete
	stats = engine.Stats()
	if stats.DeletedKeys != 1 {
		t.Errorf("Deleted keys should be 1, got %d", stats.DeletedKeys)
	}

	// Flush and check SSTable count
	if err := engine.Flush(); err != nil {
		t.Errorf("Failed to flush: %v", err)
	}

	stats = engine.Stats()
	if stats.SSTableCount == 0 {
		t.Errorf("SSTable count should be > 0 after flush")
	}
}

func TestLSMEngine_ConcurrentAccess(t *testing.T) {
	tmpDir := t.TempDir()

	config := DefaultLSMEngineConfig(tmpDir)
	config.CompactionIntervalMs = 0 // Disable background compaction

	engine, err := NewLSMEngine(config)
	if err != nil {
		t.Fatalf("Failed to create LSM engine: %v", err)
	}
	defer engine.Close()

	// Test concurrent writes and reads
	done := make(chan bool, 2)

	// Writer goroutine
	go func() {
		for i := 0; i < 100; i++ {
			key := fmt.Sprintf("concurrent_key%d", i)
			value := []byte(fmt.Sprintf("value%d", i))
			if err := engine.Put(key, value); err != nil {
				t.Errorf("Failed to put %s: %v", key, err)
			}
			time.Sleep(time.Millisecond) // Small delay
		}
		done <- true
	}()

	// Reader goroutine
	go func() {
		for i := 0; i < 50; i++ {
			key := fmt.Sprintf("concurrent_key%d", i*2)
			engine.Get(key) // Ignore errors as key might not exist yet
			time.Sleep(time.Millisecond * 2)
		}
		done <- true
	}()

	// Wait for both goroutines
	<-done
	<-done

	// Verify final state
	for i := 0; i < 100; i++ {
		key := fmt.Sprintf("concurrent_key%d", i)
		expectedValue := fmt.Sprintf("value%d", i)

		value, found, err := engine.Get(key)
		if err != nil {
			t.Errorf("Error getting %s: %v", key, err)
		}
		if !found {
			t.Errorf("Key %s not found", key)
		}
		if string(value) != expectedValue {
			t.Errorf("Key %s: expected %s, got %s", key, expectedValue, string(value))
		}
	}
}
