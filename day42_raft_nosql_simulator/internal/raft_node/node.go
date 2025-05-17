package raft_node

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/hashicorp/raft"
	raftboltdb "github.com/hashicorp/raft-boltdb"
	"github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/store"
)

// Config はRaftノードの設定です。
// この構造体は、各Raftノードを初期化するために必要なすべてのパラメータを保持します。
// NodeID: クラスタ内で各ノードを一意に識別するためのID。
// Addr: Raftノードがリッスンするネットワークアドレス (例: "127.0.0.1:7000")。
// DataDir: Raftログ、スナップショット、BoltDBファイルなどを保存するディレクトリ。
// IsLeader: このノードが初期状態でリーダーとして起動するかどうか（通常はfalseで、リーダー選出に任せる）。
// BootstrapCluster: 新しいクラスタをブートストラップするかどうか。最初のノードのみtrueに設定。
type Config struct {
	NodeID           raft.ServerID
	Addr             raft.ServerAddress // Raft通信用のアドレス
	DataDir          string
	BootstrapCluster bool
}

// Node はRaftクラスタの単一ノードを表します。
// この構造体は、Raftインスタンス、FSM（Finite State Machine）、
// およびノードの動作に必要なその他のコンポーネントをカプセル化します。
// raft: hashicorp/raftライブラリによって提供される実際のRaftコンセンサスアルゴリズムの実装。
// fsm: Raftログエントリを適用し、状態を管理するステートマシン。
// config: このノードの起動設定。
// transport: Raftノード間の通信を処理するトランスポート層。
// stableStore: Raftの安定したストレージ（例：キー/バリュー設定）。raft-boltdbがこれを提供する。
// logStore: Raftログエントリを保存するストレージ。raft-boltdbがこれを提供する。
// snapshotStore: Raftスナップショットを保存するストレージ。raft.NewFileSnapshotStoreが使用されることが多い。
type Node struct {
	raft          *raft.Raft
	fsm           *store.FSM
	kvStore       *store.KVStore // KVStoreへの参照を追加
	config        Config
	transport     raft.Transport        // Raftノード間通信用のトランスポート
	boltStore     *raftboltdb.BoltStore // LogStoreとStableStoreを兼ねるBoltDBストア
	snapshotStore raft.SnapshotStore
}

// GetConfig はノードの設定を返します。
func (n *Node) GetConfig() Config {
	return n.config
}

// GetFSM はノードのFSMを返します。
func (n *Node) GetFSM() *store.FSM {
	return n.fsm
}

// Transport はノードのトランスポートを返します。
func (n *Node) Transport() raft.Transport {
	return n.transport
}

// NodeID はノードのIDを返します。
func (n *Node) NodeID() raft.ServerID {
	return n.config.NodeID
}

// Addr はノードのアドレスを返します。
func (n *Node) Addr() raft.ServerAddress {
	return n.config.Addr
}

// NewNode は新しいRaftノードインスタンスを作成し、初期化します。
// 初期化には、Raftの設定、FSMの準備、トランスポート層のセットアップ、
// ログストア、安定ストア、スナップショットストアの準備が含まれます。
// 成功すると初期化されたNodeへのポインタを返します。エラーが発生した場合はエラーを返します。
func NewNode(cfg Config, transport raft.Transport) (*Node, error) { // fsm引数を削除
	kvStoreBasePath := filepath.Join(cfg.DataDir, "kvstore")
	kv, err := store.NewKVStore(kvStoreBasePath, string(cfg.NodeID))
	if err != nil {
		return nil, fmt.Errorf("failed to create KVStore: %w", err)
	}

	fsm := store.NewFSM(kvStoreBasePath, kv, string(cfg.NodeID)) // KVStoreをFSMに渡す

	n := &Node{
		fsm:       fsm,
		kvStore:   kv, // NodeにもKVStoreを保持
		config:    cfg,
		transport: transport,
	}

	raftCfg := raft.DefaultConfig()
	raftCfg.LocalID = cfg.NodeID
	raftCfg.HeartbeatTimeout = 1000 * time.Millisecond
	raftCfg.ElectionTimeout = 1000 * time.Millisecond
	raftCfg.CommitTimeout = 50 * time.Millisecond
	// raftCfg.Logger = hclog.New(&hclog.LoggerOptions{Name: string(cfg.NodeID), Level: hclog.Debug})

	if err := os.MkdirAll(cfg.DataDir, 0700); err != nil {
		return nil, fmt.Errorf("failed to create data directory %s: %w", cfg.DataDir, err)
	}

	boltDBPath := filepath.Join(cfg.DataDir, "raft.db")
	boltStore, err := raftboltdb.NewBoltStore(boltDBPath)
	if err != nil {
		return nil, fmt.Errorf("failed to create bolt store at %s: %w", boltDBPath, err)
	}
	n.boltStore = boltStore // boltStoreをNodeに保存

	snapshotStore, err := raft.NewFileSnapshotStore(cfg.DataDir, 2, os.Stderr)
	if err != nil {
		n.boltStore.Close() // エラーが発生したら、作成済みのboltStoreを閉じる
		return nil, fmt.Errorf("failed to create snapshot store at %s: %w", cfg.DataDir, err)
	}
	n.snapshotStore = snapshotStore

	r, err := raft.NewRaft(raftCfg, fsm, n.boltStore, n.boltStore, n.snapshotStore, transport)
	if err != nil {
		n.boltStore.Close()
		// snapshotStoreは明示的なCloseメソッドがない場合がある
		return nil, fmt.Errorf("failed to create raft instance for node %s: %w", cfg.NodeID, err)
	}
	n.raft = r

	if cfg.BootstrapCluster {
		configuration := raft.Configuration{
			Servers: []raft.Server{
				{
					ID:      cfg.NodeID,
					Address: transport.LocalAddr(),
				},
			},
		}
		f := r.BootstrapCluster(configuration)
		if err := f.Error(); err != nil {
			r.Shutdown().Error()
			n.boltStore.Close()
			return nil, fmt.Errorf("failed to bootstrap cluster for node %s: %w", cfg.NodeID, err)
		}
	}

	return n, nil
}

