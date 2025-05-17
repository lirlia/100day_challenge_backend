package raft_node

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"time"

	"day42_raft_nosql_simulator_local_test/internal/server"
	"day42_raft_nosql_simulator_local_test/internal/store"

	raftboltdb "github.com/hashicorp/raft-boltdb"

	"github.com/hashicorp/raft"
)

const (
	raftTimeout         = 10 * time.Second
	retainSnapshotCount = 2
)

// Config はRaftノードの設定です。
// この構造体は、各Raftノードを初期化するために必要なすべてのパラメータを保持します。
// NodeID: クラスタ内で各ノードを一意に識別するためのID。
// Addr: Raftノードがリッスンするネットワークアドレス (例: "127.0.0.1:7000")。
// HttpApiAddr: HTTP APIサーバー用のアドレス (例: "127.0.0.1:8080")
// DataDir: Raftログ、スナップショット、BoltDBファイルなどを保存するディレクトリ。
// IsLeader: このノードが初期状態でリーダーとして起動するかどうか（通常はfalseで、リーダー選出に任せる）。
// BootstrapCluster: 新しいクラスタをブートストラップするかどうか。最初のノードのみtrueに設定。
// JoinAddr: Joinするクラスタのアドレス
type Config struct {
	NodeID           raft.ServerID
	Addr             raft.ServerAddress // Raft通信用のアドレス
	HttpApiAddr      string             // HTTP APIサーバー用のアドレス (例: "127.0.0.1:8080")
	DataDir          string
	BootstrapCluster bool
	JoinAddr         string // 追加: Joinするクラスタのアドレス
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
	httpApiServer *server.APIServer // HTTP APIサーバーの参照
	raftConfig    *raft.Config      // raftConfig を追加
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

// RaftNodeID はノードのRaft ServerIDを返します。
func (n *Node) RaftNodeID() raft.ServerID {
	return n.config.NodeID
}

// RaftAddr はノードのRaft ServerAddressを返します。
func (n *Node) RaftAddr() raft.ServerAddress {
	return n.config.Addr
}

// NewNode は新しいRaftノードインスタンスを作成し、初期化します。
// 初期化には、Raftの設定、FSMの準備、トランスポート層のセットアップ、
// ログストア、安定ストア、スナップショットストアの準備が含まれます。
// 成功すると初期化されたNodeへのポインタを返します。エラーが発生した場合はエラーを返します。
func NewNode(cfg Config, transport raft.Transport) (*Node, error) {
	log.Printf("[INFO] [RaftNode] [%s] NewNode: Initializing Raft node with config: %+v", cfg.NodeID, cfg)

	// KVStoreの初期化
	kvStore, err := store.NewKVStore(cfg.DataDir, string(cfg.NodeID))
	if err != nil {
		log.Printf("[ERROR] [RaftNode] [%s] NewNode: Failed to create KVStore: %v", cfg.NodeID, err)
		return nil, fmt.Errorf("failed to create KVStore: %w", err)
	}

	// FSMの初期化。KVStoreを渡す。
	fsm := store.NewFSM(kvStore, string(cfg.NodeID)) // dataDir引数を削除

	// Raftログストアと安定ストアの設定 (BoltDBを使用)
	// 1つのBoltDBファイルでログストアと安定ストアを兼ねる
	boltDBPath := filepath.Join(cfg.DataDir, "raft.db")
	log.Printf("[DEBUG] [RaftNode] [%s] NewNode: BoltDB Store path: %s", cfg.NodeID, boltDBPath)

	boltDBStore, err := raftboltdb.NewBoltStore(boltDBPath)
	if err != nil {
		log.Printf("[ERROR] [RaftNode] [%s] NewNode: Failed to create Bolt store at %s: %v", cfg.NodeID, boltDBPath, err)
		return nil, fmt.Errorf("failed to create bolt store %s: %w", boltDBPath, err)
	}

	// スナップショットストアの設定
	snapshotStore, err := raft.NewFileSnapshotStore(cfg.DataDir, retainSnapshotCount, os.Stderr)
	if err != nil {
		boltDBStore.Close() // エラー時は既に開いたストアを閉じる
		log.Printf("[ERROR] [RaftNode] [%s] NewNode: Failed to create snapshot store at %s: %v", cfg.NodeID, cfg.DataDir, err)
		return nil, fmt.Errorf("failed to create snapshot store at %s: %w", cfg.DataDir, err)
	}

	node := &Node{
		fsm:           fsm,
		kvStore:       kvStore,
		config:        cfg,
		transport:     transport,
		boltStore:     boltDBStore, // 修正: logStore, stableStore の代わりに boltStore
		snapshotStore: snapshotStore,
	}

	// HTTP APIサーバーの初期化と起動
	// nodeが完全に初期化されてから APIServer を作成するために、nodeのポインタを渡す
	// RaftNodeProxy を満たすために node 自身を渡す
	node.httpApiServer = server.NewAPIServer(cfg.HttpApiAddr, node)
	err = node.httpApiServer.Start() // Startがエラーを返すように修正した場合
	if err != nil {
		boltDBStore.Close()
		log.Printf("[ERROR] [RaftNode] [%s] NewNode: Failed to start HTTP API server: %v", cfg.NodeID, err)
		return nil, fmt.Errorf("failed to start HTTP API server: %w", err)
	}

	// Raftインスタンスの作成
	raftCfg := raft.DefaultConfig()
	raftCfg.LocalID = cfg.NodeID
	raftCfg.HeartbeatTimeout = 1000 * time.Millisecond
	raftCfg.ElectionTimeout = 1000 * time.Millisecond
	raftCfg.LeaderLeaseTimeout = 500 * time.Millisecond
	raftCfg.CommitTimeout = 50 * time.Millisecond
	raftCfg.SnapshotInterval = 20 * time.Second // スナップショットの間隔
	raftCfg.SnapshotThreshold = 5               // この数のコミット後にスナップショット

	// ログ関連の設定
	// raftCfg.Logger = hclog.New(&hclog.LoggerOptions{
	// Name: "raft-" + string(cfg.NodeID),
	// Level: hclog.LevelFromString("DEBUG"), // 必要に応じて変更
	// Output: os.Stderr,
	// })

	r, err := raft.NewRaft(raftCfg, fsm, boltDBStore, boltDBStore, snapshotStore, transport)
	if err != nil {
		boltDBStore.Close()
		// snapshotStoreはCloseメソッドを持たない
		log.Printf("[ERROR] [RaftNode] [%s] NewNode: Failed to create Raft instance: %v", cfg.NodeID, err)
		return nil, fmt.Errorf("failed to create raft instance: %w", err)
	}
	node.raft = r
	node.raftConfig = raftCfg // raftConfig を保存

	if cfg.BootstrapCluster {
		log.Printf("[INFO] [RaftNode] [%s] NewNode: Bootstrapping cluster with self as leader", cfg.NodeID)
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
			log.Printf("[ERROR] [RaftNode] [%s] NewNode: Failed to bootstrap cluster: %v", cfg.NodeID, err)
			// クリーンアップは NewRaft のエラー処理で行われるため、ここでは不要
			return nil, fmt.Errorf("failed to bootstrap cluster: %w", err)
		}
		log.Printf("[INFO] [RaftNode] [%s] NewNode: Cluster bootstrapped successfully", cfg.NodeID)
	} else if cfg.JoinAddr != "" {
		log.Printf("[INFO] [RaftNode] [%s] NewNode: Attempting to join existing cluster at %s", cfg.NodeID, cfg.JoinAddr)
		// TODO: Join処理の実装 (AddVoterなど)
		// この部分はE2Eテストでは直接は使われていないが、将来的に必要になる
		// if err := n.Join(cfg.JoinAddr); err != nil {
		// return nil, fmt.Errorf("failed to join cluster: %w", err)
		// }
		log.Printf("[WARN] [RaftNode] [%s] NewNode: Join functionality is not fully implemented yet.", cfg.NodeID)
	}

	log.Printf("[INFO] [RaftNode] [%s] NewNode: Raft node initialized successfully. Leader: %v", cfg.NodeID, r.Leader())
	return node, nil
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

	// HTTP APIサーバーをシャットダウン
	if n.httpApiServer != nil { // コメントアウトを解除
		if err := n.httpApiServer.Shutdown(5 * time.Second); err != nil {
			fmt.Fprintf(os.Stderr, "Error shutting down HTTP API server for node %s: %v\n", n.config.NodeID, err)
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

// ListTables はノードが管理しているテーブルの一覧を返します。
// これはFSMから取得されます。
func (n *Node) ListTables() []string { // 返り値の型を []string に変更
	log.Printf("[INFO] [RaftNode] [%s] ListTables: Called", n.config.NodeID)
	tables := n.fsm.ListTables() // FSMのListTablesは []string を返す
	log.Printf("[INFO] [RaftNode] [%s] ListTables: FSM returned %d tables: %v", n.config.NodeID, len(tables), tables)
	return tables
}

// ListTablesFromFSM はFSMに存在するすべてのテーブル名のリストを返します。
// これは RaftNodeProxy インターフェースのために必要です。
func (n *Node) ListTablesFromFSM() []string {
	return n.fsm.ListTables() // 修正: fsm.ListTables() は既に []string を返す
}

// IsLeader はこのノードが現在Raftクラスタのリーダーであるかどうかを確認します。
func (n *Node) IsLeader() bool {
	return n.raft.State() == raft.Leader
}

// RaftLeaderAddress は現在のクラスタリーダーのアドレスを返します。
// リーダーがいない場合は空文字列を返します。
func (n *Node) RaftLeaderAddress() raft.ServerAddress {
	return n.raft.Leader()
}

// RaftLeaderID は現在のクラスタリーダーのIDを返します。
func (n *Node) RaftLeaderID() raft.ServerID {
	addr, id := n.raft.LeaderWithID()
	log.Printf("[DEBUG] Node %s RaftLeaderID(): self.config.NodeID=%s, LeaderWithID() returned AddrAsID: %s, IDAsAddr: %s", n.config.NodeID, n.config.NodeID, addr, id)
	return id
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
			leaderAddr := n.RaftLeaderAddress()
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

// GetClusterStatus は現在のノードとクラスタのステータス情報を返します。
func (n *Node) GetClusterStatus() (map[string]interface{}, error) {
	log.Printf("[INFO] [RaftNode] [%s] GetClusterStatus: Called", n.config.NodeID)
	status := make(map[string]interface{})
	status["node_id"] = n.NodeID()
	status["is_leader"] = n.IsLeader()
	status["current_leader_address"] = n.LeaderAddr()
	status["current_leader_id"] = n.LeaderID()

	raftStats := n.raft.Stats()
	status["raft_stats"] = raftStats

	// テーブル一覧 (FSMから取得)
	tableNames := n.fsm.ListTables() // これは []string
	// FSMのテーブルメタデータも取得できれば理想的だが、現状は名前のみ
	// 以前の実装では f.tables (map[string]TableMetadata) を直接返していたが、
	// FSMのインターフェースとしては ListTables() []string のみ公開されている。
	// 必要であれば、FSMにGetTableMetadata(name string)のようなメソッドを追加する。
	status["tables_in_fsm"] = tableNames

	// Raftの設定情報（一部）
	// raftConfigはNode構造体に保存されているはず
	if n.raftConfig != nil {
		status["raft_configuration_summary"] = map[string]interface{}{
			"snapshot_interval":  n.raftConfig.SnapshotInterval,
			"snapshot_threshold": n.raftConfig.SnapshotThreshold,
			// "protocol_version": n.raftConfig.ProtocolVersion, // ProtocolVersionはRaftインスタンスから取得するのが一般的
		}
	}
	if n.raft != nil {
		status["raft_protocol_version"] = n.raft.ProtocolVersion()
		// status["raft_peers"] = n.raft.Peers() // Peers()メソッドは存在しない
		// Configuration() から取得するのが一般的
		configFuture := n.raft.GetConfiguration()
		if err := configFuture.Error(); err == nil {
			status["raft_current_configuration_servers"] = configFuture.Configuration().Servers
		}
	}

	log.Printf("[INFO] [RaftNode] [%s] GetClusterStatus: Returning status for node %s, leader: %v", n.config.NodeID, n.NodeID(), n.IsLeader())
	return status, nil
}

// RaftLeaderWithID は現在のクラスタリーダーのアドレスとIDを返します。
// LeaderID() が LeaderWithID() の第2返り値を返すように変更したため、このメソッドも追加。
func (n *Node) RaftLeaderWithID() (raft.ServerAddress, raft.ServerID) {
	return n.raft.LeaderWithID()
}

// NodeID returns the string representation of the node's Raft ID.
// This is to satisfy the RaftNodeProxy interface.
func (n *Node) NodeID() string {
	return string(n.config.NodeID)
}

// LeaderWithID is a wrapper for RaftLeaderWithID to satisfy RaftNodeProxy which expects string return types.
func (n *Node) LeaderWithID() (string, string) {
	addr, id := n.RaftLeaderWithID()
	return string(addr), string(id)
}

// LeaderAddr is a wrapper for RaftLeaderAddress to satisfy RaftNodeProxy which expects string return types.
func (n *Node) LeaderAddr() string {
	return string(n.RaftLeaderAddress())
}

// LeaderIDString is a wrapper for RaftLeaderID to satisfy RaftNodeProxy.
// This specific method LeaderID() string is now directly implemented as NodeID() returns string.
// However, RaftNodeProxy might expect a LeaderID() string method specifically for the leader's ID.
// Let's ensure the RaftNodeProxy interface is matched.
// The proxy expects LeaderID() string. Node.RaftLeaderID() returns raft.ServerID.
// So we need a new LeaderID() string for the proxy.
// func (n *Node) OldLeaderID() string { // This was string(n.config.NodeID) but that's NodeID()
//
//		 return string(n.RaftLeaderID())
//	}
//
// The proxy interface has: LeaderID() string. This should be the ID of the current leader, not the node itself.
func (n *Node) LeaderID() string {
	_, id := n.RaftLeaderWithID()
	return string(id)
}
