package engine

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/blockchain"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/storage"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/wallet"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// BlockchainEngine メインのブロックチェーンエンジン
type BlockchainEngine struct {
	db         *storage.Database
	utxoSet    *blockchain.UTXOSet
	miner      *blockchain.Miner
	walletMgr  *wallet.WalletManager
	mempool    *Mempool
	mu         sync.RWMutex
	isRunning  bool
	blockTime  time.Duration // ブロック生成間隔
	difficulty int           // マイニング難易度
}

// Mempool 未確認トランザクションプール
type Mempool struct {
	transactions map[string]*blockchain.Transaction
	mu           sync.RWMutex
}

// NewMempool 新しいメンプールを作成
func NewMempool() *Mempool {
	return &Mempool{
		transactions: make(map[string]*blockchain.Transaction),
	}
}

// AddTransaction メンプールにトランザクションを追加
func (mp *Mempool) AddTransaction(tx *blockchain.Transaction) error {
	mp.mu.Lock()
	defer mp.mu.Unlock()

	txID := tx.Hash()
	if _, exists := mp.transactions[txID]; exists {
		return fmt.Errorf("transaction already exists in mempool: %s", txID)
	}

	mp.transactions[txID] = tx
	log.Printf("📝 トランザクション %s をメンプールに追加", txID[:16])
	return nil
}

// GetTransactions メンプールからトランザクションを取得
func (mp *Mempool) GetTransactions(limit int) []*blockchain.Transaction {
	mp.mu.RLock()
	defer mp.mu.RUnlock()

	transactions := make([]*blockchain.Transaction, 0, limit)
	count := 0

	for _, tx := range mp.transactions {
		if count >= limit {
			break
		}
		transactions = append(transactions, tx)
		count++
	}

	return transactions
}

// RemoveTransaction メンプールからトランザクションを削除
func (mp *Mempool) RemoveTransaction(txID string) {
	mp.mu.Lock()
	defer mp.mu.Unlock()
	delete(mp.transactions, txID)
}

// Size メンプール内のトランザクション数を取得
func (mp *Mempool) Size() int {
	mp.mu.RLock()
	defer mp.mu.RUnlock()
	return len(mp.transactions)
}

// NewBlockchainEngine 新しいブロックチェーンエンジンを作成
func NewBlockchainEngine(dbPath string) (*BlockchainEngine, error) {
	// データベース初期化
	db, err := storage.NewDatabase(dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize database: %w", err)
	}

	// UTXOセット復元
	utxoSet, err := db.GetUTXOSet()
	if err != nil {
		return nil, fmt.Errorf("failed to load UTXO set: %w", err)
	}

	// マイナー初期化
	miner := blockchain.NewMiner(4) // 初期難易度4

	// ウォレット管理システム初期化
	walletMgr := wallet.NewWalletManager()

	// メンプール初期化
	mempool := NewMempool()

	engine := &BlockchainEngine{
		db:         db,
		utxoSet:    utxoSet,
		miner:      miner,
		walletMgr:  walletMgr,
		mempool:    mempool,
		blockTime:  time.Second * 10, // 10秒間隔
		difficulty: 4,                // 4桁の先頭ゼロ
	}

	// Genesisブロックが存在しない場合は作成
	if err := engine.initializeGenesis(); err != nil {
		return nil, fmt.Errorf("failed to initialize genesis: %w", err)
	}

	log.Printf("🚀 ブロックチェーンエンジンを初期化しました")
	return engine, nil
}

