package memtable

import (
	"fmt"
	"testing"
	"time"
)

func TestMemTable_BasicOperations(t *testing.T) {
	mt := NewMemTable()

	// Test Put and Get
	key := "test_key"
	value := []byte("test_value")

	err := mt.Put(key, value)
	if err != nil {
		t.Errorf("Unexpected error during Put: %v", err)
	}

	retrievedValue, found, err := mt.Get(key)
	if err != nil {
		t.Errorf("Unexpected error during Get: %v", err)
	}
	if !found {
		t.Errorf("Expected to find key %s", key)
	}
	if string(retrievedValue) != string(value) {
		t.Errorf("Expected value %s, got %s", string(value), string(retrievedValue))
	}
}

func TestMemTable_SizeTracking(t *testing.T) {
	mt := NewMemTable()

	// Initial size should be 0
	if mt.Size() != 0 {
		t.Errorf("Expected initial size 0, got %d", mt.Size())
	}
	if mt.EntryCount() != 0 {
		t.Errorf("Expected initial entry count 0, got %d", mt.EntryCount())
	}

	// Add a key-value pair
	key := "test_key"
	value := []byte("test_value")
	mt.Put(key, value)

	expectedSize := int64(len(key) + len(value))
	if mt.Size() != expectedSize {
		t.Errorf("Expected size %d, got %d", expectedSize, mt.Size())
	}
	if mt.EntryCount() != 1 {
		t.Errorf("Expected entry count 1, got %d", mt.EntryCount())
	}

	// Update the value
	newValue := []byte("new_test_value")
	mt.Put(key, newValue)

	expectedSize = int64(len(key) + len(newValue))
	if mt.Size() != expectedSize {
		t.Errorf("Expected size %d after update, got %d", expectedSize, mt.Size())
	}
	if mt.EntryCount() != 1 {
		t.Errorf("Expected entry count 1 after update, got %d", mt.EntryCount())
	}
}

func TestMemTable_Delete(t *testing.T) {
	mt := NewMemTable()

	key := "test_key"
	value := []byte("test_value")

	// Insert and then delete
	mt.Put(key, value)
	initialSize := mt.Size()

	deleted, err := mt.Delete(key)
	if err != nil {
		t.Errorf("Unexpected error during Delete: %v", err)
	}
	if !deleted {
		t.Errorf("Expected successful deletion")
	}

	// Size should increase due to delete marker
	if mt.Size() <= initialSize {
		t.Errorf("Expected size to increase after delete (delete marker), got %d", mt.Size())
	}

	// Try to get deleted key
	_, found, err := mt.Get(key)
	if err != nil {
		t.Errorf("Unexpected error during Get: %v", err)
	}
	if found {
		t.Errorf("Expected key to be deleted")
	}

	// Try to delete non-existent key
	deleted, err = mt.Delete("non_existent")
	if err != nil {
		t.Errorf("Unexpected error during Delete: %v", err)
	}
	if deleted {
		t.Errorf("Expected deletion to fail for non-existent key")
	}
}

func TestMemTable_Iterator(t *testing.T) {
	mt := NewMemTable()

	// Insert multiple keys
	keys := []string{"zebra", "apple", "monkey", "banana", "cherry"}
	for i, key := range keys {
		value := []byte(fmt.Sprintf("value_%d", i))
		mt.Put(key, value)
	}

	// Iterate and verify order (should be sorted)
	iter := mt.NewIterator()
	var retrievedKeys []string

	for iter.HasNext() {
		key, _, ok := iter.Next()
		if !ok {
			break
		}
		retrievedKeys = append(retrievedKeys, key)
	}

	// Check if keys are in sorted order
	expectedOrder := []string{"apple", "banana", "cherry", "monkey", "zebra"}
	if len(retrievedKeys) != len(expectedOrder) {
		t.Errorf("Expected %d keys, got %d", len(expectedOrder), len(retrievedKeys))
	}

	for i, key := range retrievedKeys {
		if key != expectedOrder[i] {
			t.Errorf("Expected key %s at position %d, got %s", expectedOrder[i], i, key)
		}
	}
}

