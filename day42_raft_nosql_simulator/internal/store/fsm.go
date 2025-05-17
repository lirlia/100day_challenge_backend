package store

import (
	"encoding/json"
	"fmt"
	"io"
	"log"  // エラーログ用
	"sync" // テーブルメタデータアクセスのためのロック

	"github.com/hashicorp/raft"
)

// TableMetadata はテーブルのスキーマ情報を保持します。
type TableMetadata struct {
	TableName        string `json:"table_name"`
	PartitionKeyName string `json:"partition_key_name"`
	SortKeyName      string `json:"sort_key_name,omitempty"` // オプショナル
}

// FSM は Raft のステートマシンです。
// テーブルのメタデータと、KVStoreへの参照を保持します。
type FSM struct {
	mu          sync.RWMutex
	tables      map[string]TableMetadata // テーブル名 -> メタデータ
	kvStore     *KVStore                 // データディレクトリ操作用
	dataDir     string                   // KVStoreの初期化に必要
	localNodeID string                   // デバッグログ用
}

// NewFSM は新しい FSM インスタンスを作成します。
// dataDir はKVStoreが使用するデータストレージのベースパスです。
func NewFSM(dataDir string, kvStore *KVStore, localNodeID string) *FSM {
	return &FSM{
		tables:      make(map[string]TableMetadata),
		kvStore:     kvStore,
		dataDir:     dataDir,
		localNodeID: localNodeID,
	}
}

