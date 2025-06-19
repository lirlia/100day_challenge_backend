package chord

import (
	"fmt"
	"testing"
)

func TestNewRing(t *testing.T) {
	ring := NewRing()

	if ring == nil {
		t.Fatal("NewRing() returned nil")
	}

	if ring.Size() != 0 {
		t.Errorf("New ring size = %d, expected 0", ring.Size())
	}

	if ring.nodes == nil {
		t.Error("Ring nodes map is nil")
	}
}

func TestRingAddNode(t *testing.T) {
	ring := NewRing()

	// テスト用ノードを作成（異なるNodeIDになるように）
	node1 := NewNode("node1.example.com", 8000)
	node2 := NewNode("node2.example.com", 8001)
	node3 := NewNode("node3.example.com", 8002)

	t.Logf("Node1 ID: %d, Node2 ID: %d, Node3 ID: %d", node1.ID, node2.ID, node3.ID)

	// ノードを追加
	err := ring.AddNode(node1)
	if err != nil {
		t.Errorf("AddNode failed: %v", err)
	}

	if ring.Size() != 1 {
		t.Errorf("Ring size = %d, expected 1", ring.Size())
	}

	// 2つ目のノードを追加
	err = ring.AddNode(node2)
	if err != nil {
		t.Errorf("AddNode failed: %v", err)
	}

	if ring.Size() != 2 {
		t.Errorf("Ring size = %d, expected 2", ring.Size())
	}

	// 3つ目のノードを追加
	err = ring.AddNode(node3)
	if err != nil {
		t.Errorf("AddNode failed: %v", err)
	}

	if ring.Size() != 3 {
		t.Errorf("Ring size = %d, expected 3", ring.Size())
	}
}

func TestRingAddDuplicateNode(t *testing.T) {
	ring := NewRing()

	node1 := NewNode("localhost", 8000)
	node2 := NewNode("localhost", 8000) // 同じアドレス:ポート = 同じNodeID

	// 最初のノードを追加
	err := ring.AddNode(node1)
	if err != nil {
		t.Errorf("AddNode failed: %v", err)
	}

	// 重複ノードを追加（エラーになるべき）
	err = ring.AddNode(node2)
	if err == nil {
		t.Error("AddNode should have failed for duplicate node")
	}

	if ring.Size() != 1 {
		t.Errorf("Ring size = %d, expected 1", ring.Size())
	}
}

func TestRingRemoveNode(t *testing.T) {
	ring := NewRing()

	node1 := NewNode("127.0.0.1", 8000)
	node2 := NewNode("127.0.0.2", 8001)

	// ノードを追加
	ring.AddNode(node1)
	ring.AddNode(node2)

	// ノードを削除
	err := ring.RemoveNode(node1.ID)
	if err != nil {
		t.Errorf("RemoveNode failed: %v", err)
	}

	if ring.Size() != 1 {
		t.Errorf("Ring size = %d, expected 1", ring.Size())
	}

	// 存在しないノードを削除（エラーになるべき）
	err = ring.RemoveNode(node1.ID)
	if err == nil {
		t.Error("RemoveNode should have failed for non-existent node")
	}
}

func TestRingGetNode(t *testing.T) {
	ring := NewRing()

	node1 := NewNode("127.0.0.1", 8000)
	ring.AddNode(node1)

	// 存在するノードを取得
	retrievedNode, exists := ring.GetNode(node1.ID)
	if !exists {
		t.Error("GetNode returned false for existing node")
	}
	if retrievedNode != node1 {
		t.Error("GetNode returned different node")
	}

	// 存在しないノードを取得
	nonExistentID := NodeID(255)
	_, exists = ring.GetNode(nonExistentID)
	if exists {
		t.Error("GetNode returned true for non-existent node")
	}
}

