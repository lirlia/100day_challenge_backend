package store

import (
	"encoding/json"
	"fmt"
	"log"
	"net/url" // net/url をインポート
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
	log.Printf("[%s] KVStore NewKVStore: CALLED with baseDir='%s'", localNodeID, baseDir)
	// ベースディレクトリが存在しない場合は作成
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		log.Printf("[%s] KVStore NewKVStore: ERROR os.MkdirAll for baseDir='%s': %v", localNodeID, baseDir, err)
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
	log.Printf("[%s] KVStore tablePath: CALLED with tableName='%s'", s.localNodeID, tableName)
	// テーブル名に不正な文字が含まれていないか基本的なサニタイズを行う (例: path traversal対策)
	// 簡単な例として、filepath.Clean を使う。より堅牢なバリデーションが本番では必要。
	cleanTableName := filepath.Clean(tableName)
	if cleanTableName == "." || cleanTableName == ".." || cleanTableName != tableName {
		// 不正なテーブル名とみなし、エラーとするか、固定のパスを返すなど検討が必要。
		// ここでは単純化のためそのまま結合するが、セキュリティリスクに注意。
		log.Printf("[%s] KVStore tablePath: POTENTIAL unsafe tableName='%s', cleanTableName='%s'", s.localNodeID, tableName, cleanTableName)
	}
	finalTablePath := filepath.Join(s.baseDir, tableName)
	log.Printf("[%s] KVStore tablePath: RETURNING finalTablePath='%s' for tableName='%s'", s.localNodeID, finalTablePath, tableName)
	return finalTablePath
}

// EnsureTableDir は指定されたテーブルのデータディレクトリが存在することを確認し、なければ作成します。
func (s *KVStore) EnsureTableDir(tableName string) error {
	path := s.tablePath(tableName)
	log.Printf("[%s] KVStore EnsureTableDir: CALLED for tableName='%s', path='%s'", s.localNodeID, tableName, path)
	if err := os.MkdirAll(path, 0755); err != nil {
		log.Printf("[%s] KVStore EnsureTableDir: ERROR MkdirAll for path='%s': %v", s.localNodeID, path, err)
		return fmt.Errorf("failed to create directory for table %s: %w", tableName, err)
	}
	log.Printf("[%s] KVStore EnsureTableDir: SUCCESS for path='%s'", s.localNodeID, path)
	return nil
}

// RemoveTableDir は指定されたテーブルのデータディレクトリを削除します。
func (s *KVStore) RemoveTableDir(tableName string) error {
	path := s.tablePath(tableName)
	log.Printf("[%s] KVStore RemoveTableDir: CALLED for tableName='%s', path='%s'", s.localNodeID, tableName, path)
	// ディレクトリが存在するか確認してから削除
	if _, err := os.Stat(path); os.IsNotExist(err) {
		log.Printf("[%s] KVStore RemoveTableDir: path '%s' does NOT EXIST, skipping removal.", s.localNodeID, path)
		return nil // 存在しない場合はエラーとしない (冪等性のため)
	}

	if err := os.RemoveAll(path); err != nil {
		log.Printf("[%s] KVStore RemoveTableDir: ERROR os.RemoveAll for path='%s': %v", s.localNodeID, path, err)
		return fmt.Errorf("failed to remove directory for table %s: %w", tableName, err)
	}
	log.Printf("[%s] KVStore RemoveTableDir: SUCCESS for path='%s'", s.localNodeID, path)
	return nil
}

// StoredItem はKVStoreのファイルに保存されるアイテムの構造です。
// これにはLWWのためのタイムスタンプと実際のデータが含まれます。
type StoredItem struct {
	Timestamp int64           `json:"timestamp"`
	Data      json.RawMessage `json:"data"` // 元のアイテムのJSONバイト列
}

