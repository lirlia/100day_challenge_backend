package tests

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/lirlia/100day_challenge_backend/day68_distributed_hash_table/pkg/chord"
)

// MockAPIServer は統合テスト用のモックAPIサーバー
type MockAPIServer struct {
	Ring   *chord.Ring
	Nodes  map[string]*chord.ChordNode
	server *httptest.Server
}

// NewMockAPIServer は新しいモックAPIサーバーを作成
func NewMockAPIServer() *MockAPIServer {
	mock := &MockAPIServer{
		Ring:  chord.NewRing(),
		Nodes: make(map[string]*chord.ChordNode),
	}

	mux := http.NewServeMux()

	// ノード管理API
	mux.HandleFunc("/api/chord", mock.handleChordAPI)
	mux.HandleFunc("/api/chord/data", mock.handleDataAPI)

	mock.server = httptest.NewServer(mux)
	return mock
}

// Close はモックサーバーを終了
func (m *MockAPIServer) Close() {
	m.server.Close()
}

// URL はモックサーバーのベースURLを返す
func (m *MockAPIServer) URL() string {
	return m.server.URL
}

// ノード管理APIのハンドラー
func (m *MockAPIServer) handleChordAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		// リング状態の取得
		ringInfo := m.Ring.GetRingInfo()
		nodes := make([]map[string]interface{}, 0, ringInfo.Size)

		for _, node := range m.Ring.GetAllNodes() {
			nodeData := map[string]interface{}{
				"id":      node.ID.String(),
				"address": node.Addr,
				"dataCount": m.getNodeDataCount(node.ID.String()),
			}

			// フィンガーテーブル情報を追加
			if chordNode, exists := m.Nodes[node.ID.String()]; exists {
				fingerTable := make([]map[string]interface{}, 0)
				for _, entry := range chordNode.FingerTable.GetAllEntries() {
					if entry.Node != nil {
						fingerTable = append(fingerTable, map[string]interface{}{
							"start": entry.Start,
							"nodeId": entry.Node.ID.String(),
						})
					}
				}
				nodeData["fingerTable"] = fingerTable
			}

			nodes = append(nodes, nodeData)
		}

		response := map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"nodeCount": ringInfo.Size,
				"totalDataCount": m.getTotalDataCount(),
				"nodes": nodes,
			},
		}
		json.NewEncoder(w).Encode(response)

	case "POST":
		// ノード追加
		var req struct {
			Address string `json:"address"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		node := chord.NewChordNode(req.Address, req.Address)

		if m.Ring.GetRingInfo().Size == 0 {
			// 最初のノード
			node.InitializeFingerTable()
			m.Ring.AddNode(node.Node)
		} else {
			// 既存ノードを経由してリングに参加
			var existingNode *chord.ChordNode
			for _, n := range m.Nodes {
				existingNode = n
				break
			}

			if existingNode == nil {
				http.Error(w, "No existing node found", http.StatusInternalServerError)
				return
			}

			if err := node.Join(existingNode, m.Ring); err != nil {
				http.Error(w, fmt.Sprintf("Failed to join ring: %v", err), http.StatusInternalServerError)
				return
			}
		}

		m.Nodes[node.Node.ID.String()] = node

		response := map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"nodeId": node.Node.ID.String(),
				"address": node.Node.Addr,
			},
		}
		json.NewEncoder(w).Encode(response)

	case "DELETE":
		// ノード削除
		nodeId := r.URL.Query().Get("nodeId")
		if nodeId == "" {
			http.Error(w, "nodeId parameter required", http.StatusBadRequest)
			return
		}

		node, exists := m.Nodes[nodeId]
		if !exists {
			http.Error(w, "Node not found", http.StatusNotFound)
			return
		}

		if err := node.Leave(m.Ring); err != nil {
			http.Error(w, fmt.Sprintf("Failed to leave ring: %v", err), http.StatusInternalServerError)
			return
		}

		delete(m.Nodes, nodeId)

		response := map[string]interface{}{
			"success": true,
			"message": "ノードが正常に削除されました",
		}
		json.NewEncoder(w).Encode(response)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// データ管理APIのハンドラー
func (m *MockAPIServer) handleDataAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	switch r.Method {
	case "GET":
		// データ検索
		key := r.URL.Query().Get("key")
		if key == "" {
			http.Error(w, "key parameter required", http.StatusBadRequest)
			return
		}

		var value string
		var exists bool

		// 任意のノードから検索
		for _, node := range m.Nodes {
			value, exists = node.Get(key)
			if exists {
				break
			}
		}

		response := map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"key": key,
				"value": value,
				"exists": exists,
			},
		}
		json.NewEncoder(w).Encode(response)

	case "PUT":
		// データ保存
		var req struct {
			Key   string `json:"key"`
			Value string `json:"value"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "Invalid request body", http.StatusBadRequest)
			return
		}

		if req.Key == "" {
			http.Error(w, "key is required", http.StatusBadRequest)
			return
		}

		// 任意のノードにデータを保存
		var node *chord.ChordNode
		for _, n := range m.Nodes {
			node = n
			break
		}

		if node == nil {
			http.Error(w, "No nodes available", http.StatusServiceUnavailable)
			return
		}

		node.Put(req.Key, req.Value)

		response := map[string]interface{}{
			"success": true,
			"message": "データが正常に保存されました",
			"data": map[string]interface{}{
				"key": req.Key,
				"value": req.Value,
			},
		}
		json.NewEncoder(w).Encode(response)

	case "DELETE":
		// データ削除
		key := r.URL.Query().Get("key")
		if key == "" {
			http.Error(w, "key parameter required", http.StatusBadRequest)
			return
		}

		// 任意のノードからデータを削除
		deleted := false
		for _, node := range m.Nodes {
			if node.Delete(key) {
				deleted = true
				break
			}
		}

		response := map[string]interface{}{
			"success": true,
			"deleted": deleted,
			"message": "データ削除操作が完了しました",
		}
		json.NewEncoder(w).Encode(response)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ヘルパー関数: ノードのデータ数を取得
