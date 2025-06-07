package memtable

import (
	"math/rand"
	"strings"
	"time"
)

// Skip List の最大レベル数
const MaxLevel = 16

// SkipListNode represents a node in the skip list
type SkipListNode struct {
	Key     string
	Value   []byte
	Deleted bool // 論理削除フラグ
	Forward []*SkipListNode
}

// SkipList represents a skip list data structure
type SkipList struct {
	Header *SkipListNode
	Level  int
	rnd    *rand.Rand
}

// NewSkipList creates a new skip list
func NewSkipList() *SkipList {
	header := &SkipListNode{
		Key:     "",
		Value:   nil,
		Deleted: false,
		Forward: make([]*SkipListNode, MaxLevel),
	}

	return &SkipList{
		Header: header,
		Level:  0,
		rnd:    rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

// randomLevel generates a random level for new nodes
func (sl *SkipList) randomLevel() int {
	level := 0
	for level < MaxLevel-1 && sl.rnd.Float32() < 0.5 {
		level++
	}
	return level
}

// Put inserts or updates a key-value pair in the skip list
func (sl *SkipList) Put(key string, value []byte) {
	// update[i] は level i でのpredecessor node
	update := make([]*SkipListNode, MaxLevel)
	current := sl.Header

	// 各レベルで挿入位置を探す
	for i := sl.Level; i >= 0; i-- {
		for current.Forward[i] != nil && strings.Compare(current.Forward[i].Key, key) < 0 {
			current = current.Forward[i]
		}
		update[i] = current
	}

	current = current.Forward[0]

	// 既存のキーの場合は値を更新
	if current != nil && current.Key == key {
		current.Value = value
		current.Deleted = false // 論理削除をクリア
		return
	}

	// 新しいレベルを生成
	newLevel := sl.randomLevel()

	// 新しいレベルがスキップリストの現在のレベルより高い場合
	if newLevel > sl.Level {
		for i := sl.Level + 1; i <= newLevel; i++ {
			update[i] = sl.Header
		}
		sl.Level = newLevel
	}

	// 新しいノードを作成
	newNode := &SkipListNode{
		Key:     key,
		Value:   value,
		Deleted: false,
		Forward: make([]*SkipListNode, newLevel+1),
	}

	// ポインタを更新
	for i := 0; i <= newLevel; i++ {
		newNode.Forward[i] = update[i].Forward[i]
		update[i].Forward[i] = newNode
	}
}

// Get retrieves a value by key from the skip list
func (sl *SkipList) Get(key string) ([]byte, bool) {
	current := sl.Header

	// 各レベルで検索
	for i := sl.Level; i >= 0; i-- {
		for current.Forward[i] != nil && strings.Compare(current.Forward[i].Key, key) < 0 {
			current = current.Forward[i]
		}
	}

	current = current.Forward[0]

	// キーが見つかったかつ削除されていない場合
	if current != nil && current.Key == key && !current.Deleted {
		return current.Value, true
	}

	return nil, false
}

// Delete marks a key as deleted (logical deletion)
func (sl *SkipList) Delete(key string) bool {
	current := sl.Header

	// 各レベルで検索
	for i := sl.Level; i >= 0; i-- {
		for current.Forward[i] != nil && strings.Compare(current.Forward[i].Key, key) < 0 {
			current = current.Forward[i]
		}
	}

	current = current.Forward[0]

	// キーが見つかった場合は論理削除
	if current != nil && current.Key == key && !current.Deleted {
		current.Deleted = true
		return true
	}

	return false
}

// Iterator represents an iterator for the skip list
type Iterator struct {
	current *SkipListNode
}

// NewIterator creates a new iterator for the skip list
func (sl *SkipList) NewIterator() *Iterator {
	return &Iterator{
		current: sl.Header,
	}
}

// NewRangeIterator creates a new range iterator for the skip list
func (sl *SkipList) NewRangeIterator(startKey, endKey string) *Iterator {
	current := sl.Header

	// startKey 以上の最初のノードを見つける
	for i := sl.Level; i >= 0; i-- {
		for current.Forward[i] != nil && strings.Compare(current.Forward[i].Key, startKey) < 0 {
			current = current.Forward[i]
		}
	}

	return &Iterator{
		current: current,
	}
}

// HasNext checks if there are more elements in the iterator
func (it *Iterator) HasNext() bool {
	next := it.current.Forward[0]
	// 削除されていないノードを探す
	for next != nil && next.Deleted {
		next = next.Forward[0]
	}
	return next != nil
}

// Next moves the iterator to the next element and returns key-value pair
func (it *Iterator) Next() (string, []byte, bool) {
	if !it.HasNext() {
		return "", nil, false
	}

	it.current = it.current.Forward[0]

	// 削除されていないノードを探す
	for it.current != nil && it.current.Deleted {
		it.current = it.current.Forward[0]
	}

	if it.current == nil {
		return "", nil, false
	}

	return it.current.Key, it.current.Value, true
}

// NextWithinRange moves the iterator to the next element within the specified range
func (it *Iterator) NextWithinRange(endKey string) (string, []byte, bool) {
	key, value, ok := it.Next()
	if !ok {
		return "", nil, false
	}

	// 範囲外の場合は終了
	if strings.Compare(key, endKey) > 0 {
		return "", nil, false
	}

	return key, value, true
}

// Size returns the approximate number of active elements in the skip list
func (sl *SkipList) Size() int {
	count := 0
	current := sl.Header.Forward[0]

	for current != nil {
		if !current.Deleted {
			count++
		}
		current = current.Forward[0]
	}

	return count
}

// EstimateMemoryUsage returns the estimated memory usage in bytes
func (sl *SkipList) EstimateMemoryUsage() int {
	memUsage := 0
	current := sl.Header.Forward[0]

	for current != nil {
		// ノード自体のサイズ
		memUsage += len(current.Key) + len(current.Value)
		// ポインタ配列のサイズ（8 bytes per pointer on 64-bit systems）
		memUsage += len(current.Forward) * 8
		// その他のフィールド
		memUsage += 16 // bool + overhead
		current = current.Forward[0]
	}

	return memUsage
}