// getItemFilePath は指定されたテーブルと生のアイテムキーに対するアイテムファイルのフルパスを生成します。
// itemKey は PartitionKey または PartitionKey_SortKey の形式で、エンコードされていません。
// ファイル名は itemKey をURLパスエスケープしたものになります。
func (s *KVStore) getItemFilePath(tableName string, rawItemKey string) (string, error) {
	log.Printf("[%s] KVStore getItemFilePath: CALLED with tableName='%s', rawItemKey='%s'", s.localNodeID, tableName, rawItemKey)
	tableDataPath := s.tablePath(tableName)

	if rawItemKey == "" {
		log.Printf("[%s] KVStore getItemFilePath: rawItemKey is EMPTY for table '%s'", s.localNodeID, tableName)
		return "", fmt.Errorf("item key cannot be empty for getItemFilePath")
	}
	// パス区切り文字やその他の不正文字のチェック (元のバリデーションをベースに)
	// シングルクオートとスペースをファイル名として許容するためにバリデーションを調整
	for _, r := range rawItemKey {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '_' || r == '-' || r == ' ' || r == '\'' || r == '(' || r == ')') { // スペース、シングルクオート、括弧を許容
			log.Printf("[%s] KVStore getItemFilePath: INVALID char '%c' (rune %d) in rawItemKey '%s' for table '%s'", s.localNodeID, r, r, rawItemKey, tableName)
			return "", fmt.Errorf("invalid character '%c' in item key: %s", r, rawItemKey)
		}
	}
	if strings.Contains(rawItemKey, "/") || strings.Contains(rawItemKey, "\\") {
		log.Printf("[%s] KVStore getItemFilePath: rawItemKey '%s' contains PATH SEPARATORS for table '%s'", s.localNodeID, rawItemKey, tableName)
		return "", fmt.Errorf("item key '%s' cannot contain path separators ('/' or '\\')", rawItemKey)
	}

	encodedItemKey := url.PathEscape(rawItemKey)
	log.Printf("[%s] KVStore getItemFilePath: rawItemKey '%s' PathEscaped to encodedItemKey '%s'", s.localNodeID, rawItemKey, encodedItemKey)

	if encodedItemKey == "" { // エンコード結果が空になるケースも考慮
		log.Printf("[%s] KVStore getItemFilePath: encodedItemKey is EMPTY after PathEscape for rawItemKey '%s'", s.localNodeID, rawItemKey)
		return "", fmt.Errorf("encoded item key is empty for original key '%s'", rawItemKey)
	}

	finalPath := filepath.Join(tableDataPath, encodedItemKey+".json")
	log.Printf("[%s] KVStore getItemFilePath: MAPPED rawItemKey='%s' (raw) to finalPath='%s'", s.localNodeID, rawItemKey, finalPath)
	return finalPath, nil
}

