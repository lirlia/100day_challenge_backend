package blockchain

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"fmt"
	"strings"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// テスト用のキーペア生成
func generateKeyPair() (*ecdsa.PrivateKey, []byte, error) {
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, err
	}

	pubKeyBytes := append(privateKey.PublicKey.X.Bytes(), privateKey.PublicKey.Y.Bytes()...)
	pubKeyHash := crypto.HashPubKey(pubKeyBytes)

	return privateKey, pubKeyHash, nil
}

// TestUTXOSet_BasicOperations UTXOセットの基本操作テスト
func TestUTXOSet_BasicOperations(t *testing.T) {
	utxoSet := NewUTXOSet()

	// 初期状態確認
	if utxoSet.TotalUTXOs() != 0 {
		t.Errorf("Expected 0 UTXOs, got %d", utxoSet.TotalUTXOs())
	}

	// UTXO追加
	utxo1 := &UTXO{
		TxID:   "test_tx_1",
		OutIdx: 0,
		Output: TxOutput{Value: 100, PubKeyHash: []byte("alice")},
		Height: 1,
	}

	utxoSet.AddUTXO(utxo1)

	if utxoSet.TotalUTXOs() != 1 {
		t.Errorf("Expected 1 UTXO, got %d", utxoSet.TotalUTXOs())
	}

	// UTXO検索
	foundUTXO, exists := utxoSet.FindUTXO("test_tx_1", 0)
	if !exists {
		t.Error("UTXO should exist")
	}

	if foundUTXO.Output.Value != 100 {
		t.Errorf("Expected value 100, got %d", foundUTXO.Output.Value)
	}

	// UTXO削除
	err := utxoSet.RemoveUTXO("test_tx_1", 0)
	if err != nil {
		t.Errorf("Error removing UTXO: %v", err)
	}

	if utxoSet.TotalUTXOs() != 0 {
		t.Errorf("Expected 0 UTXOs after removal, got %d", utxoSet.TotalUTXOs())
	}
}

// TestUTXOSet_FindUTXOsByPubKeyHash 公開鍵ハッシュによるUTXO検索テスト
func TestUTXOSet_FindUTXOsByPubKeyHash(t *testing.T) {
	utxoSet := NewUTXOSet()
	alicePubKeyHash := []byte("alice")
	bobPubKeyHash := []byte("bob")

	// Alice用UTXO追加
	utxo1 := &UTXO{
		TxID:   "tx1",
		OutIdx: 0,
		Output: TxOutput{Value: 100, PubKeyHash: alicePubKeyHash},
		Height: 1,
	}
	utxo2 := &UTXO{
		TxID:   "tx2",
		OutIdx: 0,
		Output: TxOutput{Value: 200, PubKeyHash: alicePubKeyHash},
		Height: 2,
	}

	// Bob用UTXO追加
	utxo3 := &UTXO{
		TxID:   "tx3",
		OutIdx: 0,
		Output: TxOutput{Value: 150, PubKeyHash: bobPubKeyHash},
		Height: 3,
	}

	utxoSet.AddUTXO(utxo1)
	utxoSet.AddUTXO(utxo2)
	utxoSet.AddUTXO(utxo3)

	// Aliceの残高確認
	aliceBalance := utxoSet.GetBalance(alicePubKeyHash)
	if aliceBalance != 300 {
		t.Errorf("Expected Alice's balance 300, got %d", aliceBalance)
	}

	// AliceのUTXO数確認
	aliceUTXOs := utxoSet.FindUTXOsByPubKeyHash(alicePubKeyHash)
	if len(aliceUTXOs) != 2 {
		t.Errorf("Expected 2 UTXOs for Alice, got %d", len(aliceUTXOs))
	}

	// Bobの残高確認
	bobBalance := utxoSet.GetBalance(bobPubKeyHash)
	if bobBalance != 150 {
		t.Errorf("Expected Bob's balance 150, got %d", bobBalance)
	}
}