// Apply は Raft ログエントリをステートマシンに適用します。
func (f *FSM) Apply(logEntry *raft.Log) interface{} {
	f.mu.Lock()
	defer f.mu.Unlock()

	var cmd Command
	if err := json.Unmarshal(logEntry.Data, &cmd); err != nil {
		log.Printf("[%s] FSM.Apply failed to unmarshal command: %v, data: %s", f.localNodeID, err, string(logEntry.Data))
		// エラーを返すとRaftがおかしくなる可能性があるため、ここではnilを返すか、パニックする。
		// 今回はログ出力に留める。
		return fmt.Errorf("failed to unmarshal command: %w", err)
	}

	log.Printf("[%s] FSM.Apply received command: Type=%s", f.localNodeID, cmd.Type)

	switch cmd.Type {
	case CreateTableCommandType:
		payload, err := DecodeCreateTableCommand(cmd.Payload)
		if err != nil {
			log.Printf("[%s] FSM.Apply failed to decode CreateTableCommand: %v", f.localNodeID, err)
			return err
		}
		if _, exists := f.tables[payload.TableName]; exists {
			log.Printf("[%s] FSM.Apply table %s already exists", f.localNodeID, payload.TableName)
			return fmt.Errorf("table %s already exists", payload.TableName)
		}
		f.tables[payload.TableName] = TableMetadata{
			TableName:        payload.TableName,
			PartitionKeyName: payload.PartitionKeyName,
			SortKeyName:      payload.SortKeyName,
		}
		// KVStoreにテーブル用のディレクトリを作成させる
		if err := f.kvStore.EnsureTableDir(payload.TableName); err != nil {
			log.Printf("[%s] FSM.Apply failed to ensure directory for table %s: %v", f.localNodeID, payload.TableName, err)
			// FSMの状態は更新したが、ディレクトリ作成に失敗した場合。不整合だが、リカバリは難しい。
			// エラーを返してRaftにリトライさせるか？冪等性があれば良いが、ディレクトリ作成は冪等。
			return fmt.Errorf("failed to ensure directory for table %s: %w", payload.TableName, err)
		}
		log.Printf("[%s] FSM.Apply created table %s", f.localNodeID, payload.TableName)
		return nil // 成功時はnilまたは具体的な結果を返す

	case DeleteTableCommandType:
		payload, err := DecodeDeleteTableCommand(cmd.Payload)
		if err != nil {
			log.Printf("[%s] FSM.Apply failed to decode DeleteTableCommand: %v", f.localNodeID, err)
			return err
		}
		if _, exists := f.tables[payload.TableName]; !exists {
			log.Printf("[%s] FSM.Apply table %s not found for deletion", f.localNodeID, payload.TableName)
			return fmt.Errorf("table %s not found", payload.TableName)
		}
		delete(f.tables, payload.TableName)
		// KVStoreにテーブル用のディレクトリを削除させる
		if err := f.kvStore.RemoveTableDir(payload.TableName); err != nil {
			log.Printf("[%s] FSM.Apply failed to remove directory for table %s: %v", f.localNodeID, payload.TableName, err)
			// FSMの状態は更新したが、ディレクトリ削除に失敗した場合。
			return fmt.Errorf("failed to remove directory for table %s: %w", payload.TableName, err)
		}
		log.Printf("[%s] FSM.Apply deleted table %s", f.localNodeID, payload.TableName)
		return nil

	case PutItemCommandType:
		putPayload, err := DecodePutItemCommand(cmd.Payload)
		if err != nil {
			log.Printf("[%s] FSM.Apply failed to decode PutItemCommand: %v", f.localNodeID, err)
			return err
		}
		meta, exists := f.tables[putPayload.TableName]
		if !exists {
			log.Printf("[%s] FSM.Apply PutItem: table %s not found", f.localNodeID, putPayload.TableName)
			return fmt.Errorf("table %s not found", putPayload.TableName)
		}

		// itemRawData からパーティションキーとソートキーの値を抽出
		var itemDataMap map[string]interface{}
		if err := json.Unmarshal(putPayload.Item, &itemDataMap); err != nil {
			log.Printf("[%s] FSM.Apply PutItem: failed to unmarshal item data from payload for table %s: %v", f.localNodeID, putPayload.TableName, err)
			return fmt.Errorf("failed to unmarshal item data from payload for table %s: %w", putPayload.TableName, err)
		}

		pkValue, pkOk := itemDataMap[meta.PartitionKeyName]
		if !pkOk || pkValue == nil {
			log.Printf("[%s] FSM.Apply PutItem: partition key %s not found or is null in item for table %s", f.localNodeID, meta.PartitionKeyName, putPayload.TableName)
			return fmt.Errorf("partition key %s not found or is null in item for table %s", meta.PartitionKeyName, putPayload.TableName)
		}
		pkStr, pkIsStr := pkValue.(string) // キーは文字列を想定
		if !pkIsStr {
			log.Printf("[%s] FSM.Apply PutItem: partition key %s is not a string in item for table %s", f.localNodeID, meta.PartitionKeyName, putPayload.TableName)
			return fmt.Errorf("partition key %s must be a string, got %T", meta.PartitionKeyName, pkValue)
		}
		if pkStr == "" {
			return fmt.Errorf("partition key %s cannot be empty string", meta.PartitionKeyName)
		}

		itemStoreKey := pkStr
		if meta.SortKeyName != "" {
			skValue, skOk := itemDataMap[meta.SortKeyName]
			if !skOk || skValue == nil {
				log.Printf("[%s] FSM.Apply PutItem: sort key %s not found or is null in item for table %s (but defined in metadata)", f.localNodeID, meta.SortKeyName, putPayload.TableName)
				return fmt.Errorf("sort key %s not found or is null in item for table %s", meta.SortKeyName, putPayload.TableName)
			}
			skStr, skIsStr := skValue.(string)
			if !skIsStr {
				log.Printf("[%s] FSM.Apply PutItem: sort key %s is not a string in item for table %s", f.localNodeID, meta.SortKeyName, putPayload.TableName)
				return fmt.Errorf("sort key %s must be a string, got %T", meta.SortKeyName, skValue)
			}
			// ソートキーが空文字列でも許容する場合があるため、ここではチェックしない。
			itemStoreKey = pkStr + "_" + skStr
		}

		if err := f.kvStore.PutItem(putPayload.TableName, itemStoreKey, putPayload.Item, putPayload.Timestamp); err != nil {
			log.Printf("[%s] FSM.Apply PutItem: KVStore.PutItem failed for table %s, key %s: %v", f.localNodeID, putPayload.TableName, itemStoreKey, err)
			return fmt.Errorf("KVStore.PutItem failed for table %s, key %s: %w", putPayload.TableName, itemStoreKey, err)
		}
		log.Printf("[%s] FSM.Apply PutItem successful for table %s, key %s", f.localNodeID, putPayload.TableName, itemStoreKey)
		return nil

	case DeleteItemCommandType:
		deletePayload, err := DecodeDeleteItemCommand(cmd.Payload)
		if err != nil {
			log.Printf("[%s] FSM.Apply failed to decode DeleteItemCommand: %v", f.localNodeID, err)
			return err
		}
		meta, exists := f.tables[deletePayload.TableName]
		if !exists {
			log.Printf("[%s] FSM.Apply DeleteItem: table %s not found", f.localNodeID, deletePayload.TableName)
			return fmt.Errorf("table %s not found", deletePayload.TableName)
		}

		// DeleteItemCommandPayload には PartitionKey と SortKey が直接含まれている
		itemStoreKey := deletePayload.PartitionKey
		if meta.SortKeyName != "" {
			// メタデータにソートキーが定義されている場合、ペイロードのソートキーも使う
			// ペイロードのSortKeyが空でも、定義されていれば "_" で結合する (空のソートキーを表現)
			itemStoreKey = deletePayload.PartitionKey + "_" + deletePayload.SortKey
		} else if deletePayload.SortKey != "" {
			// メタデータにソートキーが定義されていないのに、ペイロードにソートキーがある場合はエラー
			log.Printf("[%s] FSM.Apply DeleteItem: sort key provided in payload for table %s which has no sort key defined", f.localNodeID, deletePayload.TableName)
			return fmt.Errorf("sort key provided for table %s which has no sort key defined", deletePayload.TableName)
		}

		if err := f.kvStore.DeleteItem(deletePayload.TableName, itemStoreKey, deletePayload.Timestamp); err != nil {
			log.Printf("[%s] FSM.Apply DeleteItem: KVStore.DeleteItem failed for table %s, key %s: %v", f.localNodeID, deletePayload.TableName, itemStoreKey, err)
			return fmt.Errorf("KVStore.DeleteItem failed for table %s, key %s: %w", deletePayload.TableName, itemStoreKey, err)
		}
		log.Printf("[%s] FSM.Apply DeleteItem successful for table %s, key %s", f.localNodeID, deletePayload.TableName, itemStoreKey)
		return nil

	default:
		log.Printf("[%s] FSM.Apply received unknown command type: %s", f.localNodeID, cmd.Type)
		return fmt.Errorf("unknown command type: %s", cmd.Type)
	}
}

