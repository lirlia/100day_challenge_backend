package store

import (
	"encoding/json"
	"fmt"
	"io"
	"log"

	"github.com/hashicorp/raft"
)

// TableMetadata はテーブルのスキーマ情報を保持します。
type TableMetadata struct {
	TableName        string `json:"table_name"`
	PartitionKeyName string `json:"partition_key_name"`
	SortKeyName      string `json:"sort_key_name,omitempty"` // オプショナル
}

// FSM はRaftのログエントリを適用し、状態を更新するステートマシンです。
// KVStoreへの操作をラップします。
type FSM struct {
	kvStore     *KVStore
	localNodeID string // デバッグログ用
	// テーブル定義などを保持するならここに追加
	tables map[string]TableMetadata // テーブル名とメタデータのマップ
}

// NewFSM は新しいFSMインスタンスを作成します。
// dataDir はKVStoreが使用するデータストレージのベースパスです。
func NewFSM(kvStore *KVStore, localNodeID string) *FSM {
	log.Printf("[INFO] [FSM] [%s] NewFSM: Initializing FSM", localNodeID)
	return &FSM{
		kvStore:     kvStore,
		localNodeID: localNodeID,
		tables:      make(map[string]TableMetadata),
	}
}

// Apply はRaftからログエントリを受け取り、ステートマシンに適用します。
// このメソッドはRaftによって呼び出され、返り値はアプリケーションのクライアントに返されます。
func (f *FSM) Apply(logEntry *raft.Log) interface{} {
	cmd := &Command{}
	if err := json.Unmarshal(logEntry.Data, cmd); err != nil {
		log.Printf("[ERROR] [FSM] [%s] Apply: Failed to unmarshal Raft log data: %v. LogData: %s", f.localNodeID, err, string(logEntry.Data))
		return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal command: %v", err)}
	}
	log.Printf("[DEBUG] [FSM] [%s] Apply: Received command: Type=%s", f.localNodeID, cmd.Type)

	switch cmd.Type {
	case CreateTableCommandType:
		payload, err := DecodeCreateTableCommand(cmd.Payload)
		if err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply CreateTable: Failed to decode payload: %v", f.localNodeID, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to decode CreateTableCommand payload: %v", err)}
		}
		log.Printf("[INFO] [FSM] [%s] Apply CreateTable: TableName='%s', PK='%s', SK='%s'", f.localNodeID, payload.TableName, payload.PartitionKeyName, payload.SortKeyName)
		if _, exists := f.tables[payload.TableName]; exists {
			log.Printf("[ERROR] [FSM] [%s] Apply CreateTable: table '%s' already exists", f.localNodeID, payload.TableName)
			return CommandResponse{Success: false, Error: fmt.Sprintf("table %s already exists", payload.TableName), TableName: payload.TableName}
		}
		f.tables[payload.TableName] = TableMetadata{
			TableName:        payload.TableName,
			PartitionKeyName: payload.PartitionKeyName,
			SortKeyName:      payload.SortKeyName,
		}
		if err := f.kvStore.EnsureTableDir(payload.TableName); err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply CreateTable: Failed to ensure table directory for '%s': %v", f.localNodeID, payload.TableName, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to create table directory for %s: %v", payload.TableName, err), TableName: payload.TableName}
		}
		log.Printf("[INFO] [FSM] [%s] Apply CreateTable: Successfully processed for table '%s'", f.localNodeID, payload.TableName)
		return CommandResponse{Success: true, Message: fmt.Sprintf("Table %s created/ensured successfully", payload.TableName), TableName: payload.TableName}

	case DeleteTableCommandType:
		payload, err := DecodeDeleteTableCommand(cmd.Payload)
		if err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply DeleteTable: Failed to decode payload: %v", f.localNodeID, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to decode DeleteTableCommand payload: %v", err)}
		}
		log.Printf("[INFO] [FSM] [%s] Apply DeleteTable: TableName='%s'", f.localNodeID, payload.TableName)
		if _, exists := f.tables[payload.TableName]; !exists {
			log.Printf("[ERROR] [FSM] [%s] Apply DeleteTable: table '%s' not found", f.localNodeID, payload.TableName)
			return CommandResponse{Success: false, Error: fmt.Sprintf("table %s not found", payload.TableName), TableName: payload.TableName}
		}
		delete(f.tables, payload.TableName)
		if err := f.kvStore.RemoveTableDir(payload.TableName); err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply DeleteTable: Failed to remove table directory for '%s': %v", f.localNodeID, payload.TableName, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to remove table directory for %s: %v", payload.TableName, err), TableName: payload.TableName}
		}
		log.Printf("[INFO] [FSM] [%s] Apply DeleteTable: Successfully processed for table '%s'", f.localNodeID, payload.TableName)
		return CommandResponse{Success: true, Message: fmt.Sprintf("Table %s deleted successfully", payload.TableName), TableName: payload.TableName}

	case PutItemCommandType:
		payload, err := DecodePutItemCommand(cmd.Payload)
		if err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply PutItem: Failed to decode payload: %v", f.localNodeID, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to decode PutItemCommand payload: %v", err)}
		}
		meta, exists := f.tables[payload.TableName]
		if !exists {
			log.Printf("[ERROR] [FSM] [%s] Apply PutItem: table '%s' not found", f.localNodeID, payload.TableName)
			return CommandResponse{Success: false, Error: fmt.Sprintf("table %s not found", payload.TableName), TableName: payload.TableName}
		}

		var itemDataMap map[string]interface{}
		if err := json.Unmarshal(payload.Item, &itemDataMap); err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply PutItem: failed to unmarshal item data for table '%s': %v", f.localNodeID, payload.TableName, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal item data for table %s: %v", payload.TableName, err), TableName: payload.TableName}
		}
		pkValue, pkOk := itemDataMap[meta.PartitionKeyName]
		if !pkOk || pkValue == nil {
			errMsg := fmt.Sprintf("partition key '%s' not found or is null in item for table '%s'", meta.PartitionKeyName, payload.TableName)
			log.Printf("[ERROR] [FSM] [%s] Apply PutItem: %s", f.localNodeID, errMsg)
			return CommandResponse{Success: false, Error: errMsg, TableName: payload.TableName}
		}
		pkStr, pkIsStr := pkValue.(string)
		if !pkIsStr || pkStr == "" {
			errMsg := fmt.Sprintf("partition key '%s' must be a non-empty string, got '%v' (type %T) for table '%s'", meta.PartitionKeyName, pkValue, pkValue, payload.TableName)
			log.Printf("[ERROR] [FSM] [%s] Apply PutItem: %s", f.localNodeID, errMsg)
			return CommandResponse{Success: false, Error: errMsg, TableName: payload.TableName}
		}
		itemStoreKey := pkStr
		if meta.SortKeyName != "" {
			skValue, skOk := itemDataMap[meta.SortKeyName]
			if !skOk || skValue == nil {
				errMsg := fmt.Sprintf("sort key '%s' not found or is null in item for table '%s' (but defined in metadata)", meta.SortKeyName, payload.TableName)
				log.Printf("[ERROR] [FSM] [%s] Apply PutItem: %s", f.localNodeID, errMsg)
				return CommandResponse{Success: false, Error: errMsg, TableName: payload.TableName}
			}
			skStr, skIsStr := skValue.(string)
			if !skIsStr {
				errMsg := fmt.Sprintf("sort key '%s' must be a string, got '%v' (type %T) for table '%s'", meta.SortKeyName, skValue, skValue, payload.TableName)
				log.Printf("[ERROR] [FSM] [%s] Apply PutItem: %s", f.localNodeID, errMsg)
				return CommandResponse{Success: false, Error: errMsg, TableName: payload.TableName}
			}
			itemStoreKey += "_" + skStr
		}
		log.Printf("[INFO] [FSM] [%s] Apply PutItem: TableName='%s', StoreKey='%s', Timestamp=%d", f.localNodeID, payload.TableName, itemStoreKey, payload.Timestamp)
		if err := f.kvStore.PutItem(payload.TableName, itemStoreKey, payload.Item, payload.Timestamp); err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply PutItem: Failed to put item '%s' in table '%s': %v", f.localNodeID, itemStoreKey, payload.TableName, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to put item %s in table %s: %v", itemStoreKey, payload.TableName, err), TableName: payload.TableName, ItemKey: itemStoreKey}
		}
		log.Printf("[INFO] [FSM] [%s] Apply PutItem: Successfully processed for table '%s', key '%s'", f.localNodeID, payload.TableName, itemStoreKey)
		return CommandResponse{Success: true, Message: fmt.Sprintf("Item %s put successfully in table %s", itemStoreKey, payload.TableName), TableName: payload.TableName, ItemKey: itemStoreKey}

	case DeleteItemCommandType:
		payload, err := DecodeDeleteItemCommand(cmd.Payload)
		if err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply DeleteItem: Failed to decode payload: %v", f.localNodeID, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to decode DeleteItemCommand payload: %v", err)}
		}
		meta, exists := f.tables[payload.TableName]
		if !exists {
			log.Printf("[ERROR] [FSM] [%s] Apply DeleteItem: table '%s' not found", f.localNodeID, payload.TableName)
			return CommandResponse{Success: false, Error: fmt.Sprintf("table %s not found", payload.TableName), TableName: payload.TableName}
		}
		itemStoreKey := payload.PartitionKey
		if meta.SortKeyName != "" {
			// ペイロードのSortKeyが空文字列でも結合する（空のソートキーを表現するため）
			itemStoreKey += "_" + payload.SortKey
		} else if payload.SortKey != "" {
			errMsg := fmt.Sprintf("sort key provided in payload for table '%s' which has no sort key defined", payload.TableName)
			log.Printf("[ERROR] [FSM] [%s] Apply DeleteItem: %s", f.localNodeID, errMsg)
			return CommandResponse{Success: false, Error: errMsg, TableName: payload.TableName}
		}
		log.Printf("[INFO] [FSM] [%s] Apply DeleteItem: TableName='%s', StoreKey='%s', Timestamp=%d", f.localNodeID, payload.TableName, itemStoreKey, payload.Timestamp)
		if err := f.kvStore.DeleteItem(payload.TableName, itemStoreKey, payload.Timestamp); err != nil {
			log.Printf("[ERROR] [FSM] [%s] Apply DeleteItem: Failed to delete item '%s' from table '%s': %v", f.localNodeID, itemStoreKey, payload.TableName, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to delete item %s from table %s: %v", itemStoreKey, payload.TableName, err), TableName: payload.TableName, ItemKey: itemStoreKey}
		}
		log.Printf("[INFO] [FSM] [%s] Apply DeleteItem: Successfully processed for table '%s', key '%s'", f.localNodeID, payload.TableName, itemStoreKey)
		return CommandResponse{Success: true, Message: fmt.Sprintf("Item %s deleted successfully from table %s", itemStoreKey, payload.TableName), TableName: payload.TableName, ItemKey: itemStoreKey}

	default:
		log.Printf("[ERROR] [FSM] [%s] Apply: Unknown command type: %s", f.localNodeID, cmd.Type)
		return CommandResponse{Success: false, Error: fmt.Sprintf("unknown command type: %s", cmd.Type)}
	}
}

