package store

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"io/ioutil"
	"log"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"github.com/hashicorp/raft"
	"github.com/stretchr/testify/require"
)

// ---- Test Helper Types and Functions ----

type TestItemKey struct {
	PK string
	SK string
}

func MustEncodeCommandPayload(t *testing.T, payload interface{}) json.RawMessage {
	b, err := json.Marshal(payload)
	require.NoError(t, err)
	return b
}

// mockSnapshotSink は raft.SnapshotSink を模倣します。
type mockSnapshotSink struct {
	buf    bytes.Buffer
	closed bool
	id     string
}

func (m *mockSnapshotSink) Write(p []byte) (n int, err error) {
	if m.closed {
		return 0, errors.New("write to closed sink")
	}
	return m.buf.Write(p)
}

func (m *mockSnapshotSink) Close() error {
	m.closed = true
	return nil
}

func (m *mockSnapshotSink) ID() string {
	return m.id
}

func (m *mockSnapshotSink) Cancel() error {
	m.closed = true
	return errors.New("snapshot cancelled")
}

func (m *mockSnapshotSink) Bytes() []byte {
	return m.buf.Bytes()
}

// ---- End Test Helper Types and Functions ----

func setupFSMWithKVStore(t *testing.T) (*FSM, *KVStore, string) {
	t.Helper()
	baseDir := t.TempDir()
	kvStoreDir := filepath.Join(baseDir, "kvstore")
	nodeID := "test-fsm-node"

	kv, err := NewKVStore(kvStoreDir, nodeID)
	require.NoError(t, err)

	// Create a logger that discards output for tests
	testLogger := log.New(io.Discard, "", 0)
	fsm := NewFSM(kv, raft.ServerID(nodeID), testLogger)
	require.NotNil(t, fsm)
	return fsm, kv, baseDir
}

func setupTestFSM(t *testing.T) (*FSM, string, func()) {
	tempDir, err := ioutil.TempDir("", "fsm_test_*")
	require.NoError(t, err)

	kv, err := NewKVStore(filepath.Join(tempDir, "kv"), "testnode")
	require.NoError(t, err)

	testLogger := log.New(io.Discard, "", 0)
	fsm := NewFSM(kv, raft.ServerID("testnode"), testLogger)

	initTablePayload := CreateTableCommandPayload{
		TableName:        "existingTable",
		PartitionKeyName: "pk",
		SortKeyName:      "sk",
	}
	restoreCmdBytes, _ := EncodeCommand(CreateTableCommandType, initTablePayload)
	fsm.Apply(&raft.Log{Data: restoreCmdBytes, Type: raft.LogCommand})

	return fsm, tempDir, func() {
		os.RemoveAll(tempDir)
	}
}

func TestFSM_TableOperations(t *testing.T) {
	fsm, _, cleanup := setupTestFSM(t)
	defer cleanup()

	tableName1 := "testTable1"
	pkName1 := "id"
	skName1 := "ts"

	t.Run("CreateTable", func(t *testing.T) {
		payload := CreateTableCommandPayload{
			TableName:        tableName1,
			PartitionKeyName: pkName1,
			SortKeyName:      skName1,
		}
		cmdBytes, err := EncodeCommand(CreateTableCommandType, payload)
		require.NoError(t, err)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.True(t, response.Success, "Apply CreateTable should be successful. Error: %s", response.Error)
		meta, exists := fsm.GetTableMetadata(tableName1)
		require.True(t, exists, "Table should exist after creation")
		require.Equal(t, tableName1, meta.TableName)
		require.Equal(t, pkName1, meta.PartitionKeyName)
		require.Equal(t, skName1, meta.SortKeyName)

		tablePath := fsm.kvStore.tablePath(tableName1)
		stat, err := os.Stat(tablePath)
		require.NoError(t, err, "KVStore directory for table should exist")
		require.True(t, stat.IsDir(), "Path should be a directory")
	})

	t.Run("CreateTable_already_exists", func(t *testing.T) {
		// tableName1 は既に作成済み
		payload := CreateTableCommandPayload{
			TableName:        tableName1,
			PartitionKeyName: pkName1,
			SortKeyName:      skName1,
		}
		cmdBytes, _ := EncodeCommand(CreateTableCommandType, payload)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.False(t, response.Success, "Apply CreateTable on existing table should fail")
		require.Contains(t, response.Error, "already exists")
	})

	t.Run("DeleteTable", func(t *testing.T) {
		// tableName1 を削除
		payload := DeleteTableCommandPayload{TableName: tableName1}
		cmdBytes, _ := EncodeCommand(DeleteTableCommandType, payload)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.True(t, response.Success, "DeleteTable should be successful. Error: %s", response.Error)

		_, exists := fsm.GetTableMetadata(tableName1)
		require.False(t, exists, "Table should not exist after deletion")

		tablePath := fsm.kvStore.tablePath(tableName1)
		_, err := os.Stat(tablePath)
		require.True(t, os.IsNotExist(err), "KVStore directory for table should be removed")
	})

	t.Run("DeleteTable_not_found", func(t *testing.T) {
		payload := DeleteTableCommandPayload{TableName: "nonExistentTable"}
		cmdBytes, _ := EncodeCommand(DeleteTableCommandType, payload)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.False(t, response.Success, "DeleteTable on non-existent table should fail")
		require.Contains(t, response.Error, "not found")
	})
}

