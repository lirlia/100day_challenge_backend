package blockchain

import (
	"testing"
	"time"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// createDummyTransaction はテスト用のダミートランザクションを作成する
func createDummyTransaction(id string) *Transaction {
	txID := crypto.HashSHA256String(id)
	return &Transaction{
		ID: txID,
		Inputs: []TxInput{
			{
				Txid:      crypto.HashSHA256String("prev_tx_" + id),
				Vout:      0,
				Signature: []byte("dummy_signature"),
				PubKey:    []byte("dummy_pubkey"),
			},
		},
		Outputs: []TxOutput{
			{
				Value:      100000000, // 1 BTC in satoshis
				PubKeyHash: crypto.HashSHA256String("recipient_" + id),
			},
		},
	}
}

func TestNewBlock(t *testing.T) {
	// テスト用トランザクション作成
	tx1 := createDummyTransaction("tx1")
	tx2 := createDummyTransaction("tx2")
	transactions := []*Transaction{tx1, tx2}

	prevHash := crypto.HashSHA256String("previous_block")
	height := int64(1)

	// ブロック作成
	block := NewBlock(transactions, prevHash, height)

	// 基本フィールドの検証
	if block.Height != height {
		t.Errorf("Expected height %d, got %d", height, block.Height)
	}

	if len(block.Transactions) != 2 {
		t.Errorf("Expected 2 transactions, got %d", len(block.Transactions))
	}

	if block.Timestamp == 0 {
		t.Error("Timestamp should not be zero")
	}

	if len(block.Hash) == 0 {
		t.Error("Hash should not be empty")
	}

	if len(block.MerkleRoot) == 0 {
		t.Error("MerkleRoot should not be empty")
	}

	// ハッシュが正しく計算されているか検証
	expectedHash := block.CalculateHash()
	if !crypto.CompareHashes(block.Hash, expectedHash) {
		t.Error("Block hash does not match calculated hash")
	}

	// Merkle Root が正しく計算されているか検証
	expectedMerkleRoot := block.CalculateMerkleRoot()
	if !crypto.CompareHashes(block.MerkleRoot, expectedMerkleRoot) {
		t.Error("MerkleRoot does not match calculated merkle root")
	}
}

func TestNewGenesisBlock(t *testing.T) {
	// Coinbase トランザクション作成
	coinbase := createDummyTransaction("coinbase")

	// Genesis block 作成
	genesis := NewGenesisBlock(coinbase)

	// Genesis block の検証
	if genesis.Height != 0 {
		t.Errorf("Genesis block height should be 0, got %d", genesis.Height)
	}

	if len(genesis.PrevBlockHash) != 0 {
		t.Error("Genesis block should have empty previous hash")
	}

	if len(genesis.Transactions) != 1 {
		t.Errorf("Genesis block should have 1 transaction, got %d", len(genesis.Transactions))
	}

	if genesis.Transactions[0] != coinbase {
		t.Error("Genesis block should contain the coinbase transaction")
	}
}

func TestBlockCalculateHash(t *testing.T) {
	tx := createDummyTransaction("test")
	block := NewBlock([]*Transaction{tx}, []byte("prev_hash"), 1)

	// ハッシュ計算
	hash1 := block.CalculateHash()
	hash2 := block.CalculateHash()

	// 同じ内容なら同じハッシュになるべき
	if !crypto.CompareHashes(hash1, hash2) {
		t.Error("CalculateHash should return consistent results")
	}

	// 内容を変更したら異なるハッシュになるべき
	block.Nonce = 123
	hash3 := block.CalculateHash()

	if crypto.CompareHashes(hash1, hash3) {
		t.Error("CalculateHash should return different results after content change")
	}
}

func TestBlockCalculateMerkleRoot(t *testing.T) {
	// トランザクションなしの場合
	emptyBlock := &Block{Transactions: []*Transaction{}}
	merkleRoot := emptyBlock.CalculateMerkleRoot()
	if len(merkleRoot) != 0 {
		t.Error("Empty block should have empty merkle root")
	}

	// 単一トランザクションの場合
	tx1 := createDummyTransaction("tx1")
	singleTxBlock := &Block{Transactions: []*Transaction{tx1}}
	merkleRoot1 := singleTxBlock.CalculateMerkleRoot()
	if len(merkleRoot1) == 0 {
		t.Error("Single transaction block should have non-empty merkle root")
	}

	// 複数トランザクションの場合
	tx2 := createDummyTransaction("tx2")
	multiTxBlock := &Block{Transactions: []*Transaction{tx1, tx2}}
	merkleRoot2 := multiTxBlock.CalculateMerkleRoot()
	if len(merkleRoot2) == 0 {
		t.Error("Multi transaction block should have non-empty merkle root")
	}

	// 異なるトランザクションセットは異なるMerkle Rootを持つべき
	if crypto.CompareHashes(merkleRoot1, merkleRoot2) {
		t.Error("Different transaction sets should have different merkle roots")
	}
}

func TestBlockValidate(t *testing.T) {
	tx := createDummyTransaction("valid_tx")
	block := NewBlock([]*Transaction{tx}, crypto.HashSHA256String("prev"), 1)

	// 正常なブロックの検証
	if !block.Validate() {
		t.Error("Valid block should pass validation")
	}

	// ハッシュを改ざんした場合
	invalidHashBlock := *block
	invalidHashBlock.Hash = crypto.HashSHA256String("invalid_hash")
	if invalidHashBlock.Validate() {
		t.Error("Block with invalid hash should fail validation")
	}

	// Merkle Root を改ざんした場合
	invalidMerkleBlock := *block
	invalidMerkleBlock.MerkleRoot = crypto.HashSHA256String("invalid_merkle")
	if invalidMerkleBlock.Validate() {
		t.Error("Block with invalid merkle root should fail validation")
	}

	// 未来のタイムスタンプの場合
	futureTimeBlock := *block
	futureTimeBlock.Timestamp = time.Now().Unix() + 3600 // 1時間後
	if futureTimeBlock.Validate() {
		t.Error("Block with future timestamp should fail validation")
	}
}

func TestBlockVerifyTransaction(t *testing.T) {
	tx1 := createDummyTransaction("tx1")
	tx2 := createDummyTransaction("tx2")
	tx3 := createDummyTransaction("tx3")

	block := NewBlock([]*Transaction{tx1, tx2}, crypto.HashSHA256String("prev"), 1)

	// 含まれているトランザクションの検証
	if !block.VerifyTransaction(tx1.ID) {
		t.Error("Block should verify transaction that it contains")
	}

	if !block.VerifyTransaction(tx2.ID) {
		t.Error("Block should verify transaction that it contains")
	}

	// 含まれていないトランザクションの検証
	if block.VerifyTransaction(tx3.ID) {
		t.Error("Block should not verify transaction that it does not contain")
	}
}

func TestBlockSerializeDeserialize(t *testing.T) {
	tx := createDummyTransaction("serialize_test")
	originalBlock := NewBlock([]*Transaction{tx}, crypto.HashSHA256String("prev"), 5)

	// シリアライゼーション
	serialized, err := originalBlock.Serialize()
	if err != nil {
		t.Fatalf("Serialization failed: %v", err)
	}

	if len(serialized) == 0 {
		t.Error("Serialized data should not be empty")
	}

	// デバッグ: シリアライズされたデータを出力
	t.Logf("Serialized data: %s", string(serialized))

	// デシリアライゼーション (現在は簡易実装なので基本的なテストのみ)
	deserializedBlock, err := DeserializeBlock(serialized)
	if err != nil {
		t.Errorf("Deserialization failed: %v", err)
		return
	}

	// 基本フィールドの確認
	if deserializedBlock.Timestamp != originalBlock.Timestamp {
		t.Errorf("Timestamp mismatch: expected %d, got %d", originalBlock.Timestamp, deserializedBlock.Timestamp)
	}

	if deserializedBlock.Height != originalBlock.Height {
		t.Errorf("Height mismatch: expected %d, got %d", originalBlock.Height, deserializedBlock.Height)
	}
}

func TestBlockGetSize(t *testing.T) {
	// 空のブロック
	emptyBlock := &Block{
		Transactions: []*Transaction{},
	}
	emptySize := emptyBlock.GetSize()
	if emptySize <= 0 {
		t.Error("Block size should be positive")
	}

	// トランザクション付きブロック
	tx := createDummyTransaction("size_test")
	blockWithTx := NewBlock([]*Transaction{tx}, crypto.HashSHA256String("prev"), 1)
	sizeWithTx := blockWithTx.GetSize()

	if sizeWithTx <= emptySize {
		t.Error("Block with transactions should be larger than empty block")
	}
}

func TestBlockString(t *testing.T) {
	tx := createDummyTransaction("string_test")
	block := NewBlock([]*Transaction{tx}, crypto.HashSHA256String("prev"), 10)

	str := block.String()
	if len(str) == 0 {
		t.Error("Block string representation should not be empty")
	}

	// 重要な情報が含まれているかチェック
	if !contains(str, "Block #10") {
		t.Error("String should contain block height")
	}

	if !contains(str, "Transactions: 1") {
		t.Error("String should contain transaction count")
	}
}

func TestBlockGetTransactionCount(t *testing.T) {
	// 空のブロック
	emptyBlock := &Block{Transactions: []*Transaction{}}
	if emptyBlock.GetTransactionCount() != 0 {
		t.Error("Empty block should have 0 transactions")
	}

	// トランザクション付きブロック
	tx1 := createDummyTransaction("count_test1")
	tx2 := createDummyTransaction("count_test2")
	block := NewBlock([]*Transaction{tx1, tx2}, crypto.HashSHA256String("prev"), 1)

	if block.GetTransactionCount() != 2 {
		t.Errorf("Block should have 2 transactions, got %d", block.GetTransactionCount())
	}
}

// BenchmarkBlockCreation はブロック作成のベンチマークテスト
func BenchmarkBlockCreation(b *testing.B) {
	tx := createDummyTransaction("benchmark")
	prevHash := crypto.HashSHA256String("prev")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		NewBlock([]*Transaction{tx}, prevHash, 1)
	}
}

// BenchmarkBlockHashCalculation はハッシュ計算のベンチマークテスト
func BenchmarkBlockHashCalculation(b *testing.B) {
	tx := createDummyTransaction("benchmark")
	block := NewBlock([]*Transaction{tx}, crypto.HashSHA256String("prev"), 1)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		block.CalculateHash()
	}
}

// contains は文字列に部分文字列が含まれているかチェックする
func contains(s, substr string) bool {
	return len(s) >= len(substr) && findSubstring(s, substr)
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
