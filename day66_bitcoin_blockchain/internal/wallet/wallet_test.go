package wallet

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"strings"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/blockchain"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// TestNewWallet ウォレット作成テスト
func TestNewWallet(t *testing.T) {
	wallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	if wallet.PrivateKey == nil {
		t.Error("Private key should not be nil")
	}

	if len(wallet.PublicKey) == 0 {
		t.Error("Public key should not be empty")
	}

	if wallet.Address == "" {
		t.Error("Address should not be empty")
	}

	// アドレスの妥当性チェック
	if !ValidateAddress(wallet.Address) {
		t.Error("Generated address should be valid")
	}
}

// TestValidateAddress アドレス検証テスト
func TestValidateAddress(t *testing.T) {
	// 有効なアドレスを作成
	wallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// 有効なアドレスのテスト
	if !ValidateAddress(wallet.Address) {
		t.Error("Valid address should pass validation")
	}

	// 無効なアドレスのテスト
	invalidAddresses := []string{
		"",
		"invalid",
		"1234567890",
		"abcdefghij",
	}

	for _, addr := range invalidAddresses {
		if ValidateAddress(addr) {
			t.Errorf("Invalid address should fail validation: %s", addr)
		}
	}
}

// TestGenerateAddress アドレス生成テスト
func TestGenerateAddress(t *testing.T) {
	// テスト用の公開鍵を生成
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatalf("Failed to generate private key: %v", err)
	}

	publicKey := append([]byte{0x04},
		append(privateKey.PublicKey.X.Bytes(), privateKey.PublicKey.Y.Bytes()...)...)

	// アドレス生成
	address1 := GenerateAddress(publicKey)
	address2 := GenerateAddress(publicKey)

	// 同じ公開鍵からは同じアドレスが生成される
	if address1 != address2 {
		t.Error("Same public key should generate same address")
	}

	// アドレスが妥当であることを確認
	if !ValidateAddress(address1) {
		t.Error("Generated address should be valid")
	}

	// Bitcoinアドレスの形式をチェック（Base58文字列であること）
	if len(address1) < 25 || len(address1) > 35 {
		t.Errorf("Address length should be between 25-35 characters, got %d", len(address1))
	}
}

// TestWalletManager ウォレット管理テスト
func TestWalletManager(t *testing.T) {
	manager := NewWalletManager()

	// ウォレット作成
	address1, err := manager.CreateWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	address2, err := manager.CreateWallet()
	if err != nil {
		t.Fatalf("Failed to create second wallet: %v", err)
	}

	// 異なるアドレスが生成されることを確認
	if address1 == address2 {
		t.Error("Different wallets should have different addresses")
	}

	// ウォレット取得テスト
	wallet1, err := manager.GetWallet(address1)
	if err != nil {
		t.Fatalf("Failed to get wallet: %v", err)
	}

	if wallet1.Address != address1 {
		t.Error("Retrieved wallet should have correct address")
	}

	// 存在しないウォレットの取得
	_, err = manager.GetWallet("nonexistent")
	if err == nil {
		t.Error("Getting nonexistent wallet should return error")
	}

	// アドレス一覧取得
	addresses := manager.GetAddresses()
	if len(addresses) != 2 {
		t.Errorf("Should have 2 addresses, got %d", len(addresses))
	}
}

// TestWalletFromPrivateKey 秘密鍵からのウォレット復元テスト
func TestWalletFromPrivateKey(t *testing.T) {
	// 元のウォレット作成
	originalWallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create original wallet: %v", err)
	}

	// 秘密鍵を取得
	privateKeyBytes := originalWallet.PrivateKey.D.Bytes()

	// 秘密鍵から復元
	restoredWallet, err := NewWalletFromPrivateKey(privateKeyBytes)
	if err != nil {
		t.Fatalf("Failed to restore wallet: %v", err)
	}

	// 同じアドレスが生成されることを確認
	if originalWallet.Address != restoredWallet.Address {
		t.Error("Restored wallet should have same address as original")
	}
}

// TestGetKeyPair 鍵ペア取得テスト
func TestGetKeyPair(t *testing.T) {
	wallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	keyPair := wallet.GetKeyPair()

	if len(keyPair.PrivateKey) == 0 {
		t.Error("Private key should not be empty")
	}

	if len(keyPair.PublicKey) == 0 {
		t.Error("Public key should not be empty")
	}

	if keyPair.Address != wallet.Address {
		t.Error("KeyPair address should match wallet address")
	}
}

// TestSignAndVerifySignature 署名・検証テスト
func TestSignAndVerifySignature(t *testing.T) {
	wallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// テストデータ
	testData := []byte("test message for signing")

	// 署名作成（ここでは簡易的なテスト）
	hashBytes := crypto.HashSHA256(testData)

	// ECDSA署名を直接作成
	r, s, err := ecdsa.Sign(rand.Reader, wallet.PrivateKey, hashBytes)
	if err != nil {
		t.Fatalf("Failed to create signature: %v", err)
	}

	signature := append(r.Bytes(), s.Bytes()...)

	// 署名検証
	isValid := wallet.VerifySignature(hashBytes, signature)
	if !isValid {
		t.Error("Valid signature should pass verification")
	}

	// 無効な署名のテスト
	invalidSignature := make([]byte, len(signature))
	copy(invalidSignature, signature)
	invalidSignature[0] ^= 0xFF // 最初のバイトを反転

	isValid = wallet.VerifySignature(hashBytes, invalidSignature)
	if isValid {
		t.Error("Invalid signature should fail verification")
	}
}