// PutItem は指定されたテーブルにアイテムを保存します。
// LWW (Last Write Wins) に基づき、指定されたタイムスタンプが既存のアイテムより新しい場合のみ上書きします。
// itemKey はパーティションキーまたは PartitionKey_SortKey の形式を想定 (デコード済みの生のキー)。
// itemRawData はアイテム全体のJSONバイト列です。
func (s *KVStore) PutItem(tableName string, itemKey string, itemRawData json.RawMessage, timestamp int64) error {
	log.Printf("[%s] KVStore PutItem: CALLED for table='%s', itemKey(raw)='%s', timestamp=%d", s.localNodeID, tableName, itemKey, timestamp)
	filePath, err := s.getItemFilePath(tableName, itemKey) // itemKey はデコード済みの生のキーを渡す
	if err != nil {
		log.Printf("[%s] KVStore PutItem: ERROR from getItemFilePath for itemKey(raw)='%s': %v", s.localNodeID, itemKey, err)
		return err
	}
	log.Printf("[%s] KVStore PutItem: determined filePath='%s' for itemKey(raw)='%s'", s.localNodeID, filePath, itemKey)

	// 既存ファイルのタイムスタンプを確認 (LWWのため)
	if _, statErr := os.Stat(filePath); !os.IsNotExist(statErr) {
		log.Printf("[%s] KVStore PutItem: file '%s' EXISTS, checking LWW.", s.localNodeID, filePath)
		existingFileBytes, readErr := os.ReadFile(filePath)
		if readErr != nil {
			log.Printf("[%s] KVStore PutItem: FAILED to read existing item file '%s' for LWW check: %v", s.localNodeID, filePath, readErr)
			return fmt.Errorf("failed to read existing item %s for LWW: %w", itemKey, readErr)
		}
		var existingStoredItem StoredItem
		if unmarshalErr := json.Unmarshal(existingFileBytes, &existingStoredItem); unmarshalErr != nil {
			log.Printf("[%s] KVStore PutItem: FAILED to unmarshal existing item file '%s' for LWW check: %v", s.localNodeID, filePath, unmarshalErr)
			return fmt.Errorf("failed to unmarshal existing item %s for LWW: %w", itemKey, unmarshalErr)
		}
		log.Printf("[%s] KVStore PutItem: LWW check for '%s' - new_ts=%d, existing_ts=%d", s.localNodeID, itemKey, timestamp, existingStoredItem.Timestamp)
		if timestamp < existingStoredItem.Timestamp {
			log.Printf("[%s] KVStore PutItem for '%s' in table '%s' SKIPPED due to LWW (new: %d < old: %d)", s.localNodeID, itemKey, tableName, timestamp, existingStoredItem.Timestamp)
			return nil // 新しいタイムスタンプが古いので何もしない (エラーではない)
		}
		log.Printf("[%s] KVStore PutItem: LWW check PASSED for '%s' (new: %d >= old: %d)", s.localNodeID, itemKey, timestamp, existingStoredItem.Timestamp)
	} else {
		log.Printf("[%s] KVStore PutItem: file '%s' does NOT exist, proceeding with write.", s.localNodeID, filePath)
	}

	storedItem := StoredItem{
		Timestamp: timestamp,
		Data:      itemRawData,
	}
	storedItemBytes, marshalErr := json.MarshalIndent(storedItem, "", "  ") // 整形して保存
	if marshalErr != nil {
		log.Printf("[%s] KVStore PutItem: FAILED to marshal StoredItem for '%s' in table '%s': %v", s.localNodeID, itemKey, tableName, marshalErr)
		return fmt.Errorf("failed to marshal item %s for storage: %w", itemKey, marshalErr)
	}

	log.Printf("[%s] KVStore PutItem: ATTEMPTING to write %d bytes to '%s'", s.localNodeID, len(storedItemBytes), filePath)
	if err := os.WriteFile(filePath, storedItemBytes, 0644); err != nil {
		log.Printf("[%s] KVStore PutItem: FAILED to write item file '%s': %v", s.localNodeID, filePath, err)
		return fmt.Errorf("failed to write item %s to file: %w", itemKey, err)
	}
	log.Printf("[%s] KVStore PutItem: SUCCESSFULLY put item '%s' in table '%s' (file: '%s')", s.localNodeID, itemKey, tableName, filePath)
	return nil
}

// GetItem は指定されたテーブルとキーからアイテムを取得します。
// アイテムの生データ (JSON RawMessage) とそのタイムスタンプを返します。
// itemKey はデコード済みの生のキーを期待します。
func (s *KVStore) GetItem(tableName string, itemKey string) (json.RawMessage, int64, error) {
	log.Printf("[%s] KVStore GetItem: CALLED for table='%s', itemKey(raw)='%s'", s.localNodeID, tableName, itemKey)
	filePath, err := s.getItemFilePath(tableName, itemKey) // itemKey はデコード済みの生のキーを渡す
	if err != nil {
		log.Printf("[%s] KVStore GetItem: ERROR from getItemFilePath for itemKey(raw)='%s': %v", s.localNodeID, itemKey, err)
		return nil, 0, err
	}
	log.Printf("[%s] KVStore GetItem: determined filePath='%s' for itemKey(raw)='%s'. Attempting os.Stat.", s.localNodeID, filePath, itemKey)

	fileInfo, statErr := os.Stat(filePath)
	if os.IsNotExist(statErr) {
		log.Printf("[%s] KVStore GetItem: file '%s' (for itemKey(raw) '%s') NOT FOUND. os.Stat error: %v", s.localNodeID, filePath, itemKey, statErr)
		return nil, 0, fmt.Errorf("item %s not found in table %s", itemKey, tableName)
	}
	if statErr != nil {
		log.Printf("[%s] KVStore GetItem: os.Stat for file '%s' (itemKey(raw) '%s') FAILED: %v", s.localNodeID, filePath, itemKey, statErr)
		return nil, 0, fmt.Errorf("failed to stat item file %s: %w", itemKey, statErr)
	}
	log.Printf("[%s] KVStore GetItem: file '%s' FOUND, size: %d. Attempting to read.", s.localNodeID, filePath, fileInfo.Size())

	fileBytes, readErr := os.ReadFile(filePath)
	if readErr != nil {
		log.Printf("[%s] KVStore GetItem: FAILED to read item file '%s': %v", s.localNodeID, filePath, readErr)
		return nil, 0, fmt.Errorf("failed to read item file %s: %w", itemKey, readErr)
	}
	log.Printf("[%s] KVStore GetItem: SUCCESSFULLY read %d bytes from '%s'. Attempting unmarshal.", s.localNodeID, len(fileBytes), filePath)

	var storedItem StoredItem
	if unmarshalErr := json.Unmarshal(fileBytes, &storedItem); unmarshalErr != nil {
		log.Printf("[%s] KVStore GetItem: FAILED to unmarshal StoredItem from '%s': %v", s.localNodeID, filePath, unmarshalErr)
		return nil, 0, fmt.Errorf("failed to unmarshal item file %s: %w", itemKey, unmarshalErr)
	}

	log.Printf("[%s] KVStore GetItem: SUCCESSFULLY got item '%s' from table '%s' (ts: %d, data_size: %d)", s.localNodeID, itemKey, tableName, storedItem.Timestamp, len(storedItem.Data))
	return storedItem.Data, storedItem.Timestamp, nil
}