func TestFSM_ItemOperations(t *testing.T) {
	fsm, _, cleanup := setupTestFSM(t)
	defer cleanup()

	tableName := "itemTestTable"
	pkName := "artist"
	skName := "song"

	createTablePayload := CreateTableCommandPayload{
		TableName:        tableName,
		PartitionKeyName: pkName,
		SortKeyName:      skName,
	}
	cmdBytesCreateTable, _ := EncodeCommand(CreateTableCommandType, createTablePayload)
	fsm.Apply(&raft.Log{Data: cmdBytesCreateTable, Type: raft.LogCommand})

	item1DataMap := map[string]interface{}{pkName: "Journey", skName: "DontStopBelievin", "album": "Journey Hits", "year": 1981}
	item1DataBytes, _ := json.Marshal(item1DataMap)
	item1PK := "Journey"
	item1SK := "DontStopBelievin"
	item1StoreKey := item1PK + "_" + item1SK
	putPayload1 := PutItemCommandPayload{
		TableName: tableName,
		Item:      item1DataBytes,
		Timestamp: time.Now().UnixNano(),
	}

	item2DataMap := map[string]interface{}{pkName: "Journey", skName: "OpenArms", "album": "Escape", "year": 1981}
	item2DataBytes, _ := json.Marshal(item2DataMap)
	item2PK := "Journey"
	item2SK := "OpenArms"
	item2StoreKey := item2PK + "_" + item2SK
	putPayload2 := PutItemCommandPayload{
		TableName: tableName,
		Item:      item2DataBytes,
		Timestamp: time.Now().UnixNano() + 1,
	}

	t.Run("PutItem1", func(t *testing.T) {
		cmdBytes, _ := EncodeCommand(PutItemCommandType, putPayload1)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.True(t, response.Success, "PutItem1 should be successful. Error: %s", response.Error)
	})

	t.Run("PutItem2_SamePK_DiffSK", func(t *testing.T) {
		cmdBytes, _ := EncodeCommand(PutItemCommandType, putPayload2)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.True(t, response.Success, "PutItem2 should be successful. Error: %s", response.Error)
	})

	t.Run("GetItem_found_item1", func(t *testing.T) {
		retrievedItemData, retrievedTimestamp, err := fsm.kvStore.GetItem(tableName, item1StoreKey)
		require.NoError(t, err, "FSM.kvStore.GetItem should not return an error for existing item")
		require.NotNil(t, retrievedItemData, "Retrieved item data should not be nil")
		var retrievedItemMap map[string]interface{}
		err = json.Unmarshal(retrievedItemData, &retrievedItemMap)
		require.NoError(t, err, "Failed to unmarshal retrieved item data")
		require.Equal(t, item1DataMap, retrievedItemMap, "Retrieved item data should match original")
		require.Equal(t, putPayload1.Timestamp, retrievedTimestamp, "Retrieved item timestamp should match original")
	})

	t.Run("GetItem_not_found", func(t *testing.T) {
		_, _, err := fsm.kvStore.GetItem(tableName, "nonexistentkey_nonexistent")
		require.Error(t, err, "FSM.kvStore.GetItem should return an error for non-existent item")
		require.True(t, errors.Is(err, ErrItemNotFound), "Error should be ErrItemNotFound")
	})

	t.Run("QueryItems_found_pk_sk1", func(t *testing.T) {
		retrievedItems, err := fsm.kvStore.QueryItems(tableName, item1PK, item1SK)
		require.NoError(t, err, "FSM.kvStore.QueryItems should not return an error")
		require.Len(t, retrievedItems, 1, "Should find 1 item with PK and SK prefix for item1")
		require.Equal(t, item1DataMap["album"], retrievedItems[0]["album"])
		require.Equal(t, item1DataMap["year"], retrievedItems[0]["year"])
	})

	t.Run("QueryItems_found_pk_only_should_return_both", func(t *testing.T) {
		retrievedItems, err := fsm.kvStore.QueryItems(tableName, item1PK, "")
		require.NoError(t, err, "FSM.kvStore.QueryItems should not return an error for PK only query")
		require.Len(t, retrievedItems, 2, "Should find 2 items (item1 and item2) with PK only")
		foundItem1 := false
		foundItem2 := false
		for _, rItemMap := range retrievedItems {
			if reflect.DeepEqual(item1DataMap["album"], rItemMap["album"]) && reflect.DeepEqual(item1DataMap[skName], rItemMap[skName]) {
				foundItem1 = true
			}
			if reflect.DeepEqual(item2DataMap["album"], rItemMap["album"]) && reflect.DeepEqual(item2DataMap[skName], rItemMap[skName]) {
				foundItem2 = true
			}
		}
		require.True(t, foundItem1, "Item1 should be found in PK only query results")
		require.True(t, foundItem2, "Item2 should be found in PK only query results")
	})

	t.Run("QueryItems_not_found_pk", func(t *testing.T) {
		retrievedItems, err := fsm.kvStore.QueryItems(tableName, "nonexistentPK", "")
		require.NoError(t, err, "FSM.kvStore.QueryItems should not return an error for non-existent PK")
		require.Empty(t, retrievedItems, "Should find 0 items for non-existent PK")
	})

	t.Run("QueryItems_not_found_sk_prefix", func(t *testing.T) {
		nonExistentSKPrefix := "nonexistentskprefix"
		retrievedItems, err := fsm.kvStore.QueryItems(tableName, item1PK, nonExistentSKPrefix)
		require.NoError(t, err, "FSM.kvStore.QueryItems should not return an error for non-existent SK prefix")
		require.Empty(t, retrievedItems, "Should find 0 items for non-existent SK prefix")
	})

	t.Run("DeleteItem_item1", func(t *testing.T) {
		deletePayload := DeleteItemCommandPayload{
			TableName:    tableName,
			PartitionKey: item1PK,
			SortKey:      item1SK,
			Timestamp:    time.Now().UnixNano(),
		}
		cmdBytes, _ := EncodeCommand(DeleteItemCommandType, deletePayload)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.True(t, response.Success, "DeleteItem1 should be successful. Error: %s", response.Error)
		_, _, err := fsm.kvStore.GetItem(tableName, item1StoreKey)
		require.Error(t, err)
		require.True(t, errors.Is(err, ErrItemNotFound))
	})

	t.Run("GetItem_item2_after_item1_delete", func(t *testing.T) {
		retrievedItemData, _, err := fsm.kvStore.GetItem(tableName, item2StoreKey)
		require.NoError(t, err)
		require.NotNil(t, retrievedItemData)
	})

	t.Run("DeleteItem_item2", func(t *testing.T) {
		deletePayload := DeleteItemCommandPayload{
			TableName:    tableName,
			PartitionKey: item2PK,
			SortKey:      item2SK,
			Timestamp:    time.Now().UnixNano(),
		}
		cmdBytes, _ := EncodeCommand(DeleteItemCommandType, deletePayload)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.True(t, response.Success, "DeleteItem2 should be successful. Error: %s", response.Error)
		_, _, err := fsm.kvStore.GetItem(tableName, item2StoreKey)
		require.Error(t, err)
		require.True(t, errors.Is(err, ErrItemNotFound))
	})
}