// Start はノードを起動します。(現在はNewNodeでRaftが起動処理を開始)
func (n *Node) Start() error {
	fmt.Printf("Node %s starting with Raft instance. Transport addr: %s\n", n.config.NodeID, n.transport.LocalAddr())
	return nil
}

// Shutdown はノードを安全にシャットダウンします。
// Raftインスタンスのシャットダウン、トランスポートのクローズなどを行います。
func (n *Node) Shutdown() error {
	fmt.Printf("Shutting down node %s...\n", n.config.NodeID)
	shutdownFuture := n.raft.Shutdown()
	if err := shutdownFuture.Error(); err != nil {
		fmt.Fprintf(os.Stderr, "Error shutting down raft for node %s: %v\n", n.config.NodeID, err)
	}

	if n.boltStore != nil { // boltStoreをクローズ
		if err := n.boltStore.Close(); err != nil {
			fmt.Fprintf(os.Stderr, "Error closing bolt store for node %s: %v\n", n.config.NodeID, err)
		}
	}

	// SnapshotStore (FileSnapshotStore) は明示的なCloseがない

	fmt.Printf("Node %s shutdown complete.\n", n.config.NodeID)
	return nil
}

// Apply はコマンドをRaftログに適用します。
// リーダーノードでのみ呼び出されるべきです。成功するとraft.ApplyFutureを返します。
// このFutureを使って、コマンドがコミットされたか、エラーが発生したかを確認できます。
func (n *Node) Apply(cmd []byte, timeout time.Duration) raft.ApplyFuture {
	return n.raft.Apply(cmd, timeout)
}

// ProposeCreateTable はテーブル作成コマンドをRaftクラスタに提案します。
// このメソッドはリーダーノードで実行されることを想定しています。
// 結果整合性のため、非リーダーで呼び出された場合はリーダーに転送するロジックが別途必要になります。
func (n *Node) ProposeCreateTable(tableName, partitionKeyName, sortKeyName string, timeout time.Duration) (interface{}, error) {
	if !n.IsLeader() {
		// リーダーでない場合は、リーダーにリクエストを転送するかエラーを返す。
		// ここでは単純にエラーを返す。CLI側でリダイレクトを試みることも可能。
		leaderID := n.LeaderID()
		leaderAddr := n.LeaderAddr()
		log.Printf("Node %s is not a leader. Current leader is %s (%s). Cannot propose CreateTable.", n.NodeID(), leaderID, leaderAddr)
		return nil, fmt.Errorf("not a leader, current leader is %s (%s)", leaderID, leaderAddr)
	}

	payload := store.CreateTableCommandPayload{
		TableName:        tableName,
		PartitionKeyName: partitionKeyName,
		SortKeyName:      sortKeyName,
	}
	cmdBytes, err := store.EncodeCommand(store.CreateTableCommandType, payload)
	if err != nil {
		return nil, fmt.Errorf("failed to encode CreateTable command: %w", err)
	}

	future := n.Apply(cmdBytes, timeout)
	if err := future.Error(); err != nil {
		return nil, fmt.Errorf("failed to apply CreateTable command: %w", err)
	}

	// future.Response() は FSM の Apply メソッドの戻り値
	// エラーがあれば FSM の Apply がエラーを返したことになる
	response := future.Response()
	if errResp, ok := response.(error); ok {
		return nil, fmt.Errorf("fsm apply error for CreateTable: %w", errResp)
	}
	return response, nil
}

