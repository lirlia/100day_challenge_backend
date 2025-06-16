package blockchain

import (
	"fmt"
	"math"
	"math/big"
	"strings"
	"sync"
	"time"

	"github.com/lirlia/100day_challenge_backend/day66_bitcoin_blockchain/pkg/crypto"
)

// 定数定義
const (
	DefaultDifficulty            = 4  // 開発用の初期難易度（先頭ゼロの数）
	MaxDifficulty                = 20 // 最大難易度
	TargetBlockTime              = 10 // 目標ブロック生成時間（秒）
	DifficultyAdjustmentInterval = 5  // 難易度調整間隔（ブロック数）
)

// ProofOfWork Proof of Work システム
type ProofOfWork struct {
	block      *Block   // マイニング対象のブロック
	target     *big.Int // 目標値（この値より小さいハッシュを見つける）
	difficulty int      // 難易度（先頭ゼロの数）
}

// Miner マイナー構造体
type Miner struct {
	difficulty int        // 現在の難易度
	isRunning  bool       // マイニング実行中フラグ
	stopCh     chan bool  // 停止チャネル
	mu         sync.Mutex // 排他制御用のミューテックス
}

// MiningResult マイニング結果
type MiningResult struct {
	Block    *Block        // マイニングされたブロック
	Nonce    int64         // 見つけたナンス値
	Hash     []byte        // ブロックハッシュ
	Duration time.Duration // マイニング時間
	Attempts int64         // 試行回数
}

// DifficultyAdjustment 難易度調整情報
type DifficultyAdjustment struct {
	OldDifficulty int           // 調整前の難易度
	NewDifficulty int           // 調整後の難易度
	TimeSpent     time.Duration // 実際にかかった時間
	TargetTime    time.Duration // 目標時間
	Reason        string        // 調整理由
}

// NewProofOfWork 新しいProof of Workインスタンスを作成
func NewProofOfWork(block *Block, difficulty int) *ProofOfWork {
	target := big.NewInt(1)
	// difficulty の数だけ左シフトして、その値を最大値から引く
	// 例: difficulty=4 の場合、先頭4桁が0である必要がある
	target.Lsh(target, uint(256-difficulty*4)) // 16進数1桁 = 4ビット

	return &ProofOfWork{
		block:      block,
		target:     target,
		difficulty: difficulty,
	}
}

// NewMiner 新しいマイナーを作成
func NewMiner(difficulty int) *Miner {
	if difficulty < 1 {
		difficulty = DefaultDifficulty
	}
	if difficulty > MaxDifficulty {
		difficulty = MaxDifficulty
	}

	return &Miner{
		difficulty: difficulty,
		isRunning:  false,
		stopCh:     make(chan bool, 1),
	}
}

// PrepareData マイニング用のデータを準備
func (pow *ProofOfWork) PrepareData(nonce int64) []byte {
	data := fmt.Sprintf("%d%s%s%d%d%d",
		pow.block.Timestamp,
		crypto.HexEncode(pow.block.MerkleRoot),
		crypto.HexEncode(pow.block.PrevBlockHash),
		pow.block.Height,
		pow.difficulty,
		nonce)
	return []byte(data)
}

// Run Proof of Work を実行（ナンス探索）
func (pow *ProofOfWork) Run() (int64, []byte, int64) {
	var hashInt big.Int
	var hash []byte
	var nonce int64 = 0
	var attempts int64 = 0

	fmt.Printf("マイニング開始 - 難易度: %d (先頭%dゼロ)\n", pow.difficulty, pow.difficulty)
	startTime := time.Now()

	for nonce < math.MaxInt64 {
		data := pow.PrepareData(nonce)
		hash = crypto.DoubleSHA256(data)

		// ハッシュをbig.Intに変換
		hashInt.SetBytes(hash)
		attempts++

		// 目標値と比較
		if hashInt.Cmp(pow.target) == -1 {
			duration := time.Since(startTime)
			fmt.Printf("✅ マイニング成功! ナンス: %d, 試行回数: %d, 時間: %v\n",
				nonce, attempts, duration)
			fmt.Printf("ハッシュ: %s\n", crypto.HexEncode(hash))
			break
		}

		nonce++

		// 進捗表示（100万回ごと）
		if attempts%1000000 == 0 {
			fmt.Printf("⏳ 試行中... %d万回, ナンス: %d\n", attempts/10000, nonce)
		}
	}

	return nonce, hash, attempts
}

// Validate Proof of Work が有効かを検証
func (pow *ProofOfWork) Validate() bool {
	var hashInt big.Int

	data := pow.PrepareData(pow.block.Nonce)
	hash := crypto.DoubleSHA256(data)
	hashInt.SetBytes(hash)

	isValid := hashInt.Cmp(pow.target) == -1

	if isValid {
		// ハッシュが実際にブロックのハッシュと一致するかもチェック
		if crypto.CompareHashes(hash, pow.block.Hash) {
			return true
		}
	}

	return false
}

// Mine ブロックをマイニング
func (miner *Miner) Mine(block *Block) (*MiningResult, error) {
	miner.mu.Lock()
	defer miner.mu.Unlock()

	if miner.isRunning {
		return nil, fmt.Errorf("マイニングは既に実行中です")
	}

	miner.isRunning = true
	defer func() { miner.isRunning = false }()

	startTime := time.Now()

	// Proof of Work を作成して実行
	pow := NewProofOfWork(block, miner.difficulty)
	nonce, hash, attempts := pow.Run()

	// ブロックを更新
	block.Nonce = nonce
	block.Hash = hash

	duration := time.Since(startTime)

	result := &MiningResult{
		Block:    block,
		Nonce:    nonce,
		Hash:     hash,
		Duration: duration,
		Attempts: attempts,
	}

	return result, nil
}

