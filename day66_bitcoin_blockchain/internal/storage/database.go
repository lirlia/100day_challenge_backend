package storage

import (
	"database/sql"
	"encoding/json"
	"fmt"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/blockchain"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"

	_ "github.com/mattn/go-sqlite3"
)

// Database ブロックチェーンデータベース管理
type Database struct {
	db     *sql.DB
	dbPath string
}

// BlockchainDB ブロックチェーン永続化インターface
type BlockchainDB interface {
	SaveBlock(block *blockchain.Block) error
	GetBlock(hash string) (*blockchain.Block, error)
	GetBlockByHeight(height int64) (*blockchain.Block, error)
	GetLatestBlock() (*blockchain.Block, error)
	GetBlockchain() ([]*blockchain.Block, error)
	GetBlockHeight() (int64, error)
	SaveUTXO(utxo *blockchain.UTXO) error
	DeleteUTXO(txID string, outIdx int) error
	GetUTXOSet() (*blockchain.UTXOSet, error)
	GetUTXOsByAddress(pubKeyHash []byte) ([]*blockchain.UTXO, error)
	SaveTransaction(tx *blockchain.Transaction, blockHeight int64) error
	GetTransaction(txID string) (*blockchain.Transaction, error)
	ValidateChain() error
	GetChainStats() (*ChainStats, error)
	Close() error
}

// ChainStats ブロックチェーン統計情報
type ChainStats struct {
	TotalBlocks       int64   `json:"total_blocks"`
	TotalTransactions int64   `json:"total_transactions"`
	TotalUTXOs        int64   `json:"total_utxos"`
	TotalValue        int64   `json:"total_value"`
	AverageBlockSize  float64 `json:"average_block_size"`
	ChainSize         int64   `json:"chain_size"`
}

// NewDatabase 新しいデータベース接続を作成
func NewDatabase(dbPath string) (*Database, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// WALモードを有効にして並行性を向上
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("failed to set WAL mode: %w", err)
	}

	database := &Database{
		db:     db,
		dbPath: dbPath,
	}

	// スキーマを初期化
	if err := database.initSchema(); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return database, nil
}

// initSchema データベーススキーマを初期化
func (d *Database) initSchema() error {
	// ブロックテーブル
	blockSchema := `
	CREATE TABLE IF NOT EXISTS blocks (
		hash TEXT PRIMARY KEY,
		height INTEGER UNIQUE NOT NULL,
		timestamp INTEGER NOT NULL,
		prev_block_hash TEXT NOT NULL,
		merkle_root TEXT NOT NULL,
		nonce INTEGER NOT NULL,
		tx_count INTEGER NOT NULL,
		size INTEGER NOT NULL,
		data TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_blocks_height ON blocks(height);
	CREATE INDEX IF NOT EXISTS idx_blocks_timestamp ON blocks(timestamp);
	CREATE INDEX IF NOT EXISTS idx_blocks_prev_hash ON blocks(prev_block_hash);
	`

	// トランザクションテーブル
	transactionSchema := `
	CREATE TABLE IF NOT EXISTS transactions (
		id TEXT PRIMARY KEY,
		block_hash TEXT NOT NULL,
		block_height INTEGER NOT NULL,
		input_count INTEGER NOT NULL,
		output_count INTEGER NOT NULL,
		is_coinbase BOOLEAN NOT NULL,
		data TEXT NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_transactions_block_hash ON transactions(block_hash);
	CREATE INDEX IF NOT EXISTS idx_transactions_block_height ON transactions(block_height);
	CREATE INDEX IF NOT EXISTS idx_transactions_coinbase ON transactions(is_coinbase);
	`

	// UTXOテーブル
	utxoSchema := `
	CREATE TABLE IF NOT EXISTS utxos (
		tx_id TEXT NOT NULL,
		out_idx INTEGER NOT NULL,
		value INTEGER NOT NULL,
		pub_key_hash TEXT NOT NULL,
		block_height INTEGER NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		PRIMARY KEY (tx_id, out_idx)
	);
	CREATE INDEX IF NOT EXISTS idx_utxos_pub_key_hash ON utxos(pub_key_hash);
	CREATE INDEX IF NOT EXISTS idx_utxos_block_height ON utxos(block_height);
	CREATE INDEX IF NOT EXISTS idx_utxos_value ON utxos(value);
	`

	// チェーン情報テーブル
	chainInfoSchema := `
	CREATE TABLE IF NOT EXISTS chain_info (
		key TEXT PRIMARY KEY,
		value TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`

	schemas := []string{blockSchema, transactionSchema, utxoSchema, chainInfoSchema}

	for _, schema := range schemas {
		if _, err := d.db.Exec(schema); err != nil {
			return fmt.Errorf("failed to create schema: %w", err)
		}
	}

	return nil
}

