package utils

import (
	"crypto/md5"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/google/uuid"
)

// GenerateChunkID 一意のチャンクIDを生成
func GenerateChunkID() string {
	return uuid.New().String()
}

// GenerateFileID 一意のファイルIDを生成
func GenerateFileID() string {
	return uuid.New().String()
}

// CalculateChecksum データのMD5チェックサムを計算
func CalculateChecksum(data []byte) string {
	hash := md5.Sum(data)
	return hex.EncodeToString(hash[:])
}

// CalculateFileChecksum ファイルのMD5チェックサムを計算
func CalculateFileChecksum(filePath string) (string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return "", fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	hash := md5.New()
	if _, err := io.Copy(hash, file); err != nil {
		return "", fmt.Errorf("failed to calculate checksum: %w", err)
	}

	return hex.EncodeToString(hash.Sum(nil)), nil
}

// EnsureDir ディレクトリが存在することを確認し、必要に応じて作成
func EnsureDir(dir string) error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return os.MkdirAll(dir, 0755)
	}
	return nil
}

// FileExists ファイルが存在するかチェック
func FileExists(filename string) bool {
	_, err := os.Stat(filename)
	return !os.IsNotExist(err)
}

// GetFileSize ファイルサイズを取得
func GetFileSize(filename string) (int64, error) {
	info, err := os.Stat(filename)
	if err != nil {
		return 0, err
	}
	return info.Size(), nil
}

// SplitFileIntoChunks ファイルをチャンクに分割
func SplitFileIntoChunks(fileSize, chunkSize int64) []ChunkInfo {
	var chunks []ChunkInfo

	offset := int64(0)
	for offset < fileSize {
		chunkID := GenerateChunkID()
		size := chunkSize

		// 最後のチャンクのサイズ調整
		if offset+size > fileSize {
			size = fileSize - offset
		}

		chunks = append(chunks, ChunkInfo{
			ID:     chunkID,
			Offset: offset,
			Size:   size,
		})

		offset += size
	}

	return chunks
}

// ChunkInfo チャンクの分割情報
type ChunkInfo struct {
	ID     string
	Offset int64
	Size   int64
}

// FormatBytes バイト数を人間が読みやすい形式に変換
func FormatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// SafeFilename ファイル名から安全でない文字を除去
func SafeFilename(filename string) string {
	// 簡単な実装：パスセパレータを除去
	return filepath.Base(filename)
}

// GenerateRandomBytes 指定されたサイズのランダムバイトを生成
func GenerateRandomBytes(size int) ([]byte, error) {
	bytes := make([]byte, size)
	_, err := rand.Read(bytes)
	if err != nil {
		return nil, fmt.Errorf("failed to generate random bytes: %w", err)
	}
	return bytes, nil
}

// RetryFunc 指定された回数まで関数を再実行
func RetryFunc(fn func() error, maxRetries int, delay time.Duration) error {
	var err error
	for i := 0; i <= maxRetries; i++ {
		err = fn()
		if err == nil {
			return nil
		}
		if i < maxRetries {
			time.Sleep(delay)
		}
	}
	return fmt.Errorf("function failed after %d retries: %w", maxRetries, err)
}

// JoinPath パスを結合（クロスプラットフォーム対応）
func JoinPath(elem ...string) string {
	return filepath.Join(elem...)
}

// NormalizePath パスを正規化
func NormalizePath(path string) string {
	return filepath.Clean(path)
}

// GetCurrentTimestamp 現在のUnixタイムスタンプを取得
func GetCurrentTimestamp() int64 {
	return time.Now().Unix()
}

// TimestampToTime Unix timestampをtime.Timeに変換
func TimestampToTime(timestamp int64) time.Time {
	return time.Unix(timestamp, 0)
}

// Min 2つの整数の最小値を返す
func Min(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

// Max 2つの整数の最大値を返す
func Max(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

// Contains スライスに要素が含まれているかチェック
func Contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}

// RemoveFromSlice スライスから要素を除去
func RemoveFromSlice(slice []string, item string) []string {
	result := make([]string, 0, len(slice))
	for _, s := range slice {
		if s != item {
			result = append(result, s)
		}
	}
	return result
}