// DeleteItem は指定されたテーブルとキーのアイテムを削除します。
// LWWに基づき、指定されたタイムスタンプが既存のアイテムのタイムスタンプ以上の場合のみ削除を実行します。
// itemKey はデコード済みの生のキーを期待します。
func (s *KVStore) DeleteItem(tableName string, itemKey string, timestamp int64) error {
	log.Printf("[%s] KVStore DeleteItem: CALLED for table='%s', itemKey(raw)='%s', timestamp=%d", s.localNodeID, tableName, itemKey, timestamp)
	filePath, err := s.getItemFilePath(tableName, itemKey) // itemKey はデコード済みの生のキーを渡す
	if err != nil {
		log.Printf("[%s] KVStore DeleteItem: ERROR from getItemFilePath for itemKey(raw)='%s': %v", s.localNodeID, itemKey, err)
		return err
	}
	log.Printf("[%s] KVStore DeleteItem: determined filePath='%s' for itemKey(raw)='%s'", s.localNodeID, filePath, itemKey)

	// 既存ファイルのタイムスタンプを確認 (LWWのため)
	if _, statErr := os.Stat(filePath); !os.IsNotExist(statErr) {
		log.Printf("[%s] KVStore DeleteItem: file '%s' EXISTS, checking LWW.", s.localNodeID, filePath)
		existingFileBytes, readErr := os.ReadFile(filePath)
		if readErr != nil {
			log.Printf("[%s] KVStore DeleteItem: FAILED to read existing item file '%s' for LWW delete check: %v", s.localNodeID, filePath, readErr)
			return fmt.Errorf("failed to read existing item %s for LWW delete: %w", itemKey, readErr)
		}
		var existingStoredItem StoredItem
		if unmarshalErr := json.Unmarshal(existingFileBytes, &existingStoredItem); unmarshalErr != nil {
			log.Printf("[%s] KVStore DeleteItem: FAILED to unmarshal existing item file '%s' for LWW delete check: %v", s.localNodeID, filePath, unmarshalErr)
			return fmt.Errorf("failed to unmarshal existing item %s for LWW delete: %w", itemKey, unmarshalErr)
		}
		log.Printf("[%s] KVStore DeleteItem: LWW check for '%s' - delete_ts=%d, existing_ts=%d", s.localNodeID, itemKey, timestamp, existingStoredItem.Timestamp)
		if timestamp < existingStoredItem.Timestamp {
			log.Printf("[%s] KVStore DeleteItem for '%s' in table '%s' SKIPPED due to LWW (delete_ts: %d < item_ts: %d)", s.localNodeID, itemKey, tableName, timestamp, existingStoredItem.Timestamp)
			return nil // 削除タイムスタンプが古いので何もしない (エラーではない)
		}
		log.Printf("[%s] KVStore DeleteItem: LWW check PASSED for '%s' (delete_ts: %d >= item_ts: %d)", s.localNodeID, itemKey, timestamp, existingStoredItem.Timestamp)
	} else if os.IsNotExist(statErr) {
		log.Printf("[%s] KVStore DeleteItem: item '%s' (file '%s') NOT FOUND, nothing to delete.", s.localNodeID, itemKey, filePath)
		return nil // 存在しない場合はエラーとしない
	} else { // その他のstatエラー
		log.Printf("[%s] KVStore DeleteItem: os.Stat for file '%s' FAILED: %v", s.localNodeID, filePath, statErr)
		return fmt.Errorf("failed to stat item file %s for LWW delete: %w", itemKey, statErr)
	}

	log.Printf("[%s] KVStore DeleteItem: ATTEMPTING to os.Remove '%s'", s.localNodeID, filePath)
	if err := os.Remove(filePath); err != nil {
		if !os.IsNotExist(err) { // 既に他のプロセス/goroutineで消された場合はエラーにしない
			log.Printf("[%s] KVStore DeleteItem: FAILED to remove item file '%s': %v", s.localNodeID, filePath, err)
			return fmt.Errorf("failed to remove item file %s: %w", itemKey, err)
		}
		log.Printf("[%s] KVStore DeleteItem: file '%s' was ALREADY removed (os.IsNotExist for os.Remove).", s.localNodeID, filePath)
	}

	log.Printf("[%s] KVStore DeleteItem: SUCCESSFULLY deleted item '%s' (file '%s')", s.localNodeID, itemKey, filePath)
	return nil
}