// SaveBlock ブロックをデータベースに保存
func (d *Database) SaveBlock(block *blockchain.Block) error {
	tx, err := d.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// ブロックデータをJSONシリアライズ
	blockData, err := json.Marshal(block)
	if err != nil {
		return fmt.Errorf("failed to marshal block: %w", err)
	}

	// ブロックを保存
	_, err = tx.Exec(`
		INSERT INTO blocks (hash, height, timestamp, prev_block_hash, merkle_root, nonce, tx_count, size, data)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, string(block.Hash), block.Height, block.Timestamp, crypto.HexEncode(block.PrevBlockHash),
		crypto.HexEncode(block.MerkleRoot), block.Nonce, len(block.Transactions), len(blockData), string(blockData))
	if err != nil {
		return fmt.Errorf("failed to insert block: %w", err)
	}

	// トランザクションを保存
	for _, transaction := range block.Transactions {
		if err := d.saveTransactionInTx(tx, transaction, block.Hash, block.Height); err != nil {
			return fmt.Errorf("failed to save transaction: %w", err)
		}
	}

	return tx.Commit()
}

// saveTransactionInTx トランザクション内でトランザクションを保存
func (d *Database) saveTransactionInTx(tx *sql.Tx, transaction *blockchain.Transaction, blockHash []byte, blockHeight int64) error {
	txData, err := json.Marshal(transaction)
	if err != nil {
		return fmt.Errorf("failed to marshal transaction: %w", err)
	}

	txID := transaction.Hash()
	_, err = tx.Exec(`
		INSERT OR REPLACE INTO transactions (id, block_hash, block_height, input_count, output_count, is_coinbase, data)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`, txID, string(blockHash), blockHeight, len(transaction.Inputs), len(transaction.Outputs), transaction.IsCoinbase(), string(txData))

	return err
}

// GetBlock ハッシュでブロックを取得
func (d *Database) GetBlock(hash string) (*blockchain.Block, error) {
	var blockData string
	err := d.db.QueryRow("SELECT data FROM blocks WHERE hash = ?", hash).Scan(&blockData)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("block not found: %s", hash)
		}
		return nil, fmt.Errorf("failed to query block: %w", err)
	}

	var block blockchain.Block
	if err := json.Unmarshal([]byte(blockData), &block); err != nil {
		return nil, fmt.Errorf("failed to unmarshal block: %w", err)
	}

	return &block, nil
}

// GetBlockByHeight 高さでブロックを取得
func (d *Database) GetBlockByHeight(height int64) (*blockchain.Block, error) {
	var blockData string
	err := d.db.QueryRow("SELECT data FROM blocks WHERE height = ?", height).Scan(&blockData)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("block not found at height: %d", height)
		}
		return nil, fmt.Errorf("failed to query block by height: %w", err)
	}

	var block blockchain.Block
	if err := json.Unmarshal([]byte(blockData), &block); err != nil {
		return nil, fmt.Errorf("failed to unmarshal block: %w", err)
	}

	return &block, nil
}

// GetLatestBlock 最新ブロックを取得
func (d *Database) GetLatestBlock() (*blockchain.Block, error) {
	var blockData string
	err := d.db.QueryRow("SELECT data FROM blocks ORDER BY height DESC LIMIT 1").Scan(&blockData)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no blocks found")
		}
		return nil, fmt.Errorf("failed to query latest block: %w", err)
	}

	var block blockchain.Block
	if err := json.Unmarshal([]byte(blockData), &block); err != nil {
		return nil, fmt.Errorf("failed to unmarshal block: %w", err)
	}

	return &block, nil
}

// GetBlockchain 全ブロックチェーンを取得
func (d *Database) GetBlockchain() ([]*blockchain.Block, error) {
	rows, err := d.db.Query("SELECT data FROM blocks ORDER BY height ASC")
	if err != nil {
		return nil, fmt.Errorf("failed to query blockchain: %w", err)
	}
	defer rows.Close()

	var blocks []*blockchain.Block
	for rows.Next() {
		var blockData string
		if err := rows.Scan(&blockData); err != nil {
			return nil, fmt.Errorf("failed to scan block data: %w", err)
		}

		var block blockchain.Block
		if err := json.Unmarshal([]byte(blockData), &block); err != nil {
			return nil, fmt.Errorf("failed to unmarshal block: %w", err)
		}

		blocks = append(blocks, &block)
	}

	return blocks, rows.Err()
}

// GetBlockHeight 現在のブロック高を取得
func (d *Database) GetBlockHeight() (int64, error) {
	var height int64
	err := d.db.QueryRow("SELECT COALESCE(MAX(height), -1) FROM blocks").Scan(&height)
	if err != nil {
		return -1, fmt.Errorf("failed to get block height: %w", err)
	}
	return height, nil
}

// SaveUTXO UTXOを保存
func (d *Database) SaveUTXO(utxo *blockchain.UTXO) error {
	_, err := d.db.Exec(`
		INSERT OR REPLACE INTO utxos (tx_id, out_idx, value, pub_key_hash, block_height)
		VALUES (?, ?, ?, ?, ?)
	`, utxo.TxID, utxo.OutIdx, utxo.Output.Value, crypto.HexEncode(utxo.Output.PubKeyHash), utxo.Height)

	if err != nil {
		return fmt.Errorf("failed to save UTXO: %w", err)
	}

	return nil
}

// DeleteUTXO UTXOを削除（消費済みにする）
func (d *Database) DeleteUTXO(txID string, outIdx int) error {
	_, err := d.db.Exec("DELETE FROM utxos WHERE tx_id = ? AND out_idx = ?", txID, outIdx)
	if err != nil {
		return fmt.Errorf("failed to delete UTXO: %w", err)
	}
	return nil
}

// GetUTXOSet 全UTXOセットを取得
func (d *Database) GetUTXOSet() (*blockchain.UTXOSet, error) {
	rows, err := d.db.Query("SELECT tx_id, out_idx, value, pub_key_hash, block_height FROM utxos")
	if err != nil {
		return nil, fmt.Errorf("failed to query UTXOs: %w", err)
	}
	defer rows.Close()

	utxoSet := blockchain.NewUTXOSet()

	for rows.Next() {
		var txID string
		var outIdx int
		var value int64
		var pubKeyHashHex string
		var blockHeight int64

		if err := rows.Scan(&txID, &outIdx, &value, &pubKeyHashHex, &blockHeight); err != nil {
			return nil, fmt.Errorf("failed to scan UTXO: %w", err)
		}

		pubKeyHash, err := crypto.HexDecode(pubKeyHashHex)
		if err != nil {
			return nil, fmt.Errorf("failed to decode pub key hash: %w", err)
		}

		utxo := &blockchain.UTXO{
			TxID:   txID,
			OutIdx: outIdx,
			Output: blockchain.TxOutput{
				Value:      value,
				PubKeyHash: pubKeyHash,
			},
			Height: blockHeight,
		}

		utxoSet.AddUTXO(utxo)
	}

	return utxoSet, rows.Err()
}

// GetUTXOsByAddress アドレス用のUTXOを取得
func (d *Database) GetUTXOsByAddress(pubKeyHash []byte) ([]*blockchain.UTXO, error) {
	pubKeyHashHex := crypto.HexEncode(pubKeyHash)

	rows, err := d.db.Query(`
		SELECT tx_id, out_idx, value, block_height
		FROM utxos WHERE pub_key_hash = ?
	`, pubKeyHashHex)
	if err != nil {
		return nil, fmt.Errorf("failed to query UTXOs by address: %w", err)
	}
	defer rows.Close()

	var utxos []*blockchain.UTXO

	for rows.Next() {
		var txID string
		var outIdx int
		var value int64
		var blockHeight int64

		if err := rows.Scan(&txID, &outIdx, &value, &blockHeight); err != nil {
			return nil, fmt.Errorf("failed to scan UTXO: %w", err)
		}

		utxo := &blockchain.UTXO{
			TxID:   txID,
			OutIdx: outIdx,
			Output: blockchain.TxOutput{
				Value:      value,
				PubKeyHash: pubKeyHash,
			},
			Height: blockHeight,
		}

		utxos = append(utxos, utxo)
	}

	return utxos, rows.Err()
}

// SaveTransaction トランザクションを保存
func (d *Database) SaveTransaction(tx *blockchain.Transaction, blockHeight int64) error {
	dbTx, err := d.db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer dbTx.Rollback()

	// 単独のトランザクション保存の場合はダミーのブロックハッシュを使用
	if err := d.saveTransactionInTx(dbTx, tx, []byte("standalone"), blockHeight); err != nil {
		return err
	}

	return dbTx.Commit()
}

// GetTransaction トランザクションを取得
func (d *Database) GetTransaction(txID string) (*blockchain.Transaction, error) {
	var txData string
	err := d.db.QueryRow("SELECT data FROM transactions WHERE id = ?", txID).Scan(&txData)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("transaction not found: %s", txID)
		}
		return nil, fmt.Errorf("failed to query transaction: %w", err)
	}

	var tx blockchain.Transaction
	if err := json.Unmarshal([]byte(txData), &tx); err != nil {
		return nil, fmt.Errorf("failed to unmarshal transaction: %w", err)
	}

	return &tx, nil
}

// ValidateChain ブロックチェーンの整合性を検証
func (d *Database) ValidateChain() error {
	blocks, err := d.GetBlockchain()
	if err != nil {
		return fmt.Errorf("failed to get blockchain: %w", err)
	}

	if len(blocks) == 0 {
		return nil // 空のチェーンは有効
	}

	// Genesisブロックの検証
	if blocks[0].Height != 0 {
		return fmt.Errorf("genesis block height should be 0, got %d", blocks[0].Height)
	}

	// 各ブロックの検証
	for i := 1; i < len(blocks); i++ {
		currentBlock := blocks[i]
		prevBlock := blocks[i-1]

		// 高さの連続性チェック
		if currentBlock.Height != prevBlock.Height+1 {
			return fmt.Errorf("invalid block height: expected %d, got %d",
				prevBlock.Height+1, currentBlock.Height)
		}

		// 前ブロックハッシュのチェック
		if crypto.HexEncode(currentBlock.PrevBlockHash) != crypto.HexEncode(prevBlock.Hash) {
			return fmt.Errorf("invalid previous block hash at height %d", currentBlock.Height)
		}

		// ブロックハッシュの検証
		valid := currentBlock.Validate()
		if !valid {
			return fmt.Errorf("invalid block at height %d", currentBlock.Height)
		}

		// タイムスタンプの順序チェック
		if currentBlock.Timestamp < prevBlock.Timestamp {
			return fmt.Errorf("invalid timestamp order at height %d", currentBlock.Height)
		}
	}

	return nil
}

// GetChainStats チェーン統計を取得
func (d *Database) GetChainStats() (*ChainStats, error) {
	stats := &ChainStats{}

	// ブロック数
	err := d.db.QueryRow("SELECT COUNT(*) FROM blocks").Scan(&stats.TotalBlocks)
	if err != nil {
		return nil, fmt.Errorf("failed to get block count: %w", err)
	}

	// トランザクション数
	err = d.db.QueryRow("SELECT COUNT(*) FROM transactions").Scan(&stats.TotalTransactions)
	if err != nil {
		return nil, fmt.Errorf("failed to get transaction count: %w", err)
	}

	// UTXO数と総価値
	err = d.db.QueryRow("SELECT COUNT(*), COALESCE(SUM(value), 0) FROM utxos").Scan(&stats.TotalUTXOs, &stats.TotalValue)
	if err != nil {
		return nil, fmt.Errorf("failed to get UTXO stats: %w", err)
	}

	// 平均ブロックサイズとチェーンサイズ
	err = d.db.QueryRow("SELECT COALESCE(AVG(size), 0), COALESCE(SUM(size), 0) FROM blocks").Scan(&stats.AverageBlockSize, &stats.ChainSize)
	if err != nil {
		return nil, fmt.Errorf("failed to get size stats: %w", err)
	}

	return stats, nil
}

// Close データベース接続を閉じる
func (d *Database) Close() error {
	if d.db != nil {
		return d.db.Close()
	}
	return nil
}

// GetDatabasePath データベースパスを取得
func (d *Database) GetDatabasePath() string {
	return d.dbPath
}

// Vacuum データベースの最適化
func (d *Database) Vacuum() error {
	_, err := d.db.Exec("VACUUM")
	return err
}

// GetDatabaseSize データベースサイズを取得
func (d *Database) GetDatabaseSize() (int64, error) {
	var pageCount, pageSize int64

	if err := d.db.QueryRow("PRAGMA page_count").Scan(&pageCount); err != nil {
		return 0, err
	}

	if err := d.db.QueryRow("PRAGMA page_size").Scan(&pageSize); err != nil {
		return 0, err
	}

	return pageCount * pageSize, nil
}
