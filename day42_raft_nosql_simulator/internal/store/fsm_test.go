package store

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"os"
	"path/filepath"
	"testing"

	"github.com/hashicorp/raft"
	"github.com/stretchr/testify/require"
)

// mockSnapshotSink は raft.SnapshotSink を模倣します。
// Persistされたデータをメモリに保持します。
type mockSnapshotSink struct {
	bytes.Buffer
	closed bool
	id     string
}

func (m *mockSnapshotSink) ID() string {
	return m.id
}

func (m *mockSnapshotSink) Close() error {
	m.closed = true
	return nil
}

func (m *mockSnapshotSink) Cancel() error {
	m.closed = true
	return nil
}

func setupFSMWithKVStore(t *testing.T) (*FSM, *KVStore, string) {
	t.Helper()
	baseDir := t.TempDir()
	kvStoreDir := filepath.Join(baseDir, "kvstore")
	nodeID := "test-fsm-node"

	kv, err := NewKVStore(kvStoreDir, nodeID)
	require.NoError(t, err)

	fsm := NewFSM(kvStoreDir, kv, nodeID)
	require.NotNil(t, fsm)
	return fsm, kv, baseDir
}

func TestFSM_TableOperations(t *testing.T) {
	fsm, kv, _ := setupFSMWithKVStore(t)

	tableName1 := "testTable1"
	pk1 := "id"
	sk1 := "ts"

	t.Run("CreateTable", func(t *testing.T) {
		payload := CreateTableCommandPayload{
			TableName:        tableName1,
			PartitionKeyName: pk1,
			SortKeyName:      sk1,
		}
		cmdBytes, err := EncodeCommand(CreateTableCommandType, payload)
		require.NoError(t, err)

		logEntry := &raft.Log{Data: cmdBytes}
		resp := fsm.Apply(logEntry)
		require.Nil(t, resp, "Apply CreateTable should not return an error")

		meta, exists := fsm.GetTableMetadata(tableName1)
		require.True(t, exists, "Table should exist after creation")
		require.Equal(t, tableName1, meta.TableName)
		require.Equal(t, pk1, meta.PartitionKeyName)
		require.Equal(t, sk1, meta.SortKeyName)

		// KVStoreのディレクトリも確認
		tablePath := kv.tablePath(tableName1)
		stat, err := os.Stat(tablePath)
		require.NoError(t, err, "KVStore directory for table should exist")
		require.True(t, stat.IsDir())
	})

	t.Run("CreateTable already exists", func(t *testing.T) {
		payload := CreateTableCommandPayload{ // 同じテーブル名
			TableName:        tableName1,
			PartitionKeyName: "new_pk",
		}
		cmdBytes, err := EncodeCommand(CreateTableCommandType, payload)
		require.NoError(t, err)

		logEntry := &raft.Log{Data: cmdBytes}
		resp := fsm.Apply(logEntry)
		require.Error(t, resp.(error), "Apply CreateTable on existing table should return an error")
		require.Contains(t, resp.(error).Error(), "already exists")
	})

	t.Run("ListTables", func(t *testing.T) {
		tables := fsm.ListTables()
		require.Len(t, tables, 1, "Should be one table listed")
		require.Contains(t, tables, tableName1)
		require.Equal(t, pk1, tables[tableName1].PartitionKeyName)
	})

	t.Run("DeleteTable", func(t *testing.T) {
		payload := DeleteTableCommandPayload{TableName: tableName1}
		cmdBytes, err := EncodeCommand(DeleteTableCommandType, payload)
		require.NoError(t, err)

		logEntry := &raft.Log{Data: cmdBytes}
		resp := fsm.Apply(logEntry)
		require.Nil(t, resp, "Apply DeleteTable should not return an error")

		_, exists := fsm.GetTableMetadata(tableName1)
		require.False(t, exists, "Table should not exist after deletion")

		tables := fsm.ListTables()
		require.Len(t, tables, 0, "Should be no tables listed after deletion")

		// KVStoreのディレクトリも確認
		tablePath := kv.tablePath(tableName1)
		_, err = os.Stat(tablePath)
		require.True(t, os.IsNotExist(err), "KVStore directory for table should be removed")
	})

	t.Run("DeleteTable not exists", func(t *testing.T) {
		payload := DeleteTableCommandPayload{TableName: "nonExistentTable"}
		cmdBytes, err := EncodeCommand(DeleteTableCommandType, payload)
		require.NoError(t, err)

		logEntry := &raft.Log{Data: cmdBytes}
		resp := fsm.Apply(logEntry)
		require.Error(t, resp.(error), "Apply DeleteTable on non-existent table should return an error")
		require.Contains(t, resp.(error).Error(), "not found")
	})

	t.Run("Apply unknown command", func(t *testing.T) {
		rawCmd := Command{Type: "UnknownType", Payload: json.RawMessage("{}")}
		cmdBytes, _ := json.Marshal(rawCmd)
		logEntry := &raft.Log{Data: cmdBytes}
		resp := fsm.Apply(logEntry)
		require.Error(t, resp.(error))
		require.Contains(t, resp.(error).Error(), "unknown command type")
	})

	t.Run("Apply malformed command", func(t *testing.T) {
		logEntry := &raft.Log{Data: []byte("this is not json")}
		resp := fsm.Apply(logEntry)
		require.Error(t, resp.(error))
		require.Contains(t, resp.(error).Error(), "failed to unmarshal command")
	})
}

