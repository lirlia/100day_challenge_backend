package chord

import (
	"testing"
)

func TestNewFingerTable(t *testing.T) {
	node := NewNode("test.example.com", 8000)
	ft := NewFingerTable(node)

	if ft == nil {
		t.Fatal("NewFingerTable returned nil")
	}

	if ft.owner != node {
		t.Errorf("FingerTable owner = %v, expected %v", ft.owner, node)
	}

	// 各エントリが正しく初期化されているかチェック
	for i := 0; i < M; i++ {
		entry, err := ft.GetEntry(i)
		if err != nil {
			t.Errorf("GetEntry(%d) failed: %v", i, err)
			continue
		}

		if entry == nil {
			t.Errorf("Entry %d is nil", i)
			continue
		}

		expectedStart := AddPowerOfTwo(node.ID, i)
		if entry.Start != expectedStart {
			t.Errorf("Entry[%d] start = %d, expected %d", i, entry.Start, expectedStart)
		}

		expectedInterval := PowerOfTwo(i)
		if entry.Interval != expectedInterval {
			t.Errorf("Entry[%d] interval = %d, expected %d", i, entry.Interval, expectedInterval)
		}

		if entry.Node != nil {
			t.Errorf("Entry[%d] node should be nil initially, got %v", i, entry.Node)
		}
	}
}

func TestFingerTableUpdateEntry(t *testing.T) {
	owner := NewNode("owner.example.com", 8000)
	ft := NewFingerTable(owner)

	targetNode := NewNode("target.example.com", 8001)

	// 正常なエントリ更新
	err := ft.UpdateEntry(0, targetNode)
	if err != nil {
		t.Errorf("UpdateEntry(0) failed: %v", err)
	}

	// 更新されたエントリを確認
	entry, err := ft.GetEntry(0)
	if err != nil {
		t.Errorf("GetEntry(0) failed after update: %v", err)
	}

	if entry.Node != targetNode {
		t.Errorf("Entry[0] node = %v, expected %v", entry.Node, targetNode)
	}

	// 無効なインデックスでのテスト
	err = ft.UpdateEntry(-1, targetNode)
	if err == nil {
		t.Error("UpdateEntry(-1) should have failed")
	}

	err = ft.UpdateEntry(M, targetNode)
	if err == nil {
		t.Error("UpdateEntry(M) should have failed")
	}
}

func TestFingerTableGetAllEntries(t *testing.T) {
	owner := NewNode("owner.example.com", 8000)
	ft := NewFingerTable(owner)

	entries := ft.GetAllEntries()

	if len(entries) != M {
		t.Errorf("GetAllEntries returned %d entries, expected %d", len(entries), M)
	}

	for i, entry := range entries {
		if entry == nil {
			t.Errorf("Entry[%d] is nil", i)
			continue
		}

		if entry.Node != nil {
			t.Errorf("Entry[%d] node should be nil initially", i)
		}
	}
}

func TestFingerTableFindClosestPrecedingNode(t *testing.T) {
	owner := NewNode("owner.example.com", 8000)
	ft := NewFingerTable(owner)

	// ノードを設定
	node1 := NewNode("node1.example.com", 8001)
	node2 := NewNode("node2.example.com", 8002)
	node3 := NewNode("node3.example.com", 8003)

	ft.UpdateEntry(0, node1)
	ft.UpdateEntry(1, node2)
	ft.UpdateEntry(2, node3)

	t.Logf("Owner ID: %d, Node1 ID: %d, Node2 ID: %d, Node3 ID: %d",
		owner.ID, node1.ID, node2.ID, node3.ID)

	// テスト用のターゲットID
	targetID := NodeID(200)

	// 最も近い先行ノードを見つける
	result := ft.FindClosestPrecedingNode(targetID)

	// 結果をチェック（自分自身または設定されたノードのいずれか）
	if result != owner && result != node1 && result != node2 && result != node3 {
		t.Errorf("FindClosestPrecedingNode returned unexpected node: %v", result)
	}
}

func TestFingerTableIsValid(t *testing.T) {
	owner := NewNode("owner.example.com", 8000)
	ft := NewFingerTable(owner)

	// 正常な状態でのテスト
	errors := ft.IsValid()
	if len(errors) != 0 {
		t.Errorf("IsValid() returned %d errors for valid finger table: %v", len(errors), errors)
	}

	// エントリを故意に壊してテスト
	ft.entries[0].Start = 999 // 無効な値

	errors = ft.IsValid()
	if len(errors) == 0 {
		t.Error("IsValid() should have detected invalid start value")
	}
}

func TestFingerTableGetFingerTableInfo(t *testing.T) {
	owner := NewNode("owner.example.com", 8000)
	ft := NewFingerTable(owner)

	// いくつかのエントリを更新
	node1 := NewNode("node1.example.com", 8001)
	node2 := NewNode("node2.example.com", 8002)

	ft.UpdateEntry(0, node1)
	ft.UpdateEntry(1, node2)

	info := ft.GetFingerTableInfo()

	// 基本情報のチェック
	if info["owner_id"] != owner.ID {
		t.Errorf("Info owner_id = %v, expected %d", info["owner_id"], owner.ID)
	}

	if info["total_entries"] != M {
		t.Errorf("Info total_entries = %v, expected %d", info["total_entries"], M)
	}

	if info["filled_entries"] != 2 {
		t.Errorf("Info filled_entries = %v, expected 2", info["filled_entries"])
	}

	// エントリの詳細情報チェック
	entries, ok := info["entries"].([]map[string]interface{})
	if !ok {
		t.Error("Info entries is not of expected type")
		return
	}

	if len(entries) != M {
		t.Errorf("Info entries length = %d, expected %d", len(entries), M)
	}

	// 最初のエントリ（更新済み）をチェック
	entry0 := entries[0]
	if entry0["node_id"] != node1.ID {
		t.Errorf("Entry[0] node_id = %v, expected %d", entry0["node_id"], node1.ID)
	}

	// 未更新のエントリをチェック
	entry2 := entries[2]
	if entry2["node_id"] != nil {
		t.Errorf("Entry[2] node_id = %v, expected nil", entry2["node_id"])
	}
}

// ベンチマークテスト
func BenchmarkFingerTableFindClosestPrecedingNode(b *testing.B) {
	owner := NewNode("owner.example.com", 8000)
	ft := NewFingerTable(owner)

	// テスト用ノードを設定
	for i := 0; i < M; i++ {
		node := NewNode("node"+string(rune(i+48))+".example.com", 8001+i)
		ft.UpdateEntry(i, node)
	}

	targetID := NodeID(100)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ft.FindClosestPrecedingNode(targetID)
	}
}

func BenchmarkFingerTableUpdateEntry(b *testing.B) {
	owner := NewNode("owner.example.com", 8000)
	ft := NewFingerTable(owner)

	nodes := make([]*Node, M)
	for i := 0; i < M; i++ {
		nodes[i] = NewNode("node"+string(rune(i+48))+".example.com", 8001+i)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		index := i % M
		ft.UpdateEntry(index, nodes[index])
	}
}

func BenchmarkFingerTableGetFingerTableInfo(b *testing.B) {
	owner := NewNode("owner.example.com", 8000)
	ft := NewFingerTable(owner)

	// テスト用ノードを設定
	for i := 0; i < M; i++ {
		node := NewNode("node"+string(rune(i+48))+".example.com", 8001+i)
		ft.UpdateEntry(i, node)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ft.GetFingerTableInfo()
	}
}