// Stop マイニングを停止
func (miner *Miner) Stop() {
	if miner.isRunning {
		select {
		case miner.stopCh <- true:
		default:
		}
	}
}

// IsRunning マイニング実行中かチェック
func (miner *Miner) IsRunning() bool {
	return miner.isRunning
}

// GetDifficulty 現在の難易度を取得
func (miner *Miner) GetDifficulty() int {
	return miner.difficulty
}

// SetDifficulty 難易度を設定
func (miner *Miner) SetDifficulty(difficulty int) {
	if difficulty < 1 {
		difficulty = 1
	}
	if difficulty > MaxDifficulty {
		difficulty = MaxDifficulty
	}
	miner.difficulty = difficulty
}

// CalculateDifficulty ブロック生成時間に基づいて難易度を計算
func CalculateDifficulty(blocks []*Block, currentDifficulty int) (*DifficultyAdjustment, int) {
	if len(blocks) < DifficultyAdjustmentInterval {
		// 十分なブロックがない場合は現在の難易度を維持
		return &DifficultyAdjustment{
			OldDifficulty: currentDifficulty,
			NewDifficulty: currentDifficulty,
			Reason:        "ブロック数不足（調整なし）",
		}, currentDifficulty
	}

	// 最新のブロックから必要な数だけ取得
	recentBlocks := blocks[len(blocks)-DifficultyAdjustmentInterval:]

	// 時間の計算
	startTime := recentBlocks[0].Timestamp
	endTime := recentBlocks[len(recentBlocks)-1].Timestamp
	actualTime := time.Duration(endTime-startTime) * time.Second
	targetTime := time.Duration(TargetBlockTime*DifficultyAdjustmentInterval) * time.Second

	adjustment := &DifficultyAdjustment{
		OldDifficulty: currentDifficulty,
		TimeSpent:     actualTime,
		TargetTime:    targetTime,
	}

	newDifficulty := currentDifficulty

	// 調整ロジック
	if actualTime < targetTime/2 {
		// 目標の半分未満の時間で生成 → 難易度上げる
		newDifficulty++
		adjustment.Reason = "ブロック生成が早すぎる（難易度上昇）"
	} else if actualTime > targetTime*2 {
		// 目標の2倍以上の時間がかかった → 難易度下げる
		newDifficulty--
		adjustment.Reason = "ブロック生成が遅すぎる（難易度低下）"
	} else {
		// 適切な範囲内 → 調整なし
		adjustment.Reason = "適切な生成時間（調整なし）"
	}

	// 難易度の範囲チェック
	if newDifficulty < 1 {
		newDifficulty = 1
		adjustment.Reason += " (最小値制限)"
	}
	if newDifficulty > MaxDifficulty {
		newDifficulty = MaxDifficulty
		adjustment.Reason += " (最大値制限)"
	}

	adjustment.NewDifficulty = newDifficulty

	return adjustment, newDifficulty
}

// ValidateBlockWork ブロックのProof of Workを検証
func ValidateBlockWork(block *Block, difficulty int) bool {
	pow := NewProofOfWork(block, difficulty)
	return pow.Validate()
}

// GetHashDifficulty ハッシュの実際の難易度を取得（先頭ゼロの数）
func GetHashDifficulty(hash []byte) int {
	hashHex := crypto.HexEncode(hash)
	difficulty := 0

	for _, char := range hashHex {
		if char == '0' {
			difficulty++
		} else {
			break
		}
	}

	return difficulty
}

// FormatHashDifficulty ハッシュを難易度が分かる形式でフォーマット
func FormatHashDifficulty(hash []byte) string {
	hashHex := crypto.HexEncode(hash)
	difficulty := GetHashDifficulty(hash)

	if difficulty > 0 {
		zeros := strings.Repeat("0", difficulty)
		remaining := hashHex[difficulty:]
		if len(remaining) > 10 {
			remaining = remaining[:10] + "..."
		}
		return fmt.Sprintf("%s%s (難易度:%d)", zeros, remaining, difficulty)
	}

	if len(hashHex) > 16 {
		return fmt.Sprintf("%s... (難易度:0)", hashHex[:16])
	}
	return fmt.Sprintf("%s (難易度:0)", hashHex)
}

// EstimateHashrate ハッシュレートを推定（ハッシュ/秒）
func EstimateHashrate(attempts int64, duration time.Duration) float64 {
	if duration == 0 {
		return 0
	}

	seconds := duration.Seconds()
	if seconds == 0 {
		return 0
	}

	return float64(attempts) / seconds
}

// String MiningResultの文字列表現
func (mr *MiningResult) String() string {
	hashrate := EstimateHashrate(mr.Attempts, mr.Duration)
	return fmt.Sprintf(`マイニング結果:
  ナンス: %d
  ハッシュ: %s
  試行回数: %d
  時間: %v
  ハッシュレート: %.2f H/s
  難易度: %d`,
		mr.Nonce,
		FormatHashDifficulty(mr.Hash),
		mr.Attempts,
		mr.Duration,
		hashrate,
		GetHashDifficulty(mr.Hash))
}

// String DifficultyAdjustmentの文字列表現
func (da *DifficultyAdjustment) String() string {
	return fmt.Sprintf(`難易度調整:
  調整前: %d → 調整後: %d
  経過時間: %v / 目標時間: %v
  理由: %s`,
		da.OldDifficulty,
		da.NewDifficulty,
		da.TimeSpent,
		da.TargetTime,
		da.Reason)
}