// ProposeDeleteTable はテーブル削除コマンドをRaftクラスタに提案します。
func (n *Node) ProposeDeleteTable(tableName string, timeout time.Duration) (interface{}, error) {
	if !n.IsLeader() {
		leaderID := n.LeaderID()
		leaderAddr := n.LeaderAddr()
		log.Printf("Node %s is not a leader. Current leader is %s (%s). Cannot propose DeleteTable.", n.NodeID(), leaderID, leaderAddr)
		return nil, fmt.Errorf("not a leader, current leader is %s (%s)", leaderID, leaderAddr)
	}

	payload := store.DeleteTableCommandPayload{
		TableName: tableName,
	}
	cmdBytes, err := store.EncodeCommand(store.DeleteTableCommandType, payload)
	if err != nil {
		return nil, fmt.Errorf("failed to encode DeleteTable command: %w", err)
	}

	future := n.Apply(cmdBytes, timeout)
	if err := future.Error(); err != nil {
		return nil, fmt.Errorf("failed to apply DeleteTable command: %w", err)
	}

	response := future.Response()
	if errResp, ok := response.(error); ok {
		return nil, fmt.Errorf("fsm apply error for DeleteTable: %w", errResp)
	}
	return response, nil
}

// GetTableMetadata は指定されたテーブルのメタデータをFSMから取得します。
// これはローカルリードであり、Raftの合意を必要としません。
func (n *Node) GetTableMetadata(tableName string) (*store.TableMetadata, bool) {
	return n.fsm.GetTableMetadata(tableName) // FSMにメソッドを追加する必要がある
}

// ListTables はFSMに存在するすべてのテーブル名とメタデータのリストを取得します。
// これもローカルリードです。
func (n *Node) ListTables() map[string]store.TableMetadata {
	return n.fsm.ListTables() // FSMにメソッドを追加する必要がある
}

// IsLeader はこのノードが現在Raftクラスタのリーダーであるかどうかを確認します。
func (n *Node) IsLeader() bool {
	return n.raft.State() == raft.Leader
}

// LeaderAddr は現在のクラスタリーダーのアドレスを返します。
// リーダーがいない場合は空文字列を返します。
func (n *Node) LeaderAddr() raft.ServerAddress {
	return n.raft.Leader()
}

// LeaderID は現在のクラスタリーダーのIDを返します。
func (n *Node) LeaderID() raft.ServerID {
	addr, id := n.raft.LeaderWithID() // 返り値の順番を入れ替えてみる (Linterの指摘に基づく仮説)
	log.Printf("[DEBUG] Node %s LeaderID(): self.config.NodeID=%s, LeaderWithID() returned AddrAsID: %s, IDAsAddr: %s", n.config.NodeID, n.config.NodeID, addr, id)
	return id // こちらが ServerID であると仮定
}

// Stats はRaftノードの統計情報を返します。
func (n *Node) Stats() map[string]string {
	return n.raft.Stats()
}

// AddVoter は新しい投票ノードをクラスタに追加します。
// リーダーノードでのみ呼び出されるべきです。
func (n *Node) AddVoter(id raft.ServerID, address raft.ServerAddress, prevIndex uint64, timeout time.Duration) error {
	if !n.IsLeader() {
		return raft.ErrNotLeader
	}
	future := n.raft.AddVoter(id, address, prevIndex, timeout)
	return future.Error()
}

// RemoveServer はノードをクラスタから削除します。
// リーダーノードでのみ呼び出されるべきです。
func (n *Node) RemoveServer(id raft.ServerID, prevIndex uint64, timeout time.Duration) error {
	if !n.IsLeader() {
		return raft.ErrNotLeader
	}
	future := n.raft.RemoveServer(id, prevIndex, timeout)
	return future.Error()
}

// WaitForLeader は指定されたタイムアウト期間、リーダーが選出されるのを待ちます。
func (n *Node) WaitForLeader(timeout time.Duration) (raft.ServerAddress, error) {
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()
	timer := time.NewTimer(timeout)
	defer timer.Stop()

	for {
		select {
		case <-ticker.C:
			leaderAddr := n.LeaderAddr()
			if leaderAddr != "" {
				return leaderAddr, nil
			}
		case <-timer.C:
			return "", fmt.Errorf("timed out waiting for leader after %v", timeout)
		}
	}
}

