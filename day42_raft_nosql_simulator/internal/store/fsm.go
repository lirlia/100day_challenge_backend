package store

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"strings"

	"github.com/hashicorp/raft"
)

// Compile-time check to ensure FSM implements the raft.FSM interface.
var _ raft.FSM = (*FSM)(nil)

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
	localNodeID raft.ServerID
	tables      map[string]TableMetadata // テーブル名とメタデータのマップ
	logger      *log.Logger
}

// NewFSM は新しいFSMインスタンスを作成します。
// dataDir はKVStoreが使用するデータストレージのベースパスです。
func NewFSM(kvStore *KVStore, localNodeID raft.ServerID, logger *log.Logger) *FSM {
	if logger == nil {
		logger = log.New(os.Stderr, fmt.Sprintf("[FSM][%s] ", string(localNodeID)), log.LstdFlags|log.Lmicroseconds)
	}
	return &FSM{
		kvStore:     kvStore,
		localNodeID: localNodeID,
		tables:      make(map[string]TableMetadata),
		logger:      logger,
	}
}

// Apply はFSMにコマンドを適用します。
func (f *FSM) Apply(logEntry *raft.Log) interface{} {
	f.logger.Printf("[DEBUG] FSM.Apply: Received log entry: type=%d, index=%d, term=%d", logEntry.Type, logEntry.Index, logEntry.Term)
	// raft.LogCommand (0) 以外は基本的に無視してよい (e.g. LogConfiguration, LogNoop, LogAddPeerDeprecated, LogRemovePeerDeprecated)
	// LogConfiguration (2) はRaft内部で処理される。
	// LogNoop (3) は特に何もしない。
	if logEntry.Type != raft.LogCommand {
		f.logger.Printf("[INFO] FSM.Apply: Skipping non-command log entry: type=%d", logEntry.Type)
		// FSMテストの TestFSM_Apply_malformed_command/Apply_non-command_log_type が
		// CommandResponse{Success: false, Error: "FSM received non-command log type: LogNoop"} を期待しているので合わせる
		return CommandResponse{Success: false, Error: fmt.Sprintf("FSM received non-command log type: %s", logEntry.Type.String())}
	}

	var cmd Command
	if err := json.Unmarshal(logEntry.Data, &cmd); err != nil {
		f.logger.Printf("[ERROR] FSM.Apply: Failed to unmarshal Raft log data into Command struct: %v. Data: %s", err, string(logEntry.Data))
		// TestFSM_Apply_malformed_command/Apply_malformed_command_JSON はこのエラーメッセージを期待
		return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal Raft log data to Command: %v. Raw Data: '%s'", err, string(logEntry.Data))}
	}

	f.logger.Printf("[DEBUG] FSM.Apply: Applying command: type=%s, payload_len=%d", cmd.Type, len(cmd.Payload))

	switch cmd.Type {
	case CreateTableCommandType:
		var payload CreateTableCommandPayload
		if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(CreateTable): Failed to unmarshal payload: %v", err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal CreateTable payload: %v", err)}
		}
		f.logger.Printf("[INFO] FSM.Apply: Creating table '%s' with PK '%s', SK '%s'", payload.TableName, payload.PartitionKeyName, payload.SortKeyName)

		if _, exists := f.tables[payload.TableName]; exists {
			f.logger.Printf("[WARN] FSM.Apply(CreateTable): Table '%s' already exists in FSM metadata", payload.TableName)
			return CommandResponse{Success: false, Error: fmt.Sprintf("table %s already exists", payload.TableName)}
		}

		// KVStoreでテーブルディレクトリを作成
		if err := f.kvStore.EnsureTableDir(payload.TableName); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(CreateTable): Failed to ensure directory for table '%s' in KVStore: %v", payload.TableName, err)
			// KVStore側で既に存在する場合もエラーにはならないはずだが、他のエラーの可能性
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to create table directory in KVStore for %s: %v", payload.TableName, err)}
		}

		// FSMのメタデータを更新
		f.tables[payload.TableName] = TableMetadata{
			TableName:        payload.TableName,
			PartitionKeyName: payload.PartitionKeyName,
			SortKeyName:      payload.SortKeyName,
		}
		f.logger.Printf("[INFO] FSM.Apply(CreateTable): Successfully created table '%s' and its directory.", payload.TableName)
		return CommandResponse{Success: true, TableName: payload.TableName, Message: "Table created successfully"}

	case DeleteTableCommandType:
		var payload DeleteTableCommandPayload
		if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(DeleteTable): Failed to unmarshal payload: %v", err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal DeleteTable payload: %v", err)}
		}
		f.logger.Printf("[INFO] FSM.Apply: Deleting table '%s'", payload.TableName)

		if _, exists := f.tables[payload.TableName]; !exists {
			f.logger.Printf("[WARN] FSM.Apply(DeleteTable): Table '%s' not found in FSM metadata", payload.TableName)
			return CommandResponse{Success: false, Error: fmt.Sprintf("table %s not found", payload.TableName)}
		}

		// KVStoreからテーブルディレクトリを削除
		if err := f.kvStore.RemoveTableDir(payload.TableName); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(DeleteTable): Failed to remove directory for table '%s' from KVStore: %v", payload.TableName, err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to remove table directory from KVStore for %s: %v", payload.TableName, err)}
		}

		// FSMのメタデータを削除
		delete(f.tables, payload.TableName)
		f.logger.Printf("[INFO] FSM.Apply(DeleteTable): Successfully deleted table '%s' and its directory.", payload.TableName)
		return CommandResponse{Success: true, TableName: payload.TableName, Message: "Table deleted successfully"}

	case PutItemCommandType:
		var payload PutItemCommandPayload
		if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): Failed to unmarshal payload: %v", err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal PutItem payload: %v", err)}
		}

		// JSONデコードされた数値はすべてfloat64型になるため、一貫性を保つために
		// Itemを一度map[string]interface{}に変換し、数値をすべてfloat64に統一する
		var itemMap map[string]interface{}
		if err := json.Unmarshal(payload.Item, &itemMap); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): Failed to unmarshal item map: %v", err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal item map: %v", err)}
		}

		// 数値をfloat64に統一（再帰的に処理）
		var convertToFloat64 func(interface{}) interface{}
		convertToFloat64 = func(v interface{}) interface{} {
			switch val := v.(type) {
			case int:
				return float64(val)
			case int64:
				return float64(val)
			case int32:
				return float64(val)
			case uint:
				return float64(val)
			case uint64:
				return float64(val)
			case uint32:
				return float64(val)
			case float32:
				return float64(val)
			case map[string]interface{}:
				for k, v := range val {
					val[k] = convertToFloat64(v)
				}
				return val
			case []interface{}:
				for i, v := range val {
					val[i] = convertToFloat64(v)
				}
				return val
			default:
				return v
			}
		}

		// マップの各要素に対して数値変換を適用
		for k, v := range itemMap {
			itemMap[k] = convertToFloat64(v)
		}

		// 変換したitemMapを再度JSONにエンコード
		updatedItem, err := json.Marshal(itemMap)
		if err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): Failed to marshal updated item map: %v", err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to marshal updated item map: %v", err)}
		}

		// 変換後のJSONをペイロードのItemに上書き
		payload.Item = updatedItem

		meta, tableExists := f.tables[payload.TableName]
		if !tableExists {
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): Table '%s' not found for item.", payload.TableName)
			return CommandResponse{Success: false, TableName: payload.TableName, Error: fmt.Sprintf("table %s not found", payload.TableName)}
		}

		// Item (json.RawMessage) を map[string]interface{} にパースしてキーを抽出
		var itemData map[string]interface{}
		if err := json.Unmarshal(payload.Item, &itemData); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): Failed to unmarshal item data for table '%s': %v. Raw Item: %s", payload.TableName, err, string(payload.Item))
			return CommandResponse{Success: false, TableName: payload.TableName, Error: fmt.Sprintf("failed to unmarshal item data for PutItem: %v", err)}
		}

		// PKとSKの値を取得
		pkValueInterface, pkOk := itemData[meta.PartitionKeyName]
		if !pkOk || pkValueInterface == nil {
			errStr := fmt.Sprintf("partition key '%s' not found or is null in item for table '%s'", meta.PartitionKeyName, payload.TableName)
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): %s. ItemData: %v", errStr, itemData)
			return CommandResponse{Success: false, TableName: payload.TableName, Error: errStr}
		}
		pkValueStr, pkIsString := pkValueInterface.(string)
		if !pkIsString { // DynamoDBではPK/SKは文字列、数値、バイナリだが、ここでは文字列を期待
			errStr := fmt.Sprintf("partition key '%s' must be a string, got %T for table '%s'", meta.PartitionKeyName, pkValueInterface, payload.TableName)
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): %s. ItemData: %v", errStr, itemData)
			return CommandResponse{Success: false, TableName: payload.TableName, Error: errStr}
		}

		var skValueStr string
		itemKey := pkValueStr
		if meta.SortKeyName != "" {
			skValueInterface, skOk := itemData[meta.SortKeyName]
			if !skOk || skValueInterface == nil {
				// ソートキーが定義されているのにアイテムにソートキーがない場合、エラーとするか、
				// あるいは空のソートキーとして許容するか。DynamoDBはエラーにする。
				// kv_store.go の getItemFilePath は空のキーを許容しない。
				// ここではエラーとする。
				errStr := fmt.Sprintf("sort key '%s' not found or is null in item for table '%s' which defines a sort key", meta.SortKeyName, payload.TableName)
				f.logger.Printf("[ERROR] FSM.Apply(PutItem): %s. ItemData: %v", errStr, itemData)
				return CommandResponse{Success: false, TableName: payload.TableName, Error: errStr}
			}
			var skIsString bool
			skValueStr, skIsString = skValueInterface.(string)
			if !skIsString {
				errStr := fmt.Sprintf("sort key '%s' must be a string, got %T for table '%s'", meta.SortKeyName, skValueInterface, payload.TableName)
				f.logger.Printf("[ERROR] FSM.Apply(PutItem): %s. ItemData: %v", errStr, itemData)
				return CommandResponse{Success: false, TableName: payload.TableName, Error: errStr}
			}
			itemKey = pkValueStr + "_" + skValueStr // kv_storeが期待するキー形式
		}
		if itemKey == "" || (meta.SortKeyName != "" && strings.HasSuffix(itemKey, "_")) || (meta.SortKeyName == "" && strings.Contains(itemKey, "_")) {
			// itemKey が空、またはSKありでSK部分が空、またはSKなしで"_"を含むなど、不正なキーをチェック
			errStr := fmt.Sprintf("generated itemKey '%s' is invalid for PK: '%s', SK: '%s' in table '%s'", itemKey, pkValueStr, skValueStr, payload.TableName)
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): %s", errStr)
			return CommandResponse{Success: false, TableName: payload.TableName, Error: errStr}
		}

		// KVStoreにアイテムを保存
		// タイムスタンプはRaftログのインデックスを使用 (LWWのため)
		timestamp := int64(logEntry.Index)
		if payload.Timestamp > 0 { // ペイロードにタイムスタンプがあればそちらを優先 (テスト用など)
			timestamp = payload.Timestamp
		}

		f.logger.Printf("[INFO] FSM.Apply(PutItem): Calling kvStore.PutItem for table '%s', key '%s', ts %d", payload.TableName, itemKey, timestamp)
		if err := f.kvStore.PutItem(payload.TableName, itemKey, payload.Item, timestamp); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(PutItem): kvStore.PutItem failed for table '%s', key '%s': %v", payload.TableName, itemKey, err)
			return CommandResponse{Success: false, TableName: payload.TableName, ItemKey: itemKey, Error: fmt.Sprintf("kvStore.PutItem failed: %v", err)}
		}

		f.logger.Printf("[INFO] FSM.Apply(PutItem): Successfully put item into table '%s', key '%s'", payload.TableName, itemKey)
		// 成功時は元々のペイロードのItemをDataとして返すか、あるいはItemKeyだけでも良い
		return CommandResponse{Success: true, TableName: payload.TableName, ItemKey: itemKey, Message: "Item put successfully"}

	case DeleteItemCommandType:
		var payload DeleteItemCommandPayload
		if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(DeleteItem): Failed to unmarshal payload: %v", err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal DeleteItem payload: %v", err)}
		}

		meta, tableExists := f.tables[payload.TableName]
		if !tableExists {
			f.logger.Printf("[ERROR] FSM.Apply(DeleteItem): Table '%s' not found.", payload.TableName)
			return CommandResponse{Success: false, TableName: payload.TableName, Error: fmt.Sprintf("table %s not found", payload.TableName)}
		}
		if payload.PartitionKey == "" {
			return CommandResponse{Success: false, TableName: payload.TableName, Error: "partition key cannot be empty for DeleteItem"}
		}

		itemKey := payload.PartitionKey
		if meta.SortKeyName != "" {
			if payload.SortKey == "" { // SKが定義されているテーブルでSKが指定されていない場合
				errStr := fmt.Sprintf("sort key must be provided for table '%s' which defines a sort key", payload.TableName)
				f.logger.Printf("[ERROR] FSM.Apply(DeleteItem): %s", errStr)
				return CommandResponse{Success: false, TableName: payload.TableName, Error: errStr}
			}
			itemKey += "_" + payload.SortKey
		} else if payload.SortKey != "" { // SKが定義されていないテーブルでSKが指定された場合
			errStr := fmt.Sprintf("sort key ('%s') provided for table '%s' which has no sort key defined", payload.SortKey, payload.TableName)
			f.logger.Printf("[ERROR] FSM.Apply(DeleteItem): %s", errStr)
			return CommandResponse{Success: false, TableName: payload.TableName, Error: errStr}
		}

		// KVStoreからアイテムを削除
		// タイムスタンプはRaftログのインデックスを使用 (LWWのため)
		timestamp := int64(logEntry.Index)
		if payload.Timestamp > 0 { // ペイロードにタイムスタンプがあればそちらを優先
			timestamp = payload.Timestamp
		}

		f.logger.Printf("[INFO] FSM.Apply(DeleteItem): Calling kvStore.DeleteItem for table '%s', key '%s', ts %d", payload.TableName, itemKey, timestamp)
		if err := f.kvStore.DeleteItem(payload.TableName, itemKey, timestamp); err != nil {
			// DeleteItemがエラーを返した場合は失敗として扱う
			// (KVStoreの実装ではアイテムが存在しない場合でもnilを返すため、この条件に入ることはないはず)
			f.logger.Printf("[ERROR] FSM.Apply(DeleteItem): kvStore.DeleteItem failed for table '%s', key '%s': %v", payload.TableName, itemKey, err)
			return CommandResponse{Success: false, TableName: payload.TableName, ItemKey: itemKey, Error: fmt.Sprintf("kvStore.DeleteItem failed: %v", err)}
		}

		f.logger.Printf("[INFO] FSM.Apply(DeleteItem): Successfully deleted item from table '%s', key '%s'", payload.TableName, itemKey)
		return CommandResponse{Success: true, TableName: payload.TableName, ItemKey: itemKey, Message: "Item deleted successfully"}

	case QueryItemsCommandType:
		var payload QueryItemsCommandPayload
		if err := json.Unmarshal(cmd.Payload, &payload); err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(QueryItems): Failed to unmarshal payload: %v", err)
			return CommandResponse{Success: false, Error: fmt.Sprintf("failed to unmarshal QueryItems payload: %v", err)}
		}
		if _, tableExists := f.tables[payload.TableName]; !tableExists {
			f.logger.Printf("[ERROR] FSM.Apply(QueryItems): Table '%s' not found.", payload.TableName)
			return CommandResponse{Success: false, TableName: payload.TableName, Error: fmt.Sprintf("table %s not found", payload.TableName)}
		}
		partitionKey := ""
		sortKeyPrefix := ""
		if payload.Filter != nil {
			if pk, ok := payload.Filter["partition_key"].(string); ok {
				partitionKey = pk
			}
			if sk, ok := payload.Filter["sort_key_prefix"].(string); ok {
				sortKeyPrefix = sk
			}
		}
		items, err := f.kvStore.QueryItems(payload.TableName, partitionKey, sortKeyPrefix)
		if err != nil {
			f.logger.Printf("[ERROR] FSM.Apply(QueryItems): kvStore.QueryItems failed for table '%s': %v", payload.TableName, err)
			return CommandResponse{Success: false, TableName: payload.TableName, Error: fmt.Sprintf("kvStore.QueryItems failed: %v", err)}
		}
		return CommandResponse{Success: true, TableName: payload.TableName, Data: items}

	default:
		f.logger.Printf("[ERROR] FSM.Apply: Unknown command type: %s", cmd.Type)
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
	metaCopy := meta
	return &metaCopy, true
}