// TestCreateCoinbaseTransaction Coinbaseトランザクション作成テスト
func TestCreateCoinbaseTransaction(t *testing.T) {
	minerPubKeyHash := []byte("miner_address")

	// Coinbaseトランザクション作成
	coinbaseTx := CreateCoinbaseTransaction(minerPubKeyHash, "Genesis Block")

	// Coinbaseトランザクションの検証
	if !coinbaseTx.IsCoinbase() {
		t.Error("Transaction should be coinbase")
	}

	if len(coinbaseTx.Inputs) != 1 {
		t.Errorf("Expected 1 input, got %d", len(coinbaseTx.Inputs))
	}

	if len(coinbaseTx.Outputs) != 1 {
		t.Errorf("Expected 1 output, got %d", len(coinbaseTx.Outputs))
	}

	if coinbaseTx.Outputs[0].Value != CoinbaseAmount {
		t.Errorf("Expected output value %d, got %d", CoinbaseAmount, coinbaseTx.Outputs[0].Value)
	}

	// IDが設定されているかチェック
	if len(coinbaseTx.ID) == 0 {
		t.Error("Transaction ID should be set")
	}
}

// TestTransactionHash トランザクションハッシュテスト
func TestTransactionHash(t *testing.T) {
	// テスト用トランザクション作成
	tx := &Transaction{
		ID: []byte{},
		Inputs: []TxInput{
			{
				Txid:      []byte("prev_tx"),
				Vout:      0,
				Signature: []byte("signature"),
				PubKey:    []byte("public_key"),
			},
		},
		Outputs: []TxOutput{
			{
				Value:      100,
				PubKeyHash: []byte("recipient"),
			},
		},
	}

	// ハッシュ計算
	hash1 := tx.Hash()
	if hash1 == "" {
		t.Error("Hash should not be empty")
	}

	// 同じトランザクションのハッシュは同じであることを確認
	hash2 := tx.Hash()
	if hash1 != hash2 {
		t.Error("Hash should be consistent")
	}

	// 異なるトランザクションのハッシュは異なることを確認
	tx.Outputs[0].Value = 200
	hash3 := tx.Hash()
	if hash1 == hash3 {
		t.Error("Different transactions should have different hashes")
	}
}

// TestTransactionBuilder_CreateTransaction トランザクション作成テスト
func TestTransactionBuilder_CreateTransaction(t *testing.T) {
	// キーペア生成
	alicePrivateKey, alicePubKeyHash, err := generateKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate Alice's key pair: %v", err)
	}

	_, bobPubKeyHash, err := generateKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate Bob's key pair: %v", err)
	}

	// UTXOセット作成・初期化
	utxoSet := NewUTXOSet()

	// Aliceに初期UTXOを与える
	utxo := &UTXO{
		TxID:   "initial_tx",
		OutIdx: 0,
		Output: TxOutput{Value: 100, PubKeyHash: alicePubKeyHash},
		Height: 1,
	}
	utxoSet.AddUTXO(utxo)

	// トランザクションビルダー作成
	builder := NewTransactionBuilder(utxoSet)

	// AliceからBobに50送金するトランザクション作成
	tx, err := builder.CreateTransaction(alicePubKeyHash, bobPubKeyHash, 50, alicePrivateKey)
	if err != nil {
		t.Fatalf("Failed to create transaction: %v", err)
	}

	// トランザクション検証
	if len(tx.Inputs) != 1 {
		t.Errorf("Expected 1 input, got %d", len(tx.Inputs))
	}

	if len(tx.Outputs) != 2 { // 送金先 + お釣り
		t.Errorf("Expected 2 outputs, got %d", len(tx.Outputs))
	}

	// 出力金額の検証
	totalOutput := int64(0)
	for _, output := range tx.Outputs {
		totalOutput += output.Value
	}

	if totalOutput != 100 {
		t.Errorf("Total output should equal input (100), got %d", totalOutput)
	}

	// 署名が設定されているかチェック
	if len(tx.Inputs[0].Signature) == 0 {
		t.Error("Input signature should be set")
	}

	// IDが設定されているかチェック
	if len(tx.ID) == 0 {
		t.Error("Transaction ID should be set")
	}
}

// TestTransactionBuilder_InsufficientFunds 残高不足テスト
func TestTransactionBuilder_InsufficientFunds(t *testing.T) {
	// キーペア生成
	alicePrivateKey, alicePubKeyHash, err := generateKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate Alice's key pair: %v", err)
	}

	_, bobPubKeyHash, err := generateKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate Bob's key pair: %v", err)
	}

	// UTXOセット作成（Aliceに50しか残高がない）
	utxoSet := NewUTXOSet()
	utxo := &UTXO{
		TxID:   "initial_tx",
		OutIdx: 0,
		Output: TxOutput{Value: 50, PubKeyHash: alicePubKeyHash},
		Height: 1,
	}
	utxoSet.AddUTXO(utxo)

	// トランザクションビルダー作成
	builder := NewTransactionBuilder(utxoSet)

	// 100送金しようとする（残高不足）
	_, err = builder.CreateTransaction(alicePubKeyHash, bobPubKeyHash, 100, alicePrivateKey)

	if err == nil {
		t.Error("Should fail with insufficient funds")
	}

	if !strings.Contains(err.Error(), "insufficient funds") {
		t.Errorf("Error should mention insufficient funds, got: %v", err)
	}
}

