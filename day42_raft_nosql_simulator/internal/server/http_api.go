package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/hashicorp/raft" // raft.ServerID と raft.ServerAddress のため
)

// RaftNodeProxy は HTTPServer が Raftノードの機能にアクセスするためのインターフェースです。
type RaftNodeProxy interface {
	NodeID() raft.ServerID
	IsLeader() bool
	LeaderAddr() raft.ServerAddress
	LeaderID() raft.ServerID
	ProposeCreateTable(tableName, pkName, skName string, timeout time.Duration) (interface{}, error)
	ProposeDeleteTable(tableName string, timeout time.Duration) (interface{}, error)
	ProposePutItem(tableName string, item map[string]interface{}, timeout time.Duration) (interface{}, error)
	ProposeDeleteItem(tableName, pk, sk string, timeout time.Duration) (interface{}, error)
	GetItemFromLocalStore(tableName, itemKey string) (json.RawMessage, int64, error)
	QueryItemsFromLocalStore(tableName, pk, skPrefix string) ([]map[string]interface{}, error)
	GetClusterStatus() (map[string]interface{}, error)
}

// APIServer はRaftノードと連携してHTTPリクエストを処理します。
type APIServer struct {
	node   RaftNodeProxy
	router *http.ServeMux
	server *http.Server
}

// NewAPIServer は新しいAPIServerインスタンスを作成します。
func NewAPIServer(node RaftNodeProxy, httpAddr string) *APIServer {
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
	s.router.HandleFunc("/create-table", httpLogger(s.handleCreateTable))
	s.router.HandleFunc("/delete-table", httpLogger(s.handleDeleteTable))
	s.router.HandleFunc("/put-item", httpLogger(s.handlePutItem))
	s.router.HandleFunc("/get-item", httpLogger(s.handleGetItem))
	s.router.HandleFunc("/delete-item", httpLogger(s.handleDeleteItem))
	s.router.HandleFunc("/query-items", httpLogger(s.handleQueryItems))
	s.router.HandleFunc("/status", httpLogger(s.handleStatus))
}

func httpLogger(handler http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		log.Printf("HTTP Request: %s %s from %s", r.Method, r.URL.Path, r.RemoteAddr)
		handler(w, r)
	}
}

// Start はHTTPサーバーを非同期に起動します。
func (s *APIServer) Start() {
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
	TableName        string `json:"table_name"`
	PartitionKeyName string `json:"partition_key_name"`
	SortKeyName      string `json:"sort_key_name,omitempty"`
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

type GetItemResponse struct {
	Item    json.RawMessage          `json:"item,omitempty"`
	Items   []map[string]interface{} `json:"items,omitempty"`
	Version int64                    `json:"version,omitempty"`
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
		leaderAddr := s.node.LeaderAddr()
		leaderID := s.node.LeaderID()
		if leaderAddr == "" {
			writeJSONError(w, "No leader elected in the cluster to handle CreateTable", http.StatusMisdirectedRequest)
			return
		}
		log.Printf("Node %s is not leader, current leader is %s (%s)", s.node.NodeID(), leaderID, leaderAddr)
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

func (s *APIServer) handleDeleteTable(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		writeJSONError(w, "Only POST method is allowed for DeleteTable", http.StatusMethodNotAllowed)
		return
	}
	var req DeleteTableRequest // Using the DTO
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()
	if req.TableName == "" {
		writeJSONError(w, "tableName is required for DeleteTable", http.StatusBadRequest)
		return
	}
	if !s.node.IsLeader() {
		leaderAddr := s.node.LeaderAddr()
		leaderID := s.node.LeaderID()
		if leaderAddr == "" {
			writeJSONError(w, "No leader elected to handle DeleteTable", http.StatusMisdirectedRequest)
			return
		}
		log.Printf("Node %s is not leader, current leader is %s (%s)", s.node.NodeID(), leaderID, leaderAddr)
		writeJSONError(w, fmt.Sprintf("Not a leader. Please send request to leader %s (%s)", leaderID, leaderAddr), http.StatusMisdirectedRequest)
		return
	}
	log.Printf("Node %s (Leader): Processing DeleteTable request for table '%s'", s.node.NodeID(), req.TableName)
	apiResponse, err := s.node.ProposeDeleteTable(req.TableName, 5*time.Second)
	if err != nil {
		log.Printf("Node %s: ProposeDeleteTable for table '%s' failed: %v", s.node.NodeID(), req.TableName, err)
		writeJSONError(w, fmt.Sprintf("Failed to propose DeleteTable: %v", err), http.StatusInternalServerError)
		return
	}
	if fsmErr, ok := apiResponse.(error); ok && fsmErr != nil {
		log.Printf("Node %s: FSM error during DeleteTable for '%s': %v", s.node.NodeID(), req.TableName, fsmErr)
		if strings.Contains(fsmErr.Error(), "not found") {
			writeJSONError(w, fmt.Sprintf("FSM returned an error for DeleteTable: %v (table not found)", fsmErr), http.StatusNotFound)
		} else {
			writeJSONError(w, fmt.Sprintf("FSM returned an error for DeleteTable: %v", fsmErr), http.StatusInternalServerError)
		}
		return
	}
	log.Printf("Node %s: DeleteTable for table '%s' proposed successfully. FSM response: %v", s.node.NodeID(), req.TableName, apiResponse)
	writeJSONResponse(w, map[string]interface{}{"message": "DeleteTable proposal accepted", "fsm_response": apiResponse}, http.StatusAccepted)
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
		leaderAddr := s.node.LeaderAddr()
		leaderID := s.node.LeaderID()
		if leaderAddr == "" {
			writeJSONError(w, "No leader elected to handle PutItem", http.StatusMisdirectedRequest)
			return
		}
		log.Printf("Node %s is not leader, current leader is %s (%s)", s.node.NodeID(), leaderID, leaderAddr)
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
	if r.Method != http.MethodPost {
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
	log.Printf("Node %s: Processing GetItem request for table '%s', PK: %s, SK: %s", s.node.NodeID(), req.TableName, req.PartitionKey, req.SortKey)
	itemKey := req.PartitionKey
	if req.SortKey != "" {
		itemKey += "_" + req.SortKey
	}
	itemData, version, err := s.node.GetItemFromLocalStore(req.TableName, itemKey)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			writeJSONError(w, "Item not found", http.StatusNotFound)
		} else {
			log.Printf("Node %s: GetItemFromLocalStore for table '%s', key '%s' failed: %v", s.node.NodeID(), req.TableName, itemKey, err)
			writeJSONError(w, fmt.Sprintf("Failed to get item: %v", err), http.StatusInternalServerError)
		}
		return
	}
	if itemData == nil {
		writeJSONError(w, "Item not found (nil data)", http.StatusNotFound)
		return
	}
	log.Printf("Node %s: GetItem for table '%s', key '%s' successful. Version: %d", s.node.NodeID(), req.TableName, itemKey, version)
	writeJSONResponse(w, GetItemResponse{Item: itemData, Version: version}, http.StatusOK)
}

