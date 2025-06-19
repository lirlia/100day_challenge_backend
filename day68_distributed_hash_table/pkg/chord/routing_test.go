package chord

import (
	"testing"
)

func TestNewChordNode(t *testing.T) {
	address := "test.example.com"
	port := 8000

	cn := NewChordNode(address, port)

	if cn == nil {
		t.Fatal("NewChordNode returned nil")
	}

	if cn.Address != address {
		t.Errorf("ChordNode address = %s, expected %s", cn.Address, address)
	}

	if cn.Port != port {
		t.Errorf("ChordNode port = %d, expected %d", cn.Port, port)
	}

	if cn.fingerTable == nil {
		t.Error("ChordNode finger table is nil")
	}

	if cn.fingerTable.owner != cn.Node {
		t.Error("FingerTable owner is not the ChordNode")
	}
}

func TestChordNodeInitializeFingerTable(t *testing.T) {
	cn := NewChordNode("test.example.com", 8000)

	// フィンガーテーブルを初期化
	cn.InitializeFingerTable()

	// successor と predecessor が自分自身に設定されているかチェック
	if cn.successor != cn.Node {
		t.Errorf("Successor = %v, expected %v", cn.successor, cn.Node)
	}

	if cn.predecessor != cn.Node {
		t.Errorf("Predecessor = %v, expected %v", cn.predecessor, cn.Node)
	}

	// 全てのフィンガーエントリが自分自身に設定されているかチェック
	for i := 0; i < M; i++ {
		entry, err := cn.fingerTable.GetEntry(i)
		if err != nil {
			t.Errorf("GetEntry(%d) failed: %v", i, err)
			continue
		}

		if entry.Node != cn.Node {
			t.Errorf("Finger[%d] node = %v, expected %v", i, entry.Node, cn.Node)
		}
	}
}

func TestChordNodeFindSuccessor(t *testing.T) {
	cn := NewChordNode("test.example.com", 8000)
	cn.InitializeFingerTable()

	t.Logf("ChordNode ID: %d", cn.ID)

	// 単一ノードの場合、全てのIDに対して自分自身がsuccessor
	testIDs := []NodeID{0, 50, 100, 150, 200, 255}

	for _, targetID := range testIDs {
		successor := cn.FindSuccessor(targetID)

		if successor != cn.Node {
			t.Errorf("FindSuccessor(%d) = %v, expected %v", targetID, successor, cn.Node)
		}
	}
}

func TestChordNodeFindPredecessor(t *testing.T) {
	cn := NewChordNode("test.example.com", 8000)
	cn.InitializeFingerTable()

	t.Logf("ChordNode ID: %d", cn.ID)

	// 単一ノードの場合、全てのIDに対して自分自身がpredecessor
	testIDs := []NodeID{0, 50, 100, 150, 200, 255}

	for _, targetID := range testIDs {
		predecessor := cn.FindPredecessor(targetID)

		if predecessor != cn.Node {
			t.Errorf("FindPredecessor(%d) = %v, expected %v", targetID, predecessor, cn.Node)
		}
	}
}

func TestChordNodeUpdateFingerTable(t *testing.T) {
	// リングを作成
	ring := NewRing()

	// ノードを作成してリングに追加
	cn1 := NewChordNode("node1.example.com", 8000)
	cn2 := NewChordNode("node2.example.com", 8001)
	cn3 := NewChordNode("node3.example.com", 8002)

	ring.AddNode(cn1.Node)
	ring.AddNode(cn2.Node)
	ring.AddNode(cn3.Node)

	t.Logf("Node1 ID: %d, Node2 ID: %d, Node3 ID: %d", cn1.ID, cn2.ID, cn3.ID)

	// フィンガーテーブルを更新
	err := cn1.UpdateFingerTable(ring)
	if err != nil {
		t.Errorf("UpdateFingerTable failed: %v", err)
	}

	// 更新後のフィンガーテーブルをチェック
	for i := 0; i < M; i++ {
		entry, err := cn1.fingerTable.GetEntry(i)
		if err != nil {
			t.Errorf("GetEntry(%d) failed: %v", i, err)
			continue
		}

		if entry.Node == nil {
			t.Errorf("Finger[%d] node is nil after update", i)
		}
	}
}