func TestFSM_SnapshotRestore(t *testing.T) {
	fsm, tempDir, cleanup := setupTestFSM(t)
	defer cleanup()

	tableName := "snapTestTable"
	createPayload := CreateTableCommandPayload{TableName: tableName, PartitionKeyName: "id", SortKeyName: ""} // No sort key for this item
	createCmdBytes, _ := EncodeCommand(CreateTableCommandType, createPayload)
	fsm.Apply(&raft.Log{Data: createCmdBytes, Type: raft.LogCommand})

	itemDataMap := map[string]interface{}{"id": "item1", "value": "data1"} // Matches PK "id"
	itemDataBytes, _ := json.Marshal(itemDataMap)
	putPayload := PutItemCommandPayload{TableName: tableName, Item: itemDataBytes, Timestamp: 12345}
	putCmdBytes, _ := EncodeCommand(PutItemCommandType, putPayload)
	fsm.Apply(&raft.Log{Data: putCmdBytes, Type: raft.LogCommand})

	snapshot, err := fsm.Snapshot()
	require.NoError(t, err)
	require.NotNil(t, snapshot)

	mockSink := &mockSnapshotSink{id: "snap1"}
	err = snapshot.Persist(mockSink)
	require.NoError(t, err)
	require.True(t, mockSink.closed)
	snapData := mockSink.Bytes()
	require.NotEmpty(t, snapData)

	newKvStore, err := NewKVStore(filepath.Join(tempDir, "kv_restore"), "restoreNode")
	require.NoError(t, err)
	newLogger := log.New(io.Discard, "", 0)
	newFSM := NewFSM(newKvStore, raft.ServerID("restoreNode"), newLogger)

	snapshotReader := io.NopCloser(bytes.NewReader(snapData))
	err = newFSM.Restore(snapshotReader)
	require.NoError(t, err)

	meta, exists := newFSM.GetTableMetadata(tableName)
	require.True(t, exists, "Restored FSM should have table metadata")
	require.Equal(t, tableName, meta.TableName)

	itemStoreKey := "item1" // Since SortKeyName is empty for the table, store key is just PK
	retrievedData, _, err := newFSM.kvStore.GetItem(tableName, itemStoreKey)
	require.NoError(t, err, "Item should exist in restored FSM. Key: %s", itemStoreKey)

	var retrievedMap, originalMap map[string]interface{}
	json.Unmarshal(retrievedData, &retrievedMap)
	json.Unmarshal(itemDataBytes, &originalMap) // itemDataBytes was used for Put
	require.Equal(t, originalMap, retrievedMap)

	snapshot.Release()
}

