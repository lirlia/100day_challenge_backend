package raft_node_test

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"os"
	"path/filepath"
	"testing"
	"time"

	"day42_raft_nosql_simulator_local_test/internal/raft_node"

	"github.com/hashicorp/raft"
	"github.com/stretchr/testify/require"
)

const (
	integrationTestNumNodes    = 3
	integrationTestBasePort    = 9000 // node_test.go や main.go とは異なるポートを使用
	integrationTestRaftTimeout = 10 * time.Second
	integrationTestWaitDelay   = 3 * time.Second // FSM適用などの伝播待ち時間
)

// setupIntegrationTestCluster は統合テスト用のRaftクラスタをセットアップします。
// 作成されたノードのスライス、トランスポートのスライス、ルートデータディレクトリ、およびクリーンアップ関数を返します。
func setupIntegrationTestCluster(t *testing.T) ([]*raft_node.Node, []raft.Transport, string, func()) {
	t.Helper()

	testDataDirRoot, err := ioutil.TempDir("", "raft-integration-test-")
	require.NoError(t, err, "Failed to create temp dir for integration test data")

	nodes := make([]*raft_node.Node, integrationTestNumNodes)
	transports := make([]raft.Transport, integrationTestNumNodes)

	for i := 0; i < integrationTestNumNodes; i++ {
		nodeIDStr := fmt.Sprintf("intNode%d", i)
		nodeID := raft.ServerID(nodeIDStr)
		addr := fmt.Sprintf("127.0.0.1:%d", integrationTestBasePort+i)
		raftAddr := raft.ServerAddress(addr)
		nodeDataDir := filepath.Join(testDataDirRoot, nodeIDStr)

		transport, err := raft.NewTCPTransport(string(raftAddr), nil, 3, integrationTestRaftTimeout, ioutil.Discard)
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
		t.Logf("Integration Node %s created. Data dir: %s, Addr: %s, Bootstrap: %v", nodeID, cfg.DataDir, cfg.Addr, cfg.BootstrapCluster)
	}

	// リーダー選出を待つ
	var leaderNode *raft_node.Node
	require.Eventually(t, func() bool {
		for _, n := range nodes {
			if n.IsLeader() {
				leaderNode = n
				return true
			}
		}
		return false
	}, 20*time.Second, 500*time.Millisecond, "Leader should be elected in integration test cluster")
	require.NotNil(t, leaderNode, "Leader node should not be nil")
	t.Logf("Integration test leader elected: Node ID=%s, Address=%s", leaderNode.NodeID(), leaderNode.Addr())

	// 他のノードをクラスタに追加 (Voterとして)
	for _, node := range nodes {
		if node.NodeID() == leaderNode.NodeID() {
			continue
		}
		t.Logf("Attempting to add voter %s (%s) to leader %s in integration test", node.NodeID(), node.Addr(), leaderNode.NodeID())
		err := leaderNode.AddVoter(node.NodeID(), node.Addr(), 0, integrationTestRaftTimeout)
		require.NoError(t, err, "Failed to add voter %s to leader %s: %v", node.NodeID(), leaderNode.NodeID(), err)
		t.Logf("AddVoter call for %s completed in integration test.", node.NodeID())
	}

	// 設定変更がクラスタ全体に伝播するのを待つ
	time.Sleep(integrationTestWaitDelay)

	cleanupFunc := func() {
		t.Log("Shutting down integration test nodes...")
		for i := len(nodes) - 1; i >= 0; i-- {
			nodeToShutdown := nodes[i]
			transportToClose := transports[i]
			t.Logf("Shutting down integration node %s", nodeToShutdown.NodeID())
			if err := nodeToShutdown.Shutdown(); err != nil {
				t.Logf("Error shutting down integration node %s: %v", nodeToShutdown.NodeID(), err)
			}

			if netTransport, ok := transportToClose.(*raft.NetworkTransport); ok {
				if err := netTransport.Close(); err != nil {
					t.Logf("Error closing transport for node %s: %v", nodeToShutdown.NodeID(), err)
				}
			}
		}
		os.RemoveAll(testDataDirRoot)
		t.Log("Integration test cleanup complete.")
	}

	return nodes, transports, testDataDirRoot, cleanupFunc
}

// getLeaderNode はクラスタ内のリーダーノードを探して返します。
// リーダーが見つからない場合は nil を返します。
func getLeaderNode(t *testing.T, nodes []*raft_node.Node) *raft_node.Node {
	t.Helper()
	for _, n := range nodes {
		if n.IsLeader() {
			return n
		}
	}
	t.Log("No leader found in the cluster")
	return nil
}

func TestIntegration_TableOperations(t *testing.T) {
	nodes, _, _, cleanup := setupIntegrationTestCluster(t)
	defer cleanup()

	leader := getLeaderNode(t, nodes)
	require.NotNil(t, leader, "Leader must exist for table operations test")

	tableName := "integrationTestTable"
	pkName := "id"

	t.Run("CreateTable", func(t *testing.T) {
		_, err := leader.ProposeCreateTable(tableName, pkName, "", integrationTestRaftTimeout)
		require.NoError(t, err, "ProposeCreateTable should succeed")

		time.Sleep(integrationTestWaitDelay) // FSM適用待ち

		// 全ノードでテーブル存在確認 (FSM直接)
		for _, node := range nodes {
			meta, exists := node.GetFSM().GetTableMetadata(tableName)
			require.True(t, exists, "Node %s: Table %s should exist in FSM", node.NodeID(), tableName)
			require.Equal(t, tableName, meta.TableName)
			require.Equal(t, pkName, meta.PartitionKeyName)
		}
	})

	t.Run("ListTables", func(t *testing.T) {
		// いずれかの一つのノード (例: リーダー) でリスト取得確認
		tables := leader.GetFSM().ListTables()
		require.Contains(t, tables, tableName, "ListTables should contain the created table")
		require.Equal(t, pkName, tables[tableName].PartitionKeyName)
	})

	t.Run("DeleteTable", func(t *testing.T) {
		_, err := leader.ProposeDeleteTable(tableName, integrationTestRaftTimeout)
		require.NoError(t, err, "ProposeDeleteTable should succeed")

		time.Sleep(integrationTestWaitDelay) // FSM適用待ち

		// 全ノードでテーブル非存在確認
		for _, node := range nodes {
			_, exists := node.GetFSM().GetTableMetadata(tableName)
			require.False(t, exists, "Node %s: Table %s should not exist in FSM after deletion", node.NodeID(), tableName)
		}
	})
}

