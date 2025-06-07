package compaction

import (
	"container/heap"
	"fmt"
	"strings"

	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/sstable"
)

// MergeEntry represents an entry in the merge process
type MergeEntry struct {
	Entry     sstable.SSTableEntry
	SourceIdx int // Index of the source iterator
}

// MergeHeap implements a min-heap for merge entries
type MergeHeap []MergeEntry

func (h MergeHeap) Len() int { return len(h) }

func (h MergeHeap) Less(i, j int) bool {
	// Compare by key first
	cmp := strings.Compare(h[i].Entry.Key, h[j].Entry.Key)
	if cmp != 0 {
		return cmp < 0
	}
	// If keys are equal, compare by timestamp (newer first)
	return h[i].Entry.Timestamp > h[j].Entry.Timestamp
}

func (h MergeHeap) Swap(i, j int) { h[i], h[j] = h[j], h[i] }

func (h *MergeHeap) Push(x interface{}) {
	*h = append(*h, x.(MergeEntry))
}

func (h *MergeHeap) Pop() interface{} {
	old := *h
	n := len(old)
	item := old[n-1]
	*h = old[0 : n-1]
	return item
}

// KWayMerger performs a k-way merge of multiple SSTable iterators
type KWayMerger struct {
	iterators []*sstable.SSTableIterator
	heap      *MergeHeap
	lastKey   string
}

// NewKWayMerger creates a new k-way merger
func NewKWayMerger(iterators []*sstable.SSTableIterator) *KWayMerger {
	merger := &KWayMerger{
		iterators: iterators,
		heap:      &MergeHeap{},
	}

	// Initialize heap with first entry from each iterator
	for i, iterator := range iterators {
		if iterator.HasNext() {
			entry, ok := iterator.Next()
			if ok {
				heap.Push(merger.heap, MergeEntry{
					Entry:     entry,
					SourceIdx: i,
				})
			}
		}
	}
	heap.Init(merger.heap)

	return merger
}

// HasNext returns true if there are more entries to merge
func (m *KWayMerger) HasNext() bool {
	return m.heap.Len() > 0
}

// Next returns the next merged entry with deduplication
func (m *KWayMerger) Next() (sstable.SSTableEntry, error) {
	if !m.HasNext() {
		return sstable.SSTableEntry{}, fmt.Errorf("no more entries")
	}

	// Get the entry with the smallest key
	mergeEntry := heap.Pop(m.heap).(MergeEntry)
	currentEntry := mergeEntry.Entry
	sourceIdx := mergeEntry.SourceIdx

	// Advance the iterator that provided this entry
	if m.iterators[sourceIdx].HasNext() {
		nextEntry, ok := m.iterators[sourceIdx].Next()
		if ok {
			heap.Push(m.heap, MergeEntry{
				Entry:     nextEntry,
				SourceIdx: sourceIdx,
			})
		}
	}

	// Handle deduplication: if this key is the same as the last one,
	// skip duplicate entries until we find a different key
	for m.HasNext() && currentEntry.Key == m.lastKey {
		// This is a duplicate key, get the next entry
		mergeEntry = heap.Pop(m.heap).(MergeEntry)
		currentEntry = mergeEntry.Entry
		sourceIdx = mergeEntry.SourceIdx

		// Advance the iterator
		if m.iterators[sourceIdx].HasNext() {
			nextEntry, ok := m.iterators[sourceIdx].Next()
			if ok {
				heap.Push(m.heap, MergeEntry{
					Entry:     nextEntry,
					SourceIdx: sourceIdx,
				})
			}
		}
	}

	// Skip all remaining entries with the same key (keep only the newest)
	for m.HasNext() {
		top := (*m.heap)[0]
		if top.Entry.Key != currentEntry.Key {
			break
		}

		// Remove duplicate entry
		mergeEntry = heap.Pop(m.heap).(MergeEntry)
		sourceIdx = mergeEntry.SourceIdx

		// Advance the iterator
		if m.iterators[sourceIdx].HasNext() {
			nextEntry, ok := m.iterators[sourceIdx].Next()
			if ok {
				heap.Push(m.heap, MergeEntry{
					Entry:     nextEntry,
					SourceIdx: sourceIdx,
				})
			}
		}
	}

	m.lastKey = currentEntry.Key
	return currentEntry, nil
}