// TestGetBalance 残高計算テスト
func TestGetBalance(t *testing.T) {
	wallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// 空のUTXOセット
	utxoSet := blockchain.NewUTXOSet()

	// 残高は0であるべき
	balance := wallet.GetBalance(utxoSet)
	if balance != 0 {
		t.Errorf("Empty UTXO set should have zero balance, got %d", balance)
	}

	// UTXOを追加
	pubKeyHash := crypto.HashPubKey(wallet.PublicKey)
	utxo := &blockchain.UTXO{
		TxID:   "test_tx_id",
		OutIdx: 0,
		Output: blockchain.TxOutput{
			Value:      100,
			PubKeyHash: pubKeyHash,
		},
		Height: 1,
	}

	utxoSet.AddUTXO(utxo)

	// 残高計算
	balance = wallet.GetBalance(utxoSet)
	if balance != 100 {
		t.Errorf("Expected balance 100, got %d", balance)
	}

	// 複数のUTXOを追加
	utxo2 := &blockchain.UTXO{
		TxID:   "test_tx_id_2",
		OutIdx: 0,
		Output: blockchain.TxOutput{
			Value:      50,
			PubKeyHash: pubKeyHash,
		},
		Height: 2,
	}

	utxoSet.AddUTXO(utxo2)

	balance = wallet.GetBalance(utxoSet)
	if balance != 150 {
		t.Errorf("Expected balance 150, got %d", balance)
	}
}

// TestAddressToPubKeyHash アドレス変換テスト
func TestAddressToPubKeyHash(t *testing.T) {
	wallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	// アドレスを公開鍵ハッシュに変換
	pubKeyHash, err := AddressToPubKeyHash(wallet.Address)
	if err != nil {
		t.Fatalf("Failed to convert address: %v", err)
	}

	if len(pubKeyHash) != 20 {
		t.Errorf("PubKeyHash should be 20 bytes, got %d", len(pubKeyHash))
	}

	// 逆変換テスト
	reconstructedAddress := PubKeyHashToAddress(pubKeyHash)
	if reconstructedAddress != wallet.Address {
		t.Error("Address conversion should be reversible")
	}
}

// TestGetWalletInfo ウォレット情報取得テスト
func TestGetWalletInfo(t *testing.T) {
	wallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create wallet: %v", err)
	}

	info := wallet.GetWalletInfo()

	// 必要なフィールドが存在することを確認
	if info["address"] != wallet.Address {
		t.Error("Wallet info should contain correct address")
	}

	publicKeyHex, ok := info["public_key"].(string)
	if !ok || len(publicKeyHex) == 0 {
		t.Error("Wallet info should contain public key")
	}

	privateKeyHex, ok := info["private_key"].(string)
	if !ok || len(privateKeyHex) == 0 {
		t.Error("Wallet info should contain private key")
	}

	// 16進文字列であることを確認
	if !isValidHex(publicKeyHex) {
		t.Error("Public key should be valid hex string")
	}

	if !isValidHex(privateKeyHex) {
		t.Error("Private key should be valid hex string")
	}
}

// TestImportWallet ウォレットインポートテスト
func TestImportWallet(t *testing.T) {
	manager := NewWalletManager()

	// 元のウォレット作成
	originalWallet, err := NewWallet()
	if err != nil {
		t.Fatalf("Failed to create original wallet: %v", err)
	}

	privateKeyBytes := originalWallet.PrivateKey.D.Bytes()

	// ウォレットをインポート
	importedAddress, err := manager.ImportWallet(privateKeyBytes)
	if err != nil {
		t.Fatalf("Failed to import wallet: %v", err)
	}

	if importedAddress != originalWallet.Address {
		t.Error("Imported wallet should have same address as original")
	}

	// インポートしたウォレットを取得
	importedWallet, err := manager.GetWallet(importedAddress)
	if err != nil {
		t.Fatalf("Failed to get imported wallet: %v", err)
	}

	if importedWallet.Address != originalWallet.Address {
		t.Error("Imported wallet should match original")
	}
}

// ヘルパー関数: 16進文字列の妥当性チェック
func isValidHex(s string) bool {
	if len(s)%2 != 0 {
		return false
	}
	return strings.IndexFunc(s, func(r rune) bool {
		return !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F'))
	}) == -1
}

// ベンチマークテスト

// BenchmarkNewWallet ウォレット作成性能テスト
func BenchmarkNewWallet(b *testing.B) {
	for i := 0; i < b.N; i++ {
		_, err := NewWallet()
		if err != nil {
			b.Fatalf("Failed to create wallet: %v", err)
		}
	}
}

// BenchmarkValidateAddress アドレス検証性能テスト
func BenchmarkValidateAddress(b *testing.B) {
	wallet, err := NewWallet()
	if err != nil {
		b.Fatalf("Failed to create wallet: %v", err)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		ValidateAddress(wallet.Address)
	}
}

// BenchmarkGetBalance 残高計算性能テスト
func BenchmarkGetBalance(b *testing.B) {
	wallet, err := NewWallet()
	if err != nil {
		b.Fatalf("Failed to create wallet: %v", err)
	}

	utxoSet := blockchain.NewUTXOSet()
	pubKeyHash := crypto.HashPubKey(wallet.PublicKey)

	// 1000個のUTXOを追加
	for i := 0; i < 1000; i++ {
		utxo := &blockchain.UTXO{
			TxID:   crypto.HashSHA256Hex([]byte(string(rune(i)))),
			OutIdx: i,
			Output: blockchain.TxOutput{
				Value:      int64(i + 1),
				PubKeyHash: pubKeyHash,
			},
			Height: int64(i + 1),
		}
		utxoSet.AddUTXO(utxo)
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		wallet.GetBalance(utxoSet)
	}
}