// initializeGenesis Genesisブロックを初期化
func (e *BlockchainEngine) initializeGenesis() error {
	// 既存ブロックをチェック
	height, err := e.db.GetBlockHeight()
	if err != nil {
		return fmt.Errorf("failed to get block height: %w", err)
	}

	if height >= 0 {
		log.Printf("📦 既存のブロックチェーンを検出 (高さ: %d)", height)
		return nil
	}

	log.Printf("🌱 Genesisブロックを作成中...")

	// システム用ウォレットを作成
	systemAddress, err := e.walletMgr.CreateWallet()
	if err != nil {
		return fmt.Errorf("failed to create system wallet: %w", err)
	}

	systemWallet, err := e.walletMgr.GetWallet(systemAddress)
	if err != nil {
		return fmt.Errorf("failed to get system wallet: %w", err)
	}

	// Genesisコインベーストランザクション作成
	pubKeyHash := crypto.HashPubKey(systemWallet.PublicKey)
	genesisCoinbase := blockchain.CreateCoinbaseTransaction(pubKeyHash, "Genesis Block - Bitcoin Go Implementation")

	// Genesisブロック作成
	genesisBlock := blockchain.NewGenesisBlock(genesisCoinbase)

	// マイニング実行
	log.Printf("⛏️  Genesisブロックをマイニング中...")
	result, err := e.miner.Mine(genesisBlock)
	if err != nil {
		return fmt.Errorf("failed to mine genesis block: %w", err)
	}

	// 結果をブロックに適用
	genesisBlock.Nonce = result.Nonce
	genesisBlock.Hash = result.Hash

	// データベースに保存
	if err := e.db.SaveBlock(genesisBlock); err != nil {
		return fmt.Errorf("failed to save genesis block: %w", err)
	}

	// UTXOセットを更新
	for i, output := range genesisCoinbase.Outputs {
		utxo := &blockchain.UTXO{
			TxID:   genesisCoinbase.Hash(),
			OutIdx: i,
			Output: output,
			Height: 0,
		}
		e.utxoSet.AddUTXO(utxo)
		if err := e.db.SaveUTXO(utxo); err != nil {
			return fmt.Errorf("failed to save genesis UTXO: %w", err)
		}
	}

	log.Printf("✅ Genesisブロックを作成完了")
	log.Printf("   📝 ブロックハッシュ: %s", crypto.HexEncode(result.Hash)[:16])
	log.Printf("   🎯 ナンス: %d", result.Nonce)
	log.Printf("   ⏱️  マイニング時間: %v", result.Duration)
	log.Printf("   💰 Genesis報酬ウォレット: %s", systemAddress)
	log.Printf("   💎 Genesis報酬: %d satoshi", blockchain.CoinbaseAmount)

	return nil
}

// CreateWallet 新しいウォレットを作成
func (e *BlockchainEngine) CreateWallet() (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	address, err := e.walletMgr.CreateWallet()
	if err != nil {
		return "", fmt.Errorf("failed to create wallet: %w", err)
	}

	log.Printf("💳 新しいウォレットを作成: %s", address)
	return address, nil
}

// GetBalance 指定アドレスの残高を取得
func (e *BlockchainEngine) GetBalance(address string) (int64, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	// アドレスから公開鍵ハッシュに変換
	pubKeyHash, err := wallet.AddressToPubKeyHash(address)
	if err != nil {
		return 0, fmt.Errorf("failed to convert address to pubkey hash: %w", err)
	}

	balance := e.utxoSet.GetBalance(pubKeyHash)
	return balance, nil
}

// SendTransaction トランザクションを送信
func (e *BlockchainEngine) SendTransaction(from, to string, amount int64) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	// 送信者ウォレットを取得
	fromWallet, err := e.walletMgr.GetWallet(from)
	if err != nil {
		return "", fmt.Errorf("failed to get sender wallet: %w", err)
	}

	// 受信者の公開鍵ハッシュを取得
	toPubKeyHash, err := wallet.AddressToPubKeyHash(to)
	if err != nil {
		return "", fmt.Errorf("failed to convert recipient address: %w", err)
	}

	// 送信者の公開鍵ハッシュを取得
	fromPubKeyHash := crypto.HashPubKey(fromWallet.PublicKey)

	// トランザクションビルダーを作成
	txBuilder := blockchain.NewTransactionBuilder(e.utxoSet)

	// トランザクション作成
	tx, err := txBuilder.CreateTransaction(fromPubKeyHash, toPubKeyHash, amount, fromWallet.PrivateKey)
	if err != nil {
		return "", fmt.Errorf("failed to create transaction: %w", err)
	}

	// トランザクションに署名
	if err := fromWallet.SignTransaction(tx, nil); err != nil {
		return "", fmt.Errorf("failed to sign transaction: %w", err)
	}

	// メンプールに追加
	if err := e.mempool.AddTransaction(tx); err != nil {
		return "", fmt.Errorf("failed to add transaction to mempool: %w", err)
	}

	txID := tx.Hash()
	log.Printf("💸 トランザクション送信: %s → %s (%d satoshi)", from[:16], to[:16], amount)
	log.Printf("   📝 トランザクションID: %s", txID[:16])

	return txID, nil
}