func TestIntegration_ItemOperations(t *testing.T) {
	nodes, _, _, cleanup := setupIntegrationTestCluster(t)
	defer cleanup()

	leader := getLeaderNode(t, nodes)
	require.NotNil(t, leader, "Leader must exist for item operations test")

	tableName := "itemTestTable"
	pkName := "itemID"
	skName := "timestamp"

	// まずテーブルを作成
	_, err := leader.ProposeCreateTable(tableName, pkName, skName, integrationTestRaftTimeout)
	require.NoError(t, err, "Setup: ProposeCreateTable for item test should succeed")
	time.Sleep(integrationTestWaitDelay)

	item1PKVal := "item001"
	item1SKVal := "2024-07-26T10:00:00Z"
	item1Data := map[string]interface{}{pkName: item1PKVal, skName: item1SKVal, "value": "data1"}
	item1Key := item1PKVal + "_" + item1SKVal

	t.Run("PutItem", func(t *testing.T) {
		_, err := leader.ProposePutItem(tableName, item1Data, integrationTestRaftTimeout)
		require.NoError(t, err, "ProposePutItem should succeed")

		time.Sleep(integrationTestWaitDelay) // KVStore適用待ち

		// 全ノードでアイテム存在確認 (KVStore直接リード)
		for _, node := range nodes {
			retrievedData, _, getErr := node.GetItemFromLocalStore(tableName, item1Key)
			require.NoError(t, getErr, "Node %s: GetItemFromLocalStore for %s should succeed", node.NodeID(), item1Key)
			var retrievedMap map[string]interface{}
			err = json.Unmarshal(retrievedData, &retrievedMap)
			require.NoError(t, err, "Node %s: Failed to unmarshal retrieved item data", node.NodeID())
			require.Equal(t, item1Data["value"], retrievedMap["value"], "Node %s: Item data mismatch", node.NodeID())
		}
	})

	item2PKVal := "item001"              // 同じPK
	item2SKVal := "2024-07-26T11:00:00Z" // 異なるSK
	item2Data := map[string]interface{}{pkName: item2PKVal, skName: item2SKVal, "value": "data2"}
	item2Key := item2PKVal + "_" + item2SKVal

	_, err = leader.ProposePutItem(tableName, item2Data, integrationTestRaftTimeout)
	require.NoError(t, err, "ProposePutItem for item2 should succeed")
	time.Sleep(integrationTestWaitDelay)

	t.Run("QueryItems by PK", func(t *testing.T) {
		// いずれかの一つのノードでクエリ確認 (結果整合性なのでどのノードでも同じはず)
		queriedItems, queryErr := nodes[0].QueryItemsFromLocalStore(tableName, item1PKVal, "")
		require.NoError(t, queryErr, "QueryItemsFromLocalStore should succeed")
		require.Len(t, queriedItems, 2, "Should find 2 items for PK %s", item1PKVal)

		// 内容の簡易確認 (value が data1 と data2 であることを確認)
		foundVal1, foundVal2 := false, false
		for _, item := range queriedItems {
			if item["value"] == "data1" {
				foundVal1 = true
			}
			if item["value"] == "data2" {
				foundVal2 = true
			}
		}
		require.True(t, foundVal1 && foundVal2, "Query did not return both items with correct values")
	})

	t.Run("QueryItems by PK and SK prefix", func(t *testing.T) {
		queriedItems, queryErr := nodes[0].QueryItemsFromLocalStore(tableName, item1PKVal, "2024-07-26T10")
		require.NoError(t, queryErr, "QueryItemsFromLocalStore with SK prefix should succeed")
		require.Len(t, queriedItems, 1, "Should find 1 item for PK %s and SK prefix 2024-07-26T10", item1PKVal)
		require.Equal(t, "data1", queriedItems[0]["value"])
	})

	t.Run("DeleteItem", func(t *testing.T) {
		_, err := leader.ProposeDeleteItem(tableName, item1PKVal, item1SKVal, integrationTestRaftTimeout)
		require.NoError(t, err, "ProposeDeleteItem for item1 should succeed")
		time.Sleep(integrationTestWaitDelay)

		// 全ノードでアイテム非存在確認
		for _, node := range nodes {
			_, _, getErr := node.GetItemFromLocalStore(tableName, item1Key)
			require.Error(t, getErr, "Node %s: Item %s should be deleted", node.NodeID(), item1Key)
			require.Contains(t, getErr.Error(), "not found", "Node %s: Error message for deleted item is incorrect", node.NodeID())
		}

		// item2は残っているはず
		_, _, getErrItem2 := nodes[0].GetItemFromLocalStore(tableName, item2Key)
		require.NoError(t, getErrItem2, "Item2 should still exist after deleting item1")
	})
}
