package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"time"

	// raft.ServerID と raft.ServerAddress のため
	"day42_raft_nosql_simulator_local_test/internal/store" // store パッケージをインポート
)

// RaftNodeProxy は APIServer が Raft ノードの機能にアクセスするためのインターフェースです。
// これにより、APIServer と RaftNode間の循環参照を避けます。
type RaftNodeProxy interface {
	IsLeader() bool
	LeaderAddr() string // Raft ServerAddress (e.g., "127.0.0.1:7000")
	LeaderID() string   // Raft ServerID (e.g., "node0")
	NodeID() string
	ProposeCreateTable(tableName, partitionKeyName, sortKeyName string, timeout time.Duration) (interface{}, error)
	ProposeDeleteTable(tableName string, timeout time.Duration) (interface{}, error)
	ProposePutItem(tableName string, itemData map[string]interface{}, timeout time.Duration) (interface{}, error)
	ProposeDeleteItem(tableName string, partitionKey string, sortKey string, timeout time.Duration) (interface{}, error)
	GetItemFromLocalStore(tableName string, itemKey string) (json.RawMessage, int64, error) // itemKey は PK または PK_SK
	QueryItemsFromLocalStore(tableName string, partitionKey string, sortKeyPrefix string) ([]map[string]interface{}, error)
	GetTableMetadata(tableName string) (*store.TableMetadata, bool)
	ListTablesFromFSM() []string
	GetClusterStatus() (map[string]interface{}, error)
	LeaderWithID() (raftAddress string, raftID string) // http_api.go での raft.ServerAddress, raft.ServerID の直接参照を避けるため文字列で返す
}

// APIServer は Raft ノードへの HTTP API を提供します。
// この構造体は main 関数で初期化され、HTTPリクエストを処理します。
type APIServer struct {
	httpServer *http.Server
	nodeProxy  RaftNodeProxy // Raftノードの操作用プロキシ
	addr       string
}

// NewAPIServer は新しいAPIServerインスタンスを作成します。
func NewAPIServer(addr string, nodeProxy RaftNodeProxy) *APIServer {
	srv := &APIServer{
		nodeProxy: nodeProxy,
		addr:      addr,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/create-table", srv.handleCreateTable)
	mux.HandleFunc("/delete-table", srv.handleDeleteTable)
	mux.HandleFunc("/put-item", srv.handlePutItem)
	mux.HandleFunc("/get-item", srv.handleGetItem)
	mux.HandleFunc("/delete-item", srv.handleDeleteItem)
	mux.HandleFunc("/query-items", srv.handleQueryItems)
	mux.HandleFunc("/status", srv.handleStatus)

	srv.httpServer = &http.Server{
		Addr:    addr,
		Handler: mux,
	}
	return srv
}

// Start はHTTP APIサーバーを起動します。
func (s *APIServer) Start() error {
	log.Printf("[INFO] [APIServer] [%s] HTTP API server starting on %s", s.nodeProxy.NodeID(), s.addr)
	go func() {
		if err := s.httpServer.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("[FATAL] [APIServer] [%s] HTTP API server ListenAndServe failed: %v", s.nodeProxy.NodeID(), err)
		}
	}()
	return nil
}

// Shutdown はHTTP APIサーバーをシャットダウンします。
func (s *APIServer) Shutdown(timeout time.Duration) error {
	log.Printf("[INFO] [APIServer] [%s] HTTP API server shutting down...", s.nodeProxy.NodeID())
	// TODO: context.WithTimeout を使用して適切にシャットダウンする
	return s.httpServer.Close()
}

// --- Request/Response Structs (client.go と共通化も検討) ---

type CreateTableRequest struct {
	TableName    string `json:"table_name"`
	PartitionKey string `json:"partition_key_name"`
	SortKey      string `json:"sort_key_name,omitempty"`
}

type DeleteTableRequest struct {
	TableName string `json:"table_name"`
}

type PutItemRequest struct {
	TableName string                 `json:"table_name"`
	Item      map[string]interface{} `json:"item"`
}

type GetItemRequest struct {
	TableName    string `json:"table_name"`
	PartitionKey string `json:"partition_key"`
	SortKey      string `json:"sort_key,omitempty"`
}

