package store

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
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

// StoredItem はKVStoreのファイルに保存されるアイテムの構造です。
// これにはLWWのためのタイムスタンプと実際のデータが含まれます。
type StoredItem struct {
	Timestamp int64           `json:"timestamp"`
	Data      json.RawMessage `json:"data"` // 元のアイテムのJSONバイト列
}

// getItemFilePath は指定されたテーブルとキーに対するアイテムファイルのフルパスを生成します。
// キーはパーティションキー、またはパーティションキーとソートキーの組み合わせです。
// キーの形式（例: "pkValue" or "pkValue_skValue"）は呼び出し側で整形することを想定。
func (s *KVStore) getItemFilePath(tableName string, itemKey string) (string, error) {
	tableDataPath := s.tablePath(tableName)

	// itemKeyのサニタイズ (ファイル名として安全か)
	// 英数字、ハイフン、アンダースコアのみを許可
	if itemKey == "" {
		log.Printf("[%s] KVStore invalid item key: key is empty for table %s", s.localNodeID, tableName)
		return "", fmt.Errorf("item key cannot be empty")
	}
	for _, r := range itemKey {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '-') {
			log.Printf("[%s] KVStore invalid character in item key: '%c' in key '%s' for table %s", s.localNodeID, r, itemKey, tableName)
			return "", fmt.Errorf("invalid character '%c' in item key: %s", r, itemKey)
		}
	}
	// filepath.Clean は ".." や "." を解決してしまうので、ここでは使用しない。
	// ディレクトリトラバーサルを防ぐため、キーに '/' が含まれていないことも確認。
	if strings.Contains(itemKey, "/") || strings.Contains(itemKey, "\\") {
		log.Printf("[%s] KVStore invalid item key: key '%s' contains path separators for table %s", s.localNodeID, itemKey, tableName)
		return "", fmt.Errorf("item key '%s' cannot contain path separators ('/' or '\\')", itemKey)
	}

	// cleanItemKey := filepath.Clean(itemKey) // <- 削除
	// if cleanItemKey == "." || cleanItemKey == ".." || cleanItemKey != itemKey || cleanItemKey == "" { // <- 削除
	// 	log.Printf("[%s] KVStore invalid item key: %s (cleaned: %s)", s.localNodeID, itemKey, cleanItemKey)
	// 	return "", fmt.Errorf("invalid item key: %s", itemKey)
	// }
	// return filepath.Join(tableDataPath, cleanItemKey+".json"), nil // <- 修正
	return filepath.Join(tableDataPath, itemKey+".json"), nil
}

// PutItem は指定されたテーブルにアイテムを保存します。
// LWW (Last Write Wins) に基づき、指定されたタイムスタンプが既存のアイテムより新しい場合のみ上書きします。
// itemKey はパーティションキーまたは PartitionKey_SortKey の形式を想定。
// itemRawData はアイテム全体のJSONバイト列です。
func (s *KVStore) PutItem(tableName string, itemKey string, itemRawData json.RawMessage, timestamp int64) error {
	filePath, err := s.getItemFilePath(tableName, itemKey)
	if err != nil {
		return err
	}

	// 既存ファイルのタイムスタンプを確認 (LWWのため)
	if _, statErr := os.Stat(filePath); !os.IsNotExist(statErr) {
		existingFileBytes, readErr := os.ReadFile(filePath)
		if readErr != nil {
			log.Printf("[%s] KVStore failed to read existing item file %s for LWW check: %v", s.localNodeID, filePath, readErr)
			return fmt.Errorf("failed to read existing item %s for LWW: %w", itemKey, readErr)
		}
		var existingStoredItem StoredItem
		if unmarshalErr := json.Unmarshal(existingFileBytes, &existingStoredItem); unmarshalErr != nil {
			log.Printf("[%s] KVStore failed to unmarshal existing item file %s for LWW check: %v", s.localNodeID, filePath, unmarshalErr)
			return fmt.Errorf("failed to unmarshal existing item %s for LWW: %w", itemKey, unmarshalErr)
		}
		if timestamp < existingStoredItem.Timestamp {
			log.Printf("[%s] KVStore PutItem for %s in table %s skipped due to LWW (new: %d, old: %d)", s.localNodeID, itemKey, tableName, timestamp, existingStoredItem.Timestamp)
			return nil // 新しいタイムスタンプが古いので何もしない (エラーではない)
		}
	}

	storedItem := StoredItem{
		Timestamp: timestamp,
		Data:      itemRawData,
	}
	storedItemBytes, marshalErr := json.MarshalIndent(storedItem, "", "  ") // 整形して保存
	if marshalErr != nil {
		log.Printf("[%s] KVStore failed to marshal StoredItem for %s in table %s: %v", s.localNodeID, itemKey, tableName, marshalErr)
		return fmt.Errorf("failed to marshal item %s for storage: %w", itemKey, marshalErr)
	}

	if err := os.WriteFile(filePath, storedItemBytes, 0644); err != nil {
		log.Printf("[%s] KVStore failed to write item file %s: %v", s.localNodeID, filePath, err)
		return fmt.Errorf("failed to write item %s to file: %w", itemKey, err)
	}
	log.Printf("[%s] KVStore successfully put item %s in table %s (file: %s)", s.localNodeID, itemKey, tableName, filePath)
	return nil
}

