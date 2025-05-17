package store

import (
	"fmt"
	"log"
	"os"
	"path/filepath"
)

// KVStore はローカルファイルシステム上でキーバリューストアを管理します。
// 各テーブルはベースディレクトリ内のサブディレクトリとして表現されます。
type KVStore struct {
	baseDir     string
	localNodeID string // デバッグログ用
}

// NewKVStore は新しいKVStoreインスタンスを作成します。
// baseDir は全てのテーブルデータが保存されるルートディレクトリです。
func NewKVStore(baseDir string, localNodeID string) (*KVStore, error) {
	// ベースディレクトリが存在しない場合は作成
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create base data directory %s: %w", baseDir, err)
	}
	log.Printf("[%s] KVStore initialized with base directory: %s", localNodeID, baseDir)
	return &KVStore{
		baseDir:     baseDir,
		localNodeID: localNodeID,
	}, nil
}

// tablePath は指定されたテーブルのデータディレクトリへのフルパスを返します。
func (s *KVStore) tablePath(tableName string) string {
	// テーブル名に不正な文字が含まれていないか基本的なサニタイズを行う (例: path traversal対策)
	// 簡単な例として、filepath.Clean を使う。より堅牢なバリデーションが本番では必要。
	cleanTableName := filepath.Clean(tableName)
	if cleanTableName == "." || cleanTableName == ".." || cleanTableName != tableName {
		// 不正なテーブル名とみなし、エラーとするか、固定のパスを返すなど検討が必要。
		// ここでは単純化のためそのまま結合するが、セキュリティリスクに注意。
		log.Printf("[%s] KVStore potential unsafe table name: %s (cleaned: %s)", s.localNodeID, tableName, cleanTableName)
	}
	return filepath.Join(s.baseDir, tableName)
}

// EnsureTableDir は指定されたテーブルのデータディレクトリが存在することを確認し、なければ作成します。
func (s *KVStore) EnsureTableDir(tableName string) error {
	path := s.tablePath(tableName)
	if err := os.MkdirAll(path, 0755); err != nil {
		log.Printf("[%s] KVStore failed to create directory for table %s at %s: %v", s.localNodeID, tableName, path, err)
		return fmt.Errorf("failed to create directory for table %s: %w", tableName, err)
	}
	log.Printf("[%s] KVStore ensured directory for table %s at %s", s.localNodeID, tableName, path)
	return nil
}

// RemoveTableDir は指定されたテーブルのデータディレクトリを削除します。
func (s *KVStore) RemoveTableDir(tableName string) error {
	path := s.tablePath(tableName)
	// ディレクトリが存在するか確認してから削除
	if _, err := os.Stat(path); os.IsNotExist(err) {
		log.Printf("[%s] KVStore directory for table %s at %s does not exist, skipping removal", s.localNodeID, tableName, path)
		return nil // 存在しない場合はエラーとしない (冪等性のため)
	}

	if err := os.RemoveAll(path); err != nil {
		log.Printf("[%s] KVStore failed to remove directory for table %s at %s: %v", s.localNodeID, tableName, path, err)
		return fmt.Errorf("failed to remove directory for table %s: %w", tableName, err)
	}
	log.Printf("[%s] KVStore removed directory for table %s at %s", s.localNodeID, tableName, path)
	return nil
}

// TODO: PutItem, GetItem, DeleteItem, QueryItems などのメソッドを実装
