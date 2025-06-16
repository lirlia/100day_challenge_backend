package blockchain

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// Block はブロックチェーンの個々のブロックを表す
type Block struct {
	Timestamp     int64          // ブロック作成時刻（UNIX タイムスタンプ）
	Transactions  []*Transaction // このブロックに含まれるトランザクション
	PrevBlockHash []byte         // 前のブロックのハッシュ
	Hash          []byte         // このブロックのハッシュ
	Nonce         int64          // Proof of Work で使用するナンス値
	Height        int64          // ブロックの高さ（Genesis block = 0）
	MerkleRoot    []byte         // Merkle Tree のルートハッシュ
}

// Transaction はトランザクションを表す
type Transaction struct {
	ID      []byte     // トランザクションID（ハッシュ）
	Inputs  []TxInput  // 入力（使用するUTXO）
	Outputs []TxOutput // 出力（新しいUTXO）
}

// TxInput はトランザクションの入力を表す
type TxInput struct {
	Txid      []byte // 参照するトランザクションのID
	Vout      int    // 参照するアウトプットのインデックス
	Signature []byte // デジタル署名
	PubKey    []byte // 公開鍵
}

// TxOutput はトランザクションの出力を表す
type TxOutput struct {
	Value      int64  // satoshi単位の値
	PubKeyHash []byte // 受取人の公開鍵ハッシュ
}

// SerializableBlock はシリアライゼーション用のブロック構造
type SerializableBlock struct {
	Timestamp     int64  `json:"timestamp"`
	MerkleRoot    string `json:"merkle_root"`
	PrevBlockHash string `json:"prev_block_hash"`
	Hash          string `json:"hash"`
	Nonce         int64  `json:"nonce"`
	Height        int64  `json:"height"`
	TxCount       int    `json:"tx_count"`
}

// NewBlock は新しいブロックを作成する
func NewBlock(transactions []*Transaction, prevBlockHash []byte, height int64) *Block {
	block := &Block{
		Timestamp:     time.Now().Unix(),
		Transactions:  transactions,
		PrevBlockHash: prevBlockHash,
		Height:        height,
		Nonce:         0,
	}

	// Merkle Root を計算
	block.MerkleRoot = block.CalculateMerkleRoot()

	// ブロックのハッシュを計算
	block.Hash = block.CalculateHash()
	return block
}

// CalculateHash はブロックのハッシュを計算する
func (b *Block) CalculateHash() []byte {
	// ブロックの情報を結合してハッシュ化
	data := fmt.Sprintf("%d%s%s%d%d",
		b.Timestamp,
		hex.EncodeToString(b.MerkleRoot),
		hex.EncodeToString(b.PrevBlockHash),
		b.Nonce,
		b.Height)

	return crypto.HashSHA256([]byte(data))
}

// CalculateMerkleRoot はMerkle Treeのルートハッシュを計算する
func (b *Block) CalculateMerkleRoot() []byte {
	if len(b.Transactions) == 0 {
		return []byte{}
	}

	var txHashes [][]byte
	for _, tx := range b.Transactions {
		txHashes = append(txHashes, tx.ID)
	}

	// トランザクションIDは既にハッシュなので、専用関数を使用
	tree := crypto.NewMerkleTreeFromHashes(txHashes)
	return tree.GetRootHash()
}

// HashTransactions はブロック内のすべてのトランザクションのハッシュを計算する
// 後方互換性のため残しているが、MerkleRootを使用することを推奨
func (b *Block) HashTransactions() string {
	return hex.EncodeToString(b.MerkleRoot)
}

// NewGenesisBlock はGenesisブロック（最初のブロック）を作成する
func NewGenesisBlock(coinbase *Transaction) *Block {
	return NewBlock([]*Transaction{coinbase}, []byte{}, 0)
}

// Serialize はブロックをバイト配列にシリアライズする
func (b *Block) Serialize() ([]byte, error) {
	sb := SerializableBlock{
		Timestamp:     b.Timestamp,
		MerkleRoot:    hex.EncodeToString(b.MerkleRoot),
		PrevBlockHash: hex.EncodeToString(b.PrevBlockHash),
		Hash:          hex.EncodeToString(b.Hash),
		Nonce:         b.Nonce,
		Height:        b.Height,
		TxCount:       len(b.Transactions),
	}

	return json.Marshal(sb)
}

