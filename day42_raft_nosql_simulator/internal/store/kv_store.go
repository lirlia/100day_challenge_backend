package store

import (
	"encoding/json"
	"errors" // errors パッケージをインポート
	"fmt"
	"log"
	"net/url" // net/url をインポート
	"os"
	"path/filepath"
	"strings"
)

// ErrItemNotFound はアイテムが見つからない場合に返されるエラーです。
var ErrItemNotFound = errors.New("item not found")

// KVStore はローカルファイルシステム上でキーバリューストアを管理します。
// 各テーブルはベースディレクトリ内のサブディレクトリとして表現されます。
type KVStore struct {
	baseDir     string
	localNodeID string // デバッグログ用
}

// NewKVStore は新しいKVStoreインスタンスを作成します。
// baseDir は全てのテーブルデータが保存されるルートディレクトリです。
func NewKVStore(baseDir string, localNodeID string) (*KVStore, error) {
	log.Printf("[INFO] [KVStore] [%s] NewKVStore: CALLED with baseDir='%s'", localNodeID, baseDir)
	// ベースディレクトリが存在しない場合は作成
	if err := os.MkdirAll(baseDir, 0755); err != nil {
		log.Printf("[ERROR] [KVStore] [%s] NewKVStore: os.MkdirAll for baseDir='%s' failed: %v", localNodeID, baseDir, err)
		return nil, fmt.Errorf("failed to create base data directory %s: %w", baseDir, err)
	}
	log.Printf("[INFO] [KVStore] [%s] Initialized with base directory: %s", localNodeID, baseDir)
	return &KVStore{
		baseDir:     baseDir,
		localNodeID: localNodeID,
	}, nil
}

// tablePath は指定されたテーブルのデータディレクトリへのフルパスを返します。
func (s *KVStore) tablePath(tableName string) string {
	log.Printf("[DEBUG] [KVStore] [%s] tablePath: CALLED with tableName='%s'", s.localNodeID, tableName)
	// テーブル名に不正な文字が含まれていないか基本的なサニタイズを行う (例: path traversal対策)
	// 簡単な例として、filepath.Clean を使う。より堅牢なバリデーションが本番では必要。
	cleanTableName := filepath.Clean(tableName)
	if cleanTableName == "." || cleanTableName == ".." || cleanTableName != tableName {
		log.Printf("[WARN] [KVStore] [%s] tablePath: Potentially unsafe tableName='%s', cleanTableName='%s'", s.localNodeID, tableName, cleanTableName)
	}
	finalTablePath := filepath.Join(s.baseDir, tableName)
	log.Printf("[DEBUG] [KVStore] [%s] tablePath: RETURNING finalTablePath='%s' for tableName='%s'", s.localNodeID, finalTablePath, tableName)
	return finalTablePath
}

// EnsureTableDir は指定されたテーブルのデータディレクトリが存在することを確認し、なければ作成します。
func (s *KVStore) EnsureTableDir(tableName string) error {
	path := s.tablePath(tableName)
	log.Printf("[INFO] [KVStore] [%s] EnsureTableDir: CALLED for tableName='%s', path='%s'", s.localNodeID, tableName, path)
	if err := os.MkdirAll(path, 0755); err != nil {
		log.Printf("[ERROR] [KVStore] [%s] EnsureTableDir: MkdirAll for path='%s' failed: %v", s.localNodeID, path, err)
		return fmt.Errorf("failed to create directory for table %s: %w", tableName, err)
	}
	log.Printf("[INFO] [KVStore] [%s] EnsureTableDir: SUCCESS for path='%s'", s.localNodeID, path)
	return nil
}

