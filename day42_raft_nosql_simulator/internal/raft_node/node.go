package raft_node

import (
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
	config        Config
	transport     raft.Transport        // Raftノード間通信用のトランスポート
	boltStore     *raftboltdb.BoltStore // LogStoreとStableStoreを兼ねるBoltDBストア
	snapshotStore raft.SnapshotStore
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
func NewNode(cfg Config, fsm *store.FSM, transport raft.Transport) (*Node, error) {
	n := &Node{
		fsm:       fsm,
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