func TestMemTable_RangeIterator(t *testing.T) {
	mt := NewMemTable()

	// Insert numeric keys
	for i := 0; i < 10; i++ {
		key := fmt.Sprintf("key_%02d", i)
		value := []byte(fmt.Sprintf("value_%d", i))
		mt.Put(key, value)
	}

	// Test range iteration from key_03 to key_07
	startKey := "key_03"
	endKey := "key_07"
	iter := mt.NewRangeIterator(startKey, endKey)

	var retrievedKeys []string
	for {
		key, _, ok := iter.NextWithinRange(endKey)
		if !ok {
			break
		}
		retrievedKeys = append(retrievedKeys, key)
	}

	expectedKeys := []string{"key_03", "key_04", "key_05", "key_06", "key_07"}
	if len(retrievedKeys) != len(expectedKeys) {
		t.Errorf("Expected %d keys in range, got %d", len(expectedKeys), len(retrievedKeys))
	}

	for i, key := range retrievedKeys {
		if key != expectedKeys[i] {
			t.Errorf("Expected key %s at position %d, got %s", expectedKeys[i], i, key)
		}
	}
}

func TestMemTable_Stats(t *testing.T) {
	mt := NewMemTable()

	// Test initial stats
	stats := mt.GetStats()
	if stats.EntryCount != 0 {
		t.Errorf("Expected initial entry count 0, got %d", stats.EntryCount)
	}
	if stats.SizeBytes != 0 {
		t.Errorf("Expected initial size 0, got %d", stats.SizeBytes)
	}
	if time.Since(stats.CreatedAt) > time.Second {
		t.Errorf("Expected recent creation time")
	}

	// Add some data
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("key_%d", i)
		value := []byte(fmt.Sprintf("value_%d", i))
		mt.Put(key, value)
	}

	stats = mt.GetStats()
	if stats.EntryCount != 5 {
		t.Errorf("Expected entry count 5, got %d", stats.EntryCount)
	}
	if stats.SizeBytes <= 0 {
		t.Errorf("Expected positive size, got %d", stats.SizeBytes)
	}
	if stats.MemoryUsageBytes <= 0 {
		t.Errorf("Expected positive memory usage, got %d", stats.MemoryUsageBytes)
	}
	if stats.Age <= 0 {
		t.Errorf("Expected positive age, got %v", stats.Age)
	}
}

func TestMemTable_CreatedAt(t *testing.T) {
	start := time.Now()
	mt := NewMemTable()
	end := time.Now()

	createdAt := mt.CreatedAt()
	if createdAt.Before(start) || createdAt.After(end) {
		t.Errorf("Expected creation time between %v and %v, got %v", start, end, createdAt)
	}
}

func TestMemTable_IsMutable(t *testing.T) {
	mt := NewMemTable()
	if !mt.IsMutable() {
		t.Errorf("Expected MemTable to be mutable")
	}
}

func TestMemTable_EstimateMemoryUsage(t *testing.T) {
	mt := NewMemTable()

	// Initial memory usage should be minimal
	initialUsage := mt.EstimateMemoryUsage()

	// Add some data
	for i := 0; i < 100; i++ {
		key := fmt.Sprintf("key_%03d", i)
		value := []byte(fmt.Sprintf("value_%d", i))
		mt.Put(key, value)
	}

	finalUsage := mt.EstimateMemoryUsage()
	if finalUsage <= initialUsage {
		t.Errorf("Expected memory usage to increase, initial: %d, final: %d", initialUsage, finalUsage)
	}
}

func TestMemTable_ConcurrentAccess(t *testing.T) {
	mt := NewMemTable()

	// Test basic concurrent safety (this is a simple test)
	done := make(chan bool, 2)

	// Writer goroutine
	go func() {
		for i := 0; i < 100; i++ {
			key := fmt.Sprintf("key_%d", i)
			value := []byte(fmt.Sprintf("value_%d", i))
			mt.Put(key, value)
		}
		done <- true
	}()

	// Reader goroutine
	go func() {
		for i := 0; i < 100; i++ {
			key := fmt.Sprintf("key_%d", i%50)
			mt.Get(key)
		}
		done <- true
	}()

	// Wait for both goroutines
	<-done
	<-done

	// Verify final state
	if mt.EntryCount() != 100 {
		t.Errorf("Expected 100 entries after concurrent access, got %d", mt.EntryCount())
	}
}
