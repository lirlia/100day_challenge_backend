package wallet

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/internal/blockchain"
	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// 定数定義
const (
	AddressVersionByte = 0x00 // Bitcoin Mainnetのバージョンバイト
	ChecksumLength     = 4    // チェックサムの長さ
	AddressLength      = 25   // アドレスの総長（バージョン1 + ハッシュ20 + チェックサム4）
)

// Wallet ウォレット構造体
type Wallet struct {
	PrivateKey *ecdsa.PrivateKey // ECDSA秘密鍵
	PublicKey  []byte            // 公開鍵（非圧縮形式）
	Address    string            // Base58エンコードされたアドレス
}

// KeyPair 鍵ペア情報
type KeyPair struct {
	PrivateKey []byte `json:"private_key"`
	PublicKey  []byte `json:"public_key"`
	Address    string `json:"address"`
}

// WalletManager ウォレット管理システム
type WalletManager struct {
	wallets map[string]*Wallet // アドレス -> ウォレットのマッピング
}

// NewWallet 新しいウォレットを作成
func NewWallet() (*Wallet, error) {
	// ECDSA鍵ペア生成（P-256カーブを使用）
	privateKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, fmt.Errorf("failed to generate private key: %w", err)
	}

	// 公開鍵をバイト形式に変換（非圧縮形式: 04 + X + Y）
	publicKey := append([]byte{0x04},
		append(privateKey.PublicKey.X.Bytes(), privateKey.PublicKey.Y.Bytes()...)...)

	// アドレス生成
	address := GenerateAddress(publicKey)

	return &Wallet{
		PrivateKey: privateKey,
		PublicKey:  publicKey,
		Address:    address,
	}, nil
}

// NewWalletFromPrivateKey 秘密鍵からウォレットを復元
func NewWalletFromPrivateKey(privateKeyBytes []byte) (*Wallet, error) {
	// 秘密鍵をECDSA形式に変換
	privateKey, err := crypto.RestorePrivateKey(privateKeyBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to restore private key: %w", err)
	}

	// 公開鍵を生成
	publicKey := append([]byte{0x04},
		append(privateKey.PublicKey.X.Bytes(), privateKey.PublicKey.Y.Bytes()...)...)

	// アドレス生成
	address := GenerateAddress(publicKey)

	return &Wallet{
		PrivateKey: privateKey,
		PublicKey:  publicKey,
		Address:    address,
	}, nil
}

// GenerateAddress 公開鍵からBitcoinアドレスを生成
func GenerateAddress(publicKey []byte) string {
	// 1. SHA256ハッシュ
	sha256Hash := sha256.Sum256(publicKey)

	// 2. RIPEMD160ハッシュ（簡易版を使用）
	ripemdHash := crypto.RIPEMD160(sha256Hash[:])

	// 3. Base58Checkエンコード
	return crypto.Base58CheckEncode(AddressVersionByte, ripemdHash)
}

// ValidateAddress アドレスの妥当性をチェック
func ValidateAddress(address string) bool {
	_, _, err := crypto.Base58CheckDecode(address)
	return err == nil
}

// GetKeyPair 鍵ペア情報を取得
func (w *Wallet) GetKeyPair() *KeyPair {
	return &KeyPair{
		PrivateKey: w.PrivateKey.D.Bytes(),
		PublicKey:  w.PublicKey,
		Address:    w.Address,
	}
}

// SignTransaction トランザクションに署名
func (w *Wallet) SignTransaction(tx *blockchain.Transaction, prevTXs map[string]*blockchain.Transaction) error {
	// Coinbaseトランザクションは署名不要
	if tx.IsCoinbase() {
		return nil
	}

	// 署名対象のハッシュを計算
	txHash := tx.Hash()

	// 各入力に署名
	for i := range tx.Inputs {
		// 署名作成
		txHashBytes, err := hex.DecodeString(txHash)
		if err != nil {
			return fmt.Errorf("failed to decode transaction hash: %w", err)
		}

		r, s, err := ecdsa.Sign(rand.Reader, w.PrivateKey, txHashBytes)
		if err != nil {
			return fmt.Errorf("failed to sign transaction: %w", err)
		}

		// 署名をDER形式で格納
		signature := append(r.Bytes(), s.Bytes()...)
		tx.Inputs[i].Signature = signature
	}

	return nil
}