// ProposePutItem はアイテム書き込みコマンドをRaftクラスタに提案します。
func (n *Node) ProposePutItem(tableName string, itemData map[string]interface{}, timeout time.Duration) (interface{}, error) {
	if !n.IsLeader() {
		leaderID, leaderAddr := n.LeaderWithID()
		log.Printf("Node %s is not a leader. Current leader is %s (%s). Cannot propose PutItem.", n.NodeID(), leaderID, leaderAddr)
		return nil, fmt.Errorf("not a leader, current leader is %s (%s)", leaderID, leaderAddr)
	}

	// TableMetadataを取得して、キー名を確認する必要がある
	meta, exists := n.fsm.GetTableMetadata(tableName)
	if !exists {
		return nil, fmt.Errorf("table %s not found", tableName)
	}

	// itemDataからパーティションキーとソートキーの値を検証 (FSMのApplyでも検証するが、Propose前にも行うと良い)
	pkValue, pkOk := itemData[meta.PartitionKeyName]
	if !pkOk || pkValue == nil {
		return nil, fmt.Errorf("partition key %s not found or is null in item for table %s", meta.PartitionKeyName, tableName)
	}
	// 型チェックなどはFSMのApplyに任せる

	putPayload, err := store.NewPutItemCommandPayload(tableName, itemData)
	if err != nil {
		return nil, fmt.Errorf("failed to create PutItemPayload: %w", err)
	}

	cmdBytes, err := store.EncodeCommand(store.PutItemCommandType, putPayload)
	if err != nil {
		return nil, fmt.Errorf("failed to encode PutItem command: %w", err)
	}

	future := n.Apply(cmdBytes, timeout)
	if err := future.Error(); err != nil {
		return nil, fmt.Errorf("failed to apply PutItem command: %w", err)
	}

	response := future.Response()
	if errResp, ok := response.(error); ok {
		return nil, fmt.Errorf("fsm apply error for PutItem: %w", errResp)
	}
	return response, nil
}

// ProposeDeleteItem はアイテム削除コマンドをRaftクラスタに提案します。
func (n *Node) ProposeDeleteItem(tableName string, partitionKey string, sortKey string, timeout time.Duration) (interface{}, error) {
	if !n.IsLeader() {
		leaderID, leaderAddr := n.LeaderWithID()
		log.Printf("Node %s is not a leader. Current leader is %s (%s). Cannot propose DeleteItem.", n.NodeID(), leaderID, leaderAddr)
		return nil, fmt.Errorf("not a leader, current leader is %s (%s)", leaderID, leaderAddr)
	}

	// TableMetadataを取得して、ソートキーの有無などを確認
	meta, exists := n.fsm.GetTableMetadata(tableName)
	if !exists {
		return nil, fmt.Errorf("table %s not found", tableName)
	}
	if meta.SortKeyName == "" && sortKey != "" {
		return nil, fmt.Errorf("sort key provided for table %s which has no sort key defined", tableName)
	}
	if meta.SortKeyName != "" && sortKey == "" {
		// ソートキーが定義されているテーブルで、ソートキーが指定されていない場合。
		// DynamoDBではエラーになるが、ここでは空のソートキーとして扱われるか、FSM側で検証される想定。
		// NewDeleteItemCommandPayloadは空のソートキーを許容する。
	}

	deletePayload := store.NewDeleteItemCommandPayload(tableName, partitionKey, sortKey)
	cmdBytes, err := store.EncodeCommand(store.DeleteItemCommandType, deletePayload)
	if err != nil {
		return nil, fmt.Errorf("failed to encode DeleteItem command: %w", err)
	}

	future := n.Apply(cmdBytes, timeout)
	if err := future.Error(); err != nil {
		return nil, fmt.Errorf("failed to apply DeleteItem command: %w", err)
	}

	response := future.Response()
	if errResp, ok := response.(error); ok {
		return nil, fmt.Errorf("fsm apply error for DeleteItem: %w", errResp)
	}
	return response, nil
}

// GetItemFromLocalStore はローカルのKVStoreから直接アイテムを取得します (結果整合性)。
// キーは、パーティションキー (ソートキーなしテーブル) または PartitionKey_SortKey (ソートキーありテーブル) の形式です。
func (n *Node) GetItemFromLocalStore(tableName string, itemKey string) (json.RawMessage, int64, error) {
	// KVStoreに直接アクセスするため、FSMのテーブル存在確認は行っても良いが、必須ではない。
	// KVStore側でテーブルディレクトリの存在確認は行われる。
	return n.kvStore.GetItem(tableName, itemKey)
}

// QueryItemsFromLocalStore はローカルのKVStoreから直接アイテムをクエリします (結果整合性)。
func (n *Node) QueryItemsFromLocalStore(tableName string, partitionKey string, sortKeyPrefix string) ([]map[string]interface{}, error) {
	return n.kvStore.QueryItems(tableName, partitionKey, sortKeyPrefix)
}

// LeaderWithID は現在のクラスタリーダーのアドレスとIDを返します。
// LeaderID() が LeaderWithID() の第2返り値を返すように変更したため、このメソッドも追加。
func (n *Node) LeaderWithID() (raft.ServerAddress, raft.ServerID) {
	return n.raft.LeaderWithID()
}