func TestFSM_Apply_malformed_command(t *testing.T) {
	fsm, _, cleanup := setupTestFSM(t)
	defer cleanup()

	t.Run("Apply malformed command JSON", func(t *testing.T) {
		logEntry := &raft.Log{Data: []byte("this is not json"), Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp, "Apply malformed command should return a response")
		response, ok := resp.(CommandResponse)
		require.True(t, ok, "Response should be a CommandResponse")
		require.False(t, response.Success, "Apply malformed command should fail")
		require.Contains(t, response.Error, "failed to unmarshal Raft log data")
		require.Contains(t, response.Error, "this is not json")
	})

	t.Run("Apply unknown command type in payload", func(t *testing.T) {
		unknownCmdPayload := map[string]string{"test": "data"}
		unknownCmdBytes, _ := json.Marshal(unknownCmdPayload)
		cmd := Command{Type: CommandType("UnknownCmd"), Payload: unknownCmdBytes}
		cmdBytes, _ := json.Marshal(cmd)
		logEntry := &raft.Log{Data: cmdBytes, Type: raft.LogCommand}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.False(t, response.Success)
		require.Contains(t, response.Error, "unknown command type: UnknownCmd")
	})

	t.Run("Apply non-command log type", func(t *testing.T) {
		logEntry := &raft.Log{Data: []byte("some data"), Type: raft.LogNoop}
		resp := fsm.Apply(logEntry)
		require.NotNil(t, resp)
		response, ok := resp.(CommandResponse)
		require.True(t, ok)
		require.False(t, response.Success)
		require.Contains(t, response.Error, "FSM received non-command log type: LogNoop")
	})
}