func (m *MockAPIServer) getNodeDataCount(nodeID string) int {
	// 簡易実装: 実際にはノード内部のデータカウントを返す
	return 0
}

// ヘルパー関数: 総データ数を取得
func (m *MockAPIServer) getTotalDataCount() int {
	// 簡易実装: 実際には全ノードのデータ合計を返す
	return 0
}

// Web UI統合テスト: API基本機能テスト
func TestWebUIIntegrationBasicAPI(t *testing.T) {
	t.Log("=== Web UI統合テスト: API基本機能テスト ===")

	server := NewMockAPIServer()
	defer server.Close()

	baseURL := server.URL()

	// 1. 初期状態確認 (空のリング)
	t.Log("1. 初期状態確認")
	resp, err := http.Get(baseURL + "/api/chord")
	if err != nil {
		t.Fatalf("GET /api/chord failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Errorf("Expected status 200, got %d", resp.StatusCode)
	}

	var ringResponse map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&ringResponse); err != nil {
		t.Fatalf("Failed to decode response: %v", err)
	}

	data := ringResponse["data"].(map[string]interface{})
	if int(data["nodeCount"].(float64)) != 0 {
		t.Errorf("Expected 0 nodes, got %v", data["nodeCount"])
	}

	// 2. ノード追加テスト
	t.Log("2. ノード追加テスト")
	addNodeTests := []struct {
		address string
	}{
		{"test-node-1.local:8001"},
		{"test-node-2.local:8002"},
		{"test-node-3.local:8003"},
	}

	for i, test := range addNodeTests {
		reqBody := map[string]string{"address": test.address}
		jsonBody, _ := json.Marshal(reqBody)

		resp, err := http.Post(baseURL+"/api/chord", "application/json", bytes.NewBuffer(jsonBody))
		if err != nil {
			t.Fatalf("POST /api/chord failed for node %d: %v", i+1, err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200 for node %d, got %d", i+1, resp.StatusCode)
		}

		var nodeResponse map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&nodeResponse); err != nil {
			t.Fatalf("Failed to decode response for node %d: %v", i+1, err)
		}

		if !nodeResponse["success"].(bool) {
			t.Errorf("Node %d addition failed", i+1)
		}

		// 短時間待機 (リング更新のため)
		time.Sleep(time.Millisecond * 100)
	}

	// 3. リング状態確認
	t.Log("3. リング状態確認")
	resp, err = http.Get(baseURL + "/api/chord")
	if err != nil {
		t.Fatalf("GET /api/chord failed after adding nodes: %v", err)
	}
	defer resp.Body.Close()

	if err := json.NewDecoder(resp.Body).Decode(&ringResponse); err != nil {
		t.Fatalf("Failed to decode ring response: %v", err)
	}

	data = ringResponse["data"].(map[string]interface{})
	nodeCount := int(data["nodeCount"].(float64))
	if nodeCount != len(addNodeTests) {
		t.Errorf("Expected %d nodes, got %d", len(addNodeTests), nodeCount)
	}

	nodes := data["nodes"].([]interface{})
	t.Logf("リング内のノード数: %d", len(nodes))

	for i, nodeData := range nodes {
		node := nodeData.(map[string]interface{})
		t.Logf("ノード %d: ID=%s, Address=%s", i+1, node["id"], node["address"])
	}

	t.Log("API基本機能テスト完了")
}

