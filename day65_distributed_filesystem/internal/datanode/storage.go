package datanode

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/utils"
)

// ChunkStorage チャンクストレージ管理
type ChunkStorage struct {
	dataDir string
	chunks  map[string]*ChunkInfo
	mu      sync.RWMutex
}

// ChunkInfo チャンク情報
type ChunkInfo struct {
	ID       string
	Size     int64
	Checksum string
	FilePath string
}

// NewChunkStorage 新しいChunkStorageを作成
func NewChunkStorage(dataDir string) (*ChunkStorage, error) {
	if err := utils.EnsureDir(dataDir); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	storage := &ChunkStorage{
		dataDir: dataDir,
		chunks:  make(map[string]*ChunkInfo),
	}

	// 既存のチャンクを読み込み
	if err := storage.loadExistingChunks(); err != nil {
		return nil, fmt.Errorf("failed to load existing chunks: %w", err)
	}

	return storage, nil
}

// loadExistingChunks 既存のチャンクを読み込み
func (cs *ChunkStorage) loadExistingChunks() error {
	return filepath.Walk(cs.dataDir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if !info.IsDir() && filepath.Ext(path) == ".chunk" {
			chunkID := filepath.Base(path)
			chunkID = chunkID[:len(chunkID)-6] // .chunk拡張子を除去

			// チェックサムを計算
			checksum, err := utils.CalculateFileChecksum(path)
			if err != nil {
				fmt.Printf("Warning: failed to calculate checksum for %s: %v\n", path, err)
				checksum = ""
			}

			cs.chunks[chunkID] = &ChunkInfo{
				ID:       chunkID,
				Size:     info.Size(),
				Checksum: checksum,
				FilePath: path,
			}
		}

		return nil
	})
}

// WriteChunk チャンクを書き込み
func (cs *ChunkStorage) WriteChunk(chunkID string, data []byte) (string, error) {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	chunkPath := cs.getChunkPath(chunkID)

	// チャンクファイルを作成
	file, err := os.Create(chunkPath)
	if err != nil {
		return "", fmt.Errorf("failed to create chunk file: %w", err)
	}
	defer file.Close()

	// データを書き込み
	if _, err := file.Write(data); err != nil {
		return "", fmt.Errorf("failed to write chunk data: %w", err)
	}

	// チェックサムを計算
	checksum := utils.CalculateChecksum(data)

	// チャンク情報を保存
	cs.chunks[chunkID] = &ChunkInfo{
		ID:       chunkID,
		Size:     int64(len(data)),
		Checksum: checksum,
		FilePath: chunkPath,
	}

	return checksum, nil
}

// ReadChunk チャンクを読み込み
func (cs *ChunkStorage) ReadChunk(chunkID string, offset, size int64) ([]byte, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	chunkInfo, exists := cs.chunks[chunkID]
	if !exists {
		return nil, fmt.Errorf("chunk not found: %s", chunkID)
	}

	file, err := os.Open(chunkInfo.FilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to open chunk file: %w", err)
	}
	defer file.Close()

	// オフセット位置にシーク
	if offset > 0 {
		if _, err := file.Seek(offset, io.SeekStart); err != nil {
			return nil, fmt.Errorf("failed to seek to offset: %w", err)
		}
	}

	// サイズを調整
	if size <= 0 || offset+size > chunkInfo.Size {
		size = chunkInfo.Size - offset
	}

	// データを読み込み
	data := make([]byte, size)
	n, err := file.Read(data)
	if err != nil && err != io.EOF {
		return nil, fmt.Errorf("failed to read chunk data: %w", err)
	}

	return data[:n], nil
}

// DeleteChunk チャンクを削除
func (cs *ChunkStorage) DeleteChunk(chunkID string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	chunkInfo, exists := cs.chunks[chunkID]
	if !exists {
		return fmt.Errorf("chunk not found: %s", chunkID)
	}

	// ファイルを削除
	if err := os.Remove(chunkInfo.FilePath); err != nil {
		return fmt.Errorf("failed to remove chunk file: %w", err)
	}

	// メタデータを削除
	delete(cs.chunks, chunkID)

	return nil
}

// ChunkExists チャンクが存在するかチェック
func (cs *ChunkStorage) ChunkExists(chunkID string) bool {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	_, exists := cs.chunks[chunkID]
	return exists
}

// GetChunkInfo チャンク情報を取得
func (cs *ChunkStorage) GetChunkInfo(chunkID string) (*ChunkInfo, error) {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	chunkInfo, exists := cs.chunks[chunkID]
	if !exists {
		return nil, fmt.Errorf("chunk not found: %s", chunkID)
	}

	// コピーを返す
	return &ChunkInfo{
		ID:       chunkInfo.ID,
		Size:     chunkInfo.Size,
		Checksum: chunkInfo.Checksum,
		FilePath: chunkInfo.FilePath,
	}, nil
}

