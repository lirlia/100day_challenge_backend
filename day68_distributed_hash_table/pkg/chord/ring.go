package chord

import (
	"fmt"
	"log"
	"sync"
	"time"
)

// Ring は Chord DHT のリング構造を管理する
type Ring struct {
	mu    sync.RWMutex
	nodes map[NodeID]*Node // 全ノードの管理
	size  int               // 現在のノード数
}

// NewRing は新しいリングを作成する
func NewRing() *Ring {
	return &Ring{
		nodes: make(map[NodeID]*Node),
		size:  0,
	}
}

// AddNode はリングにノードを追加する
func (r *Ring) AddNode(node *Node) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.nodes[node.ID]; exists {
		return fmt.Errorf("node with ID %d already exists", node.ID)
	}

	r.nodes[node.ID] = node
	r.size++

	log.Printf("Added node %s to ring (size: %d)", node.String(), r.size)
	return nil
}

// RemoveNode はリングからノードを削除する
func (r *Ring) RemoveNode(nodeID NodeID) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	node, exists := r.nodes[nodeID]
	if !exists {
		return fmt.Errorf("node with ID %d not found", nodeID)
	}

	delete(r.nodes, nodeID)
	r.size--

	log.Printf("Removed node %s from ring (size: %d)", node.String(), r.size)
	return nil
}

// GetNode は指定されたIDのノードを取得する
func (r *Ring) GetNode(nodeID NodeID) (*Node, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()

	node, exists := r.nodes[nodeID]
	return node, exists
}

// GetAllNodes は全ノードのリストを返す
func (r *Ring) GetAllNodes() []*Node {
	r.mu.RLock()
	defer r.mu.RUnlock()

	nodes := make([]*Node, 0, r.size)
	for _, node := range r.nodes {
		nodes = append(nodes, node)
	}

	return nodes
}

// Size はリング内のノード数を返す
func (r *Ring) Size() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.size
}

// FindSuccessor は指定されたIDの successor を見つける
func (r *Ring) FindSuccessor(id NodeID) *Node {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.size == 0 {
		return nil
	}

	if r.size == 1 {
		// 単一ノードの場合
		for _, node := range r.nodes {
			return node
		}
	}

	// 最も近い successor を見つける
	var successor *Node
	minDistance := NodeID(HASH_SPACE)

	for _, node := range r.nodes {
		distance := Distance(id, node.ID)
		if distance < minDistance {
			minDistance = distance
			successor = node
		}
	}

	return successor
}

// FindPredecessor は指定されたIDの predecessor を見つける
func (r *Ring) FindPredecessor(id NodeID) *Node {
	r.mu.RLock()
	defer r.mu.RUnlock()

	if r.size == 0 {
		return nil
	}

	if r.size == 1 {
		// 単一ノードの場合
		for _, node := range r.nodes {
			return node
		}
	}

	// 最も近い predecessor を見つける
	var predecessor *Node
	minDistance := NodeID(HASH_SPACE)

	for _, node := range r.nodes {
		distance := Distance(node.ID, id)
		if distance < minDistance {
			minDistance = distance
			predecessor = node
		}
	}

	return predecessor
}

// GetResponsibleNode は指定されたキーに責任を持つノードを返す
func (r *Ring) GetResponsibleNode(key string) *Node {
	keyID := HashKey(key)
	return r.FindSuccessor(keyID)
}

// GetRingInfo はリング全体の情報を返す
func (r *Ring) GetRingInfo() *RingInfo {
	r.mu.RLock()
	defer r.mu.RUnlock()

	nodes := make([]NodeInfo, 0, r.size)
	totalData := 0
	connections := 0

	for _, node := range r.nodes {
		node.storageMu.RLock()
		dataCount := len(node.storage)
		node.storageMu.RUnlock()

		totalData += dataCount
		connections += len(node.connections)

		nodeInfo := NodeInfo{
			ID:        node.ID,
			Address:   node.Address,
			IsAlive:   node.isAlive,
			DataCount: dataCount,
			LastSeen:  time.Now(), // TODO: 実際の最終確認時刻
		}

		// Successor と Predecessor の情報を追加
		node.mu.RLock()
		if node.successor != nil {
			nodeInfo.Successor = node.successor
		}
		if node.predecessor != nil {
			nodeInfo.Predecessor = node.predecessor
		}
		// 基本Nodeにはフィンガーテーブルがないため、空の配列を設定
		nodeInfo.FingerTable = [M]*Node{}
		node.mu.RUnlock()

		nodes = append(nodes, nodeInfo)
	}

	return &RingInfo{
		Nodes:       nodes,
		TotalData:   totalData,
		Connections: connections,
		UpdatedAt:   time.Now(),
	}
}

