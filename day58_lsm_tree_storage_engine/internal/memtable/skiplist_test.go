package memtable

import (
	"fmt"
	"strconv"
	"testing"
)

func TestSkipList_BasicOperations(t *testing.T) {
	sl := NewSkipList()

	// Test Put and Get
	key := "test_key"
	value := []byte("test_value")

	sl.Put(key, value)

	retrievedValue, found := sl.Get(key)
	if !found {
		t.Errorf("Expected to find key %s", key)
	}

	if string(retrievedValue) != string(value) {
		t.Errorf("Expected value %s, got %s", string(value), string(retrievedValue))
	}
}

func TestSkipList_Update(t *testing.T) {
	sl := NewSkipList()

	key := "test_key"
	value1 := []byte("value1")
	value2 := []byte("value2")

	// Insert initial value
	sl.Put(key, value1)
	retrievedValue, _ := sl.Get(key)
	if string(retrievedValue) != string(value1) {
		t.Errorf("Expected value %s, got %s", string(value1), string(retrievedValue))
	}

	// Update value
	sl.Put(key, value2)
	retrievedValue, _ = sl.Get(key)
	if string(retrievedValue) != string(value2) {
		t.Errorf("Expected updated value %s, got %s", string(value2), string(retrievedValue))
	}
}

func TestSkipList_Delete(t *testing.T) {
	sl := NewSkipList()

	key := "test_key"
	value := []byte("test_value")

	// Insert and then delete
	sl.Put(key, value)
	deleted := sl.Delete(key)
	if !deleted {
		t.Errorf("Expected successful deletion")
	}

	// Try to get deleted key
	_, found := sl.Get(key)
	if found {
		t.Errorf("Expected key to be deleted")
	}

	// Try to delete non-existent key
	deleted = sl.Delete("non_existent")
	if deleted {
		t.Errorf("Expected deletion to fail for non-existent key")
	}
}

func TestSkipList_MultipleKeys(t *testing.T) {
	sl := NewSkipList()

	// Insert multiple keys
	keys := []string{"apple", "banana", "cherry", "date", "elderberry"}
	for i, key := range keys {
		value := []byte(fmt.Sprintf("value_%d", i))
		sl.Put(key, value)
	}

	// Verify all keys
	for i, key := range keys {
		expectedValue := fmt.Sprintf("value_%d", i)
		retrievedValue, found := sl.Get(key)
		if !found {
			t.Errorf("Expected to find key %s", key)
		}
		if string(retrievedValue) != expectedValue {
			t.Errorf("Expected value %s, got %s", expectedValue, string(retrievedValue))
		}
	}

	// Check size
	size := sl.Size()
	if size != len(keys) {
		t.Errorf("Expected size %d, got %d", len(keys), size)
	}
}

func TestSkipList_Iterator(t *testing.T) {
	sl := NewSkipList()

	// Insert keys in random order
	keys := []string{"zebra", "apple", "monkey", "banana", "cherry"}
	for i, key := range keys {
		value := []byte(fmt.Sprintf("value_%d", i))
		sl.Put(key, value)
	}

	// Iterate and verify order (should be sorted)
	iter := sl.NewIterator()
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

func TestSkipList_RangeIterator(t *testing.T) {
	sl := NewSkipList()

	// Insert numeric keys
	for i := 0; i < 10; i++ {
		key := fmt.Sprintf("key_%02d", i)
		value := []byte(fmt.Sprintf("value_%d", i))
		sl.Put(key, value)
	}

	// Test range iteration from key_03 to key_07
	startKey := "key_03"
	endKey := "key_07"
	iter := sl.NewRangeIterator(startKey, endKey)

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

func TestSkipList_StressTest(t *testing.T) {
	sl := NewSkipList()

	// Insert many keys
	numKeys := 1000
	for i := 0; i < numKeys; i++ {
		key := fmt.Sprintf("key_%06d", i)
		value := []byte(fmt.Sprintf("value_%d", i))
		sl.Put(key, value)
	}

	// Verify all keys exist
	for i := 0; i < numKeys; i++ {
		key := fmt.Sprintf("key_%06d", i)
		expectedValue := fmt.Sprintf("value_%d", i)
		retrievedValue, found := sl.Get(key)
		if !found {
			t.Errorf("Expected to find key %s", key)
		}
		if string(retrievedValue) != expectedValue {
			t.Errorf("Expected value %s, got %s", expectedValue, string(retrievedValue))
		}
	}

	// Delete half the keys
	for i := 0; i < numKeys; i += 2 {
		key := fmt.Sprintf("key_%06d", i)
		deleted := sl.Delete(key)
		if !deleted {
			t.Errorf("Expected successful deletion of key %s", key)
		}
	}

	// Verify deletions
	for i := 0; i < numKeys; i++ {
		key := fmt.Sprintf("key_%06d", i)
		_, found := sl.Get(key)

		if i%2 == 0 {
			// Even keys should be deleted
			if found {
				t.Errorf("Expected key %s to be deleted", key)
			}
		} else {
			// Odd keys should still exist
			if !found {
				t.Errorf("Expected key %s to exist", key)
			}
		}
	}

	// Check final size
	expectedSize := numKeys / 2
	actualSize := sl.Size()
	if actualSize != expectedSize {
		t.Errorf("Expected size %d, got %d", expectedSize, actualSize)
	}
}

func BenchmarkSkipList_Put(b *testing.B) {
	sl := NewSkipList()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		key := strconv.Itoa(i)
		value := []byte(fmt.Sprintf("value_%d", i))
		sl.Put(key, value)
	}
}

func BenchmarkSkipList_Get(b *testing.B) {
	sl := NewSkipList()

	// Prepare data
	numKeys := 10000
	for i := 0; i < numKeys; i++ {
		key := strconv.Itoa(i)
		value := []byte(fmt.Sprintf("value_%d", i))
		sl.Put(key, value)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		key := strconv.Itoa(i % numKeys)
		sl.Get(key)
	}
}