// ListTables はFSMが認識しているテーブルの一覧を返します。
func (f *FSM) ListTables() []string {
	f.logger.Printf("[DEBUG] [FSM] [%s] ListTables: Called, f.tables has %d entries", f.localNodeID, len(f.tables))
	tableNames := make([]string, 0, len(f.tables))
	for name := range f.tables {
		tableNames = append(tableNames, name)
	}
	f.logger.Printf("[DEBUG] [FSM] [%s] ListTables: Returning %d tables: %v", f.localNodeID, len(tableNames), tableNames)
	return tableNames
}

// Snapshot は現在のFSMの状態のスナップショットを返します。
func (f *FSM) Snapshot() (raft.FSMSnapshot, error) {
	f.logger.Printf("[INFO] [FSM] [%s] Snapshot: Creating FSM snapshot with current table metadata (%d tables)", f.localNodeID, len(f.tables))
	tablesCopy := make(map[string]TableMetadata, len(f.tables))
	for k, v := range f.tables { // f.tables を直接渡すとレースコンディションの可能性があるためコピー
		tablesCopy[k] = v
	}
	return &fsmSnapshot{tables: tablesCopy, localNodeID: string(f.localNodeID)}, nil
}

// Restore はスナップショットからFSMの状態を復元します。
func (f *FSM) Restore(rc io.ReadCloser) error {
	f.logger.Printf("[INFO] [FSM] [%s] Restore: Restoring FSM from snapshot", f.localNodeID)
	defer func() {
		if err := rc.Close(); err != nil {
			f.logger.Printf("[ERROR] [FSM] [%s] Restore: Failed to close snapshot reader: %v", f.localNodeID, err)
		}
	}()

	var tablesSnapshot map[string]TableMetadata
	dec := json.NewDecoder(rc)
	if err := dec.Decode(&tablesSnapshot); err != nil {
		f.logger.Printf("[ERROR] [FSM] [%s] Restore: Failed to decode snapshot data: %v", f.localNodeID, err)
		return fmt.Errorf("failed to decode snapshot: %w", err)
	}
	f.tables = tablesSnapshot // 新しいマップで上書き
	f.logger.Printf("[INFO] [FSM] [%s] Restore: Successfully restored %d tables from snapshot. Ensuring KVStore directories.", f.localNodeID, len(f.tables))

	for tableName := range f.tables {
		f.logger.Printf("[DEBUG] [FSM] [%s] Restore: Ensuring directory for restored table '%s'", f.localNodeID, tableName)
		if err := f.kvStore.EnsureTableDir(tableName); err != nil {
			// リストア中にKVStoreのディレクトリ作成に失敗した場合、致命的エラーとするか警告に留めるか。
			// Raftログの再適用で最終的には整合性が取れる可能性もあるが、スナップショットからの復元としては不完全。
			// ここではエラーを返し、Raftにリストア失敗を通知する。
			f.logger.Printf("[ERROR] [FSM] [%s] Restore: Failed to ensure directory for restored table '%s' in KVStore: %v", f.localNodeID, tableName, err)
			return fmt.Errorf("failed to ensure kvstore directory for restored table %s: %w", tableName, err)
		}
	}
	f.logger.Printf("[INFO] [FSM] [%s] Restore: Completed successfully.", f.localNodeID)
	return nil
}