// TestProcessTransaction UTXOセットへのトランザクション適用テスト
func TestProcessTransaction(t *testing.T) {
	utxoSet := NewUTXOSet()

	// 初期UTXO追加
	initialUTXO := &UTXO{
		TxID:   "tx1",
		OutIdx: 0,
		Output: TxOutput{Value: 100, PubKeyHash: []byte("alice")},
		Height: 1,
	}
	utxoSet.AddUTXO(initialUTXO)

	// トランザクション作成（tx1:0を消費して新しい出力を作成）
	tx := &Transaction{
		ID: []byte("tx2"),
		Inputs: []TxInput{
			{
				Txid:      []byte("tx1"),
				Vout:      0,
				Signature: []byte("sig"),
				PubKey:    []byte("alice_pubkey"),
			},
		},
		Outputs: []TxOutput{
			{Value: 60, PubKeyHash: []byte("bob")},
			{Value: 40, PubKeyHash: []byte("alice")}, // お釣り
		},
	}

	// トランザクション適用前の状態確認
	if utxoSet.TotalUTXOs() != 1 {
		t.Errorf("Expected 1 UTXO before processing, got %d", utxoSet.TotalUTXOs())
	}

	// トランザクション適用
	err := utxoSet.ProcessTransaction(tx, 2)
	if err != nil {
		t.Fatalf("Failed to process transaction: %v", err)
	}

	// トランザクション適用後の状態確認
	if utxoSet.TotalUTXOs() != 2 {
		t.Errorf("Expected 2 UTXOs after processing, got %d", utxoSet.TotalUTXOs())
	}

	// 古いUTXOが削除されていることを確認
	_, exists := utxoSet.FindUTXO("tx1", 0)
	if exists {
		t.Error("Old UTXO should be removed")
	}

	// 新しいUTXOが追加されていることを確認
	newUTXO1, exists := utxoSet.FindUTXO("tx2", 0)
	if !exists {
		t.Error("New UTXO 0 should exist")
	}
	if newUTXO1.Output.Value != 60 {
		t.Errorf("Expected UTXO 0 value 60, got %d", newUTXO1.Output.Value)
	}

	newUTXO2, exists := utxoSet.FindUTXO("tx2", 1)
	if !exists {
		t.Error("New UTXO 1 should exist")
	}
	if newUTXO2.Output.Value != 40 {
		t.Errorf("Expected UTXO 1 value 40, got %d", newUTXO2.Output.Value)
	}
}

// TestProcessCoinbaseTransaction Coinbaseトランザクション処理テスト
func TestProcessCoinbaseTransaction(t *testing.T) {
	utxoSet := NewUTXOSet()

	// Coinbaseトランザクション作成
	coinbaseTx := CreateCoinbaseTransaction([]byte("miner"), "Block reward")

	// Coinbaseトランザクション適用
	err := utxoSet.ProcessTransaction(coinbaseTx, 1)
	if err != nil {
		t.Fatalf("Failed to process coinbase transaction: %v", err)
	}

	// UTXOが追加されていることを確認
	if utxoSet.TotalUTXOs() != 1 {
		t.Errorf("Expected 1 UTXO after coinbase, got %d", utxoSet.TotalUTXOs())
	}

	// マイナーの残高確認
	minerBalance := utxoSet.GetBalance([]byte("miner"))
	if minerBalance != CoinbaseAmount {
		t.Errorf("Expected miner balance %d, got %d", CoinbaseAmount, minerBalance)
	}
}