// GetItem は指定されたテーブルとキーからアイテムを取得します。
// アイテムの生データ (JSON RawMessage) とそのタイムスタンプを返します。
func (s *KVStore) GetItem(tableName string, itemKey string) (json.RawMessage, int64, error) {
	filePath, err := s.getItemFilePath(tableName, itemKey)
	if err != nil {
		return nil, 0, err
	}

	if _, statErr := os.Stat(filePath); os.IsNotExist(statErr) {
		log.Printf("[%s] KVStore GetItem: item %s not found in table %s (file: %s)", s.localNodeID, itemKey, tableName, filePath)
		return nil, 0, fmt.Errorf("item %s not found in table %s", itemKey, tableName) // TODO: 専用エラー型
	}

	fileBytes, readErr := os.ReadFile(filePath)
	if readErr != nil {
		log.Printf("[%s] KVStore failed to read item file %s: %v", s.localNodeID, filePath, readErr)
		return nil, 0, fmt.Errorf("failed to read item file %s: %w", itemKey, readErr)
	}

	var storedItem StoredItem
	if unmarshalErr := json.Unmarshal(fileBytes, &storedItem); unmarshalErr != nil {
		log.Printf("[%s] KVStore failed to unmarshal item file %s: %v", s.localNodeID, filePath, unmarshalErr)
		return nil, 0, fmt.Errorf("failed to unmarshal item file %s: %w", itemKey, unmarshalErr)
	}

	log.Printf("[%s] KVStore successfully got item %s from table %s (timestamp: %d)", s.localNodeID, itemKey, tableName, storedItem.Timestamp)
	return storedItem.Data, storedItem.Timestamp, nil
}

// DeleteItem は指定されたテーブルとキーのアイテムを削除します。
// LWWに基づき、指定されたタイムスタンプが既存のアイテムのタイムスタンプ以上の場合のみ削除を実行します。
func (s *KVStore) DeleteItem(tableName string, itemKey string, timestamp int64) error {
	filePath, err := s.getItemFilePath(tableName, itemKey)
	if err != nil {
		return err
	}

	// 既存ファイルのタイムスタンプを確認 (LWWのため)
	if _, statErr := os.Stat(filePath); !os.IsNotExist(statErr) {
		existingFileBytes, readErr := os.ReadFile(filePath)
		if readErr != nil {
			log.Printf("[%s] KVStore failed to read existing item file %s for LWW delete check: %v", s.localNodeID, filePath, readErr)
			return fmt.Errorf("failed to read existing item %s for LWW delete: %w", itemKey, readErr)
		}
		var existingStoredItem StoredItem
		if unmarshalErr := json.Unmarshal(existingFileBytes, &existingStoredItem); unmarshalErr != nil {
			log.Printf("[%s] KVStore failed to unmarshal existing item file %s for LWW delete check: %v", s.localNodeID, filePath, unmarshalErr)
			return fmt.Errorf("failed to unmarshal existing item %s for LWW delete: %w", itemKey, unmarshalErr)
		}
		if timestamp < existingStoredItem.Timestamp {
			log.Printf("[%s] KVStore DeleteItem for %s in table %s skipped due to LWW (delete_ts: %d, item_ts: %d)", s.localNodeID, itemKey, tableName, timestamp, existingStoredItem.Timestamp)
			return nil // 削除タイムスタンプが古いので何もしない (エラーではない)
		}
	} else if os.IsNotExist(statErr) {
		log.Printf("[%s] KVStore DeleteItem: item %s not found in table %s (file: %s), nothing to delete.", s.localNodeID, itemKey, tableName, filePath)
		return nil // 存在しない場合はエラーとしない
	}

	if err := os.Remove(filePath); err != nil {
		if !os.IsNotExist(err) { // 既に他のプロセス/goroutineで消された場合はエラーにしない
			log.Printf("[%s] KVStore failed to remove item file %s: %v", s.localNodeID, filePath, err)
			return fmt.Errorf("failed to remove item file %s: %w", itemKey, err)
		}
	}

	log.Printf("[%s] KVStore successfully deleted item %s from table %s (file: %s)", s.localNodeID, itemKey, tableName, filePath)
	return nil
}