// GetTableMetadata は指定されたテーブルのメタデータを返します。
// テーブルが存在しない場合は nil と false を返します。
func (f *FSM) GetTableMetadata(tableName string) (*TableMetadata, bool) {
	meta, exists := f.tables[tableName]
	if !exists {
		return nil, false
	}
	// コピーを返すことで、外部からの変更を防ぐ
	metaCopy := meta
	return &metaCopy, true
}

// ListTables はFSMが認識しているテーブルの一覧を返します。
// TODO: 実際にはテーブルメタデータを保持し、そこから返す
func (f *FSM) ListTables() []string {
	log.Printf("[INFO] [FSM] [%s] ListTables: Called", f.localNodeID)
	// PoC段階ではKVStoreのディレクトリ一覧から取得するか、
	// あるいはFSM内で管理しているテーブルリストを返す。
	// 現状はFSMのtablesマップのキーを返す
	tableNames := make([]string, 0, len(f.tables))
	for name := range f.tables {
		tableNames = append(tableNames, name)
	}
	log.Printf("[INFO] [FSM] [%s] ListTables: Returning %d tables: %v", f.localNodeID, len(tableNames), tableNames)
	return tableNames
}

// Snapshot は現在のFSMの状態のスナップショットを返します。
// この実装では、KVStoreのデータはファイルシステムにあるため、
// スナップショット作成は比較的軽量にできるはずですが、ここでは簡略化のため何もしません。
// 実際の永続化はファイルシステムへの書き込みによって行われているため、
// Raftのスナップショットとしては、どのログエントリまで適用されたか、くらいで良いかもしれません。
// より高度な実装では、ファイルシステムのコピーや特定のチェックポイントファイルを作成することが考えられます。
func (f *FSM) Snapshot() (raft.FSMSnapshot, error) {
	log.Printf("[INFO] [FSM] [%s] Snapshot: Creating FSM snapshot with current table metadata (%d tables)", f.localNodeID, len(f.tables))
	// この例では、FSM自体のメモリ上の状態は最小限（テーブルメタデータなど）なので、
	// スナップショットにはそれらを含めるか、あるいはKVStoreが永続化するので何もしないか。
	// ここではテーブルメタデータのみをスナップショットに含めます。
	tablesCopy := make(map[string]TableMetadata, len(f.tables))
	for k, v := range f.tables {
		tablesCopy[k] = v
	}
	return &fsmSnapshot{tables: tablesCopy, localNodeID: f.localNodeID}, nil
}