// TestUTXOSet_Copy UTXOセットコピーテスト
func TestUTXOSet_Copy(t *testing.T) {
	original := NewUTXOSet()

	// 元のセットにUTXO追加
	utxo := &UTXO{
		TxID:   "test_tx",
		OutIdx: 0,
		Output: TxOutput{Value: 100, PubKeyHash: []byte("alice")},
		Height: 1,
	}
	original.AddUTXO(utxo)

	// コピー作成
	copied := original.Copy()

	// コピーが正しく作成されているか確認
	if copied.TotalUTXOs() != original.TotalUTXOs() {
		t.Error("Copied UTXO set should have same number of UTXOs")
	}

	copiedUTXO, exists := copied.FindUTXO("test_tx", 0)
	if !exists {
		t.Error("Copied UTXO should exist")
	}

	if copiedUTXO.Output.Value != 100 {
		t.Errorf("Copied UTXO should have same value")
	}

	// 元のセットを変更してもコピーに影響しないことを確認
	err := original.RemoveUTXO("test_tx", 0)
	if err != nil {
		t.Fatalf("Failed to remove UTXO from original: %v", err)
	}

	if copied.TotalUTXOs() != 1 {
		t.Error("Copied set should still have the UTXO")
	}

	if original.TotalUTXOs() != 0 {
		t.Error("Original set should be empty")
	}
}

// TestUTXOSet_String 文字列表現テスト
func TestUTXOSet_String(t *testing.T) {
	utxoSet := NewUTXOSet()

	// 空のセットの文字列表現
	str := utxoSet.String()
	if !strings.Contains(str, "Total: 0 UTXOs") {
		t.Error("String should show 0 UTXOs for empty set")
	}

	// UTXO追加後の文字列表現
	utxo := &UTXO{
		TxID:   "test_tx_id",
		OutIdx: 0,
		Output: TxOutput{Value: 100, PubKeyHash: []byte("alice")},
		Height: 1,
	}
	utxoSet.AddUTXO(utxo)

	str = utxoSet.String()
	if !strings.Contains(str, "Total: 1 UTXOs") {
		t.Error("String should show 1 UTXO")
	}

	if !strings.Contains(str, "test_tx_") {
		t.Error("String should contain transaction ID prefix")
	}
}

// TestInvalidTransactionCreation 無効なトランザクション作成テスト
func TestInvalidTransactionCreation(t *testing.T) {
	// キーペア生成
	alicePrivateKey, alicePubKeyHash, err := generateKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	_, bobPubKeyHash, err := generateKeyPair()
	if err != nil {
		t.Fatalf("Failed to generate key pair: %v", err)
	}

	utxoSet := NewUTXOSet()
	builder := NewTransactionBuilder(utxoSet)

	// 負の金額でトランザクション作成を試行
	_, err = builder.CreateTransaction(alicePubKeyHash, bobPubKeyHash, -10, alicePrivateKey)
	if err == nil {
		t.Error("Should fail with negative amount")
	}

	// ゼロ金額でトランザクション作成を試行
	_, err = builder.CreateTransaction(alicePubKeyHash, bobPubKeyHash, 0, alicePrivateKey)
	if err == nil {
		t.Error("Should fail with zero amount")
	}

	// UTXOがない状態でトランザクション作成を試行
	_, err = builder.CreateTransaction(alicePubKeyHash, bobPubKeyHash, 100, alicePrivateKey)
	if err == nil {
		t.Error("Should fail with no UTXOs")
	}
}

// BenchmarkUTXOSet_GetBalance 残高計算のベンチマーク
func BenchmarkUTXOSet_GetBalance(b *testing.B) {
	utxoSet := NewUTXOSet()
	pubKeyHash := []byte("test_address")

	// 1000個のUTXOを追加
	for i := 0; i < 1000; i++ {
		utxo := &UTXO{
			TxID:   fmt.Sprintf("tx_%d", i),
			OutIdx: 0,
			Output: TxOutput{Value: 100, PubKeyHash: pubKeyHash},
			Height: int64(i + 1),
		}
		utxoSet.AddUTXO(utxo)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = utxoSet.GetBalance(pubKeyHash)
	}
}

// BenchmarkTransactionHash トランザクションハッシュ計算のベンチマーク
func BenchmarkTransactionHash(b *testing.B) {
	tx := &Transaction{
		ID: []byte{},
		Inputs: []TxInput{
			{
				Txid:      []byte("prev_tx_id"),
				Vout:      0,
				Signature: []byte("signature_data"),
				PubKey:    []byte("public_key_data"),
			},
		},
		Outputs: []TxOutput{
			{Value: 100, PubKeyHash: []byte("recipient_address")},
			{Value: 50, PubKeyHash: []byte("change_address")},
		},
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = tx.Hash()
	}
}
