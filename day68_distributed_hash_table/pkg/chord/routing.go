package chord

import (
	"fmt"
	"log"
	"sync"
)

// ChordNode は Chord プロトコルの機能を持つノードを表す
type ChordNode struct {
	*Node                    // 基本ノード情報を埋め込み
	fingerTable *FingerTable // フィンガーテーブル
	mu          sync.RWMutex // 並行アクセス制御
}

// NewChordNode は新しい Chord ノードを作成する
func NewChordNode(address string, port int) *ChordNode {
	baseNode := NewNode(address, port)

	cn := &ChordNode{
		Node:        baseNode,
		fingerTable: NewFingerTable(baseNode),
	}

	log.Printf("Created Chord node %d at %s:%d", cn.ID, address, port)
	return cn
}

// FindSuccessor は指定されたIDのsuccessorを見つける
// Chord アルゴリズムの中核的な機能
func (cn *ChordNode) FindSuccessor(targetID NodeID) *Node {
	cn.mu.RLock()
	defer cn.mu.RUnlock()

	log.Printf("Node %d: finding successor for ID %d", cn.ID, targetID)

	// 自分がsuccessorの場合（単一ノードまたは範囲内）
	if cn.successor != nil {
		if BetweenInclusive(targetID, cn.ID, cn.successor.ID) {
			log.Printf("Node %d: successor for %d is %d (direct successor)",
				cn.ID, targetID, cn.successor.ID)
			return cn.successor
		}
	} else {
		// successor が設定されていない場合は自分自身
		log.Printf("Node %d: no successor set, returning self for %d", cn.ID, targetID)
		return cn.Node
	}

	// フィンガーテーブルを使用して最も近い先行ノードを見つける
	precedingNode := cn.fingerTable.FindClosestPrecedingNode(targetID)

	// 自分自身が最も近い場合は、successorに問い合わせる
	if precedingNode == cn.Node {
		if cn.successor != nil {
			log.Printf("Node %d: forwarding successor request for %d to successor %d",
				cn.ID, targetID, cn.successor.ID)
			return cn.successor
		}
		return cn.Node
	}

	// 実際のネットワーク実装では、precedingNode に対してリモート呼び出しを行う
	// ここでは簡易実装として、successorを返す
	log.Printf("Node %d: would forward successor request for %d to node %d",
		cn.ID, targetID, precedingNode.ID)

	return precedingNode
}

// FindPredecessor は指定されたIDのpredecessorを見つける
func (cn *ChordNode) FindPredecessor(targetID NodeID) *Node {
	cn.mu.RLock()
	defer cn.mu.RUnlock()

	log.Printf("Node %d: finding predecessor for ID %d", cn.ID, targetID)

	// 自分がpredecessorの場合
	if cn.predecessor != nil {
		if BetweenInclusive(targetID, cn.predecessor.ID, cn.ID) {
			log.Printf("Node %d: predecessor for %d is %d (direct predecessor)",
				cn.ID, targetID, cn.predecessor.ID)
			return cn.predecessor
		}
	}

	// フィンガーテーブルを使用して検索
	precedingNode := cn.fingerTable.FindClosestPrecedingNode(targetID)

	if precedingNode == cn.Node {
		if cn.predecessor != nil {
			log.Printf("Node %d: forwarding predecessor request for %d to predecessor %d",
				cn.ID, targetID, cn.predecessor.ID)
			return cn.predecessor
		}
		return cn.Node
	}

	log.Printf("Node %d: would forward predecessor request for %d to node %d",
		cn.ID, targetID, precedingNode.ID)

	return precedingNode
}

// UpdateFingerTable はフィンガーテーブルを更新する（外部から呼び出し用）
func (cn *ChordNode) UpdateFingerTable(ring *Ring) error {
	cn.mu.Lock()
	defer cn.mu.Unlock()
	return cn.updateFingerTableUnlocked(ring)
}

// updateFingerTableUnlocked は内部用の非ロック版フィンガーテーブル更新
func (cn *ChordNode) updateFingerTableUnlocked(ring *Ring) error {
	if ring == nil {
		return fmt.Errorf("ring is nil")
	}

	log.Printf("Node %d: updating finger table", cn.ID)

	// 各フィンガーエントリを更新
	for i := 0; i < M; i++ {
		entry, err := cn.fingerTable.GetEntry(i)
		if err != nil {
			return fmt.Errorf("failed to get finger entry %d: %v", i, err)
		}

		// このエントリがカバーすべき範囲の開始点のsuccessorを見つける
		responsibleNode := ring.FindSuccessor(entry.Start)
		if responsibleNode != nil {
			err = cn.fingerTable.UpdateEntry(i, responsibleNode)
			if err != nil {
				log.Printf("Node %d: failed to update finger[%d]: %v", cn.ID, i, err)
			}
		}
	}

	log.Printf("Node %d: finger table update completed", cn.ID)
	return nil
}