type DeleteItemRequest struct {
	TableName    string `json:"table_name"`
	PartitionKey string `json:"partition_key"`
	SortKey      string `json:"sort_key,omitempty"`
}

type QueryItemsRequest struct {
	TableName     string `json:"table_name"`
	PartitionKey  string `json:"partition_key"`
	SortKeyPrefix string `json:"sort_key_prefix,omitempty"`
}

// APIErrorResponse はエラー時のAPIレスポンスです。
type APIErrorResponse struct {
	Error   string `json:"error"`
	Message string `json:"message,omitempty"`
}

// APISuccessResponse は成功時のAPIレスポンスの基本形です。
type APISuccessResponse struct {
	Message     string                   `json:"message"`
	FSMResponse interface{}              `json:"fsm_response,omitempty"`
	Item        json.RawMessage          `json:"item,omitempty"`
	Items       []map[string]interface{} `json:"items,omitempty"`
	Version     int64                    `json:"version,omitempty"`
}

// --- HTTP Handlers ---

func (s *APIServer) handleCreateTable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	if !s.nodeProxy.IsLeader() {
		leaderAddr, leaderID := s.nodeProxy.LeaderWithID()
		errMsg := fmt.Sprintf("Not a leader. Please send request to leader %s (%s)", leaderID, leaderAddr)
		log.Printf("[WARN] [APIServer] [%s] handleCreateTable: %s", s.nodeProxy.NodeID(), errMsg)
		s.respondWithError(w, http.StatusMisdirectedRequest, errMsg, "Request must be sent to the leader node.")
		return
	}

	var req CreateTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondWithError(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	fsmResponse, err := s.nodeProxy.ProposeCreateTable(req.TableName, req.PartitionKey, req.SortKey, 10*time.Second)
	if err != nil {
		s.respondWithError(w, http.StatusInternalServerError, "Failed to propose CreateTable command", err.Error())
		return
	}

	s.respondWithJSON(w, http.StatusOK, APISuccessResponse{
		Message:     fmt.Sprintf("CreateTable proposal accepted for table %s", req.TableName),
		FSMResponse: fsmResponse,
	})
}

func (s *APIServer) handleDeleteTable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	if !s.nodeProxy.IsLeader() {
		leaderAddr, leaderID := s.nodeProxy.LeaderWithID()
		errMsg := fmt.Sprintf("Not a leader. Please send request to leader %s (%s)", leaderID, leaderAddr)
		log.Printf("[WARN] [APIServer] [%s] handleDeleteTable: %s", s.nodeProxy.NodeID(), errMsg)
		s.respondWithError(w, http.StatusMisdirectedRequest, errMsg, "Request must be sent to the leader node.")
		return
	}

	var req DeleteTableRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondWithError(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	fsmResponse, err := s.nodeProxy.ProposeDeleteTable(req.TableName, 10*time.Second)
	if err != nil {
		s.respondWithError(w, http.StatusInternalServerError, "Failed to propose DeleteTable command", err.Error())
		return
	}

	s.respondWithJSON(w, http.StatusOK, APISuccessResponse{
		Message:     fmt.Sprintf("DeleteTable proposal accepted for table %s", req.TableName),
		FSMResponse: fsmResponse,
	})
}

func (s *APIServer) handlePutItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.nodeProxy.IsLeader() {
		leaderAddr, leaderID := s.nodeProxy.LeaderWithID()
		errMsg := fmt.Sprintf("Not a leader. Please send request to leader %s (%s)", leaderID, leaderAddr)
		log.Printf("[WARN] [APIServer] [%s] handlePutItem: %s", s.nodeProxy.NodeID(), errMsg)
		s.respondWithError(w, http.StatusMisdirectedRequest, errMsg, "Request must be sent to the leader node.")
		return
	}

	var req PutItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondWithError(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	fsmResponse, err := s.nodeProxy.ProposePutItem(req.TableName, req.Item, 10*time.Second)
	if err != nil {
		s.respondWithError(w, http.StatusInternalServerError, "Failed to propose PutItem command", err.Error())
		return
	}
	s.respondWithJSON(w, http.StatusOK, APISuccessResponse{Message: "PutItem proposal accepted", FSMResponse: fsmResponse})
}

