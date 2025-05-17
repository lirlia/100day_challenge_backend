package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/hashicorp/raft"
	"github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/raft_node"
)

const (
	numNodes    = 3
	basePort    = 7000
	dataDir     = "./data"
	raftTimeout = 10 * time.Second
)

func main() {
	fmt.Println("Starting Raft cluster simulation...")

	// クリーンアップ: 既存のデータディレクトリを削除 (シミュレーションのたびに初期状態にするため)
	if err := os.RemoveAll(dataDir); err != nil {
		log.Fatalf("Failed to remove existing data directory: %v", err)
	}

	nodes := make([]*raft_node.Node, numNodes)
	transports := make([]raft.Transport, numNodes)
	// InmemTransportは共有チャネルを使用するため、1つだけ作成し共有する
	// ただし、NewTCPTransportのようにアドレス指定で接続先を分けることもできる。
	// raft.NewInmemTransport() はアドレスを引数にとらないので、loopback を使う。
	// 今回は各ノードがユニークなアドレスを持つ loopback FSM transport を使う。
	// しかし、InmemTransportは一つのプロセス内でgoroutineとしてノードを動かすことを想定しており、
	// 実際にはアドレスというよりは、IDで識別されるノード間でメッセージをルーティングする。
	// もっともシンプルなのは raft.NewInmemTransport() を一つ作り共有するケース。
	// ここでは、InmemTransport が内部でアドレスを解決できると仮定するが、
	// 実際の hashicorp/raft の InmemTransport はそのような動作を直接サポートしない場合がある。
	// TCPTransport の方がシミュレーションとしては現実に近い。
	// 今回は、TCPTransportを使用します。

	// fsm := store.NewFSM() // 全ノードで共有FSMインスタンス (内容はRaft経由で同期される) <- この行を削除し、Node内で個別に作成

	var raftServers []raft.Server
	for i := 0; i < numNodes; i++ {
		nodeID := raft.ServerID(fmt.Sprintf("node%d", i))
		// TCPTransportを使用するため、localhostの異なるポートでアドレスを生成
		addr := fmt.Sprintf("127.0.0.1:%d", basePort+i)
		raftAddr := raft.ServerAddress(addr)

		raftServers = append(raftServers, raft.Server{
			ID:      nodeID,
			Address: raftAddr,
		})

		transport, err := raft.NewTCPTransport(string(raftAddr), nil, 3, raftTimeout, os.Stderr)
		if err != nil {
			log.Fatalf("Failed to create TCP transport for %s: %v", nodeID, err)
		}
		transports[i] = transport

		cfg := raft_node.Config{
			NodeID:           nodeID,
			Addr:             raftAddr, // node.goのConfig.AddrはこのAddr
			DataDir:          filepath.Join(dataDir, string(nodeID)),
			BootstrapCluster: i == 0, // 最初のノードのみクラスタをブートストラップ
		}

		// n, err := raft_node.NewNode(cfg, fsm, transport) // transportを渡す <- fsm引数を削除
		n, err := raft_node.NewNode(cfg, transport)
		if err != nil {
			log.Fatalf("Failed to create node %s: %v", nodeID, err)
		}
		nodes[i] = n
		fmt.Printf("Node %s created. Data dir: %s, Addr: %s, Bootstrap: %v\n", nodeID, cfg.DataDir, cfg.Addr, cfg.BootstrapCluster)
	}

	// 最初のノード(ブートストラップノード)のRaft設定に全サーバー情報を伝える
	// NewNode内でBootstrapClusterがtrueの場合に自身の情報でブートストラップするので、
	// 他のノードをAddVoterで追加する必要がある、または初期設定で全ノードを渡す。
	// hashicorp/raftでは、BootstrapClusterは最初のサーバーリストでクラスタを開始する。
	// 明示的に他のノードを参加させる必要はない。
	// ただし、他のノードはリーダーに接続してクラスタに参加しようとする。

	fmt.Println("All nodes created. Waiting for leader election...")

	// リーダー選出を待つ (最初のノードで代表して待つ)
	var leaderAddr raft.ServerAddress
	var leaderID raft.ServerID
	var foundLeaderNode *raft_node.Node
	var err error

	for i := 0; i < 15; i++ { // 試行回数を少し増やす
		for _, n := range nodes {
			if n.IsLeader() {
				leaderAddr = n.LeaderAddr()
				leaderID = n.LeaderID()
				foundLeaderNode = n
				break
			}
		}
		if foundLeaderNode != nil {
			// フォロワーがリーダーを認識するのを少し待つ
			time.Sleep(1 * time.Second)
			break
		}
		time.Sleep(1 * time.Second) // 周期を少し短く
		fmt.Println("Still waiting for leader...")
	}

	if foundLeaderNode == nil {
		log.Fatalf("Failed to elect leader or identify leader node after multiple attempts: %v", err)
	}
	fmt.Printf("Leader elected: Node ID=%s, Address=%s\n", leaderID, leaderAddr)

	// リーダーに他のノードをVoterとして追加する
	if foundLeaderNode != nil {
		for _, node := range nodes {
			if node.NodeID() == foundLeaderNode.NodeID() {
				continue // 自分自身は追加しない
			}
			fmt.Printf("Attempting to add voter %s (%s) to leader %s\n", node.NodeID(), node.Addr(), foundLeaderNode.NodeID())
			err := foundLeaderNode.AddVoter(node.NodeID(), node.Addr(), 0, 500*time.Millisecond)
			if err != nil {
				log.Printf("Failed to add voter %s to leader %s: %v\n", node.NodeID(), foundLeaderNode.NodeID(), err)
			} else {
				fmt.Printf("Successfully added voter %s to leader %s\n", node.NodeID(), foundLeaderNode.NodeID())
			}
		}
		// 設定変更が反映されるのを待つ
		time.Sleep(2 * time.Second)
	}

	// 状態表示
	for i, n := range nodes {
		// フォロワーノードもリーダー情報を表示できるように、リーダーノードから取得する
		currentLeaderAddr := "N/A"
		currentLeaderID := "N/A"
		if foundLeaderNode != nil { // リーダーが見つかっていれば
			// 各ノードが認識しているリーダーのアドレスを取得
			// RaftライブラリのLeader()は自分がリーダーでなければ空を返すことがあるため、クラスタ全体としてのリーダー情報を表示する
			// waitForLeaderで取得したものを正とするか、各ノードのLeader()を信頼するか。
			// ここでは、waitForLeaderなどで特定したクラスタのリーダー情報を表示する。
			// 個々のn.LeaderAddr() n.LeaderID() はそのノードが認識しているリーダー。
			// 正しくは、各ノード n.LeaderAddr() と n.LeaderID() を使うべき。
			// Leader()が空を返すのは、そのノードがまだリーダーを知らない状態。
			currentLeaderAddr = string(n.LeaderAddr()) // n.LeaderAddr() は raft.ServerAddress (string)
			currentLeaderID = string(n.LeaderID())     // n.LeaderID() は raft.ServerID (string)
			if currentLeaderAddr == "" {
				currentLeaderAddr = "Unknown"
			}
			if currentLeaderID == "" {
				currentLeaderID = "Unknown"
			}
		}
		fmt.Printf("Node %d (%s): State=%s, IsLeader=%v, NodeRecognizedLeaderAddr=%s, NodeRecognizedLeaderID=%s\n",
			i, n.Stats()["id"], n.Stats()["state"], n.IsLeader(), currentLeaderAddr, currentLeaderID)
	}

	// シャットダウン処理
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	fmt.Println("Shutting down nodes...")
	for i := len(nodes) - 1; i >= 0; i-- { // 逆順でシャットダウン
		if err := nodes[i].Shutdown(); err != nil {
			log.Printf("Error shutting down node %s: %v", nodes[i].Stats()["id"], err)
		}
		// TCPTransportの場合、個別にCloseが必要
		if transports[i] != nil {
			// NewTCPTransport は Transport インターフェースを返すが、
			// その実体は *NetworkTransport である。
			// *NetworkTransport は Close() メソッドを持つ。
			if netTransport, ok := transports[i].(*raft.NetworkTransport); ok {
				if err := netTransport.Close(); err != nil {
					log.Printf("Error closing transport for node %s: %v", nodes[i].Stats()["id"], err)
				}
			} else {
				// もし他の種類の Transport (例えば InmemTransport) の場合、Close がないかもしれない
				log.Printf("Transport for node %s cannot be closed as *raft.NetworkTransport. Actual type: %T", nodes[i].Stats()["id"], transports[i])
			}
		}
	}
	fmt.Println("Cluster shutdown complete.")
}
