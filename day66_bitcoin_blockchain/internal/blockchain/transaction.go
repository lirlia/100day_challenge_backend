package blockchain

import (
	"bytes"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// 定数定義
const (
	CoinbaseAmount = 50                  // マイニング報酬（Bitcoin初期の報酬）
	CoinbaseData   = "The Genesis Block" // Genesis Coinbase データ
)

// UTXO (Unspent Transaction Output) 未使用トランザクション出力
type UTXO struct {
	TxID   string   `json:"tx_id"`   // トランザクションID
	OutIdx int      `json:"out_idx"` // 出力インデックス
	Output TxOutput `json:"output"`  // 実際の出力
	Height int64    `json:"height"`  // ブロック高
}

// UTXOSet UTXO管理システム
type UTXOSet struct {
	UTXOs map[string]map[int]*UTXO `json:"utxos"` // TxID -> OutIdx -> UTXO のマッピング
}

// NewUTXOSet 新しいUTXOセットを作成
func NewUTXOSet() *UTXOSet {
	return &UTXOSet{
		UTXOs: make(map[string]map[int]*UTXO),
	}
}

// AddUTXO UTXOを追加
func (us *UTXOSet) AddUTXO(utxo *UTXO) {
	if us.UTXOs[utxo.TxID] == nil {
		us.UTXOs[utxo.TxID] = make(map[int]*UTXO)
	}
	us.UTXOs[utxo.TxID][utxo.OutIdx] = utxo
}

// RemoveUTXO UTXOを削除（消費済みにする）
func (us *UTXOSet) RemoveUTXO(txID string, outIdx int) error {
	if txMap, exists := us.UTXOs[txID]; exists {
		if _, exists := txMap[outIdx]; exists {
			delete(txMap, outIdx)
			if len(txMap) == 0 {
				delete(us.UTXOs, txID)
			}
			return nil
		}
	}
	return fmt.Errorf("UTXO not found: %s:%d", txID, outIdx)
}

// FindUTXO 指定されたトランザクション出力がUTXOかチェック
func (us *UTXOSet) FindUTXO(txID string, outIdx int) (*UTXO, bool) {
	if txMap, exists := us.UTXOs[txID]; exists {
		if utxo, exists := txMap[outIdx]; exists {
			return utxo, true
		}
	}
	return nil, false
}

// FindUTXOsByPubKeyHash 公開鍵ハッシュに対応するUTXOを取得
func (us *UTXOSet) FindUTXOsByPubKeyHash(pubKeyHash []byte) []*UTXO {
	var utxos []*UTXO

	for _, txMap := range us.UTXOs {
		for _, utxo := range txMap {
			if bytes.Equal(utxo.Output.PubKeyHash, pubKeyHash) {
				utxos = append(utxos, utxo)
			}
		}
	}

	return utxos
}

// GetBalance 指定された公開鍵ハッシュの残高を計算
func (us *UTXOSet) GetBalance(pubKeyHash []byte) int64 {
	var balance int64
	utxos := us.FindUTXOsByPubKeyHash(pubKeyHash)

	for _, utxo := range utxos {
		balance += utxo.Output.Value
	}

	return balance
}

// Copy UTXOSetのディープコピー
func (us *UTXOSet) Copy() *UTXOSet {
	newSet := NewUTXOSet()

	for txID, txMap := range us.UTXOs {
		for outIdx, utxo := range txMap {
			newUTXO := &UTXO{
				TxID:   txID,
				OutIdx: outIdx,
				Output: utxo.Output, // TxOutputも値コピー
				Height: utxo.Height,
			}
			newSet.AddUTXO(newUTXO)
		}
	}

	return newSet
}

// TotalUTXOs 総UTXO数を取得
func (us *UTXOSet) TotalUTXOs() int {
	count := 0
	for _, txMap := range us.UTXOs {
		count += len(txMap)
	}
	return count
}

// TransactionBuilder トランザクション作成ヘルパー
type TransactionBuilder struct {
	utxoSet *UTXOSet
}

// NewTransactionBuilder トランザクションビルダーを作成
func NewTransactionBuilder(utxoSet *UTXOSet) *TransactionBuilder {
	return &TransactionBuilder{
		utxoSet: utxoSet,
	}
}

// CreateTransaction 新しいトランザクションを作成
func (tb *TransactionBuilder) CreateTransaction(from, to []byte, amount int64, privateKey *ecdsa.PrivateKey) (*Transaction, error) {
	if amount <= 0 {
		return nil, errors.New("amount must be positive")
	}

	// 送信者のUTXOを取得
	utxos := tb.utxoSet.FindUTXOsByPubKeyHash(from)
	if len(utxos) == 0 {
		return nil, errors.New("no UTXOs found for sender")
	}

	// 必要な金額を集める
	var inputs []TxInput
	var totalInput int64

	for _, utxo := range utxos {
		if totalInput >= amount {
			break
		}

		input := TxInput{
			Txid:      []byte(utxo.TxID),
			Vout:      utxo.OutIdx,
			Signature: []byte{}, // 後で署名
			PubKey:    append(privateKey.PublicKey.X.Bytes(), privateKey.PublicKey.Y.Bytes()...),
		}
		inputs = append(inputs, input)
		totalInput += utxo.Output.Value
	}

	if totalInput < amount {
		return nil, fmt.Errorf("insufficient funds: have %d, need %d", totalInput, amount)
	}

	// 出力を作成
	var outputs []TxOutput

	// 送金先への出力
	outputs = append(outputs, TxOutput{
		Value:      amount,
		PubKeyHash: to,
	})

	// お釣りがある場合、送信者への出力
	if totalInput > amount {
		outputs = append(outputs, TxOutput{
			Value:      totalInput - amount,
			PubKeyHash: from,
		})
	}

	// トランザクション作成
	tx := &Transaction{
		ID:      []byte{}, // 後で計算
		Inputs:  inputs,
		Outputs: outputs,
	}

	// トランザクションIDを計算
	tx.ID = []byte(tx.Hash())

	// 各入力に署名
	for idx := range tx.Inputs {
		signature, err := tb.signTxInput(tx, idx, privateKey)
		if err != nil {
			return nil, fmt.Errorf("failed to sign input %d: %w", idx, err)
		}
		tx.Inputs[idx].Signature = signature
	}

	return tx, nil
}

// CreateCoinbaseTransaction Coinbaseトランザクション（マイニング報酬）を作成
func CreateCoinbaseTransaction(to []byte, data string) *Transaction {
	if data == "" {
		data = fmt.Sprintf("Coinbase for %x", to)
	}

	// Coinbase入力（特別な入力）
	txin := TxInput{
		Txid:      []byte{},
		Vout:      -1,
		Signature: nil,
		PubKey:    []byte(data),
	}

	// マイニング報酬出力
	txout := TxOutput{
		Value:      CoinbaseAmount,
		PubKeyHash: to,
	}

	tx := &Transaction{
		ID:      []byte{},
		Inputs:  []TxInput{txin},
		Outputs: []TxOutput{txout},
	}

	tx.ID = []byte(tx.Hash())
	return tx
}

// IsCoinbase Coinbaseトランザクションかチェック
func (tx *Transaction) IsCoinbase() bool {
	return len(tx.Inputs) == 1 && len(tx.Inputs[0].Txid) == 0 && tx.Inputs[0].Vout == -1
}

// VerifyTransaction トランザクション検証
func (tx *Transaction) VerifyTransaction(utxoSet *UTXOSet) error {
	if tx.IsCoinbase() {
		return nil // Coinbaseトランザクションは特別扱い
	}

	// 入力検証
	for i, input := range tx.Inputs {
		// 参照されているUTXOが存在するかチェック
		utxo, exists := utxoSet.FindUTXO(string(input.Txid), input.Vout)
		if !exists {
			return fmt.Errorf("input %d: UTXO not found %s:%d", i, string(input.Txid), input.Vout)
		}

		// 署名検証
		if err := tx.verifyInputSignature(i, input, utxo.Output.PubKeyHash); err != nil {
			return fmt.Errorf("input %d: signature verification failed: %w", i, err)
		}
	}

	// 入出力金額の検証
	inputSum := int64(0)
	for _, input := range tx.Inputs {
		utxo, _ := utxoSet.FindUTXO(string(input.Txid), input.Vout)
		inputSum += utxo.Output.Value
	}

	outputSum := int64(0)
	for _, output := range tx.Outputs {
		if output.Value <= 0 {
			return errors.New("output value must be positive")
		}
		outputSum += output.Value
	}

	if inputSum < outputSum {
		return fmt.Errorf("input sum (%d) less than output sum (%d)", inputSum, outputSum)
	}

	return nil
}

// Hash トランザクションのハッシュを計算
func (tx *Transaction) Hash() string {
	// 署名なしでハッシュ計算
	txCopy := tx.copyWithoutSignatures()

	data, err := json.Marshal(txCopy)
	if err != nil {
		return ""
	}

	hash := sha256.Sum256(data)
	return hex.EncodeToString(hash[:])
}

// copyWithoutSignatures 署名なしのトランザクションコピー
func (tx *Transaction) copyWithoutSignatures() *Transaction {
	inputs := make([]TxInput, len(tx.Inputs))
	for i, input := range tx.Inputs {
		inputs[i] = TxInput{
			Txid:      input.Txid,
			Vout:      input.Vout,
			Signature: nil, // 署名は除外
			PubKey:    input.PubKey,
		}
	}

	return &Transaction{
		ID:      []byte{},
		Inputs:  inputs,
		Outputs: tx.Outputs,
	}
}

// signTxInput トランザクション入力に署名
func (tb *TransactionBuilder) signTxInput(tx *Transaction, inIdx int, privateKey *ecdsa.PrivateKey) ([]byte, error) {
	// 署名対象データの準備
	txCopy := tx.copyWithoutSignatures()
	txCopy.ID = []byte(txCopy.Hash())

	// 署名データを作成
	signData := fmt.Sprintf("%s:%d", string(txCopy.ID), inIdx)
	hash := sha256.Sum256([]byte(signData))

	// ECDSA署名
	r, s, err := ecdsa.Sign(rand.Reader, privateKey, hash[:])
	if err != nil {
		return nil, err
	}

	// 署名をバイト配列に変換
	signature := append(r.Bytes(), s.Bytes()...)
	return signature, nil
}

// verifyInputSignature 入力の署名検証
func (tx *Transaction) verifyInputSignature(inIdx int, input TxInput, pubKeyHash []byte) error {
	// 公開鍵を復元
	pubKey, err := crypto.RestorePublicKey(input.PubKey)
	if err != nil {
		return fmt.Errorf("failed to restore public key: %w", err)
	}

	// 公開鍵ハッシュ検証
	computedHash := crypto.HashPubKey(input.PubKey)
	if !bytes.Equal(computedHash, pubKeyHash) {
		return errors.New("public key hash mismatch")
	}

	// 署名データの準備
	txCopy := tx.copyWithoutSignatures()
	txCopy.ID = []byte(txCopy.Hash())
	signData := fmt.Sprintf("%s:%d", string(txCopy.ID), inIdx)
	hash := sha256.Sum256([]byte(signData))

	// 署名を復元
	if len(input.Signature) < 64 {
		return errors.New("invalid signature length")
	}

	r := new(big.Int).SetBytes(input.Signature[:32])
	s := new(big.Int).SetBytes(input.Signature[32:64])

	// ECDSA署名検証
	if !ecdsa.Verify(pubKey, hash[:], r, s) {
		return errors.New("signature verification failed")
	}

	return nil
}

// ProcessTransaction UTXOセットにトランザクションを適用
func (us *UTXOSet) ProcessTransaction(tx *Transaction, blockHeight int64) error {
	// Coinbaseでない場合、入力UTXOを削除
	if !tx.IsCoinbase() {
		for _, input := range tx.Inputs {
			err := us.RemoveUTXO(string(input.Txid), input.Vout)
			if err != nil {
				return fmt.Errorf("failed to remove UTXO %s:%d: %w", string(input.Txid), input.Vout, err)
			}
		}
	}

	// 新しいUTXOを追加
	for idx, output := range tx.Outputs {
		utxo := &UTXO{
			TxID:   string(tx.ID),
			OutIdx: idx,
			Output: output,
			Height: blockHeight,
		}
		us.AddUTXO(utxo)
	}

	return nil
}

// String UTXOの文字列表現
func (utxo *UTXO) String() string {
	return fmt.Sprintf("UTXO{%s:%d, Value: %d, Height: %d}",
		utxo.TxID[:8], utxo.OutIdx, utxo.Output.Value, utxo.Height)
}

// String UTXOSetの文字列表現
func (us *UTXOSet) String() string {
	var result bytes.Buffer
	result.WriteString(fmt.Sprintf("UTXOSet{Total: %d UTXOs}\n", us.TotalUTXOs()))

	for txID, txMap := range us.UTXOs {
		for outIdx, utxo := range txMap {
			result.WriteString(fmt.Sprintf("  %s:%d -> %s\n", txID[:8], outIdx, utxo.String()))
		}
	}

	return result.String()
}
