package storage

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/blockchain"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/wallet"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// テスト用のデータベースを作成
func createTestDB(t *testing.T) (*Database, string) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to create test database: %v", err)
	}

	return db, dbPath
}

func TestNewDatabase(t *testing.T) {
	tempDir := t.TempDir()
	dbPath := filepath.Join(tempDir, "test.db")

	db, err := NewDatabase(dbPath)
	if err != nil {
		t.Fatalf("Failed to create database: %v", err)
	}
	defer db.Close()

	// データベースファイルが作成されているかチェック
	if _, err := os.Stat(dbPath); os.IsNotExist(err) {
		t.Error("Database file was not created")
	}

	// パスが正しく設定されているかチェック
	if db.GetDatabasePath() != dbPath {
		t.Errorf("Expected database path %s, got %s", dbPath, db.GetDatabasePath())
	}

	t.Logf("✓ データベース作成テスト成功")
}

func TestSaveAndGetBlock(t *testing.T) {
	db, _ := createTestDB(t)
	defer db.Close()

	// テスト用ウォレットとコインベーストランザクション作成
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	pubKeyHash := crypto.HashPubKey(w.PublicKey)
	coinbase := blockchain.CreateCoinbaseTransaction(pubKeyHash, "Genesis coinbase")

	// Genesisブロックを作成
	genesisBlock := blockchain.NewGenesisBlock(coinbase)
	genesisBlock.Hash = []byte("genesis_hash_test")

	// ブロックを保存
	err = db.SaveBlock(genesisBlock)
	if err != nil {
		t.Fatalf("Failed to save genesis block: %v", err)
	}

	// ハッシュでブロックを取得
	retrievedBlock, err := db.GetBlock(string(genesisBlock.Hash))
	if err != nil {
		t.Fatalf("Failed to get block by hash: %v", err)
	}

	// ブロックデータが正しく保存・取得されているかチェック
	if retrievedBlock.Height != genesisBlock.Height {
		t.Errorf("Expected height %d, got %d", genesisBlock.Height, retrievedBlock.Height)
	}

	// 高さでブロックを取得
	blockByHeight, err := db.GetBlockByHeight(0)
	if err != nil {
		t.Fatalf("Failed to get block by height: %v", err)
	}

	if blockByHeight.Height != 0 {
		t.Errorf("Expected height 0, got %d", blockByHeight.Height)
	}

	t.Logf("✓ ブロック保存・取得テスト成功")
	t.Logf("  - ブロック高: %d", retrievedBlock.Height)
	t.Logf("  - トランザクション数: %d", len(retrievedBlock.Transactions))
}

func TestUTXOOperations(t *testing.T) {
	db, _ := createTestDB(t)
	defer db.Close()

	// テスト用ウォレット作成
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// テスト用UTXO作成
	pubKeyHash := crypto.HashPubKey(w.PublicKey)
	utxo := &blockchain.UTXO{
		TxID:   "test_tx_001",
		OutIdx: 0,
		Output: blockchain.TxOutput{
			Value:      1000,
			PubKeyHash: pubKeyHash,
		},
		Height: 1,
	}

	// UTXO保存
	err = db.SaveUTXO(utxo)
	if err != nil {
		t.Fatalf("Failed to save UTXO: %v", err)
	}

	// アドレス別UTXO取得
	utxos, err := db.GetUTXOsByAddress(pubKeyHash)
	if err != nil {
		t.Fatalf("Failed to get UTXOs by address: %v", err)
	}

	if len(utxos) != 1 {
		t.Errorf("Expected 1 UTXO, got %d", len(utxos))
	}

	if utxos[0].TxID != "test_tx_001" {
		t.Errorf("Expected UTXO TxID 'test_tx_001', got %s", utxos[0].TxID)
	}

	// UTXO削除
	err = db.DeleteUTXO("test_tx_001", 0)
	if err != nil {
		t.Fatalf("Failed to delete UTXO: %v", err)
	}

	// 削除後の確認
	utxos, err = db.GetUTXOsByAddress(pubKeyHash)
	if err != nil {
		t.Fatalf("Failed to get UTXOs by address after deletion: %v", err)
	}

	if len(utxos) != 0 {
		t.Errorf("Expected 0 UTXOs after deletion, got %d", len(utxos))
	}

	t.Logf("✓ UTXO操作テスト成功")
}

func TestGetChainStats(t *testing.T) {
	db, _ := createTestDB(t)
	defer db.Close()

	// テスト用ウォレット作成
	w, err := wallet.NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	pubKeyHash := crypto.HashPubKey(w.PublicKey)
	coinbase := blockchain.CreateCoinbaseTransaction(pubKeyHash, "Genesis coinbase")

	// ブロック作成
	genesisBlock := blockchain.NewGenesisBlock(coinbase)
	genesisBlock.Hash = []byte("genesis")
	err = db.SaveBlock(genesisBlock)
	if err != nil {
		t.Fatalf("Failed to save genesis block: %v", err)
	}

	// 統計を取得
	stats, err := db.GetChainStats()
	if err != nil {
		t.Fatalf("Failed to get chain stats: %v", err)
	}

	if stats.TotalBlocks != 1 {
		t.Errorf("Expected 1 block, got %d", stats.TotalBlocks)
	}

	t.Logf("✓ チェーン統計テスト成功")
	t.Logf("  - ブロック数: %d", stats.TotalBlocks)
	t.Logf("  - トランザクション数: %d", stats.TotalTransactions)
}

func TestErrorHandling(t *testing.T) {
	db, _ := createTestDB(t)
	defer db.Close()

	// 存在しないブロックを取得
	_, err := db.GetBlock("nonexistent_hash")
	if err == nil {
		t.Error("Expected error for nonexistent block, got nil")
	}

	// 存在しない高さのブロックを取得
	_, err = db.GetBlockByHeight(999)
	if err == nil {
		t.Error("Expected error for nonexistent block height, got nil")
	}

	t.Logf("✓ エラーハンドリングテスト成功")
}