// MineBlock 新しいブロックをマイニング
func (e *BlockchainEngine) MineBlock(minerAddress string) (*blockchain.MiningResult, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	// マイナーウォレットを取得
	minerWallet, err := e.walletMgr.GetWallet(minerAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to get miner wallet: %w", err)
	}

	// 現在のブロック高を取得
	currentHeight, err := e.db.GetBlockHeight()
	if err != nil {
		return nil, fmt.Errorf("failed to get current height: %w", err)
	}

	// 最新ブロックを取得
	latestBlock, err := e.db.GetLatestBlock()
	if err != nil {
		return nil, fmt.Errorf("failed to get latest block: %w", err)
	}

	// メンプールからトランザクションを取得
	memoryTxs := e.mempool.GetTransactions(10) // 最大10トランザクション

	// コインベーストランザクション作成
	minerPubKeyHash := crypto.HashPubKey(minerWallet.PublicKey)
	coinbase := blockchain.CreateCoinbaseTransaction(minerPubKeyHash,
		fmt.Sprintf("Block %d mined by %s", currentHeight+1, minerAddress[:16]))

	// ブロックに含めるトランザクションリスト
	transactions := []*blockchain.Transaction{coinbase}
	transactions = append(transactions, memoryTxs...)

	// 新しいブロック作成
	newBlock := blockchain.NewBlock(transactions, latestBlock.Hash, currentHeight+1)

	log.Printf("⛏️  ブロック %d をマイニング中... (トランザクション数: %d)",
		currentHeight+1, len(transactions))

	// マイニング実行
	result, err := e.miner.Mine(newBlock)
	if err != nil {
		return nil, fmt.Errorf("failed to mine block: %w", err)
	}

	// 結果をブロックに適用
	newBlock.Nonce = result.Nonce
	newBlock.Hash = result.Hash

	// ブロックをデータベースに保存
	if err := e.db.SaveBlock(newBlock); err != nil {
		return nil, fmt.Errorf("failed to save block: %w", err)
	}

	// UTXOセットを更新
	for _, tx := range transactions {
		if err := e.utxoSet.ProcessTransaction(tx, currentHeight+1); err != nil {
			log.Printf("⚠️  UTXO処理エラー: %v", err)
		}

		// 新しいUTXOをデータベースに保存
		for i, output := range tx.Outputs {
			utxo := &blockchain.UTXO{
				TxID:   tx.Hash(),
				OutIdx: i,
				Output: output,
				Height: currentHeight + 1,
			}
			if err := e.db.SaveUTXO(utxo); err != nil {
				log.Printf("⚠️  UTXO保存エラー: %v", err)
			}
		}

		// 消費されたUTXOをデータベースから削除
		for _, input := range tx.Inputs {
			if err := e.db.DeleteUTXO(crypto.HexEncode(input.Txid), input.Vout); err != nil {
				log.Printf("⚠️  UTXO削除エラー: %v", err)
			}
		}
	}

	// 確認済みトランザクションをメンプールから削除
	for _, tx := range memoryTxs {
		e.mempool.RemoveTransaction(tx.Hash())
	}

	log.Printf("✅ ブロック %d マイニング完了", currentHeight+1)
	log.Printf("   📝 ブロックハッシュ: %s", crypto.HexEncode(result.Hash)[:16])
	log.Printf("   🎯 ナンス: %d", result.Nonce)
	log.Printf("   ⏱️  マイニング時間: %v", result.Duration)
	log.Printf("   💰 マイナー報酬: %d satoshi", blockchain.CoinbaseAmount)

	return result, nil
}