// UpdateNodeConnections はノードの接続情報を更新する
func (r *Ring) UpdateNodeConnections(nodeID NodeID) {
	r.mu.RLock()
	node, exists := r.nodes[nodeID]
	r.mu.RUnlock()

	if !exists {
		return
	}

	// 他の全ノードとの接続状態を更新
	for _, otherNode := range r.nodes {
		if otherNode.ID != nodeID {
			node.lastSeen[otherNode.ID] = time.Now()
		}
	}
}

// PrintRing はリングの状態をデバッグ出力する
func (r *Ring) PrintRing() {
	r.mu.RLock()
	defer r.mu.RUnlock()

	fmt.Printf("=== Ring Status (Size: %d) ===\n", r.size)

	if r.size == 0 {
		fmt.Println("Empty ring")
		return
	}

	// ノードをID順にソート
	sortedNodes := make([]*Node, 0, r.size)
	for _, node := range r.nodes {
		sortedNodes = append(sortedNodes, node)
	}

	// 簡単なソート（バブルソート）
	for i := 0; i < len(sortedNodes)-1; i++ {
		for j := 0; j < len(sortedNodes)-i-1; j++ {
			if sortedNodes[j].ID > sortedNodes[j+1].ID {
				sortedNodes[j], sortedNodes[j+1] = sortedNodes[j+1], sortedNodes[j]
			}
		}
	}

	for _, node := range sortedNodes {
		node.mu.RLock()
		successorID := "nil"
		predecessorID := "nil"

		if node.successor != nil {
			successorID = fmt.Sprintf("%d", node.successor.ID)
		}
		if node.predecessor != nil {
			predecessorID = fmt.Sprintf("%d", node.predecessor.ID)
		}

		node.storageMu.RLock()
		dataCount := len(node.storage)
		node.storageMu.RUnlock()

		fmt.Printf("Node %d: pred=%s, succ=%s, data=%d\n",
			node.ID, predecessorID, successorID, dataCount)
		node.mu.RUnlock()
	}

	fmt.Println("=========================")
}

// ValidateRing はリングの整合性を検証する
func (r *Ring) ValidateRing() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()

	var errors []string

	if r.size == 0 {
		return errors
	}

	if r.size == 1 {
		// 単一ノードの場合の検証
		for _, node := range r.nodes {
			node.mu.RLock()
			if node.successor != nil && node.successor != node {
				errors = append(errors, fmt.Sprintf("Single node %d should have itself as successor", node.ID))
			}
			if node.predecessor != nil && node.predecessor != node {
				errors = append(errors, fmt.Sprintf("Single node %d should have itself as predecessor", node.ID))
			}
			node.mu.RUnlock()
		}
		return errors
	}

	// 複数ノードの場合の検証
	for _, node := range r.nodes {
		node.mu.RLock()

		// Successor の検証
		if node.successor == nil {
			errors = append(errors, fmt.Sprintf("Node %d has no successor", node.ID))
		} else if node.successor == node {
			errors = append(errors, fmt.Sprintf("Node %d should not be its own successor in multi-node ring", node.ID))
		}

		// Predecessor の検証
		if node.predecessor == nil {
			errors = append(errors, fmt.Sprintf("Node %d has no predecessor", node.ID))
		} else if node.predecessor == node {
			errors = append(errors, fmt.Sprintf("Node %d should not be its own predecessor in multi-node ring", node.ID))
		}

		node.mu.RUnlock()
	}

	return errors
}
