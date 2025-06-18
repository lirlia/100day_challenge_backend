package server

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/engine"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// APIServer RESTful APIサーバー
type APIServer struct {
	engine *engine.BlockchainEngine
	server *http.Server
	ctx    context.Context
	cancel context.CancelFunc
}

// NewAPIServer 新しいAPIサーバーを作成
func NewAPIServer(engine *engine.BlockchainEngine, port int) *APIServer {
	ctx, cancel := context.WithCancel(context.Background())

	mux := http.NewServeMux()
	server := &http.Server{
		Addr:         fmt.Sprintf(":%d", port),
		Handler:      mux,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	apiServer := &APIServer{
		engine: engine,
		server: server,
		ctx:    ctx,
		cancel: cancel,
	}

	// ルート設定
	apiServer.setupRoutes(mux)

	return apiServer
}

// setupRoutes APIルートを設定
func (s *APIServer) setupRoutes(mux *http.ServeMux) {
	// CORS設定用ミドルウェア
	corsMiddleware := func(handler http.HandlerFunc) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

			if r.Method == "OPTIONS" {
				w.WriteHeader(http.StatusOK)
				return
			}

			handler(w, r)
		}
	}

	// ブロックチェーン情報API
	mux.HandleFunc("/api/info", corsMiddleware(s.handleGetInfo))

	// ブロック関連API
	mux.HandleFunc("/api/blocks", corsMiddleware(s.handleBlocks))
	mux.HandleFunc("/api/blocks/", corsMiddleware(s.handleBlockDetail))
	mux.HandleFunc("/api/blocks/height/", corsMiddleware(s.handleBlockByHeight))

	// ウォレット関連API
	mux.HandleFunc("/api/wallets", corsMiddleware(s.handleWallets))
	mux.HandleFunc("/api/wallets/create", corsMiddleware(s.handleCreateWallet))
	mux.HandleFunc("/api/wallets/", corsMiddleware(s.handleWalletDetail))

	// トランザクション関連API
	mux.HandleFunc("/api/transactions/send", corsMiddleware(s.handleSendTransaction))

	// マイニング関連API
	mux.HandleFunc("/api/mining/mine", corsMiddleware(s.handleMineBlock))
	mux.HandleFunc("/api/mining/start", corsMiddleware(s.handleStartAutoMining))
	mux.HandleFunc("/api/mining/stop", corsMiddleware(s.handleStopAutoMining))

	// チェーン検証API
	mux.HandleFunc("/api/validate", corsMiddleware(s.handleValidateChain))

	// 静的ファイルサーバー（Web UI用）
	mux.Handle("/", http.FileServer(http.Dir("./web/")))
}

// handleGetInfo ブロックチェーン情報を取得
func (s *APIServer) handleGetInfo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	info, err := s.engine.GetBlockchainInfo()
	if err != nil {
		s.sendError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to get info: %v", err))
		return
	}

	s.sendJSON(w, info)
}

// handleBlocks ブロック一覧を取得
func (s *APIServer) handleBlocks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	info, err := s.engine.GetBlockchainInfo()
	if err != nil {
		s.sendError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to get info: %v", err))
		return
	}

	// 最新の10ブロックを取得
	blocks := make([]*engine.BlockSummary, 0)
	for i := info.Height; i >= 0 && len(blocks) < 10; i-- {
		block, err := s.engine.GetBlockByHeight(i)
		if err != nil {
			continue
		}

		summary := &engine.BlockSummary{
			Height:       block.Height,
			Hash:         crypto.HexEncode(block.Hash)[:16] + "...",
			PrevHash:     crypto.HexEncode(block.PrevBlockHash)[:16] + "...",
			Timestamp:    block.Timestamp,
			Nonce:        block.Nonce,
			Transactions: len(block.Transactions),
		}
		blocks = append(blocks, summary)
	}

	s.sendJSON(w, map[string]interface{}{
		"blocks": blocks,
		"total":  info.Height + 1,
	})
}

// handleBlockDetail ブロック詳細を取得
func (s *APIServer) handleBlockDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// パスからハッシュを抽出
	path := strings.TrimPrefix(r.URL.Path, "/api/blocks/")
	if path == "" {
		s.sendError(w, http.StatusBadRequest, "Block hash is required")
		return
	}

	block, err := s.engine.GetBlock(path)
	if err != nil {
		s.sendError(w, http.StatusNotFound, fmt.Sprintf("Block not found: %v", err))
		return
	}

	s.sendJSON(w, block)
}

// handleBlockByHeight 高さでブロックを取得
func (s *APIServer) handleBlockByHeight(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// パスから高さを抽出
	path := strings.TrimPrefix(r.URL.Path, "/api/blocks/height/")
	if path == "" {
		s.sendError(w, http.StatusBadRequest, "Block height is required")
		return
	}

	height, err := strconv.ParseInt(path, 10, 64)
	if err != nil {
		s.sendError(w, http.StatusBadRequest, fmt.Sprintf("Invalid height: %v", err))
		return
	}

	block, err := s.engine.GetBlockByHeight(height)
	if err != nil {
		s.sendError(w, http.StatusNotFound, fmt.Sprintf("Block not found: %v", err))
		return
	}

	s.sendJSON(w, block)
}

// handleWallets ウォレット一覧を取得
func (s *APIServer) handleWallets(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	wallets := s.engine.GetWallets()

	// 各ウォレットの残高を取得
	walletDetails := make([]map[string]interface{}, 0)
	for _, address := range wallets {
		balance, err := s.engine.GetBalance(address)
		if err != nil {
			log.Printf("Failed to get balance for %s: %v", address, err)
			balance = 0
		}

		walletDetails = append(walletDetails, map[string]interface{}{
			"address": address,
			"balance": balance,
		})
	}

	s.sendJSON(w, map[string]interface{}{
		"wallets": walletDetails,
		"total":   len(wallets),
	})
}