func (s *APIServer) handleGetItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost { // DynamoDB GetItem は通常POST (GETも可だがペイロードが複雑な場合がある)
		http.Error(w, "Only POST method is allowed for GetItem", http.StatusMethodNotAllowed)
		return
	}

	var req GetItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondWithError(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	// GetItem はローカルリードなのでリーダーシップチェックは不要だが、
	// テーブル定義はFSMから取得するので、ノードがクラスタの一部であることは前提。
	meta, exists := s.nodeProxy.GetTableMetadata(req.TableName)
	if !exists {
		s.respondWithError(w, http.StatusNotFound, fmt.Sprintf("Table %s not found", req.TableName), "")
		return
	}

	itemKey := req.PartitionKey
	if meta.SortKeyName != "" {
		if req.SortKey == "" {
			s.respondWithError(w, http.StatusBadRequest, fmt.Sprintf("Sort key must be provided for table %s", req.TableName), "")
			return
		}
		itemKey += "_" + req.SortKey
	}

	itemData, version, err := s.nodeProxy.GetItemFromLocalStore(req.TableName, itemKey)
	if err != nil {
		// KVStoreのGetItemはアイテムが見つからない場合エラーを返すので、それを404として扱う
		// TODO: エラーの種類を判別してより適切なステータスコードを返す
		s.respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to get item: %s", err.Error()), "")
		return
	}
	if itemData == nil { // 通常、GetItemFromLocalStoreがエラーを返すのでここには来ないはずだが念のため
		s.respondWithError(w, http.StatusNotFound, fmt.Sprintf("Item %s not found in table %s", itemKey, req.TableName), "")
		return
	}

	s.respondWithJSON(w, http.StatusOK, APISuccessResponse{Message: "Item retrieved successfully", Item: itemData, Version: version})
}

func (s *APIServer) handleDeleteItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}
	if !s.nodeProxy.IsLeader() {
		leaderAddr, leaderID := s.nodeProxy.LeaderWithID()
		errMsg := fmt.Sprintf("Not a leader. Please send request to leader %s (%s)", leaderID, leaderAddr)
		log.Printf("[WARN] [APIServer] [%s] handleDeleteItem: %s", s.nodeProxy.NodeID(), errMsg)
		s.respondWithError(w, http.StatusMisdirectedRequest, errMsg, "Request must be sent to the leader node.")
		return
	}

	var req DeleteItemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondWithError(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	fsmResponse, err := s.nodeProxy.ProposeDeleteItem(req.TableName, req.PartitionKey, req.SortKey, 10*time.Second)
	if err != nil {
		s.respondWithError(w, http.StatusInternalServerError, "Failed to propose DeleteItem command", err.Error())
		return
	}
	s.respondWithJSON(w, http.StatusOK, APISuccessResponse{Message: "DeleteItem proposal accepted", FSMResponse: fsmResponse})
}

func (s *APIServer) handleQueryItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed for QueryItems", http.StatusMethodNotAllowed)
		return
	}

	var req QueryItemsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.respondWithError(w, http.StatusBadRequest, "Invalid request payload", err.Error())
		return
	}

	// QueryItemsもローカルリード
	_, exists := s.nodeProxy.GetTableMetadata(req.TableName)
	if !exists {
		s.respondWithError(w, http.StatusNotFound, fmt.Sprintf("Table %s not found", req.TableName), "")
		return
	}

	items, err := s.nodeProxy.QueryItemsFromLocalStore(req.TableName, req.PartitionKey, req.SortKeyPrefix)
	if err != nil {
		s.respondWithError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to query items: %s", err.Error()), "")
		return
	}

	s.respondWithJSON(w, http.StatusOK, APISuccessResponse{Message: "Items queried successfully", Items: items})
}

func (s *APIServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET method is allowed", http.StatusMethodNotAllowed)
		return
	}

	status, err := s.nodeProxy.GetClusterStatus()
	if err != nil {
		s.respondWithError(w, http.StatusInternalServerError, "Failed to get cluster status", err.Error())
		return
	}
	s.respondWithJSON(w, http.StatusOK, status)
}

// --- Helper functions for responding ---

func (s *APIServer) respondWithError(w http.ResponseWriter, code int, errorType string, message string) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(APIErrorResponse{Error: errorType, Message: message})
}

func (s *APIServer) respondWithJSON(w http.ResponseWriter, code int, payload interface{}) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(payload)
}