// QueryItems は指定されたパーティションキーに一致するアイテムをスキャンします。
// sortKeyPrefix が指定されている場合、ソートキーがそのプレフィックスで始まるアイテムのみを返します。
// 返り値は、各アイテムの実際のデータ (map[string]interface{}) のスライスです。
// ファイル名は PartitionKey または PartitionKey_SortKey.json (エンコード済み) を想定。
// GetItem に渡す際にはデコードされたキーを使用します。
func (s *KVStore) QueryItems(tableName string, partitionKey string, sortKeyPrefix string) ([]map[string]interface{}, error) {
	log.Printf("[%s] KVStore QueryItems: CALLED for table='%s', partitionKey='%s', sortKeyPrefix='%s'", s.localNodeID, tableName, partitionKey, sortKeyPrefix)
	tableDataPath := s.tablePath(tableName)
	if _, err := os.Stat(tableDataPath); os.IsNotExist(err) {
		log.Printf("[%s] KVStore QueryItems: table directory '%s' (for table '%s') does NOT exist.", s.localNodeID, tableDataPath, tableName)
		return nil, fmt.Errorf("table %s does not exist", tableName)
	}

	files, err := os.ReadDir(tableDataPath)
	if err != nil {
		log.Printf("[%s] KVStore QueryItems: FAILED to read directory '%s': %v", s.localNodeID, tableDataPath, err)
		return nil, fmt.Errorf("failed to read table directory %s: %w", tableName, err)
	}
	log.Printf("[%s] KVStore QueryItems: found %d entries in '%s'", s.localNodeID, len(files), tableDataPath)

	var results []map[string]interface{}

	for i, file := range files {
		fileName := file.Name() // これはエンコードされたキー + .json
		log.Printf("[%s] KVStore QueryItems: [Loop %d/%d] PROCESSING entry: '%s'", s.localNodeID, i+1, len(files), fileName)
		if file.IsDir() {
			log.Printf("[%s] KVStore QueryItems: entry '%s' is a DIRECTORY, skipping.", s.localNodeID, fileName)
			continue
		}
		if !strings.HasSuffix(fileName, ".json") {
			log.Printf("[%s] KVStore QueryItems: entry '%s' is NOT a .json file, skipping.", s.localNodeID, fileName)
			continue
		}

		encodedKeyFromFile := strings.TrimSuffix(fileName, ".json")
		log.Printf("[%s] KVStore QueryItems: from fileName '%s', got encodedKeyFromFile='%s'", s.localNodeID, fileName, encodedKeyFromFile)

		rawKeyFromFileName, unescapeErr := url.PathUnescape(encodedKeyFromFile) // ファイル名からデコードして生のキーを取得
		if unescapeErr != nil {
			log.Printf("[%s] KVStore QueryItems: FAILED to PathUnescape encodedKeyFromFile '%s': %v. Skipping.", s.localNodeID, encodedKeyFromFile, unescapeErr)
			continue
		}
		log.Printf("[%s] KVStore QueryItems: PathUnescaped '%s' to rawKeyFromFileName='%s'", s.localNodeID, encodedKeyFromFile, rawKeyFromFileName)

		// デコードされた rawKeyFromFileName を使ってパーティションキーとソートキーを解析
		var currentPartitionKey, currentSortKey string
		parts := strings.SplitN(rawKeyFromFileName, "_", 2)
		currentPartitionKey = parts[0]
		if len(parts) > 1 {
			currentSortKey = parts[1]
		}
		log.Printf("[%s] KVStore QueryItems: parsed from rawKeyFromFileName '%s' -> currentPK='%s', currentSK='%s'", s.localNodeID, rawKeyFromFileName, currentPartitionKey, currentSortKey)

		// PartitionKeyが一致するかどうか
		if currentPartitionKey != partitionKey {
			log.Printf("[%s] KVStore QueryItems: PK MISMATCH for rawKey '%s' (currentPK='%s', expectedPK='%s'). Skipping.", s.localNodeID, rawKeyFromFileName, currentPartitionKey, partitionKey)
			continue
		}
		log.Printf("[%s] KVStore QueryItems: PK MATCH for rawKey '%s' (currentPK='%s'). Checking SKPrefix='%s'.", s.localNodeID, rawKeyFromFileName, currentPartitionKey, sortKeyPrefix)

		// SortKeyPrefixのチェック
		if sortKeyPrefix != "" { // sortKeyPrefixが指定されている場合のみ
			if !strings.HasPrefix(currentSortKey, sortKeyPrefix) {
				log.Printf("[%s] KVStore QueryItems: SKPrefix MISMATCH for rawKey '%s' (currentSK='%s' (len %d), expectedSKPrefix='%s' (len %d)). Skipping.", s.localNodeID, rawKeyFromFileName, currentSortKey, len(currentSortKey), sortKeyPrefix, len(sortKeyPrefix))
				continue
			}
			log.Printf("[%s] KVStore QueryItems: SKPrefix MATCH for rawKey '%s' (currentSK='%s', expectedSKPrefix='%s').", s.localNodeID, rawKeyFromFileName, currentSortKey, sortKeyPrefix)
		} else {
			log.Printf("[%s] KVStore QueryItems: NO SKPrefix specified for rawKey '%s'. Item included based on PK match.", s.localNodeID, rawKeyFromFileName)
		}

		log.Printf("[%s] KVStore QueryItems: item with rawKey '%s' MATCHES criteria. Attempting to GetItem.", s.localNodeID, rawKeyFromFileName)
		itemData, _, getItemErr := s.GetItem(tableName, rawKeyFromFileName) // GetItemにはデコード済みのrawKeyFromFileNameを渡す
		if getItemErr != nil {
			log.Printf("[%s] KVStore QueryItems: GetItem FAILED for rawKey '%s': %v. Skipping.", s.localNodeID, rawKeyFromFileName, getItemErr)
			continue
		}

		var actualData map[string]interface{}
		if unmarshalErr := json.Unmarshal(itemData, &actualData); unmarshalErr != nil {
			log.Printf("[%s] KVStore QueryItems: FAILED to unmarshal itemData for rawKey '%s': %v. Skipping.", s.localNodeID, rawKeyFromFileName, unmarshalErr)
			continue
		}
		results = append(results, actualData)
		log.Printf("[%s] KVStore QueryItems: SUCCESSFULLY added item from rawKey '%s' to results. Result count: %d", s.localNodeID, rawKeyFromFileName, len(results))
	}

	log.Printf("[%s] KVStore QueryItems for table '%s', pk='%s', skPrefix='%s' FINAL found %d items.", s.localNodeID, tableName, partitionKey, sortKeyPrefix, len(results))
	return results, nil
}

// TODO: PutItem, GetItem, DeleteItem, QueryItems などのメソッドを実装
// このTODOコメントはもう不要なので削除します。
