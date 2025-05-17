package raft_node_test

import (
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/raft_node"

	"github.com/hashicorp/raft"
	"github.com/stretchr/testify/require"
)

const (
	testNumNodes    = 3
	testBasePort    = 8000 // main.go とは異なるポートを使用
	testRaftTimeout = 5 * time.Second
)

func createTestDataDir(t *testing.T) string {
	tmpDir, err := ioutil.TempDir("", "raft-test-")
	require.NoError(t, err, "Failed to create temp dir for test data")
	return tmpDir
}

func TestClusterLeaderElectionAndShutdown(t *testing.T) {
	testDataDirRoot := createTestDataDir(t)
	defer os.RemoveAll(testDataDirRoot)
	t.Logf("Test data directory: %s", testDataDirRoot)

	nodes := make([]*raft_node.Node, testNumNodes)
	transports := make([]raft.Transport, testNumNodes)

	// FSMは全ノードで共通のインスタンスを使用できますが、
	// 実際のデータは各ノードのRaftログに基づいてローカルに適用されるため、
	// FSM自体が状態を持つ場合は、各ノードが独自のFSMインスタンスを持つべきです。
	// 今回のFSMは現時点では状態を持たないので、共有でも問題ありません。

	// 1. ノードの作成と初期化
	for i := 0; i < testNumNodes; i++ {
		nodeIDStr := fmt.Sprintf("testnode%d", i)
		nodeID := raft.ServerID(nodeIDStr)
		addr := fmt.Sprintf("127.0.0.1:%d", testBasePort+i)
		raftAddr := raft.ServerAddress(addr)
		nodeDataDir := filepath.Join(testDataDirRoot, nodeIDStr)

		transport, err := raft.NewTCPTransport(string(raftAddr), nil, 3, testRaftTimeout, ioutil.Discard) // ログ出力を抑制
		require.NoError(t, err, "Failed to create TCP transport for %s", nodeID)
		transports[i] = transport

		cfg := raft_node.Config{
			NodeID:           nodeID,
			Addr:             raftAddr,
			DataDir:          nodeDataDir,
			BootstrapCluster: i == 0, // 最初のノードのみクラスタをブートストラップ
		}

		n, err := raft_node.NewNode(cfg, transport)
		require.NoError(t, err, "Failed to create node %s", nodeID)
		nodes[i] = n
		t.Logf("Node %s created. Data dir: %s, Addr: %s, Bootstrap: %v", nodeID, cfg.DataDir, cfg.Addr, cfg.BootstrapCluster)
	}

	// 2. リーダー選出の待機と確認
	var leaderNode *raft_node.Node
	var leaderID raft.ServerID
	var leaderAddr raft.ServerAddress

	require.Eventually(t, func() bool {
		for _, n := range nodes {
			if n.IsLeader() {
				leaderNode = n
				leaderID = n.RaftLeaderID()
				leaderAddr = n.RaftLeaderAddress()
				return true
			}
		}
		return false
	}, 15*time.Second, 500*time.Millisecond, "Leader should be elected")

	require.NotNil(t, leaderNode, "Leader node should not be nil")
	t.Logf("Leader elected: Node ID=%s, Address=%s", leaderID, leaderAddr)

	// 3. 他のノードをクラスタに追加 (Voterとして)
	for _, node := range nodes {
		if node.RaftNodeID() == leaderNode.RaftNodeID() {
			continue
		}
		t.Logf("Attempting to add voter %s (%s) to leader %s", node.RaftNodeID(), node.RaftAddr(), leaderNode.RaftNodeID())
		err := leaderNode.AddVoter(node.RaftNodeID(), node.RaftAddr(), 0, testRaftTimeout)
		if err != nil {
			// 時々 "not leader" エラーが出ることがある。リトライか、より長い待機時間が必要かもしれない。
			t.Logf("Warning: Failed to add voter %s to leader %s: %v. This might happen if leadership changed.", node.RaftNodeID(), leaderNode.RaftNodeID(), err)
		} else {
			t.Logf("AddVoter call for %s completed.", node.RaftNodeID())
		}
	}
	// 設定変更がクラスタ全体に伝播するのを待つ
	time.Sleep(3 * time.Second)

	// 4. 全ノードがリーダーを認識しているか確認
	for i, n := range nodes {
		finalLeaderAddr := n.RaftLeaderAddress()
		finalLeaderID := n.RaftLeaderID()
		t.Logf("Node %d (%s): State=%s, IsLeader=%v, RecognizedLeaderAddr=%s, RecognizedLeaderID=%s",
			i, n.RaftNodeID(), n.Stats()["state"], n.IsLeader(), finalLeaderAddr, finalLeaderID)
		// リーダーノード自体も、他のフォロワーも、選出されたリーダーの正しいアドレスを認識しているべき
		require.Equal(t, leaderAddr, finalLeaderAddr, "Node %s should recognize leader address %s, got %s", n.RaftNodeID(), leaderAddr, finalLeaderAddr)
		// リーダーIDも同様 (Linterの問題で以前アドレスが返っていたが、修正後はIDのはず)
		require.Equal(t, leaderID, finalLeaderID, "Node %s should recognize leader ID %s, got %s", n.RaftNodeID(), leaderID, finalLeaderID)
	}

	// 5. シャットダウン処理
	t.Log("Shutting down nodes...")
	for i := len(nodes) - 1; i >= 0; i-- {
		nodeToShutdown := nodes[i]
		transportToClose := transports[i]
		t.Logf("Shutting down node %s", nodeToShutdown.RaftNodeID())
		err := nodeToShutdown.Shutdown()
		require.NoError(t, err, "Error shutting down node %s", nodeToShutdown.RaftNodeID())

		if transportToClose != nil {
			if netTransport, ok := transportToClose.(*raft.NetworkTransport); ok {
				err := netTransport.Close()
				require.NoError(t, err, "Error closing transport for node %s", nodeToShutdown.RaftNodeID())
			} else {
				t.Logf("Transport for node %s is not *raft.NetworkTransport, type: %T", nodeToShutdown.RaftNodeID(), transportToClose)
			}
		}
	}
	t.Log("Test completed successfully.")
}