// Web UI統合テスト: データ操作API テスト
func TestWebUIIntegrationDataOperations(t *testing.T) {
	t.Log("=== Web UI統合テスト: データ操作API テスト ===")

	server := NewMockAPIServer()
	defer server.Close()

	baseURL := server.URL()

	// 先にノードを追加
	nodeAddresses := []string{
		"data-test-1.local:8001",
		"data-test-2.local:8002",
		"data-test-3.local:8003",
	}

	for _, address := range nodeAddresses {
		reqBody := map[string]string{"address": address}
		jsonBody, _ := json.Marshal(reqBody)

		resp, err := http.Post(baseURL+"/api/chord", "application/json", bytes.NewBuffer(jsonBody))
		if err != nil {
			t.Fatalf("Failed to add node %s: %v", address, err)
		}
		resp.Body.Close()
	}

	time.Sleep(time.Millisecond * 200) // リング構築待機

	// 1. データ保存テスト
	t.Log("1. データ保存テスト")
	testData := []struct {
		key   string
		value string
	}{
		{"user:123", "John Doe"},
		{"session:abc", "active_session_data"},
		{"config:app", "production_settings"},
		{"metric:cpu", "85.5%"},
		{"log:error", "connection_timeout"},
	}

	for _, data := range testData {
		reqBody := map[string]string{
			"key":   data.key,
			"value": data.value,
		}
		jsonBody, _ := json.Marshal(reqBody)

		req, err := http.NewRequest("PUT", baseURL+"/api/chord/data", bytes.NewBuffer(jsonBody))
		if err != nil {
			t.Fatalf("Failed to create PUT request for %s: %v", data.key, err)
		}
		req.Header.Set("Content-Type", "application/json")

		client := &http.Client{}
		response, err := client.Do(req)
		if err != nil {
			t.Fatalf("PUT /api/chord/data failed for %s: %v", data.key, err)
		}
		defer response.Body.Close()

		if response.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200 for PUT %s, got %d", data.key, response.StatusCode)
		}

		var putResponse map[string]interface{}
		if err := json.NewDecoder(response.Body).Decode(&putResponse); err != nil {
			t.Fatalf("Failed to decode PUT response for %s: %v", data.key, err)
		}

		if !putResponse["success"].(bool) {
			t.Errorf("Data save failed for key %s", data.key)
		}
	}

	// 短時間待機 (データ分散のため)
	time.Sleep(time.Millisecond * 100)

	// 2. データ検索テスト
	t.Log("2. データ検索テスト")
	for _, data := range testData {
		resp, err := http.Get(fmt.Sprintf("%s/api/chord/data?key=%s", baseURL, data.key))
		if err != nil {
			t.Fatalf("GET /api/chord/data failed for %s: %v", data.key, err)
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			t.Errorf("Expected status 200 for GET %s, got %d", data.key, resp.StatusCode)
		}

		var getResponse map[string]interface{}
		if err := json.NewDecoder(resp.Body).Decode(&getResponse); err != nil {
			t.Fatalf("Failed to decode GET response for %s: %v", data.key, err)
		}

		responseData := getResponse["data"].(map[string]interface{})
		if !responseData["exists"].(bool) {
			t.Errorf("Data not found for key %s", data.key)
			continue
		}

		if responseData["value"].(string) != data.value {
			t.Errorf("Value mismatch for key %s: expected %s, got %s",
				data.key, data.value, responseData["value"].(string))
		}

		t.Logf("データ検索成功: %s = %s", data.key, responseData["value"].(string))
	}

	t.Log("データ操作API テスト完了")
}

// 平均時間を計算するヘルパー関数
func calculateAverageTime(times []time.Duration) time.Duration {
	var total time.Duration
	for _, t := range times {
		total += t
	}
	return total / time.Duration(len(times))
}