// GetAllChunks 全チャンク情報を取得
func (cs *ChunkStorage) GetAllChunks() map[string]*ChunkInfo {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	result := make(map[string]*ChunkInfo)
	for id, info := range cs.chunks {
		result[id] = &ChunkInfo{
			ID:       info.ID,
			Size:     info.Size,
			Checksum: info.Checksum,
			FilePath: info.FilePath,
		}
	}

	return result
}

// GetChunkIDs 全チャンクIDを取得
func (cs *ChunkStorage) GetChunkIDs() []string {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	ids := make([]string, 0, len(cs.chunks))
	for id := range cs.chunks {
		ids = append(ids, id)
	}

	return ids
}

// GetUsedSpace 使用済み容量を取得
func (cs *ChunkStorage) GetUsedSpace() int64 {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	var total int64
	for _, info := range cs.chunks {
		total += info.Size
	}

	return total
}

// GetChunkCount チャンク数を取得
func (cs *ChunkStorage) GetChunkCount() int {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	return len(cs.chunks)
}

// VerifyChunk チャンクの整合性を検証
func (cs *ChunkStorage) VerifyChunk(chunkID string) error {
	cs.mu.RLock()
	chunkInfo, exists := cs.chunks[chunkID]
	cs.mu.RUnlock()

	if !exists {
		return fmt.Errorf("chunk not found: %s", chunkID)
	}

	// ファイルが存在するかチェック
	if !utils.FileExists(chunkInfo.FilePath) {
		return fmt.Errorf("chunk file not found: %s", chunkInfo.FilePath)
	}

	// サイズをチェック
	fileSize, err := utils.GetFileSize(chunkInfo.FilePath)
	if err != nil {
		return fmt.Errorf("failed to get file size: %w", err)
	}

	if fileSize != chunkInfo.Size {
		return fmt.Errorf("size mismatch: expected %d, got %d", chunkInfo.Size, fileSize)
	}

	// チェックサムを検証
	if chunkInfo.Checksum != "" {
		actualChecksum, err := utils.CalculateFileChecksum(chunkInfo.FilePath)
		if err != nil {
			return fmt.Errorf("failed to calculate checksum: %w", err)
		}

		if actualChecksum != chunkInfo.Checksum {
			return fmt.Errorf("checksum mismatch: expected %s, got %s", chunkInfo.Checksum, actualChecksum)
		}
	}

	return nil
}

// getChunkPath チャンクファイルのパスを取得
func (cs *ChunkStorage) getChunkPath(chunkID string) string {
	return filepath.Join(cs.dataDir, chunkID+".chunk")
}

// CopyChunk チャンクを別のチャンクIDでコピー
func (cs *ChunkStorage) CopyChunk(sourceChunkID, targetChunkID string) error {
	cs.mu.Lock()
	defer cs.mu.Unlock()

	sourceInfo, exists := cs.chunks[sourceChunkID]
	if !exists {
		return fmt.Errorf("source chunk not found: %s", sourceChunkID)
	}

	// ターゲットが既に存在する場合はエラー
	if _, exists := cs.chunks[targetChunkID]; exists {
		return fmt.Errorf("target chunk already exists: %s", targetChunkID)
	}

	targetPath := cs.getChunkPath(targetChunkID)

	// ファイルをコピー
	sourceFile, err := os.Open(sourceInfo.FilePath)
	if err != nil {
		return fmt.Errorf("failed to open source file: %w", err)
	}
	defer sourceFile.Close()

	targetFile, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("failed to create target file: %w", err)
	}
	defer targetFile.Close()

	if _, err := io.Copy(targetFile, sourceFile); err != nil {
		return fmt.Errorf("failed to copy data: %w", err)
	}

	// ターゲットチャンク情報を作成
	cs.chunks[targetChunkID] = &ChunkInfo{
		ID:       targetChunkID,
		Size:     sourceInfo.Size,
		Checksum: sourceInfo.Checksum,
		FilePath: targetPath,
	}

	return nil
}

// GetStorageStats ストレージ統計を取得
func (cs *ChunkStorage) GetStorageStats() map[string]interface{} {
	cs.mu.RLock()
	defer cs.mu.RUnlock()

	return map[string]interface{}{
		"chunk_count": len(cs.chunks),
		"used_space":  cs.GetUsedSpace(),
		"data_dir":    cs.dataDir,
	}
}