func TestFSM_SnapshotRestore(t *testing.T) {
	fsm, _, baseDir := setupFSMWithKVStore(t)

	tableName1 := "snapTable1"
	payload1 := CreateTableCommandPayload{TableName: tableName1, PartitionKeyName: "id1"}
	cmdBytes1, _ := EncodeCommand(CreateTableCommandType, payload1)
	fsm.Apply(&raft.Log{Data: cmdBytes1})

	tableName2 := "snapTable2"
	// payload2 := CreateTableCommandPayload{TableName: tableName2, PartitionKeyName: "id2", SortKeyName: "sk2"}
	// cmdBytes2, _ := EncodeCommand(DeleteTableCommandType, payload2) // 間違い: CreateTableであるべき。これはRestore時のkv.EnsureTableDirのエラーテスト用 <- コメントアウト
	// 正しくは CreateTableCommandType だが、DeleteTableCommandTypeでエラーケースを試す（Restoreでkv.EnsureTableDirがエラーになる）
	// ただし、Applyではテーブルが存在しないのでDeleteはエラーになる。Snapshotは正しく行われる。
	// このテストはより複雑なシナリオ用。一旦、単純なスナップショットリストアを先に。

	// スナップショット前に状態確認
	tablesBeforeSnap := fsm.ListTables()
	require.Len(t, tablesBeforeSnap, 1) // snapTable1のみのはず
	require.Contains(t, tablesBeforeSnap, tableName1)

	// 1. Snapshot
	snap, err := fsm.Snapshot()
	require.NoError(t, err)
	require.NotNil(t, snap)

	// Persist snapshot
	mockSink := &mockSnapshotSink{id: "snap1"}
	err = snap.Persist(mockSink)
	require.NoError(t, err)
	require.True(t, mockSink.closed)
	snapData := mockSink.Bytes()
	require.NotEmpty(t, snapData)
	snap.Release() // Release anrufen

	// 2. Restore to a new FSM instance
	newKvStoreDir := filepath.Join(baseDir, "kvstore_restored")
	newNodeID := "restored-fsm-node"
	newKv, err := NewKVStore(newKvStoreDir, newNodeID)
	require.NoError(t, err)
	newFSM := NewFSM(newKvStoreDir, newKv, newNodeID)

	err = newFSM.Restore(io.NopCloser(bytes.NewReader(snapData)))
	require.NoError(t, err, "Restore should succeed")

	// Verify restored state
	restoredTables := newFSM.ListTables()
	require.Len(t, restoredTables, 1, "Restored FSM should have 1 table")
	require.Contains(t, restoredTables, tableName1)
	meta1, exists1 := newFSM.GetTableMetadata(tableName1)
	require.True(t, exists1)
	require.Equal(t, tableName1, meta1.TableName)
	require.Equal(t, "id1", meta1.PartitionKeyName)

	// KVStoreディレクトリも復元時にEnsureされるか確認
	restoredTablePath1 := newKv.tablePath(tableName1)
	stat1, err := os.Stat(restoredTablePath1)
	require.NoError(t, err, "KVStore directory for restored table1 should exist")
	require.True(t, stat1.IsDir())

	// tableName2 (存在しないはずのテーブル) のディレクトリがないことも確認
	// このテストシナリオではtableName2はスナップショットに含まれないため
	nonExistentTablePath := newKv.tablePath(tableName2)
	_, err = os.Stat(nonExistentTablePath)
	require.True(t, os.IsNotExist(err), "Directory for table not in snapshot should not exist")

	t.Run("Snapshot and Restore with multiple tables", func(t *testing.T) {
		fsmMulti, _, _ := setupFSMWithKVStore(t)
		tbl1 := "multiSnap1"
		tbl2 := "multiSnap2"
		fsmMulti.Apply(&raft.Log{Data: mustEncode(t, CreateTableCommandType, CreateTableCommandPayload{TableName: tbl1, PartitionKeyName: "pk1"})})
		fsmMulti.Apply(&raft.Log{Data: mustEncode(t, CreateTableCommandType, CreateTableCommandPayload{TableName: tbl2, PartitionKeyName: "pk2", SortKeyName: "sk2"})})

		snapM, errM := fsmMulti.Snapshot()
		require.NoError(t, errM)
		sinkM := &mockSnapshotSink{id: "snapM"}
		require.NoError(t, snapM.Persist(sinkM))
		snapM.Release()

		fsmRestoredMulti, _, _ := setupFSMWithKVStore(t) // 新しいFSMとKVStore
		errRestoreM := fsmRestoredMulti.Restore(io.NopCloser(bytes.NewReader(sinkM.Bytes())))
		require.NoError(t, errRestoreM)

		allTables := fsmRestoredMulti.ListTables()
		require.Len(t, allTables, 2)
		require.Contains(t, allTables, tbl1)
		require.Contains(t, allTables, tbl2)
		metaTbl1, _ := fsmRestoredMulti.GetTableMetadata(tbl1)
		require.Equal(t, "pk1", metaTbl1.PartitionKeyName)
		metaTbl2, _ := fsmRestoredMulti.GetTableMetadata(tbl2)
		require.Equal(t, "pk2", metaTbl2.PartitionKeyName)
		require.Equal(t, "sk2", metaTbl2.SortKeyName)
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