// handleCreateWallet 新しいウォレットを作成
func (s *APIServer) handleCreateWallet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	address, err := s.engine.CreateWallet()
	if err != nil {
		s.sendError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to create wallet: %v", err))
		return
	}

	s.sendJSON(w, map[string]interface{}{
		"address": address,
		"message": "Wallet created successfully",
	})
}

// handleWalletDetail ウォレット詳細を取得
func (s *APIServer) handleWalletDetail(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	// パスからアドレスを抽出
	path := strings.TrimPrefix(r.URL.Path, "/api/wallets/")
	if path == "" {
		s.sendError(w, http.StatusBadRequest, "Wallet address is required")
		return
	}

	balance, err := s.engine.GetBalance(path)
	if err != nil {
		s.sendError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to get balance: %v", err))
		return
	}

	s.sendJSON(w, map[string]interface{}{
		"address": path,
		"balance": balance,
	})
}

// SendTransactionRequest トランザクション送信リクエスト
type SendTransactionRequest struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Amount int64  `json:"amount"`
}

// handleSendTransaction トランザクションを送信
func (s *APIServer) handleSendTransaction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req SendTransactionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, fmt.Sprintf("Invalid request: %v", err))
		return
	}

	if req.From == "" || req.To == "" || req.Amount <= 0 {
		s.sendError(w, http.StatusBadRequest, "From, To, and Amount are required")
		return
	}

	txID, err := s.engine.SendTransaction(req.From, req.To, req.Amount)
	if err != nil {
		s.sendError(w, http.StatusBadRequest, fmt.Sprintf("Failed to send transaction: %v", err))
		return
	}

	s.sendJSON(w, map[string]interface{}{
		"transaction_id": txID,
		"message":        "Transaction added to mempool",
	})
}

// MineBlockRequest ブロックマイニングリクエスト
type MineBlockRequest struct {
	MinerAddress string `json:"miner_address"`
}

// handleMineBlock ブロックをマイニング
func (s *APIServer) handleMineBlock(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req MineBlockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, fmt.Sprintf("Invalid request: %v", err))
		return
	}

	if req.MinerAddress == "" {
		s.sendError(w, http.StatusBadRequest, "Miner address is required")
		return
	}

	result, err := s.engine.MineBlock(req.MinerAddress)
	if err != nil {
		s.sendError(w, http.StatusInternalServerError, fmt.Sprintf("Failed to mine block: %v", err))
		return
	}

	s.sendJSON(w, map[string]interface{}{
		"message":  "Block mined successfully",
		"hash":     crypto.HexEncode(result.Hash),
		"nonce":    result.Nonce,
		"duration": result.Duration.String(),
		"attempts": result.Attempts,
	})
}

// handleStartAutoMining 自動マイニングを開始
func (s *APIServer) handleStartAutoMining(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	var req MineBlockRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		s.sendError(w, http.StatusBadRequest, fmt.Sprintf("Invalid request: %v", err))
		return
	}

	if req.MinerAddress == "" {
		s.sendError(w, http.StatusBadRequest, "Miner address is required")
		return
	}

	if err := s.engine.StartAutoMining(s.ctx, req.MinerAddress); err != nil {
		s.sendError(w, http.StatusConflict, fmt.Sprintf("Failed to start auto mining: %v", err))
		return
	}

	s.sendJSON(w, map[string]interface{}{
		"message": "Auto mining started",
	})
}

// handleStopAutoMining 自動マイニングを停止
func (s *APIServer) handleStopAutoMining(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	s.engine.StopAutoMining()

	s.sendJSON(w, map[string]interface{}{
		"message": "Auto mining stopped",
	})
}

// handleValidateChain チェーンの整合性を検証
func (s *APIServer) handleValidateChain(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		s.sendError(w, http.StatusMethodNotAllowed, "Method not allowed")
		return
	}

	if err := s.engine.ValidateChain(); err != nil {
		s.sendError(w, http.StatusInternalServerError, fmt.Sprintf("Chain validation failed: %v", err))
		return
	}

	s.sendJSON(w, map[string]interface{}{
		"message": "Chain validation successful",
		"valid":   true,
	})
}

// sendJSON JSON レスポンスを送信
func (s *APIServer) sendJSON(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)

	if err := json.NewEncoder(w).Encode(data); err != nil {
		log.Printf("Failed to encode JSON response: %v", err)
	}
}

// sendError エラーレスポンスを送信
func (s *APIServer) sendError(w http.ResponseWriter, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)

	response := map[string]interface{}{
		"error":   true,
		"message": message,
		"status":  status,
	}

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode error response: %v", err)
	}
}

// Start APIサーバーを開始
func (s *APIServer) Start() error {
	log.Printf("🌐 APIサーバーを開始: %s", s.server.Addr)

	if err := s.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		return fmt.Errorf("failed to start server: %w", err)
	}

	return nil
}

// Stop APIサーバーを停止
func (s *APIServer) Stop() error {
	log.Printf("🛑 APIサーバーを停止中...")

	// 自動マイニングを停止
	s.cancel()

	// サーバーを優雅に停止
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := s.server.Shutdown(ctx); err != nil {
		return fmt.Errorf("failed to shutdown server: %w", err)
	}

	log.Printf("✅ APIサーバーを停止しました")
	return nil
}
