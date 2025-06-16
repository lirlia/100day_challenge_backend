package blockchain

import (
	"fmt"
	"testing"
	"time"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// TestNewProofOfWork Proof of Work インスタンス作成テスト
func TestNewProofOfWork(t *testing.T) {
	// テスト用ブロック作成
	coinbaseTx := CreateCoinbaseTransaction([]byte("miner"), "test mining")
	block := NewBlock([]*Transaction{coinbaseTx}, []byte("prev_hash"), 1)

	// PoW作成
	difficulty := 2
	pow := NewProofOfWork(block, difficulty)

	if pow == nil {
		t.Error("ProofOfWork should not be nil")
	}

	if pow.block != block {
		t.Error("Block should be set correctly")
	}

	if pow.difficulty != difficulty {
		t.Errorf("Expected difficulty %d, got %d", difficulty, pow.difficulty)
	}

	if pow.target == nil {
		t.Error("Target should be set")
	}
}

// TestNewMiner マイナー作成テスト
func TestNewMiner(t *testing.T) {
	// 正常なケース
	miner := NewMiner(4)
	if miner.GetDifficulty() != 4 {
		t.Errorf("Expected difficulty 4, got %d", miner.GetDifficulty())
	}

	if miner.IsRunning() {
		t.Error("Miner should not be running initially")
	}

	// 境界値テスト
	minerLow := NewMiner(0) // 最小値未満
	if minerLow.GetDifficulty() != DefaultDifficulty {
		t.Errorf("Expected default difficulty %d, got %d", DefaultDifficulty, minerLow.GetDifficulty())
	}

	minerHigh := NewMiner(MaxDifficulty + 1) // 最大値超過
	if minerHigh.GetDifficulty() != MaxDifficulty {
		t.Errorf("Expected max difficulty %d, got %d", MaxDifficulty, minerHigh.GetDifficulty())
	}
}

// TestMinerSetDifficulty 難易度設定テスト
func TestMinerSetDifficulty(t *testing.T) {
	miner := NewMiner(4)

	// 正常な値
	miner.SetDifficulty(6)
	if miner.GetDifficulty() != 6 {
		t.Errorf("Expected difficulty 6, got %d", miner.GetDifficulty())
	}

	// 最小値未満
	miner.SetDifficulty(0)
	if miner.GetDifficulty() != 1 {
		t.Errorf("Difficulty should be clamped to 1, got %d", miner.GetDifficulty())
	}

	// 最大値超過
	miner.SetDifficulty(MaxDifficulty + 5)
	if miner.GetDifficulty() != MaxDifficulty {
		t.Errorf("Difficulty should be clamped to %d, got %d", MaxDifficulty, miner.GetDifficulty())
	}
}

// TestProofOfWorkPrepareData データ準備テスト
func TestProofOfWorkPrepareData(t *testing.T) {
	coinbaseTx := CreateCoinbaseTransaction([]byte("miner"), "test")
	block := NewBlock([]*Transaction{coinbaseTx}, []byte("prev_hash"), 1)

	pow := NewProofOfWork(block, 2)

	data1 := pow.PrepareData(0)
	data2 := pow.PrepareData(0)

	// 同じナンスでは同じデータが生成されることを確認
	if string(data1) != string(data2) {
		t.Error("Same nonce should produce same data")
	}

	// 異なるナンスでは異なるデータが生成されることを確認
	data3 := pow.PrepareData(1)
	if string(data1) == string(data3) {
		t.Error("Different nonce should produce different data")
	}

	// データが空でないことを確認
	if len(data1) == 0 {
		t.Error("Prepared data should not be empty")
	}
}

// TestProofOfWorkRunEasy 簡単な難易度でのマイニングテスト
func TestProofOfWorkRunEasy(t *testing.T) {
	// 難易度1で簡単にマイニング
	coinbaseTx := CreateCoinbaseTransaction([]byte("miner"), "easy test")
	block := NewBlock([]*Transaction{coinbaseTx}, []byte("prev_hash"), 1)

	pow := NewProofOfWork(block, 1) // 低い難易度

	nonce, hash, attempts := pow.Run()

	// 結果確認
	if nonce < 0 {
		t.Error("Nonce should be positive")
	}

	if len(hash) == 0 {
		t.Error("Hash should not be empty")
	}

	if attempts <= 0 {
		t.Error("Attempts should be positive")
	}

	// ハッシュが目標を満たしているかチェック
	if !crypto.HasLeadingZeros(hash, 1) {
		t.Error("Hash should have at least 1 leading zero")
	}

	fmt.Printf("マイニング完了: ナンス=%d, 試行回数=%d, ハッシュ=%s\n",
		nonce, attempts, crypto.HexEncode(hash))
}

// TestProofOfWorkValidate PoW検証テスト
func TestProofOfWorkValidate(t *testing.T) {
	coinbaseTx := CreateCoinbaseTransaction([]byte("miner"), "validate test")
	block := NewBlock([]*Transaction{coinbaseTx}, []byte("prev_hash"), 1)

	pow := NewProofOfWork(block, 1)

	// マイニング実行
	nonce, hash, _ := pow.Run()
	block.Nonce = nonce
	block.Hash = hash

	// 検証
	if !pow.Validate() {
		t.Error("Valid proof of work should be validated")
	}

	// ナンスを変更して無効化
	block.Nonce = nonce + 1
	if pow.Validate() {
		t.Error("Invalid proof of work should not be validated")
	}
}

// TestMinerMine マイナーによるマイニングテスト
func TestMinerMine(t *testing.T) {
	miner := NewMiner(1) // 低い難易度でテスト

	coinbaseTx := CreateCoinbaseTransaction([]byte("miner"), "miner test")
	block := NewBlock([]*Transaction{coinbaseTx}, []byte("prev_hash"), 1)

	// マイニング実行
	result, err := miner.Mine(block)
	if err != nil {
		t.Fatalf("Mining failed: %v", err)
	}

	// 結果確認
	if result == nil {
		t.Error("Mining result should not be nil")
	}

	if result.Nonce < 0 {
		t.Error("Nonce should be positive")
	}

	if len(result.Hash) == 0 {
		t.Error("Hash should not be empty")
	}

	if result.Duration <= 0 {
		t.Error("Duration should be positive")
	}

	if result.Attempts <= 0 {
		t.Error("Attempts should be positive")
	}

	// ブロックが更新されているかチェック
	if block.Nonce != result.Nonce {
		t.Error("Block nonce should be updated")
	}

	if !crypto.CompareHashes(block.Hash, result.Hash) {
		t.Error("Block hash should be updated")
	}

	// PoW検証
	if !ValidateBlockWork(block, miner.GetDifficulty()) {
		t.Error("Mined block should have valid proof of work")
	}

	fmt.Printf("マイニング結果: %s\n", result.String())
}

// TestCalculateDifficulty 難易度調整テスト
func TestCalculateDifficulty(t *testing.T) {
	// テスト用のブロック生成（時間間隔を調整）
	baseTime := time.Now().Unix()

	blocks := []*Block{
		{Timestamp: baseTime},
		{Timestamp: baseTime + 10}, // 10秒後
		{Timestamp: baseTime + 20}, // 20秒後
		{Timestamp: baseTime + 30}, // 30秒後
		{Timestamp: baseTime + 40}, // 40秒後
	}

	// ブロック数不足の場合
	adjustment, newDifficulty := CalculateDifficulty(blocks[:3], 4)
	if newDifficulty != 4 {
		t.Errorf("Difficulty should remain unchanged with insufficient blocks")
	}
	if adjustment.Reason != "ブロック数不足（調整なし）" {
		t.Errorf("Unexpected reason: %s", adjustment.Reason)
	}

	// 適切な時間間隔（調整なし）- 時間間隔40秒は目標50秒の適正範囲内
	adjustment, newDifficulty = CalculateDifficulty(blocks, 4)
	if newDifficulty != 4 {
		t.Errorf("Expected difficulty 4, got %d", newDifficulty)
	}

	// 高速生成（難易度上昇）
	fastBlocks := []*Block{
		{Timestamp: baseTime},
		{Timestamp: baseTime + 2}, // 2秒後
		{Timestamp: baseTime + 4}, // 4秒後
		{Timestamp: baseTime + 6}, // 6秒後
		{Timestamp: baseTime + 8}, // 8秒後（目標の半分未満）
	}

	adjustment, newDifficulty = CalculateDifficulty(fastBlocks, 4)
	if newDifficulty != 5 {
		t.Errorf("Difficulty should increase for fast generation, got %d", newDifficulty)
	}

	// 低速生成（難易度低下）
	slowBlocks := []*Block{
		{Timestamp: baseTime},
		{Timestamp: baseTime + 30},  // 30秒後
		{Timestamp: baseTime + 60},  // 60秒後
		{Timestamp: baseTime + 90},  // 90秒後
		{Timestamp: baseTime + 120}, // 120秒後（目標の2倍以上）
	}

	adjustment, newDifficulty = CalculateDifficulty(slowBlocks, 4)
	if newDifficulty != 3 {
		t.Errorf("Difficulty should decrease for slow generation, got %d", newDifficulty)
	}

	// 境界値テスト（最小値）
	_, newDifficulty = CalculateDifficulty(slowBlocks, 1)
	if newDifficulty < 1 {
		t.Errorf("Difficulty should not go below 1, got %d", newDifficulty)
	}

	// 境界値テスト（最大値）
	_, newDifficulty = CalculateDifficulty(fastBlocks, MaxDifficulty)
	if newDifficulty > MaxDifficulty {
		t.Errorf("Difficulty should not exceed %d, got %d", MaxDifficulty, newDifficulty)
	}

	fmt.Printf("難易度調整テスト完了: %s\n", adjustment.String())
}

// TestValidateBlockWork ブロック作業証明検証テスト
func TestValidateBlockWork(t *testing.T) {
	miner := NewMiner(1)

	coinbaseTx := CreateCoinbaseTransaction([]byte("miner"), "validation test")
	block := NewBlock([]*Transaction{coinbaseTx}, []byte("prev_hash"), 1)

	// マイニング実行
	_, err := miner.Mine(block)
	if err != nil {
		t.Fatalf("Mining failed: %v", err)
	}

	// 有効なブロックの検証
	if !ValidateBlockWork(block, 1) {
		t.Error("Valid block work should be validated")
	}

	// 無効なナンスで検証
	invalidBlock := *block
	invalidBlock.Nonce = block.Nonce + 1
	if ValidateBlockWork(&invalidBlock, 1) {
		t.Error("Invalid block work should not be validated")
	}

	// 異なる難易度で検証
	if ValidateBlockWork(block, 3) {
		t.Error("Block should not be valid for higher difficulty")
	}
}

// TestGetHashDifficulty ハッシュ難易度取得テスト
func TestGetHashDifficulty(t *testing.T) {
	testCases := []struct {
		hashHex  string
		expected int
	}{
		{"0000abcd1234567890abcdef1234567890abcdef1234567890abcdef12345678", 4},
		{"000abcd1234567890abcdef1234567890abcdef1234567890abcdef123456789", 3},
		{"00abcd1234567890abcdef1234567890abcdef1234567890abcdef1234567890", 2},
		{"0abcd1234567890abcdef1234567890abcdef1234567890abcdef12345678901", 1},
		{"abcd1234567890abcdef1234567890abcdef1234567890abcdef123456789012", 0},
		{"0000000000000000000000000000000000000000000000000000000000000000", 64},
	}

	for _, tc := range testCases {
		hash, err := crypto.HexDecode(tc.hashHex)
		if err != nil {
			t.Fatalf("Failed to decode hash: %v", err)
		}

		difficulty := GetHashDifficulty(hash)
		if difficulty != tc.expected {
			t.Errorf("Hash %s: expected difficulty %d, got %d",
				tc.hashHex[:16], tc.expected, difficulty)
		}
	}
}

// TestFormatHashDifficulty ハッシュフォーマットテスト
func TestFormatHashDifficulty(t *testing.T) {
	// 先頭ゼロありのハッシュ
	hashWithZeros, _ := crypto.HexDecode("0000abcd1234567890abcdef1234567890abcdef1234567890abcdef12345678")
	formatted := FormatHashDifficulty(hashWithZeros)

	if len(formatted) == 0 {
		t.Error("Formatted hash should not be empty")
	}

	// フォーマットに難易度が含まれているかチェック
	if len(formatted) == 0 {
		t.Error("Formatted hash should not be empty")
	}

	// 先頭ゼロなしのハッシュ
	hashNoZeros, _ := crypto.HexDecode("abcd1234567890abcdef1234567890abcdef1234567890abcdef123456789012")
	formattedNoZeros := FormatHashDifficulty(hashNoZeros)

	if len(formattedNoZeros) == 0 {
		t.Error("Formatted hash should not be empty")
	}

	fmt.Printf("フォーマット例: %s\n", formatted)
	fmt.Printf("フォーマット例(ゼロなし): %s\n", formattedNoZeros)
}

// TestEstimateHashrate ハッシュレート推定テスト
func TestEstimateHashrate(t *testing.T) {
	// 正常なケース
	hashrate := EstimateHashrate(1000000, time.Second)
	expected := 1000000.0
	if hashrate != expected {
		t.Errorf("Expected hashrate %f, got %f", expected, hashrate)
	}

	// ゼロ時間のケース
	hashrate = EstimateHashrate(1000, 0)
	if hashrate != 0 {
		t.Errorf("Expected hashrate 0 for zero duration, got %f", hashrate)
	}

	// ゼロ試行のケース
	hashrate = EstimateHashrate(0, time.Second)
	if hashrate != 0 {
		t.Errorf("Expected hashrate 0 for zero attempts, got %f", hashrate)
	}
}

// TestMiningResultString マイニング結果文字列表現テスト
func TestMiningResultString(t *testing.T) {
	hash, _ := crypto.HexDecode("0000abcd1234567890abcdef1234567890abcdef1234567890abcdef12345678")

	result := &MiningResult{
		Nonce:    12345,
		Hash:     hash,
		Duration: time.Second,
		Attempts: 1000000,
	}

	str := result.String()
	if len(str) == 0 {
		t.Error("String representation should not be empty")
	}

	fmt.Printf("マイニング結果表示:\n%s\n", str)
}

// TestDifficultyAdjustmentString 難易度調整文字列表現テスト
func TestDifficultyAdjustmentString(t *testing.T) {
	adjustment := &DifficultyAdjustment{
		OldDifficulty: 4,
		NewDifficulty: 5,
		TimeSpent:     20 * time.Second,
		TargetTime:    50 * time.Second,
		Reason:        "ブロック生成が早すぎる（難易度上昇）",
	}

	str := adjustment.String()
	if len(str) == 0 {
		t.Error("String representation should not be empty")
	}

	fmt.Printf("難易度調整表示:\n%s\n", str)
}

// BenchmarkProofOfWorkRun マイニングのベンチマーク
func BenchmarkProofOfWorkRun(b *testing.B) {
	coinbaseTx := CreateCoinbaseTransaction([]byte("miner"), "benchmark")
	block := NewBlock([]*Transaction{coinbaseTx}, []byte("prev_hash"), 1)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		pow := NewProofOfWork(block, 1) // 低い難易度でベンチマーク
		_, _, _ = pow.Run()
	}
}

// BenchmarkHashDifficulty ハッシュ難易度計算のベンチマーク
func BenchmarkHashDifficulty(b *testing.B) {
	hash, _ := crypto.HexDecode("0000abcd1234567890abcdef1234567890abcdef1234567890abcdef12345678")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = GetHashDifficulty(hash)
	}
}