func TestChordNodeJoin(t *testing.T) {
	// 既存のリングを作成
	ring := NewRing()
	existingNode := NewChordNode("existing.example.com", 8000)
	existingNode.InitializeFingerTable()
	ring.AddNode(existingNode.Node)

	// 新しいノードがリングに参加
	newNode := NewChordNode("new.example.com", 8001)

	err := newNode.Join(existingNode, ring)
	if err != nil {
		t.Errorf("Join failed: %v", err)
	}

	// リングにノードが追加されているかチェック
	if ring.Size() != 2 {
		t.Errorf("Ring size = %d, expected 2", ring.Size())
	}

	// successorが設定されているかチェック
	if newNode.successor == nil {
		t.Error("Successor not set after join")
	}
}

func TestChordNodeLeave(t *testing.T) {
	// リングを作成してノードを追加
	ring := NewRing()
	cn := NewChordNode("test.example.com", 8000)
	cn.InitializeFingerTable()
	ring.AddNode(cn.Node)

	// ノードがリングから離脱
	err := cn.Leave(ring)
	if err != nil {
		t.Errorf("Leave failed: %v", err)
	}

	// リングからノードが削除されているかチェック
	if ring.Size() != 0 {
		t.Errorf("Ring size = %d, expected 0", ring.Size())
	}

	// successor と predecessor がクリアされているかチェック
	if cn.successor != nil {
		t.Errorf("Successor = %v, expected nil", cn.successor)
	}

	if cn.predecessor != nil {
		t.Errorf("Predecessor = %v, expected nil", cn.predecessor)
	}

	// フィンガーテーブルがクリアされているかチェック
	for i := 0; i < M; i++ {
		entry, err := cn.fingerTable.GetEntry(i)
		if err != nil {
			t.Errorf("GetEntry(%d) failed: %v", i, err)
			continue
		}

		if entry.Node != nil {
			t.Errorf("Finger[%d] node = %v, expected nil", i, entry.Node)
		}
	}
}

func TestChordNodeValidateNode(t *testing.T) {
	cn := NewChordNode("test.example.com", 8000)
	cn.InitializeFingerTable()

	// 正常な状態でのバリデーション
	errors := cn.ValidateNode()
	if len(errors) != 0 {
		t.Errorf("ValidateNode returned %d errors for valid node: %v", len(errors), errors)
	}

	// フィンガーテーブルを故意に壊してテスト
	cn.fingerTable.entries[0].Start = 999 // 無効な値

	errors = cn.ValidateNode()
	if len(errors) == 0 {
		t.Error("ValidateNode should have detected invalid finger table")
	}
}

func TestChordNodeGetChordInfo(t *testing.T) {
	cn := NewChordNode("test.example.com", 8000)
	cn.InitializeFingerTable()

	info := cn.GetChordInfo()

	// 基本情報のチェック
	if info["node_id"] != cn.ID {
		t.Errorf("Info node_id = %v, expected %d", info["node_id"], cn.ID)
	}

	expectedAddress := "test.example.com:8000"
	if info["address"] != expectedAddress {
		t.Errorf("Info address = %v, expected %s", info["address"], expectedAddress)
	}

	if info["successor"] != cn.ID { // 単一ノードの場合は自分自身
		t.Errorf("Info successor = %v, expected %d", info["successor"], cn.ID)
	}

	if info["predecessor"] != cn.ID { // 単一ノードの場合は自分自身
		t.Errorf("Info predecessor = %v, expected %d", info["predecessor"], cn.ID)
	}

	if info["data_count"] != 0 {
		t.Errorf("Info data_count = %v, expected 0", info["data_count"])
	}

	// フィンガーテーブル情報がある かチェック
	if info["finger_table"] == nil {
		t.Error("Info finger_table is nil")
	}
}

// ベンチマークテスト
func BenchmarkChordNodeFindSuccessor(b *testing.B) {
	cn := NewChordNode("test.example.com", 8000)
	cn.InitializeFingerTable()

	targetID := NodeID(100)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cn.FindSuccessor(targetID)
	}
}

func BenchmarkChordNodeUpdateFingerTable(b *testing.B) {
	ring := NewRing()
	cn := NewChordNode("test.example.com", 8000)

	// テスト用ノードを追加
	for i := 0; i < 10; i++ {
		node := NewChordNode("node"+string(rune(i+48))+".example.com", 8001+i)
		ring.AddNode(node.Node)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cn.UpdateFingerTable(ring)
	}
}

func BenchmarkChordNodeGetChordInfo(b *testing.B) {
	cn := NewChordNode("test.example.com", 8000)
	cn.InitializeFingerTable()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		cn.GetChordInfo()
	}
}