func TestRingGetAllNodes(t *testing.T) {
	ring := NewRing()

	// 空のリング
	nodes := ring.GetAllNodes()
	if len(nodes) != 0 {
		t.Errorf("Empty ring returned %d nodes, expected 0", len(nodes))
	}

	// ノードを追加
	node1 := NewNode("node1.example.com", 8000)
	node2 := NewNode("node2.example.com", 8001)
	node3 := NewNode("node3.example.com", 8002)

	t.Logf("Node1 ID: %d, Node2 ID: %d, Node3 ID: %d", node1.ID, node2.ID, node3.ID)

	ring.AddNode(node1)
	ring.AddNode(node2)
	ring.AddNode(node3)

	nodes = ring.GetAllNodes()
	if len(nodes) != 3 {
		t.Errorf("Ring with 3 nodes returned %d nodes, expected 3", len(nodes))
	}

	// 全ノードが含まれているかチェック
	nodeIDs := make(map[NodeID]bool)
	for _, node := range nodes {
		nodeIDs[node.ID] = true
	}

	if !nodeIDs[node1.ID] || !nodeIDs[node2.ID] || !nodeIDs[node3.ID] {
		t.Error("GetAllNodes did not return all nodes")
	}
}

func TestRingFindSuccessor(t *testing.T) {
	ring := NewRing()

	// 空のリング
	successor := ring.FindSuccessor(NodeID(10))
	if successor != nil {
		t.Error("FindSuccessor should return nil for empty ring")
	}

	// 単一ノード
	node1 := NewNode("node1.example.com", 8000)
	ring.AddNode(node1)

	successor = ring.FindSuccessor(NodeID(10))
	if successor != node1 {
		t.Error("FindSuccessor should return the only node for single-node ring")
	}

	// 複数ノード
	node2 := NewNode("node2.example.com", 8001)
	node3 := NewNode("node3.example.com", 8002)
	ring.AddNode(node2)
	ring.AddNode(node3)

	// 各ノードの実際のIDを取得
	t.Logf("Node1 ID: %d", node1.ID)
	t.Logf("Node2 ID: %d", node2.ID)
	t.Logf("Node3 ID: %d", node3.ID)

	// テスト用のIDで successor を検索
	testID := NodeID(100)
	successor = ring.FindSuccessor(testID)
	if successor == nil {
		t.Error("FindSuccessor returned nil for valid ID")
	}

	t.Logf("FindSuccessor(%d) = Node %d", testID, successor.ID)
}

func TestRingFindPredecessor(t *testing.T) {
	ring := NewRing()

	// 空のリング
	predecessor := ring.FindPredecessor(NodeID(10))
	if predecessor != nil {
		t.Error("FindPredecessor should return nil for empty ring")
	}

	// 単一ノード
	node1 := NewNode("node1.example.com", 8000)
	ring.AddNode(node1)

	predecessor = ring.FindPredecessor(NodeID(10))
	if predecessor != node1 {
		t.Error("FindPredecessor should return the only node for single-node ring")
	}

	// 複数ノード
	node2 := NewNode("node2.example.com", 8001)
	node3 := NewNode("node3.example.com", 8002)
	ring.AddNode(node2)
	ring.AddNode(node3)

	// テスト用のIDで predecessor を検索
	testID := NodeID(100)
	predecessor = ring.FindPredecessor(testID)
	if predecessor == nil {
		t.Error("FindPredecessor returned nil for valid ID")
	}

	t.Logf("FindPredecessor(%d) = Node %d", testID, predecessor.ID)
}

func TestRingGetResponsibleNode(t *testing.T) {
	ring := NewRing()

	// 単一ノード
	node1 := NewNode("node1.example.com", 8000)
	ring.AddNode(node1)

	responsibleNode := ring.GetResponsibleNode("test_key")
	if responsibleNode != node1 {
		t.Error("GetResponsibleNode should return the only node for single-node ring")
	}

	// 複数ノード
	node2 := NewNode("node2.example.com", 8001)
	node3 := NewNode("node3.example.com", 8002)
	ring.AddNode(node2)
	ring.AddNode(node3)

	// 異なるキーで責任ノードを検索
	keys := []string{"key1", "key2", "key3", "user:123", "data:456"}

	for _, key := range keys {
		responsibleNode := ring.GetResponsibleNode(key)
		if responsibleNode == nil {
			t.Errorf("GetResponsibleNode returned nil for key %s", key)
		} else {
			keyID := HashKey(key)
			t.Logf("Key '%s' (ID: %d) -> Node %d", key, keyID, responsibleNode.ID)
		}
	}
}

