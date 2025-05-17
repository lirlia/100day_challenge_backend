package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"
	// "day42_raft_nosql_simulator_local_test/internal/raft_node" // 循環参照のため削除
	// RaftNodeProxy インターフェースのメソッドシグネチャで使用
)

// APIServer はRaftノードと連携してHTTPリクエストを処理します。
type APIServer struct {
	node   RaftNodeProxy // raft_node.Node の代わりにインターフェースを使用
	router *http.ServeMux
	server *http.Server
}

// NewAPIServer は新しいAPIServerインスタンスを作成します。
func NewAPIServer(node RaftNodeProxy, httpAddr string) *APIServer { // 引数もインターフェース型に
	s := &APIServer{
		node:   node,
		router: http.NewServeMux(),
	}
	s.server = &http.Server{
		Addr:    httpAddr,
		Handler: s.router,
	}
	s.setupRoutes()
	return s
}

func (s *APIServer) setupRoutes() {
	s.router.HandleFunc("/create-table", s.handleCreateTable)
	// TODO: /put-item, /get-item などのルートをここに追加
	s.router.HandleFunc("/put-item", s.handlePutItem)
	s.router.HandleFunc("/get-item", s.handleGetItem)
	s.router.HandleFunc("/delete-item", s.handleDeleteItem)
	s.router.HandleFunc("/query-items", s.handleQueryItems)
	s.router.HandleFunc("/status", s.handleStatus)
}

// Start はHTTPサーバーを非同期に起動します。
func (s *APIServer) Start() {
	// s.node.NodeID() はインターフェース経由で呼び出される
	log.Printf("Node %s: HTTP API server starting on %s", s.node.NodeID(), s.server.Addr)
	go func() {
		if err := s.server.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("Node %s: HTTP API server ListenAndServe failed: %v", s.node.NodeID(), err)
		}
	}()
}

// Shutdown はHTTPサーバーをシャットダウンします。
func (s *APIServer) Shutdown(timeout time.Duration) error {
	log.Printf("Node %s: Shutting down HTTP API server...", s.node.NodeID())
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	return s.server.Shutdown(ctx)
}

// --- DTOs (Data Transfer Objects) ---

type CreateTableRequest struct {
	TableName        string `json:"tableName"`
	PartitionKeyName string `json:"partitionKeyName"`
	SortKeyName      string `json:"sortKeyName,omitempty"`
}

// PutItem
type PutItemRequest struct {
	TableName string                 `json:"tableName"`
	Item      map[string]interface{} `json:"item"`
}

// GetItem
type GetItemRequest struct {
	TableName    string `json:"tableName"`
	PartitionKey string `json:"partitionKey"`
	SortKey      string `json:"sortKey,omitempty"` // ソートキーはオプショナル
}

// DeleteItem (GetItemRequest と同じ構造で良いが、明確化のため別途定義も可)
type DeleteItemRequest struct {
	TableName    string `json:"tableName"`
	PartitionKey string `json:"partitionKey"`
	SortKey      string `json:"sortKey,omitempty"`
}

// QueryItems
type QueryItemsRequest struct {
	TableName     string `json:"tableName"`
	PartitionKey  string `json:"partitionKey"`
	SortKeyPrefix string `json:"sortKeyPrefix,omitempty"` // オプショナル
}

type GetItemResponse struct { // GetItem と QueryItems の成功レスポンス用
	Item    json.RawMessage          `json:"item,omitempty"`    // GetItem用
	Items   []map[string]interface{} `json:"items,omitempty"`   // QueryItems用
	Version int64                    `json:"version,omitempty"` // GetItem用 (KVStoreのバージョン)
}

type ErrorResponse struct {
	Error string `json:"error"`
}

// --- Handlers ---