// InitializeFingerTable はフィンガーテーブルを初期化する（ノード参加時）
func (cn *ChordNode) InitializeFingerTable() {
	cn.mu.Lock()
	defer cn.mu.Unlock()

	log.Printf("Node %d: initializing finger table", cn.ID)

	// 単一ノードの場合、全てのエントリを自分に設定
	for i := 0; i < M; i++ {
		err := cn.fingerTable.UpdateEntry(i, cn.Node)
		if err != nil {
			log.Printf("Node %d: failed to initialize finger[%d]: %v", cn.ID, i, err)
		}
	}

	// successor と predecessor も自分に設定
	cn.successor = cn.Node
	cn.predecessor = cn.Node

	log.Printf("Node %d: finger table initialization completed (single node)", cn.ID)
}

// Join は既存のリングにノードを参加させる
func (cn *ChordNode) Join(existingNode *ChordNode, ring *Ring) error {
	if existingNode == nil || ring == nil {
		return fmt.Errorf("existingNode or ring is nil")
	}

	log.Printf("Node %d: joining ring via node %d", cn.ID, existingNode.ID)

	// 自分のsuccessorを見つける
	successor := existingNode.FindSuccessor(cn.ID)

	// 短期間のロックで基本情報を更新
	cn.mu.Lock()
	if successor != nil {
		cn.successor = successor
		log.Printf("Node %d: successor set to node %d", cn.ID, successor.ID)
	}
	cn.mu.Unlock()

	// リングに自分を追加（ロック外で実行）
	err := ring.AddNode(cn.Node)
	if err != nil {
		return fmt.Errorf("failed to add node to ring: %v", err)
	}

	// フィンガーテーブルを更新（別途ロックを取得）
	err = cn.UpdateFingerTable(ring)
	if err != nil {
		log.Printf("Node %d: failed to update finger table during join: %v", cn.ID, err)
	}

	log.Printf("Node %d: successfully joined ring", cn.ID)
	return nil
}

// Leave はノードをリングから離脱させる
func (cn *ChordNode) Leave(ring *Ring) error {
	if ring == nil {
		return fmt.Errorf("ring is nil")
	}

	cn.mu.Lock()
	defer cn.mu.Unlock()

	log.Printf("Node %d: leaving ring", cn.ID)

	// リングから削除
	err := ring.RemoveNode(cn.ID)
	if err != nil {
		return fmt.Errorf("failed to remove node from ring: %v", err)
	}

	// フィンガーテーブルをクリア
	for i := 0; i < M; i++ {
		err := cn.fingerTable.UpdateEntry(i, nil)
		if err != nil {
			log.Printf("Node %d: failed to clear finger[%d]: %v", cn.ID, i, err)
		}
	}

	// successor と predecessor をクリア
	cn.successor = nil
	cn.predecessor = nil

	log.Printf("Node %d: successfully left ring", cn.ID)
	return nil
}

// GetFingerTable はフィンガーテーブルを返す（デバッグ用）
func (cn *ChordNode) GetFingerTable() *FingerTable {
	cn.mu.RLock()
	defer cn.mu.RUnlock()
	return cn.fingerTable
}

// PrintStatus はノードの状態を表示する（デバッグ用）
func (cn *ChordNode) PrintStatus() {
	cn.mu.RLock()
	defer cn.mu.RUnlock()

	fmt.Printf("=== Chord Node %d Status ===\n", cn.ID)
	fmt.Printf("Address: %s:%d\n", cn.Address, cn.Port)

	if cn.successor != nil {
		fmt.Printf("Successor: Node %d\n", cn.successor.ID)
	} else {
		fmt.Printf("Successor: nil\n")
	}

	if cn.predecessor != nil {
		fmt.Printf("Predecessor: Node %d\n", cn.predecessor.ID)
	} else {
		fmt.Printf("Predecessor: nil\n")
	}

	fmt.Printf("Data stored: %d items\n", len(cn.storage))
	fmt.Printf("=============================\n")

	// フィンガーテーブルも表示
	cn.fingerTable.PrintFingerTable()
}

// ValidateNode はノードの整合性をチェックする
func (cn *ChordNode) ValidateNode() []error {
	cn.mu.RLock()
	defer cn.mu.RUnlock()

	var errors []error

	// フィンガーテーブルの妥当性チェック
	ftErrors := cn.fingerTable.IsValid()
	errors = append(errors, ftErrors...)

	// successor/predecessorの妥当性チェック
	if cn.successor == nil && cn.predecessor == nil {
		// 単一ノードの場合はOK
	} else if cn.successor == nil || cn.predecessor == nil {
		errors = append(errors, fmt.Errorf("successor or predecessor is nil but not both"))
	}

	return errors
}

// GetChordInfo は Chord ノードの統計情報を返す
func (cn *ChordNode) GetChordInfo() map[string]interface{} {
	cn.mu.RLock()
	defer cn.mu.RUnlock()

	info := map[string]interface{}{
		"node_id":    cn.ID,
		"address":    fmt.Sprintf("%s:%d", cn.Address, cn.Port),
		"successor":  nil,
		"predecessor": nil,
		"data_count": len(cn.storage),
		"finger_table": cn.fingerTable.GetFingerTableInfo(),
	}

	if cn.successor != nil {
		info["successor"] = cn.successor.ID
	}

	if cn.predecessor != nil {
		info["predecessor"] = cn.predecessor.ID
	}

	return info
}
