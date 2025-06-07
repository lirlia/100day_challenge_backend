package memtable

import (
	"sync"
	"time"
)

// MemTable represents an in-memory table for the LSM-tree
type MemTable struct {
	skipList  *SkipList
	mutex     sync.RWMutex
	size      int64     // バイト単位でのサイズ
	entries   int64     // エントリ数
	createdAt time.Time // 作成時刻
}

// MemTableInterface defines the interface for MemTable operations
type MemTableInterface interface {
	Put(key string, value []byte) error
	Get(key string) ([]byte, bool, error)
	Delete(key string) (bool, error)
	NewIterator() IteratorInterface
	NewRangeIterator(startKey, endKey string) IteratorInterface
	Size() int64
	EntryCount() int64
	EstimateMemoryUsage() int64
	CreatedAt() time.Time
	IsMutable() bool
}

// IteratorInterface defines the interface for iterators
type IteratorInterface interface {
	HasNext() bool
	Next() (string, []byte, bool)
	NextWithinRange(endKey string) (string, []byte, bool)
}

// NewMemTable creates a new MemTable
func NewMemTable() *MemTable {
	return &MemTable{
		skipList:  NewSkipList(),
		size:      0,
		entries:   0,
		createdAt: time.Now(),
	}
}

// Put inserts a key-value pair into the MemTable
func (mt *MemTable) Put(key string, value []byte) error {
	mt.mutex.Lock()
	defer mt.mutex.Unlock()

	// 既存の値をチェック（サイズ計算のため）
	oldValue, exists := mt.skipList.Get(key)

	mt.skipList.Put(key, value)

	// サイズとエントリ数を更新
	if exists {
		// 既存キーの場合は差分を計算
		mt.size = mt.size - int64(len(oldValue)) + int64(len(value))
	} else {
		// 新規キーの場合
		mt.size += int64(len(key) + len(value))
		mt.entries++
	}

	return nil
}

// Get retrieves a value by key from the MemTable
func (mt *MemTable) Get(key string) ([]byte, bool, error) {
	mt.mutex.RLock()
	defer mt.mutex.RUnlock()

	value, found := mt.skipList.Get(key)
	return value, found, nil
}

// Delete marks a key as deleted in the MemTable
func (mt *MemTable) Delete(key string) (bool, error) {
	mt.mutex.Lock()
	defer mt.mutex.Unlock()

	deleted := mt.skipList.Delete(key)

	// 削除マーカーのサイズを追加（実際の実装では削除マーカーもディスクに書かれる）
	if deleted {
		mt.size += int64(len(key)) // 削除マーカーのオーバーヘッド
	}

	return deleted, nil
}

// NewIterator creates a new iterator for the MemTable
func (mt *MemTable) NewIterator() IteratorInterface {
	mt.mutex.RLock()
	defer mt.mutex.RUnlock()

	return &MemTableIterator{
		iterator: mt.skipList.NewIterator(),
		memTable: mt,
	}
}

// NewRangeIterator creates a new range iterator for the MemTable
func (mt *MemTable) NewRangeIterator(startKey, endKey string) IteratorInterface {
	mt.mutex.RLock()
	defer mt.mutex.RUnlock()

	return &MemTableIterator{
		iterator: mt.skipList.NewRangeIterator(startKey, endKey),
		memTable: mt,
	}
}

// Size returns the estimated size in bytes
func (mt *MemTable) Size() int64 {
	mt.mutex.RLock()
	defer mt.mutex.RUnlock()
	return mt.size
}

// EntryCount returns the number of entries
func (mt *MemTable) EntryCount() int64 {
	mt.mutex.RLock()
	defer mt.mutex.RUnlock()
	return mt.entries
}

// EstimateMemoryUsage returns the estimated memory usage in bytes
func (mt *MemTable) EstimateMemoryUsage() int64 {
	mt.mutex.RLock()
	defer mt.mutex.RUnlock()
	return int64(mt.skipList.EstimateMemoryUsage())
}

// CreatedAt returns the creation time of the MemTable
func (mt *MemTable) CreatedAt() time.Time {
	return mt.createdAt
}

// IsMutable returns true if the MemTable is mutable
func (mt *MemTable) IsMutable() bool {
	return true // In this implementation, MemTable is always mutable
}

// MemTableIterator wraps the skip list iterator with proper locking
type MemTableIterator struct {
	iterator *Iterator
	memTable *MemTable
}

// HasNext checks if there are more elements
func (mti *MemTableIterator) HasNext() bool {
	return mti.iterator.HasNext()
}

// Next moves to the next element
func (mti *MemTableIterator) Next() (string, []byte, bool) {
	return mti.iterator.Next()
}

// NextWithinRange moves to the next element within range
func (mti *MemTableIterator) NextWithinRange(endKey string) (string, []byte, bool) {
	return mti.iterator.NextWithinRange(endKey)
}

// MemTableStats represents statistics for a MemTable
type MemTableStats struct {
	EntryCount       int64
	SizeBytes        int64
	MemoryUsageBytes int64
	CreatedAt        time.Time
	Age              time.Duration
}

// GetStats returns statistics for the MemTable
func (mt *MemTable) GetStats() MemTableStats {
	mt.mutex.RLock()
	defer mt.mutex.RUnlock()

	return MemTableStats{
		EntryCount:       mt.entries,
		SizeBytes:        mt.size,
		MemoryUsageBytes: int64(mt.skipList.EstimateMemoryUsage()),
		CreatedAt:        mt.createdAt,
		Age:              time.Since(mt.createdAt),
	}
}