func (s *APIServer) handleCreateTable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSONError(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.TableName == "" || req.PartitionKeyName == "" {
		writeJSONError(w, "tableName and partitionKeyName are required", http.StatusBadRequest)
		return
	}

	if !s.node.IsLeader() {
		leaderAddr, leaderID := s.node.LeaderWithID()
		if leaderAddr == "" { // raft.ServerAddress は string のエイリアスなので空文字列と比較可能
			writeJSONError(w, "No leader elected in the cluster to handle CreateTable", http.StatusInternalServerError)
			return
		}
		log.Printf("Node %s is not leader, forwarding CreateTable request for table '%s' to leader %s (%s)", s.node.NodeID(), req.TableName, leaderID, leaderAddr)
		writeJSONError(w, fmt.Sprintf("Not a leader. Please send request to leader %s (%s)", leaderID, leaderAddr), http.StatusMisdirectedRequest)
		return
	}

	log.Printf("Node %s (Leader): Processing CreateTable request for table '%s'", s.node.NodeID(), req.TableName)

	apiResponse, err := s.node.ProposeCreateTable(req.TableName, req.PartitionKeyName, req.SortKeyName, 5*time.Second)
	if err != nil {
		log.Printf("Node %s: ProposeCreateTable for table '%s' failed: %v", s.node.NodeID(), req.TableName, err)
		writeJSONError(w, fmt.Sprintf("Failed to propose CreateTable: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("Node %s: CreateTable for table '%s' proposed successfully. Response from FSM: %v", s.node.NodeID(), req.TableName, apiResponse)
	writeJSONResponse(w, map[string]interface{}{"message": "CreateTable proposal accepted", "fsm_response": apiResponse}, http.StatusAccepted)
}

func (s *APIServer) handlePutItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, "Only POST method is allowed for PutItem", http.StatusMethodNotAllowed)
		return
	}

	var req PutItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, fmt.Sprintf("Invalid PutItem request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.TableName == "" || req.Item == nil || len(req.Item) == 0 {
		writeJSONError(w, "tableName and item are required for PutItem", http.StatusBadRequest)
		return
	}

	if !s.node.IsLeader() {
		leaderAddr, leaderID := s.node.LeaderWithID()
		if leaderAddr == "" {
			writeJSONError(w, "No leader elected to handle PutItem", http.StatusInternalServerError)
			return
		}
		writeJSONError(w, fmt.Sprintf("Not a leader. Please send PutItem request to leader %s (%s)", leaderID, leaderAddr), http.StatusMisdirectedRequest)
		return
	}

	log.Printf("Node %s (Leader): Processing PutItem request for table '%s'", s.node.NodeID(), req.TableName)
	apiResponse, err := s.node.ProposePutItem(req.TableName, req.Item, 5*time.Second)
	if err != nil {
		log.Printf("Node %s: ProposePutItem for table '%s' failed: %v", s.node.NodeID(), req.TableName, err)
		writeJSONError(w, fmt.Sprintf("Failed to propose PutItem: %v", err), http.StatusInternalServerError)
		return
	}
	log.Printf("Node %s: PutItem for table '%s' proposed successfully. FSM response: %v", s.node.NodeID(), req.TableName, apiResponse)
	writeJSONResponse(w, map[string]interface{}{"message": "PutItem proposal accepted", "fsm_response": apiResponse}, http.StatusAccepted)
}

func (s *APIServer) handleGetItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { // GETでも良いが、リクエストボディでキーを指定するのでPOSTが一般的
		writeJSONError(w, "Only POST method is allowed for GetItem", http.StatusMethodNotAllowed)
		return
	}

	var req GetItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, fmt.Sprintf("Invalid GetItem request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.TableName == "" || req.PartitionKey == "" {
		writeJSONError(w, "tableName and partitionKey are required for GetItem", http.StatusBadRequest)
		return
	}

	// GetItemはRaftを経由しないローカルリード
	// どのノードでも処理できるが、クライアントは任意のノードにリクエストを送る想定
	log.Printf("Node %s: Processing GetItem request for table '%s', PK: %s, SK: %s", s.node.NodeID(), req.TableName, req.PartitionKey, req.SortKey)

	// KVStoreのキー形式に合わせる (store.BuildItemKey を使うのが望ましいが、ここでは直接構築)
	itemKey := req.PartitionKey
	if req.SortKey != "" {
		itemKey += "_" + req.SortKey
	}

	itemData, version, err := s.node.GetItemFromLocalStore(req.TableName, itemKey)
	if err != nil {
		// TODO: エラーの種類によってStatusNotFound(404)などを返す
		log.Printf("Node %s: GetItemFromLocalStore for table '%s', key '%s' failed: %v", s.node.NodeID(), req.TableName, itemKey, err)
		writeJSONError(w, fmt.Sprintf("Failed to get item: %v", err), http.StatusInternalServerError) // 見つからない場合は404の方が適切
		return
	}

	if itemData == nil {
		writeJSONError(w, "Item not found", http.StatusNotFound)
		return
	}

	log.Printf("Node %s: GetItem for table '%s', key '%s' successful. Version: %d", s.node.NodeID(), req.TableName, itemKey, version)
	writeJSONResponse(w, GetItemResponse{Item: itemData, Version: version}, http.StatusOK)
}