// QueryItems は指定されたパーティションキーに一致するアイテムをスキャンします。
// sortKeyPrefix が指定されている場合、ソートキーがそのプレフィックスで始まるアイテムのみを返します。
// 返り値は、各アイテムの実際のデータ (map[string]interface{}) のスライスです。
// アイテムのファイル名は PartitionKey または PartitionKey_SortKey.json を想定。
func (s *KVStore) QueryItems(tableName string, partitionKey string, sortKeyPrefix string) ([]map[string]interface{}, error) {
	tableDataPath := s.tablePath(tableName)
	if _, err := os.Stat(tableDataPath); os.IsNotExist(err) {
		log.Printf("[%s] KVStore QueryItems: table directory %s does not exist for table %s", s.localNodeID, tableDataPath, tableName)
		return nil, fmt.Errorf("table %s does not exist", tableName)
	}

	files, err := os.ReadDir(tableDataPath)
	if err != nil {
		log.Printf("[%s] KVStore failed to read directory %s for QueryItems: %v", s.localNodeID, tableDataPath, err)
		return nil, fmt.Errorf("failed to read table directory %s: %w", tableName, err)
	}

	var results []map[string]interface{}
	prefixToMatch := partitionKey
	if sortKeyPrefix != "" {
		prefixToMatch += "_" + sortKeyPrefix
	} else {
		// ソートキープレフィックスがない場合、厳密にパーティションキーのみに一致するか、
		// PartitionKey_ で始まるものも含むか。ここでは、ファイル名が PartitionKey.json であるものを探す。
		// または、PartitionKey のみで、SortKeyがないアイテムも対象とする。
		// DynamoDBの挙動に近いのは、PartitionKey が一致し、SortKeyの条件を満たすもの。
		// ファイル名が PartitionKey.json (ソートキーなし) or PartitionKey_SortKeyValue.json (ソートキーあり)
	}

	for _, file := range files {
		if file.IsDir() {
			continue // サブディレクトリは無視
		}
		fileName := file.Name()
		if !strings.HasSuffix(fileName, ".json") {
			continue // JSONファイル以外は無視
		}

		itemKeyFromFile := strings.TrimSuffix(fileName, ".json")

		// PartitionKeyが一致するかどうか
		pkMatches := strings.HasPrefix(itemKeyFromFile, partitionKey)
		if !pkMatches {
			continue
		}

		// SortKeyPrefixのチェック
		// 1. SortKeyなしのアイテム (ファイル名がPartitionKey.json) かつ sortKeyPrefixが空
		// 2. SortKeyありのアイテム (ファイル名がPartitionKey_SortKeyValue.json) かつ PartitionKey_SortKeyPrefix で始まる
		_ = itemKeyFromFile == partitionKey
		_ = strings.Contains(itemKeyFromFile, "_")

		if sortKeyPrefix == "" {
			// ソートキープレフィックス指定なし: PKが完全一致するアイテム(ソートキーなし)のみ対象とするか、PKで始まるもの全てか。
			// ここでは、PKが一致し、かつソートキーがない(ファイル名がPK.json)か、
			// またはソートキーがあってもPK部分が一致すればOKとする（より緩いマッチング）。
			// DynamoDBのQueryでは、PKが一致し、SK条件があればSK条件も満たすもの。SK条件なしならPKが一致するもの全て。
			// ファイル名が PK.json または PK_SK.json のいずれかで、PK部分が一致すればよい。
			// itemKeyFromFile が partitionKey で始まればOK。
			if !strings.HasPrefix(itemKeyFromFile, partitionKey+"_") && itemKeyFromFile != partitionKey {
				continue
			}
		} else {
			// ソートキープレフィックス指定あり: PKが一致し、SKが指定プレフィックスで始まるもの
			// ファイル名が PartitionKey_SortKeyPrefix... .json である必要がある
			if !strings.HasPrefix(itemKeyFromFile, partitionKey+"_"+sortKeyPrefix) {
				continue
			}
		}

		itemData, _, getItemErr := s.GetItem(tableName, itemKeyFromFile)
		if getItemErr != nil {
			log.Printf("[%s] KVStore QueryItems: failed to get item %s during scan: %v", s.localNodeID, itemKeyFromFile, getItemErr)
			// 一つのファイルの読み取りエラーで全体を失敗させるか、スキップするか。ここではスキップ。
			continue
		}

		var actualData map[string]interface{}
		if unmarshalErr := json.Unmarshal(itemData, &actualData); unmarshalErr != nil {
			log.Printf("[%s] KVStore QueryItems: failed to unmarshal item data for %s: %v", s.localNodeID, itemKeyFromFile, unmarshalErr)
			continue
		}
		results = append(results, actualData)
	}

	log.Printf("[%s] KVStore QueryItems for table %s, pk=%s, skPrefix=%s found %d items", s.localNodeID, tableName, partitionKey, sortKeyPrefix, len(results))
	return results, nil
}

// TODO: PutItem, GetItem, DeleteItem, QueryItems などのメソッドを実装