// GetTableMetadata は指定されたテーブルのメタデータを返します。
// テーブルが存在しない場合は nil と false を返します。
func (f *FSM) GetTableMetadata(tableName string) (*TableMetadata, bool) {
	f.mu.RLock()
	defer f.mu.RUnlock()
	meta, exists := f.tables[tableName]
	if !exists {
		return nil, false
	}
	// コピーを返すことで、外部からの変更を防ぐ
	metaCopy := meta
	return &metaCopy, true
}

// ListTables は現在FSMに存在するすべてのテーブルのメタデータのマップを返します。
// マップのキーはテーブル名です。
func (f *FSM) ListTables() map[string]TableMetadata {
	f.mu.RLock()
	defer f.mu.RUnlock()
	tablesCopy := make(map[string]TableMetadata, len(f.tables))
	for k, v := range f.tables {
		tablesCopy[k] = v
	}
	return tablesCopy
}

// Snapshot は現在のステートマシンのスナップショットを生成します。
// スナップショットにはテーブルメタデータが含まれます。
func (f *FSM) Snapshot() (raft.FSMSnapshot, error) {
	f.mu.RLock()
	defer f.mu.RUnlock()

	tablesCopy := make(map[string]TableMetadata, len(f.tables))
	for k, v := range f.tables {
		tablesCopy[k] = v
	}

	log.Printf("[%s] FSM.Snapshot creating snapshot with %d tables", f.localNodeID, len(tablesCopy))
	return &fsmSnapshot{tables: tablesCopy, localNodeID: f.localNodeID}, nil
}

// Restore はスナップショットからステートマシンを復元します。
func (f *FSM) Restore(rc io.ReadCloser) error {
	defer rc.Close()
	f.mu.Lock()
	defer f.mu.Unlock()

	var tables map[string]TableMetadata
	if err := json.NewDecoder(rc).Decode(&tables); err != nil {
		log.Printf("[%s] FSM.Restore failed to decode snapshot: %v", f.localNodeID, err)
		return fmt.Errorf("failed to decode snapshot: %w", err)
	}

	f.tables = tables
	// スナップショット復元後、KVStore側のディレクトリ構造も整合性を取る必要がある。
	// EnsureTableDirを各テーブルに対して呼び出す。
	for tableName := range f.tables {
		if err := f.kvStore.EnsureTableDir(tableName); err != nil {
			// ここでエラーが発生すると復元が不完全になる。
			// 起動時のエラーとして処理し、起動を失敗させるべきかもしれない。
			log.Printf("[%s] FSM.Restore failed to ensure directory for table %s during restore: %v", f.localNodeID, tableName, err)
			return fmt.Errorf("failed to ensure directory for table %s during restore: %w", tableName, err)
		}
	}

	log.Printf("[%s] FSM.Restore restored state with %d tables", f.localNodeID, len(f.tables))
	return nil
}

// fsmSnapshot は FSMSnapshot インターフェースを実装します。
type fsmSnapshot struct {
	tables      map[string]TableMetadata
	localNodeID string // デバッグログ用
}

func (s *fsmSnapshot) Persist(sink raft.SnapshotSink) error {
	log.Printf("[%s] fsmSnapshot.Persist started", s.localNodeID)
	err := func() error {
		data, err := json.Marshal(s.tables)
		if err != nil {
			log.Printf("[%s] fsmSnapshot.Persist failed to marshal tables: %v", s.localNodeID, err)
			return fmt.Errorf("failed to marshal tables for snapshot: %w", err)
		}
		if _, err := sink.Write(data); err != nil {
			log.Printf("[%s] fsmSnapshot.Persist failed to write to sink: %v", s.localNodeID, err)
			return fmt.Errorf("failed to write snapshot to sink: %w", err)
		}
		return nil
	}()

	if err != nil {
		log.Printf("[%s] fsmSnapshot.Persist error, aborting sink: %v", s.localNodeID, err)
		_ = sink.Cancel() // sink.Cancel()のエラーは無視
		return err
	}

	if err := sink.Close(); err != nil {
		log.Printf("[%s] fsmSnapshot.Persist failed to close sink: %v", s.localNodeID, err)
		return fmt.Errorf("failed to close snapshot sink: %w", err)
	}
	log.Printf("[%s] fsmSnapshot.Persist completed successfully", s.localNodeID)
	return nil
}

func (s *fsmSnapshot) Release() {
	log.Printf("[%s] fsmSnapshot.Release called", s.localNodeID)
	// スナップショットが不要になったときに呼ばれる。
	// メモリ上のリソースなどがあればここで解放する。今回は特に何もしない。
}