// DeserializeBlock はバイト配列からブロックを復元する
func DeserializeBlock(data []byte) (*Block, error) {
	var sb SerializableBlock
	if err := json.Unmarshal(data, &sb); err != nil {
		return nil, fmt.Errorf("failed to unmarshal block data: %w", err)
	}

	// HEX文字列をバイト配列に変換
	merkleRoot, err := hex.DecodeString(sb.MerkleRoot)
	if err != nil {
		return nil, fmt.Errorf("failed to decode merkle root: %w", err)
	}

	prevHash, err := hex.DecodeString(sb.PrevBlockHash)
	if err != nil {
		return nil, fmt.Errorf("failed to decode prev hash: %w", err)
	}

	hash, err := hex.DecodeString(sb.Hash)
	if err != nil {
		return nil, fmt.Errorf("failed to decode hash: %w", err)
	}

	block := &Block{
		Timestamp:     sb.Timestamp,
		MerkleRoot:    merkleRoot,
		PrevBlockHash: prevHash,
		Hash:          hash,
		Nonce:         sb.Nonce,
		Height:        sb.Height,
		Transactions:  make([]*Transaction, 0), // 簡易実装のため空
	}

	return block, nil
}

// Validate はブロックの整合性を検証する
func (b *Block) Validate() bool {
	// 1. ハッシュが正しく計算されているかチェック
	calculatedHash := b.CalculateHash()
	if !crypto.CompareHashes(calculatedHash, b.Hash) {
		return false
	}

	// 2. Merkle Root が正しく計算されているかチェック
	calculatedMerkleRoot := b.CalculateMerkleRoot()
	if !crypto.CompareHashes(calculatedMerkleRoot, b.MerkleRoot) {
		return false
	}

	// 3. タイムスタンプが妥当かチェック（現在時刻より未来でない）
	if b.Timestamp > time.Now().Unix() {
		return false
	}

	return true
}

// VerifyTransaction はブロック内に指定のトランザクションが含まれているかを検証する
func (b *Block) VerifyTransaction(txHash []byte) bool {
	// Merkle Tree を使用した検証
	var txHashes [][]byte
	for _, tx := range b.Transactions {
		txHashes = append(txHashes, tx.ID)
	}

	// トランザクションIDは既にハッシュなので、専用関数を使用
	tree := crypto.NewMerkleTreeFromHashes(txHashes)
	return tree.VerifyTransaction(txHash)
}

// GetTransactionCount はブロック内のトランザクション数を返す
func (b *Block) GetTransactionCount() int {
	return len(b.Transactions)
}

// GetSize はブロックの概算サイズを返す（バイト）
func (b *Block) GetSize() int {
	// 簡易的なサイズ計算
	size := 0
	size += 8  // Timestamp
	size += 32 // PrevBlockHash
	size += 32 // Hash
	size += 8  // Nonce
	size += 8  // Height
	size += 32 // MerkleRoot

	// トランザクションのサイズ（概算）
	for _, tx := range b.Transactions {
		size += len(tx.ID)
		size += len(tx.Inputs) * (32 + 4 + 100) // Txid + Vout + Signature/PubKey概算
		size += len(tx.Outputs) * (8 + 25)      // Value + PubKeyHash概算
	}

	return size
}

// String はブロックの文字列表現を返す
func (b *Block) String() string {
	return fmt.Sprintf(`Block #%d:
  Timestamp: %d (%s)
  Previous Hash: %s
  Hash: %s
  Merkle Root: %s
  Nonce: %d
  Transactions: %d
  Size: %d bytes
`, b.Height,
		b.Timestamp,
		time.Unix(b.Timestamp, 0).Format("2006-01-02 15:04:05"),
		crypto.FormatHash(b.PrevBlockHash),
		crypto.FormatHash(b.Hash),
		crypto.FormatHash(b.MerkleRoot),
		b.Nonce,
		len(b.Transactions),
		b.GetSize())
}