// GetBlockchainInfo ブロックチェーン情報を取得
func (e *BlockchainEngine) GetBlockchainInfo() (*BlockchainInfo, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	height, err := e.db.GetBlockHeight()
	if err != nil {
		return nil, fmt.Errorf("failed to get block height: %w", err)
	}

	stats, err := e.db.GetChainStats()
	if err != nil {
		return nil, fmt.Errorf("failed to get chain stats: %w", err)
	}

	return &BlockchainInfo{
		Height:            height,
		TotalBlocks:       stats.TotalBlocks,
		TotalTransactions: stats.TotalTransactions,
		TotalUTXOs:        stats.TotalUTXOs,
		TotalValue:        stats.TotalValue,
		AverageBlockSize:  stats.AverageBlockSize,
		ChainSize:         stats.ChainSize,
		MempoolSize:       e.mempool.Size(),
		Difficulty:        e.difficulty,
		IsRunning:         e.isRunning,
	}, nil
}

// GetBlock 指定されたハッシュのブロックを取得
func (e *BlockchainEngine) GetBlock(hash string) (*blockchain.Block, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	return e.db.GetBlock(hash)
}

// GetBlockByHeight 指定された高さのブロックを取得
func (e *BlockchainEngine) GetBlockByHeight(height int64) (*blockchain.Block, error) {
	e.mu.RLock()
	defer e.mu.RUnlock()

	return e.db.GetBlockByHeight(height)
}

// GetWallets 管理されているウォレット一覧を取得
func (e *BlockchainEngine) GetWallets() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	return e.walletMgr.GetAddresses()
}

// ValidateChain ブロックチェーンの整合性を検証
func (e *BlockchainEngine) ValidateChain() error {
	e.mu.RLock()
	defer e.mu.RUnlock()

	log.Printf("🔍 ブロックチェーンの整合性を検証中...")

	if err := e.db.ValidateChain(); err != nil {
		return fmt.Errorf("chain validation failed: %w", err)
	}

	log.Printf("✅ ブロックチェーンの整合性確認完了")
	return nil
}

// StartAutoMining 自動マイニングを開始
func (e *BlockchainEngine) StartAutoMining(ctx context.Context, minerAddress string) error {
	e.mu.Lock()
	if e.isRunning {
		e.mu.Unlock()
		return fmt.Errorf("auto mining is already running")
	}
	e.isRunning = true
	e.mu.Unlock()

	log.Printf("🔄 自動マイニングを開始 (間隔: %v)", e.blockTime)

	go func() {
		ticker := time.NewTicker(e.blockTime)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				e.mu.Lock()
				e.isRunning = false
				e.mu.Unlock()
				log.Printf("⏹️  自動マイニングを停止")
				return

			case <-ticker.C:
				// メンプールにトランザクションがある場合のみマイニング
				if e.mempool.Size() > 0 {
					if _, err := e.MineBlock(minerAddress); err != nil {
						log.Printf("❌ 自動マイニングエラー: %v", err)
					}
				}
			}
		}
	}()

	return nil
}

// StopAutoMining 自動マイニングを停止
func (e *BlockchainEngine) StopAutoMining() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.isRunning = false
}

// Close エンジンを終了
func (e *BlockchainEngine) Close() error {
	e.mu.Lock()
	defer e.mu.Unlock()

	e.isRunning = false

	if e.db != nil {
		if err := e.db.Close(); err != nil {
			return fmt.Errorf("failed to close database: %w", err)
		}
	}

	log.Printf("🔚 ブロックチェーンエンジンを終了しました")
	return nil
}

// BlockchainInfo ブロックチェーン情報構造体
type BlockchainInfo struct {
	Height            int64   `json:"height"`
	TotalBlocks       int64   `json:"total_blocks"`
	TotalTransactions int64   `json:"total_transactions"`
	TotalUTXOs        int64   `json:"total_utxos"`
	TotalValue        int64   `json:"total_value"`
	AverageBlockSize  float64 `json:"average_block_size"`
	ChainSize         int64   `json:"chain_size"`
	MempoolSize       int     `json:"mempool_size"`
	Difficulty        int     `json:"difficulty"`
	IsRunning         bool    `json:"is_running"`
}

// BlockSummary ブロック概要情報構造体
type BlockSummary struct {
	Height       int64  `json:"height"`
	Hash         string `json:"hash"`
	PrevHash     string `json:"prev_hash"`
	Timestamp    int64  `json:"timestamp"`
	Nonce        int64  `json:"nonce"`
	Transactions int    `json:"transactions"`
}