// fsmSnapshot は Raft のスナップショットインターフェースを実装します。
type fsmSnapshot struct {
	tables      map[string]TableMetadata
	localNodeID string
}

// Persist はスナップショットの内容を Raft のストレージに永続化します。
func (s *fsmSnapshot) Persist(sink raft.SnapshotSink) error {
	s.logf(log.Printf, "[INFO] fsmSnapshot.Persist started with %d tables. Sink ID: %s", len(s.tables), sink.ID())
	err := func() error {
		data, err := json.Marshal(s.tables)
		if err != nil {
			s.logf(log.Printf, "[ERROR] fsmSnapshot.Persist failed to marshal tables: %v", err)
			return fmt.Errorf("failed to marshal tables for snapshot: %w", err)
		}
		n, err := sink.Write(data)
		if err != nil {
			s.logf(log.Printf, "[ERROR] fsmSnapshot.Persist failed to write to sink: %v (wrote %d bytes)", err, n)
			return fmt.Errorf("failed to write snapshot to sink: %w", err)
		}
		s.logf(log.Printf, "[DEBUG] fsmSnapshot.Persist successfully wrote %d bytes to sink", n)
		return nil
	}()

	if err != nil {
		s.logf(log.Printf, "[ERROR] fsmSnapshot.Persist error, cancelling sink: %v", err)
		if cancelErr := sink.Cancel(); cancelErr != nil {
			s.logf(log.Printf, "[ERROR] fsmSnapshot.Persist failed to cancel sink: %v", cancelErr)
		}
		return err
	}

	if err := sink.Close(); err != nil {
		s.logf(log.Printf, "[ERROR] fsmSnapshot.Persist failed to close sink: %v", err)
		return fmt.Errorf("failed to close snapshot sink: %w", err)
	}
	s.logf(log.Printf, "[INFO] fsmSnapshot.Persist completed successfully for sink ID: %s", sink.ID())
	return nil
}

// Release はスナップショットが不要になったときに呼び出されます。
func (s *fsmSnapshot) Release() {
	s.logf(log.Printf, "[INFO] fsmSnapshot.Release called")
}

func (s *fsmSnapshot) logf(loggerFunc func(format string, v ...interface{}), format string, v ...interface{}) {
	prefix := fmt.Sprintf("[FSM Snapshot][%s] ", s.localNodeID)
	loggerFunc(prefix+format, v...)
}