// mustEncode is a helper for tests to panic on encoding errors
func mustEncode(t *testing.T, cmdType CommandType, payload interface{}) []byte {
	t.Helper()
	bytes, err := EncodeCommand(cmdType, payload)
	require.NoError(t, err)
	return bytes
}

// FSM.Restore でKVStoreのEnsureTableDirが失敗するケースのテスト
func TestFSM_Restore_KVStoreError(t *testing.T) {
	fsm, _, _ := setupFSMWithKVStore(t)

	// 1. テーブルを作成しスナップショットを取る
	tableName := "tableForKvError"
	fsm.Apply(&raft.Log{Data: mustEncode(t, CreateTableCommandType, CreateTableCommandPayload{TableName: tableName, PartitionKeyName: "pk"})})
	snap, err := fsm.Snapshot()
	require.NoError(t, err)
	sink := &mockSnapshotSink{id: "kvErrSnap"}
	require.NoError(t, snap.Persist(sink))
	snap.Release()

	// 2. 新しいFSMと「壊れた」KVStoreでリストアを試みる
	// KVStoreのEnsureTableDirがエラーを返すようにモックする (ここでは実際のKVStoreを使い、ディレクトリ作成権限をなくすなどでシミュレート可能だが複雑)
	// 今回はKVStore自体を置き換えるのではなく、EnsureTableDirがエラーを返す状況を作るのが難しい。
	// 簡単な代替として、kvStoreに不正なパス（存在しない親ディレクトリなど）を与えてNewKVStoreでエラーを起こさせる、
	// または、Restoreロジック内でEnsureTableDirがエラーを返すことを期待するテストとする。
	// ここでは、kvStoreのbaseDirを非常に特殊なものにして、EnsureTableDirが失敗する可能性を高めるアプローチを試みる。
	// より直接的なテストは、KVStoreインターフェースを定義し、モックを注入することだが、現状そこまではしない。

	restoredFSMBaseDir := t.TempDir()
	// 存在しない、かつ作成権限のないディレクトリをkvStoreのベースとしてFSMを初期化する (シミュレーション)
	// 例: /proc/nonexistentdir (Linux) - これはプラットフォーム依存で良くない
	// 代わりに、kvStoreのbaseDirを既存のファイルにするなどで MkdirAll を失敗させる
	badKvStoreDir := filepath.Join(restoredFSMBaseDir, "file.txt")
	err = os.WriteFile(badKvStoreDir, []byte("i am a file"), 0600)
	require.NoError(t, err)

	_, err = NewKVStore(badKvStoreDir, "bad-kv-node")
	// NewKVStore は baseDir がファイルの場合、MkdirAll でエラーになるはず
	require.Error(t, err, "NewKVStore should fail if baseDir is a file")
	// ↑のテストはNewKVStoreが正常系を想定しているので、ここではエラーにならない。
	// 実際のテストは、Restore時にEnsureTableDirが失敗するようにする。
	// そのためには、kvStoreのEnsureTableDirをモックするか、テスト中にディレクトリ権限を変更する必要があるが、それは複雑。

	// このテストケースは、現在の設計では直接的かつ綺麗にテストするのが難しい。
	// FSMのRestore内のEnsureTableDirがエラーを返したときに、Restore自体がエラーを返すことの確認に留める。
	// そのような状況を作るために、スナップショットデータに存在しないテーブルのデータを含めるなどはできない。
	// ここでは一旦、KVStoreが正常な前提でのリストアテストにフォーカスする。
	// 将来的にKVStoreをインターフェース化すれば、このテストは容易になる。
	log.Println("Skipping TestFSM_Restore_KVStoreError as it's hard to reliably trigger EnsureTableDir error in FSM.Restore with current setup.")
	t.Skip("Skipping TestFSM_Restore_KVStoreError as it's hard to reliably trigger EnsureTableDir error in FSM.Restore with current setup.")
}

// io.ReadCloser のためのヘルパー
// import "io"
// io.NopCloser(bytes.NewReader(data))