func (s *APIServer) handleDeleteItem(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
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
		leaderAddr := s.node.LeaderAddr()
		leaderID := s.node.LeaderID()
		if leaderAddr == "" {
			writeJSONError(w, "No leader elected to handle DeleteItem", http.StatusMisdirectedRequest)
			return
		}
		log.Printf("Node %s is not leader, current leader is %s (%s)", s.node.NodeID(), leaderID, leaderAddr)
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
	log.Printf("Node %s: DeleteItem for table '%s' proposed successfully. FSM response: %v", s.node.NodeID(), req.TableName, apiResponse)
	writeJSONResponse(w, map[string]interface{}{"message": "DeleteItem proposal accepted", "fsm_response": apiResponse}, http.StatusAccepted)
}

func (s *APIServer) handleQueryItems(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
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
	log.Printf("Node %s: Processing QueryItems request for table '%s', PK: %s, SKPrefix: %s", s.node.NodeID(), req.TableName, req.PartitionKey, req.SortKeyPrefix)
	items, err := s.node.QueryItemsFromLocalStore(req.TableName, req.PartitionKey, req.SortKeyPrefix)
	if err != nil {
		log.Printf("Node %s: QueryItemsFromLocalStore for table '%s', PK '%s' failed: %v", s.node.NodeID(), req.TableName, req.PartitionKey, err)
		writeJSONError(w, fmt.Sprintf("Failed to query items: %v", err), http.StatusInternalServerError)
		return
	}
	if items == nil {
		items = []map[string]interface{}{}
	}
	log.Printf("Node %s: QueryItems for table '%s', PK '%s' successful. Found %d items.", s.node.NodeID(), req.TableName, req.PartitionKey, len(items))
	writeJSONResponse(w, GetItemResponse{Items: items}, http.StatusOK)
}

func (s *APIServer) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, "Only GET method is allowed for Status", http.StatusMethodNotAllowed)
		return
	}
	statusInfo, err := s.node.GetClusterStatus()
	if err != nil {
		log.Printf("Node %s: Failed to get cluster status: %v", s.node.NodeID(), err)
		writeJSONError(w, fmt.Sprintf("Failed to get cluster status: %v", err), http.StatusInternalServerError)
		return
	}
	log.Printf("Node %s: Successfully retrieved cluster status.", s.node.NodeID())
	writeJSONResponse(w, statusInfo, http.StatusOK)
}

// --- Helper functions ---
func writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(ErrorResponse{Error: message})
}

func writeJSONResponse(w http.ResponseWriter, data interface{}, statusCode int) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)
	if data != nil {
		if err := json.NewEncoder(w).Encode(data); err != nil {
			log.Printf("Error writing JSON response body: %v", err)
		}
	}
}