// Restore はスナップショットからFSMの状態を復元します。
// この例では、KVStoreのデータはファイルシステムに既に永続化されているため、
// 基本的には何もしなくても良いか、あるいはスナップショットに含まれるメタデータを復元します。
func (f *FSM) Restore(rc io.ReadCloser) error {
	log.Printf("[INFO] [FSM] [%s] Restore: Restoring FSM from snapshot", f.localNodeID)
	// スナップショットの内容を読み取り、FSMの状態（例：テーブルメタデータ）を復元する
	var tablesSnapshot map[string]TableMetadata
	dec := json.NewDecoder(rc)
	if err := dec.Decode(&tablesSnapshot); err != nil {
		_ = rc.Close()
		log.Printf("[ERROR] [FSM] [%s] Restore: Failed to decode snapshot data: %v", f.localNodeID, err)
		return fmt.Errorf("failed to decode snapshot: %w", err)
	}
	f.tables = tablesSnapshot
	log.Printf("[INFO] [FSM] [%s] Restore: Successfully restored %d tables from snapshot", f.localNodeID, len(f.tables))

	// KVStore側のディレクトリも復元されたテーブルに合わせてEnsureTableDirしておくのが堅牢
	// ただし、KVStoreのデータ自体はRaftログの再適用や既存データによって整合性が取れるはずなので必須ではないかもしれない。
	for tableName := range f.tables {
		if err := f.kvStore.EnsureTableDir(tableName); err != nil {
			log.Printf("[WARN] [FSM] [%s] Restore: Failed to ensure directory for restored table '%s', but proceeding: %v", f.localNodeID, tableName, err)
			// 致命的ではないかもしれないので警告にとどめる
		}
	}
	return rc.Close() // 必ずCloseする
}