// VerifySignature 署名の検証
func (w *Wallet) VerifySignature(data []byte, signature []byte) bool {
	// 署名をr, sに分割
	if len(signature) < 64 {
		return false
	}

	r := new(big.Int).SetBytes(signature[:32])
	s := new(big.Int).SetBytes(signature[32:64])

	// 署名検証
	return ecdsa.Verify(&w.PrivateKey.PublicKey, data, r, s)
}

// GetBalance UTXOベースの残高計算
func (w *Wallet) GetBalance(utxoSet *blockchain.UTXOSet) int64 {
	var balance int64
	utxos := utxoSet.FindUTXOsByPubKeyHash(crypto.HashPubKey(w.PublicKey))

	for _, utxo := range utxos {
		balance += utxo.Output.Value
	}

	return balance
}

// NewWalletManager 新しいウォレット管理システムを作成
func NewWalletManager() *WalletManager {
	return &WalletManager{
		wallets: make(map[string]*Wallet),
	}
}

// CreateWallet 新しいウォレットを作成して管理対象に追加
func (wm *WalletManager) CreateWallet() (string, error) {
	wallet, err := NewWallet()
	if err != nil {
		return "", err
	}

	wm.wallets[wallet.Address] = wallet
	return wallet.Address, nil
}

// GetWallet アドレスに対応するウォレットを取得
func (wm *WalletManager) GetWallet(address string) (*Wallet, error) {
	wallet, exists := wm.wallets[address]
	if !exists {
		return nil, errors.New("wallet not found")
	}
	return wallet, nil
}

// GetAddresses 管理されているすべてのアドレスを取得
func (wm *WalletManager) GetAddresses() []string {
	addresses := make([]string, 0, len(wm.wallets))
	for address := range wm.wallets {
		addresses = append(addresses, address)
	}
	return addresses
}

// ImportWallet 秘密鍵からウォレットをインポート
func (wm *WalletManager) ImportWallet(privateKeyBytes []byte) (string, error) {
	wallet, err := NewWalletFromPrivateKey(privateKeyBytes)
	if err != nil {
		return "", err
	}

	wm.wallets[wallet.Address] = wallet
	return wallet.Address, nil
}

// SendTransaction トランザクションを作成・署名して送信準備
func (wm *WalletManager) SendTransaction(from, to string, amount int, utxoSet *blockchain.UTXOSet) (*blockchain.Transaction, error) {
	// 送金者のウォレットを取得
	fromWallet, err := wm.GetWallet(from)
	if err != nil {
		return nil, fmt.Errorf("sender wallet not found: %w", err)
	}

	// 受取者のアドレスを検証
	if !ValidateAddress(to) {
		return nil, errors.New("invalid recipient address")
	}

	// トランザクション作成
	fromPubKeyHash := crypto.HashPubKey(fromWallet.PublicKey)
	toPubKeyHash, err := AddressToPubKeyHash(to)
	if err != nil {
		return nil, fmt.Errorf("failed to convert address: %w", err)
	}

	// TransactionBuilderを使用してトランザクション作成
	builder := blockchain.NewTransactionBuilder(utxoSet)
	tx, err := builder.CreateTransaction(fromPubKeyHash, toPubKeyHash, int64(amount), fromWallet.PrivateKey)
	if err != nil {
		return nil, fmt.Errorf("failed to create transaction: %w", err)
	}

	// TransactionBuilderで既に署名済みのため、追加の署名は不要

	return tx, nil
}

// AddressToPubKeyHash アドレスを公開鍵ハッシュに変換
func AddressToPubKeyHash(address string) ([]byte, error) {
	_, payload, err := crypto.Base58CheckDecode(address)
	if err != nil {
		return nil, err
	}
	return payload, nil
}

// PubKeyHashToAddress 公開鍵ハッシュをアドレスに変換
func PubKeyHashToAddress(pubKeyHash []byte) string {
	return crypto.Base58CheckEncode(AddressVersionByte, pubKeyHash)
}

// GetWalletInfo ウォレットの詳細情報を取得
func (w *Wallet) GetWalletInfo() map[string]interface{} {
	return map[string]interface{}{
		"address":     w.Address,
		"public_key":  crypto.HexEncode(w.PublicKey),
		"private_key": crypto.HexEncode(w.PrivateKey.D.Bytes()),
	}
}