func TestRingGetRingInfo(t *testing.T) {
	ring := NewRing()

	// 空のリング
	info := ring.GetRingInfo()
	if info == nil {
		t.Fatal("GetRingInfo returned nil")
	}
	if len(info.Nodes) != 0 {
		t.Errorf("Empty ring info has %d nodes, expected 0", len(info.Nodes))
	}
	if info.TotalData != 0 {
		t.Errorf("Empty ring info has %d total data, expected 0", info.TotalData)
	}

	// ノードを追加
	node1 := NewNode("127.0.0.1", 8000)
	node2 := NewNode("127.0.0.2", 8001)
	ring.AddNode(node1)
	ring.AddNode(node2)

	// ノードにデータを追加
	node1.storageMu.Lock()
	node1.storage["key1"] = "value1"
	node1.storage["key2"] = "value2"
	node1.storageMu.Unlock()

	node2.storageMu.Lock()
	node2.storage["key3"] = "value3"
	node2.storageMu.Unlock()

	info = ring.GetRingInfo()
	if len(info.Nodes) != 2 {
		t.Errorf("Ring info has %d nodes, expected 2", len(info.Nodes))
	}
	if info.TotalData != 3 {
		t.Errorf("Ring info has %d total data, expected 3", info.TotalData)
	}
}

func TestRingValidateRing(t *testing.T) {
	ring := NewRing()

	// 空のリング（エラーなし）
	errors := ring.ValidateRing()
	if len(errors) != 0 {
		t.Errorf("Empty ring validation returned %d errors, expected 0", len(errors))
	}

	// 単一ノード（自分自身を指すべき、ただし現在の実装では設定されていない）
	node1 := NewNode("127.0.0.1", 8000)
	ring.AddNode(node1)

	errors = ring.ValidateRing()
	// 現在の実装では successor/predecessor が設定されていないので
	// エラーが発生することが期待される
	t.Logf("Single node validation errors: %d", len(errors))
	for _, err := range errors {
		t.Logf("Validation error: %s", err)
	}
}

func TestRingPrintRing(t *testing.T) {
	ring := NewRing()

	// PrintRing がpanicしないことを確認
	ring.PrintRing() // 空のリング

	// ノードを追加
	node1 := NewNode("127.0.0.1", 8000)
	node2 := NewNode("127.0.0.2", 8001)
	ring.AddNode(node1)
	ring.AddNode(node2)

	ring.PrintRing() // ノードがあるリング
}

// ベンチマークテスト
func BenchmarkRingAddNode(b *testing.B) {
	ring := NewRing()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		node := NewNode(fmt.Sprintf("127.0.0.%d", i%254+1), 8000+i)
		ring.AddNode(node)
	}
}

func BenchmarkRingFindSuccessor(b *testing.B) {
	ring := NewRing()

	// テスト用ノードを追加
	for i := 0; i < 10; i++ {
		node := NewNode(fmt.Sprintf("127.0.0.%d", i+1), 8000+i)
		ring.AddNode(node)
	}

	testID := NodeID(100)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ring.FindSuccessor(testID)
	}
}

func BenchmarkRingGetResponsibleNode(b *testing.B) {
	ring := NewRing()

	// テスト用ノードを追加
	for i := 0; i < 10; i++ {
		node := NewNode(fmt.Sprintf("127.0.0.%d", i+1), 8000+i)
		ring.AddNode(node)
	}

	key := "test_key"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ring.GetResponsibleNode(key)
	}
}