func (s *APIServer) handleDeleteItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { // 一般的にはDELETEメソッドだが、リクエストボディのためPOSTも許容
		writeJSONError(w, "Only POST method is allowed for DeleteItem", http.StatusMethodNotAllowed)
		return
	}
	var req DeleteItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, fmt.Sprintf("Invalid DeleteItem request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.TableName == "" || req.PartitionKey == "" {
		writeJSONError(w, "tableName and partitionKey are required for DeleteItem", http.StatusBadRequest)
		return
	}

	if !s.node.IsLeader() {
		leaderAddr, leaderID := s.node.LeaderWithID()
		if leaderAddr == "" {
			writeJSONError(w, "No leader elected to handle DeleteItem", http.StatusInternalServerError)
			return
		}
		writeJSONError(w, fmt.Sprintf("Not a leader. Please send DeleteItem request to leader %s (%s)", leaderID, leaderAddr), http.StatusMisdirectedRequest)
		return
	}

	log.Printf("Node %s (Leader): Processing DeleteItem request for table '%s', PK: %s, SK: %s", s.node.NodeID(), req.TableName, req.PartitionKey, req.SortKey)
	apiResponse, err := s.node.ProposeDeleteItem(req.TableName, req.PartitionKey, req.SortKey, 5*time.Second)
	if err != nil {
		log.Printf("Node %s: ProposeDeleteItem for table '%s' failed: %v", s.node.NodeID(), req.TableName, err)
		writeJSONError(w, fmt.Sprintf("Failed to propose DeleteItem: %v", err), http.StatusInternalServerError)
		return
	}
	log.Printf("Node %s: DeleteItem for table '%s' proposed successfully. FSM Response: %v", s.node.NodeID(), req.TableName, apiResponse)
	writeJSONResponse(w, map[string]interface{}{"message": "DeleteItem proposal accepted", "fsm_response": apiResponse}, http.StatusAccepted)
}

func (s *APIServer) handleQueryItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { // Queryもリクエストボディで条件指定のためPOST
		writeJSONError(w, "Only POST method is allowed for QueryItems", http.StatusMethodNotAllowed)
		return
	}
	var req QueryItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, fmt.Sprintf("Invalid QueryItems request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if req.TableName == "" || req.PartitionKey == "" {
		writeJSONError(w, "tableName and partitionKey are required for QueryItems", http.StatusBadRequest)
		return
	}

	// QueryItemsもローカルリード
	log.Printf("Node %s: Processing QueryItems request for table '%s', PK: %s, SKPrefix: %s", s.node.NodeID(), req.TableName, req.PartitionKey, req.SortKeyPrefix)
	items, err := s.node.QueryItemsFromLocalStore(req.TableName, req.PartitionKey, req.SortKeyPrefix)
	if err != nil {
		log.Printf("Node %s: QueryItemsFromLocalStore for table '%s', PK '%s' failed: %v", s.node.NodeID(), req.TableName, req.PartitionKey, err)
		writeJSONError(w, fmt.Sprintf("Failed to query items: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("Node %s: QueryItems for table '%s', PK '%s' successful. Found %d items.", s.node.NodeID(), req.TableName, req.PartitionKey, len(items))
	writeJSONResponse(w, GetItemResponse{Items: items}, http.StatusOK)
}

func (s *APIServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		writeJSONError(w, "Only GET method is allowed", http.StatusMethodNotAllowed)
		return
	}
	stats := s.node.Stats()
	leaderAddr, leaderID := s.node.LeaderWithID()
	statusInfo := map[string]interface{}{
		"nodeId":     s.node.NodeID(),
		"raftState":  stats["state"],
		"raftTerm":   stats["term"],
		"isLeader":   s.node.IsLeader(),
		"leaderId":   leaderID,
		"leaderAddr": leaderAddr,
		// "fsmNumTables": len(s.node.GetFSM().ListTables()), // GetFSM() は RaftNodeProxy にないのでコメントアウト。代わりに ListTablesFromFSM() を使う
		"fsmNumTables": len(s.node.ListTablesFromFSM()),
	}
	writeJSONResponse(w, statusInfo, http.StatusOK)
}

// --- Helper functions ---

func writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ErrorResponse{Error: message})
}

func writeJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			log.Printf("Error writing JSON response: %v", err)
		}
	}
}