// RemoveTableDir は指定されたテーブルのデータディレクトリを削除します。
func (s *KVStore) RemoveTableDir(tableName string) error {
	path := s.tablePath(tableName)
	log.Printf("[INFO] [KVStore] [%s] RemoveTableDir: CALLED for tableName='%s', path='%s'", s.localNodeID, tableName, path)
	// ディレクトリが存在するか確認してから削除
	if _, err := os.Stat(path); os.IsNotExist(err) {
		log.Printf("[INFO] [KVStore] [%s] RemoveTableDir: path '%s' does NOT EXIST, skipping removal.", s.localNodeID, path)
		return nil // 存在しない場合はエラーとしない (冪等性のため)
	}

	if err := os.RemoveAll(path); err != nil {
		log.Printf("[ERROR] [KVStore] [%s] RemoveTableDir: os.RemoveAll for path='%s' failed: %v", s.localNodeID, path, err)
		return fmt.Errorf("failed to remove directory for table %s: %w", tableName, err)
	}
	log.Printf("[INFO] [KVStore] [%s] RemoveTableDir: SUCCESS for path='%s'", s.localNodeID, path)
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
	log.Printf("[DEBUG] [KVStore] [%s] getItemFilePath: CALLED with tableName='%s', rawItemKey='%s'", s.localNodeID, tableName, rawItemKey)
	tableDataPath := s.tablePath(tableName)

	if rawItemKey == "" {
		log.Printf("[ERROR] [KVStore] [%s] getItemFilePath: rawItemKey is EMPTY for table '%s'", s.localNodeID, tableName)
		return "", fmt.Errorf("item key cannot be empty for getItemFilePath")
	}
	// パス区切り文字やその他の不正文字のチェック (元のバリデーションをベースに)
	// シングルクオートとスペースをファイル名として許容するためにバリデーションを調整
	for _, r := range rawItemKey {
		if !((r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '_' || r == '-' || r == ' ' || r == '\'' || r == '(' || r == ')') { // スペース、シングルクオート、括弧を許容
			log.Printf("[ERROR] [KVStore] [%s] getItemFilePath: INVALID char '%c' (rune %d) in rawItemKey '%s' for table '%s'", s.localNodeID, r, r, rawItemKey, tableName)
			return "", fmt.Errorf("invalid character '%c' in item key: %s", r, rawItemKey)
		}
	}
	if strings.Contains(rawItemKey, "/") || strings.Contains(rawItemKey, "\\") {
		log.Printf("[ERROR] [KVStore] [%s] getItemFilePath: rawItemKey '%s' contains PATH SEPARATORS for table '%s'", s.localNodeID, rawItemKey, tableName)
		return "", fmt.Errorf("item key '%s' cannot contain path separators ('/' or '\\')", rawItemKey)
	}

	encodedItemKey := url.PathEscape(rawItemKey)
	log.Printf("[DEBUG] [KVStore] [%s] getItemFilePath: rawItemKey '%s' PathEscaped to encodedItemKey '%s'", s.localNodeID, rawItemKey, encodedItemKey)

	if encodedItemKey == "" { // エンコード結果が空になるケースも考慮
		log.Printf("[ERROR] [KVStore] [%s] getItemFilePath: encodedItemKey is EMPTY after PathEscape for rawItemKey '%s'", s.localNodeID, rawItemKey)
		return "", fmt.Errorf("encoded item key is empty for original key '%s'", rawItemKey)
	}

	finalPath := filepath.Join(tableDataPath, encodedItemKey+".json")
	log.Printf("[DEBUG] [KVStore] [%s] getItemFilePath: MAPPED rawItemKey='%s' (raw) to finalPath='%s'", s.localNodeID, rawItemKey, finalPath)
	return finalPath, nil
}

// PutItem は指定されたテーブルにアイテムを保存します。
// LWW (Last Write Wins) に基づき、指定されたタイムスタンプが既存のアイテムより新しい場合のみ上書きします。
// itemKey はパーティションキーまたは PartitionKey_SortKey の形式を想定 (デコード済みの生のキー)。
// itemRawData はアイテム全体のJSONバイト列です。
func (s *KVStore) PutItem(tableName string, itemKey string, itemRawData json.RawMessage, timestamp int64) error {
	log.Printf("[INFO] [KVStore] [%s] PutItem: CALLED for table='%s', itemKey(raw)='%s', timestamp=%d", s.localNodeID, tableName, itemKey, timestamp)
	filePath, err := s.getItemFilePath(tableName, itemKey) // itemKey はデコード済みの生のキーを渡す
	if err != nil {
		log.Printf("[ERROR] [KVStore] [%s] PutItem: from getItemFilePath for itemKey(raw)='%s': %v", s.localNodeID, itemKey, err)
		return err
	}
	log.Printf("[DEBUG] [KVStore] [%s] PutItem: determined filePath='%s' for itemKey(raw)='%s'", s.localNodeID, filePath, itemKey)

	// 既存ファイルのタイムスタンプを確認 (LWWのため)
	if _, statErr := os.Stat(filePath); !os.IsNotExist(statErr) {
		log.Printf("[DEBUG] [KVStore] [%s] PutItem: file '%s' EXISTS, checking LWW.", s.localNodeID, filePath)
		existingFileBytes, readErr := os.ReadFile(filePath)
		if readErr != nil {
			log.Printf("[ERROR] [KVStore] [%s] PutItem: FAILED to read existing item file '%s' for LWW check: %v", s.localNodeID, filePath, readErr)
			return fmt.Errorf("failed to read existing item %s for LWW: %w", itemKey, readErr)
		}
		var existingStoredItem StoredItem
		if unmarshalErr := json.Unmarshal(existingFileBytes, &existingStoredItem); unmarshalErr != nil {
			log.Printf("[ERROR] [KVStore] [%s] PutItem: FAILED to unmarshal existing item file '%s' for LWW check: %v", s.localNodeID, filePath, unmarshalErr)
			return fmt.Errorf("failed to unmarshal existing item %s for LWW: %w", itemKey, unmarshalErr)
		}
		log.Printf("[DEBUG] [KVStore] [%s] PutItem: LWW check for '%s' - new_ts=%d, existing_ts=%d", s.localNodeID, itemKey, timestamp, existingStoredItem.Timestamp)
		if timestamp < existingStoredItem.Timestamp {
			log.Printf("[INFO] [KVStore] [%s] PutItem for '%s' in table '%s' SKIPPED due to LWW (new: %d < old: %d)", s.localNodeID, itemKey, tableName, timestamp, existingStoredItem.Timestamp)
			return nil // 新しいタイムスタンプが古いので何もしない (エラーではない)
		}
		log.Printf("[DEBUG] [KVStore] [%s] PutItem: LWW check PASSED for '%s' (new: %d >= old: %d)", s.localNodeID, itemKey, timestamp, existingStoredItem.Timestamp)
	} else {
		log.Printf("[DEBUG] [KVStore] [%s] PutItem: file '%s' does NOT exist, proceeding with write.", s.localNodeID, filePath)
	}

	storedItem := StoredItem{
		Timestamp: timestamp,
		Data:      itemRawData,
	}
	storedItemBytes, marshalErr := json.MarshalIndent(storedItem, "", "  ") // 整形して保存
	if marshalErr != nil {
		log.Printf("[ERROR] [KVStore] [%s] PutItem: FAILED to marshal StoredItem for '%s' in table '%s': %v", s.localNodeID, itemKey, tableName, marshalErr)
		return fmt.Errorf("failed to marshal item %s for storage: %w", itemKey, marshalErr)
	}

	log.Printf("[DEBUG] [KVStore] [%s] PutItem: ATTEMPTING to write %d bytes to '%s'", s.localNodeID, len(storedItemBytes), filePath)
	if err := os.WriteFile(filePath, storedItemBytes, 0644); err != nil {
		log.Printf("[ERROR] [KVStore] [%s] PutItem: FAILED to write item file '%s': %v", s.localNodeID, filePath, err)
		return fmt.Errorf("failed to write item %s to file: %w", itemKey, err)
	}
	log.Printf("[INFO] [KVStore] [%s] PutItem: SUCCESSFULLY put item '%s' in table '%s' (file: '%s')", s.localNodeID, itemKey, tableName, filePath)
	return nil
}

// GetItem は指定されたテーブルとキーからアイテムを取得します。
// アイテムの生データ (JSON RawMessage) とそのタイムスタンプを返します。
// itemKey はデコード済みの生のキーを期待します。
func (s *KVStore) GetItem(tableName string, itemKey string) (json.RawMessage, int64, error) {
	log.Printf("[INFO] [KVStore] [%s] GetItem: CALLED for table='%s', itemKey(raw)='%s'", s.localNodeID, tableName, itemKey)
	filePath, err := s.getItemFilePath(tableName, itemKey) // itemKey はデコード済みの生のキーを渡す
	if err != nil {
		log.Printf("[ERROR] [KVStore] [%s] GetItem: from getItemFilePath for itemKey(raw)='%s': %v", s.localNodeID, itemKey, err)
		return nil, 0, err
	}
	log.Printf("[DEBUG] [KVStore] [%s] GetItem: determined filePath='%s' for itemKey(raw)='%s'. Attempting os.Stat.", s.localNodeID, filePath, itemKey)

	fileInfo, statErr := os.Stat(filePath)
	if os.IsNotExist(statErr) {
		log.Printf("[WARN] [KVStore] [%s] GetItem: file '%s' (for itemKey(raw) '%s') NOT FOUND. os.Stat error: %v", s.localNodeID, filePath, itemKey, statErr)
		return nil, 0, ErrItemNotFound // ErrItemNotFound を返す
	}
	if statErr != nil {
		log.Printf("[ERROR] [KVStore] [%s] GetItem: os.Stat for file '%s' (itemKey(raw) '%s') FAILED: %v", s.localNodeID, filePath, itemKey, statErr)
		return nil, 0, fmt.Errorf("failed to stat item file %s: %w", itemKey, statErr)
	}
	log.Printf("[DEBUG] [KVStore] [%s] GetItem: file '%s' FOUND, size: %d. Attempting to read.", s.localNodeID, filePath, fileInfo.Size())

	fileBytes, readErr := os.ReadFile(filePath)
	if readErr != nil {
		log.Printf("[ERROR] [KVStore] [%s] GetItem: FAILED to read item file '%s': %v", s.localNodeID, filePath, readErr)
		return nil, 0, fmt.Errorf("failed to read item file %s: %w", itemKey, readErr)
	}
	log.Printf("[DEBUG] [KVStore] [%s] GetItem: SUCCESSFULLY read %d bytes from '%s'. Attempting unmarshal.", s.localNodeID, len(fileBytes), filePath)

	var storedItem StoredItem
	if unmarshalErr := json.Unmarshal(fileBytes, &storedItem); unmarshalErr != nil {
		log.Printf("[ERROR] [KVStore] [%s] GetItem: FAILED to unmarshal StoredItem from '%s': %v", s.localNodeID, filePath, unmarshalErr)
		return nil, 0, fmt.Errorf("failed to unmarshal item file %s: %w", itemKey, unmarshalErr)
	}

	log.Printf("[INFO] [KVStore] [%s] GetItem: SUCCESSFULLY got item '%s' from table '%s' (ts: %d, data_size: %d)", s.localNodeID, itemKey, tableName, storedItem.Timestamp, len(storedItem.Data))
	return storedItem.Data, storedItem.Timestamp, nil
}

// DeleteItem は指定されたテーブルとキーのアイテムを削除します。
// LWWに基づき、指定されたタイムスタンプが既存のアイテムのタイムスタンプ以上の場合のみ削除を実行します。
// itemKey はデコード済みの生のキーを期待します。
func (s *KVStore) DeleteItem(tableName string, itemKey string, timestamp int64) error {
	log.Printf("[INFO] [KVStore] [%s] DeleteItem: CALLED for table='%s', itemKey(raw)='%s', timestamp=%d", s.localNodeID, tableName, itemKey, timestamp)
	filePath, err := s.getItemFilePath(tableName, itemKey) // itemKey はデコード済みの生のキーを渡す
	if err != nil {
		log.Printf("[ERROR] [KVStore] [%s] DeleteItem: from getItemFilePath for itemKey(raw)='%s': %v", s.localNodeID, itemKey, err)
		return err
	}
	log.Printf("[DEBUG] [KVStore] [%s] DeleteItem: determined filePath='%s' for itemKey(raw)='%s'", s.localNodeID, filePath, itemKey)

	// 既存ファイルのタイムスタンプを確認 (LWWのため)
	if _, statErr := os.Stat(filePath); !os.IsNotExist(statErr) {
		log.Printf("[DEBUG] [KVStore] [%s] DeleteItem: file '%s' EXISTS, checking LWW.", s.localNodeID, filePath)
		existingFileBytes, readErr := os.ReadFile(filePath)
		if readErr != nil {
			log.Printf("[ERROR] [KVStore] [%s] DeleteItem: FAILED to read existing item file '%s' for LWW delete check: %v", s.localNodeID, filePath, readErr)
			return fmt.Errorf("failed to read existing item %s for LWW delete: %w", itemKey, readErr)
		}
		var existingStoredItem StoredItem
		if unmarshalErr := json.Unmarshal(existingFileBytes, &existingStoredItem); unmarshalErr != nil {
			log.Printf("[ERROR] [KVStore] [%s] DeleteItem: FAILED to unmarshal existing item file '%s' for LWW delete check: %v", s.localNodeID, filePath, unmarshalErr)
			return fmt.Errorf("failed to unmarshal existing item %s for LWW delete: %w", itemKey, unmarshalErr)
		}
		log.Printf("[DEBUG] [KVStore] [%s] DeleteItem: LWW check for '%s' - delete_ts=%d, existing_ts=%d", s.localNodeID, itemKey, timestamp, existingStoredItem.Timestamp)
		if timestamp < existingStoredItem.Timestamp {
			log.Printf("[INFO] [KVStore] [%s] DeleteItem for '%s' in table '%s' SKIPPED due to LWW (delete_ts: %d < item_ts: %d)", s.localNodeID, itemKey, tableName, timestamp, existingStoredItem.Timestamp)
			return nil // 削除タイムスタンプが古いので何もしない (エラーではない)
		}
		log.Printf("[DEBUG] [KVStore] [%s] DeleteItem: LWW check PASSED for '%s' (delete_ts: %d >= item_ts: %d)", s.localNodeID, itemKey, timestamp, existingStoredItem.Timestamp)
	} else {
		log.Printf("[INFO] [KVStore] [%s] DeleteItem: file '%s' (for itemKey '%s') does NOT exist. No action needed.", s.localNodeID, filePath, itemKey)
		return nil // 存在しない場合も成功として扱う（DynamoDBと同様）
	}

	if err := os.Remove(filePath); err != nil {
		log.Printf("[ERROR] [KVStore] [%s] DeleteItem: FAILED to remove item file '%s': %v", s.localNodeID, filePath, err)
		return fmt.Errorf("failed to remove item file %s: %w", itemKey, err)
	}
	log.Printf("[INFO] [KVStore] [%s] DeleteItem: SUCCESSFULLY deleted item '%s' in table '%s' (file: '%s')", s.localNodeID, itemKey, tableName, filePath)
	return nil
}

// QueryItems は指定されたテーブルのパーティションキーに一致するアイテムを検索し、
// さらにソートキーのプレフィックスに一致するアイテムをフィルタリングします。
// これはファイルシステムをスキャンするため、大規模なテーブルではパフォーマンスに影響する可能性があります。
func (s *KVStore) QueryItems(tableName string, partitionKey string, sortKeyPrefix string) ([]map[string]interface{}, error) {
	log.Printf("[INFO] [KVStore] [%s] QueryItems: CALLED for table='%s', partitionKey='%s', sortKeyPrefix='%s'", s.localNodeID, tableName, partitionKey, sortKeyPrefix)
	tableDataPath := s.tablePath(tableName)

	if _, err := os.Stat(tableDataPath); os.IsNotExist(err) {
		log.Printf("[WARN] [KVStore] [%s] QueryItems: table directory '%s' for table '%s' does not exist.", s.localNodeID, tableDataPath, tableName)
		// テーブルが存在しない場合はエラーを返す
		// FSMのテストケースでは、存在しないテーブルに対するクエリはエラーを返すことを期待している
		return nil, fmt.Errorf("table '%s' does not exist", tableName)
	}

	dirEntries, err := os.ReadDir(tableDataPath)
	if err != nil {
		log.Printf("[ERROR] [KVStore] [%s] QueryItems: failed to read directory '%s' for table '%s': %v", s.localNodeID, tableDataPath, tableName, err)
		return nil, fmt.Errorf("failed to read directory for table %s: %w", tableName, err)
	}
	log.Printf("[DEBUG] [KVStore] [%s] QueryItems: found %d entries in '%s'", s.localNodeID, len(dirEntries), tableDataPath)

	var items []map[string]interface{}
	for i, entry := range dirEntries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			log.Printf("[DEBUG] [KVStore] [%s] QueryItems: [Loop %d/%d] SKIPPING entry: '%s' (not a .json file or is a directory)", s.localNodeID, i+1, len(dirEntries), entry.Name())
			continue
		}
		log.Printf("[DEBUG] [KVStore] [%s] QueryItems: [Loop %d/%d] PROCESSING entry: '%s'", s.localNodeID, i+1, len(dirEntries), entry.Name())

		encodedKeyFromFile := strings.TrimSuffix(entry.Name(), ".json")
		log.Printf("[DEBUG] [KVStore] [%s] QueryItems: from fileName '%s', got encodedKeyFromFile='%s'", s.localNodeID, entry.Name(), encodedKeyFromFile)

		rawKeyFromFileName, unescapeErr := url.PathUnescape(encodedKeyFromFile)
		if unescapeErr != nil {
			log.Printf("[WARN] [KVStore] [%s] QueryItems: failed to unescape file name '%s' (orig: '%s'), skipping: %v", s.localNodeID, encodedKeyFromFile, entry.Name(), unescapeErr)
			continue
		}
		log.Printf("[DEBUG] [KVStore] [%s] QueryItems: PathUnescaped '%s' to rawKeyFromFileName='%s'", s.localNodeID, encodedKeyFromFile, rawKeyFromFileName)

		// rawKeyFromFileName (例: "ArtistValue_SongTitleValue" または "ArtistValue") からPKとSKをパース
		// このロジックはFSMのキー生成やGetItemのキー解釈と一貫している必要がある。
		// ここでは単純に、PKがファイル名に含まれているか、そしてSKプレフィックスが一致するかを見る。
		// 実際のDynamoDBでは、PKが一致するアイテムを効率的に検索し、その後SKでフィルタする。
		// ファイルシステムベースなので、全スキャンに近い形になる。

		// まず、PKが一致するかどうかを確認
		// rawKeyFromFileNameは 'PK' または 'PK_SK' の形式。
		parts := strings.SplitN(rawKeyFromFileName, "_", 2)
		currentPK := parts[0]
		var currentSK string
		if len(parts) > 1 {
			currentSK = parts[1]
		}
		log.Printf("[DEBUG] [KVStore] [%s] QueryItems: parsed from rawKeyFromFileName '%s' -> currentPK='%s', currentSK='%s'", s.localNodeID, rawKeyFromFileName, currentPK, currentSK)

		if currentPK != partitionKey {
			log.Printf("[DEBUG] [KVStore] [%s] QueryItems: PK MISMATCH for rawKey '%s' (currentPK='%s', expectedPK='%s'). Skipping.", s.localNodeID, rawKeyFromFileName, currentPK, partitionKey)
			continue
		}
		log.Printf("[DEBUG] [KVStore] [%s] QueryItems: PK MATCH for rawKey '%s' (currentPK='%s'). Checking SKPrefix='%s'.", s.localNodeID, rawKeyFromFileName, currentPK, sortKeyPrefix)

		// ソートキーのプレフィックスフィルタリング (指定されている場合)
		if sortKeyPrefix != "" {
			if !strings.HasPrefix(currentSK, sortKeyPrefix) {
				log.Printf("[DEBUG] [KVStore] [%s] QueryItems: SKPrefix MISMATCH for rawKey '%s' (currentSK='%s' (len %d), expectedSKPrefix='%s' (len %d)). Skipping.", s.localNodeID, rawKeyFromFileName, currentSK, len(currentSK), sortKeyPrefix, len(sortKeyPrefix))
				continue
			}
			log.Printf("[DEBUG] [KVStore] [%s] QueryItems: SKPrefix MATCH for rawKey '%s' (currentSK='%s', expectedSKPrefix='%s').", s.localNodeID, rawKeyFromFileName, currentSK, sortKeyPrefix)
		} else {
			// ソートキープレフィックスが指定されていない場合は、PKが一致すればOK (ソートキーなしテーブル or 全SKアイテム)
			log.Printf("[DEBUG] [KVStore] [%s] QueryItems: No SKPrefix specified, PK match is sufficient for rawKey '%s'.", s.localNodeID, rawKeyFromFileName)
		}

		// 条件に一致したのでアイテムを読み込む
		log.Printf("[DEBUG] [KVStore] [%s] QueryItems: item with rawKey '%s' MATCHES criteria. Attempting to GetItem.", s.localNodeID, rawKeyFromFileName)
		itemDataRaw, _, getItemErr := s.GetItem(tableName, rawKeyFromFileName) // GetItemはデコード済みのキーを期待
		if getItemErr != nil {
			log.Printf("[WARN] [KVStore] [%s] QueryItems: failed to get item for matched key '%s' (orig file: '%s'), skipping: %v", s.localNodeID, rawKeyFromFileName, entry.Name(), getItemErr)
			continue
		}
		var itemDataMap map[string]interface{}
		if unmarshalMapErr := json.Unmarshal(itemDataRaw, &itemDataMap); unmarshalMapErr != nil {
			log.Printf("[WARN] [KVStore] [%s] QueryItems: failed to unmarshal item data for key '%s' into map, skipping: %v", s.localNodeID, rawKeyFromFileName, unmarshalMapErr)
			continue
		}
		items = append(items, itemDataMap)
		log.Printf("[DEBUG] [KVStore] [%s] QueryItems: SUCCESSFULLY added item from rawKey '%s' to results. Result count: %d", s.localNodeID, rawKeyFromFileName, len(items))
	}

	log.Printf("[INFO] [KVStore] [%s] QueryItems for table '%s', pk='%s', skPrefix='%s' FINAL found %d items.", s.localNodeID, tableName, partitionKey, sortKeyPrefix, len(items))
	return items, nil
}

// TODO: PutItem, GetItem, DeleteItem, QueryItems などのメソッドを実装
// このTODOコメントはもう不要なので削除します。