// fsmSnapshot は Raft のスナップショットインターフェースを実装します。
// この例ではテーブルのメタデータのみをスナップショットに含めます。
type fsmSnapshot struct {
	tables      map[string]TableMetadata
	localNodeID string // デバッグ用
}

// Persist はスナップショットの内容を Raft のストレージに永続化します。
func (s *fsmSnapshot) Persist(sink raft.SnapshotSink) error {
	log.Printf("[INFO] [FSM] [%s] fsmSnapshot.Persist started with %d tables", s.localNodeID, len(s.tables))
	err := func() error {
		data, err := json.Marshal(s.tables)
		if err != nil {
			log.Printf("[ERROR] [FSM] [%s] fsmSnapshot.Persist failed to marshal tables: %v", s.localNodeID, err)
			return fmt.Errorf("failed to marshal tables for snapshot: %w", err)
		}
		if _, err := sink.Write(data); err != nil {
			log.Printf("[ERROR] [FSM] [%s] fsmSnapshot.Persist failed to write to sink: %v", s.localNodeID, err)
			return fmt.Errorf("failed to write snapshot to sink: %w", err)
		}
		return nil
	}()

	if err != nil {
		log.Printf("[ERROR] [FSM] [%s] fsmSnapshot.Persist error, aborting sink: %v", s.localNodeID, err)
		_ = sink.Cancel() // sink.Cancel()のエラーは無視
		return err
	}

	if err := sink.Close(); err != nil {
		log.Printf("[ERROR] [FSM] [%s] fsmSnapshot.Persist failed to close sink: %v", s.localNodeID, err)
		return fmt.Errorf("failed to close snapshot sink: %w", err)
	}
	log.Printf("[INFO] [FSM] [%s] fsmSnapshot.Persist completed successfully", s.localNodeID)
	return nil
}

// Release はスナップショットが不要になったときに呼び出されます。
func (s *fsmSnapshot) Release() {
	log.Printf("[INFO] [FSM] [%s] fsmSnapshot.Release called", s.localNodeID)
	// スナップショットが不要になったときに呼ばれる。
	// メモリ上のリソースなどがあればここで解放する。今回は特に何もしない。
}
