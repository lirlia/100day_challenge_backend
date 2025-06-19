package chord

import (
	"fmt"
	"log"
	"sync"
)

// FingerEntry はフィンガーテーブルの各エントリを表す
type FingerEntry struct {
	Start    NodeID `json:"start"`     // このエントリがカバーする範囲の開始点
	Interval NodeID `json:"interval"`  // カバー範囲のサイズ（2^i）
	Node     *Node  `json:"node"`      // 実際の担当ノード
}

// FingerTable はフィンガーテーブル全体を管理する
type FingerTable struct {
	mu      sync.RWMutex
	entries [M]*FingerEntry `json:"entries"` // M=8 個のエントリ
	owner   *Node           `json:"owner"`   // このテーブルの所有者
}

// NewFingerTable は新しいフィンガーテーブルを作成する
func NewFingerTable(owner *Node) *FingerTable {
	ft := &FingerTable{
		entries: [M]*FingerEntry{},
		owner:   owner,
	}

	// 各エントリの開始点を計算して初期化
	for i := 0; i < M; i++ {
		start := AddPowerOfTwo(owner.ID, i)
		interval := PowerOfTwo(i)

		ft.entries[i] = &FingerEntry{
			Start:    start,
			Interval: interval,
			Node:     nil, // 後で更新
		}
	}

	log.Printf("Created finger table for node %d", owner.ID)
	return ft
}

// UpdateEntry はフィンガーテーブルの特定のエントリを更新する
func (ft *FingerTable) UpdateEntry(index int, node *Node) error {
	ft.mu.Lock()
	defer ft.mu.Unlock()

	if index < 0 || index >= M {
		return fmt.Errorf("invalid finger table index: %d", index)
	}

	if ft.entries[index] == nil {
		return fmt.Errorf("finger table entry %d is nil", index)
	}

	oldNode := ft.entries[index].Node
	ft.entries[index].Node = node

	// ログ出力時のnilチェック
	if oldNode == nil && node != nil {
		log.Printf("Node %d: finger[%d] initialized to node %d",
			ft.owner.ID, index, node.ID)
	} else if oldNode != nil && node != nil {
		log.Printf("Node %d: finger[%d] updated from node %d to node %d",
			ft.owner.ID, index, oldNode.ID, node.ID)
	} else if oldNode != nil && node == nil {
		log.Printf("Node %d: finger[%d] cleared (was node %d)",
			ft.owner.ID, index, oldNode.ID)
	} else {
		log.Printf("Node %d: finger[%d] cleared", ft.owner.ID, index)
	}

	return nil
}

// GetEntry はフィンガーテーブルの特定のエントリを取得する
func (ft *FingerTable) GetEntry(index int) (*FingerEntry, error) {
	ft.mu.RLock()
	defer ft.mu.RUnlock()

	if index < 0 || index >= M {
		return nil, fmt.Errorf("invalid finger table index: %d", index)
	}

	return ft.entries[index], nil
}

// GetAllEntries はフィンガーテーブルの全エントリを取得する
func (ft *FingerTable) GetAllEntries() [M]*FingerEntry {
	ft.mu.RLock()
	defer ft.mu.RUnlock()

	var result [M]*FingerEntry
	copy(result[:], ft.entries[:])
	return result
}

// FindClosestPrecedingNode は指定されたIDに最も近い先行ノードを見つける
// Chord アルゴリズムの核心部分
func (ft *FingerTable) FindClosestPrecedingNode(targetID NodeID) *Node {
	ft.mu.RLock()
	defer ft.mu.RUnlock()

	// フィンガーテーブルを逆順で検索（最も遠いエントリから）
	for i := M - 1; i >= 0; i-- {
		entry := ft.entries[i]
		if entry.Node == nil {
			continue
		}

		// entry.Node.ID が (owner.ID, targetID) の範囲内にある場合
		if BetweenExclusive(entry.Node.ID, ft.owner.ID, targetID) {
			log.Printf("Node %d: closest preceding node for %d is node %d (finger[%d])",
				ft.owner.ID, targetID, entry.Node.ID, i)
			return entry.Node
		}
	}

	// 適切なノードが見つからない場合は自分自身を返す
	log.Printf("Node %d: no closer preceding node found for %d, returning self",
		ft.owner.ID, targetID)
	return ft.owner
}

// IsValid はフィンガーテーブルの整合性をチェックする
func (ft *FingerTable) IsValid() []error {
	ft.mu.RLock()
	defer ft.mu.RUnlock()

	var errors []error

	// 各エントリの妥当性をチェック
	for i, entry := range ft.entries {
		if entry == nil {
			errors = append(errors, fmt.Errorf("finger[%d] is nil", i))
			continue
		}

		// Start値が正しく計算されているかチェック
		expectedStart := AddPowerOfTwo(ft.owner.ID, i)
		if entry.Start != expectedStart {
			errors = append(errors,
				fmt.Errorf("finger[%d] start mismatch: expected %d, got %d",
					i, expectedStart, entry.Start))
		}

		// Interval値が正しいかチェック
		expectedInterval := PowerOfTwo(i)
		if entry.Interval != expectedInterval {
			errors = append(errors,
				fmt.Errorf("finger[%d] interval mismatch: expected %d, got %d",
					i, expectedInterval, entry.Interval))
		}
	}

	return errors
}

// PrintFingerTable はフィンガーテーブルの内容を表示する（デバッグ用）
func (ft *FingerTable) PrintFingerTable() {
	ft.mu.RLock()
	defer ft.mu.RUnlock()

	fmt.Printf("=== Finger Table for Node %d ===\n", ft.owner.ID)
	fmt.Printf("Index | Start | Interval | Node\n")
	fmt.Printf("------|-------|----------|-----\n")

	for i, entry := range ft.entries {
		nodeStr := "nil"
		if entry.Node != nil {
			nodeStr = fmt.Sprintf("%d", entry.Node.ID)
		}

		fmt.Printf("%5d | %5d | %8d | %s\n",
			i, entry.Start, entry.Interval, nodeStr)
	}

	fmt.Printf("================================\n")
}

// GetFingerTableInfo は統計情報を返す
func (ft *FingerTable) GetFingerTableInfo() map[string]interface{} {
	ft.mu.RLock()
	defer ft.mu.RUnlock()

	info := map[string]interface{}{
		"owner_id":     ft.owner.ID,
		"total_entries": M,
		"filled_entries": 0,
		"entries": make([]map[string]interface{}, M),
	}

	filledCount := 0
	for i, entry := range ft.entries {
		entryInfo := map[string]interface{}{
			"index":    i,
			"start":    entry.Start,
			"interval": entry.Interval,
			"node_id":  nil,
		}

		if entry.Node != nil {
			entryInfo["node_id"] = entry.Node.ID
			filledCount++
		}

		info["entries"].([]map[string]interface{})[i] = entryInfo
	}

	info["filled_entries"] = filledCount
	return info
}
