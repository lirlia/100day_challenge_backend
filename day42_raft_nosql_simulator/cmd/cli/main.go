package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/hashicorp/raft"

	"github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/raft_node"
	// "github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/store"
)

var (
	numNodes    int    = 3
	basePort    int    = 8000
	dataDirBase string = "./data"
	nodes       []*raft_node.Node
)

// SetDataDirBase はサーバーのデータディレクトリのベースパスを設定します。
// この関数は cmd/cli/root.go の serverCmd から呼び出されます。
func SetDataDirBase(newBase string) {
	if newBase != "" {
		dataDirBase = newBase
		log.Printf("Data directory base path set to: %s", dataDirBase)
	}
}

// runServer はRaftクラスタサーバーを起動・管理します。
func runServer() {
	log.Println("Starting Raft cluster server...")

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	nodes = make([]*raft_node.Node, numNodes)

	for i := 0; i < numNodes; i++ {
		nodeID := fmt.Sprintf("node%d", i)
		rpcAddr := fmt.Sprintf("127.0.0.1:%d", basePort+i)
		httpApiPortOffset := 100 // Raftポートとのオフセット
		httpApiAddr := fmt.Sprintf("127.0.0.1:%d", basePort+i+httpApiPortOffset)
		nodeDataDir := filepath.Join(dataDirBase, nodeID)

		if err := os.MkdirAll(filepath.Join(nodeDataDir, "snapshots"), 0755); err != nil {
			log.Fatalf("Failed to create snapshot directory for node %s: %v", nodeID, err)
		}

		cfg := raft_node.Config{
			NodeID:           raft.ServerID(nodeID),
			Addr:             raft.ServerAddress(rpcAddr),
			HttpApiAddr:      httpApiAddr, // HttpApiAddrを設定
			DataDir:          nodeDataDir,
			BootstrapCluster: i == 0,
		}

		transport, err := raft.NewTCPTransport(string(cfg.Addr), nil, 2, 5*time.Second, os.Stderr)
		if err != nil {
			log.Fatalf("Failed to create transport for node %s: %v", nodeID, err)
		}

		n, err := raft_node.NewNode(cfg, transport)
		if err != nil {
			log.Fatalf("Failed to create node %s: %v", nodeID, err)
		}
		nodes[i] = n
		log.Printf("Node %s created. Data dir: %s, Addr: %s, Bootstrap: %t", nodeID, nodeDataDir, rpcAddr, cfg.BootstrapCluster)
	}

	log.Println("Waiting for leader election...")
	var leaderNode *raft_node.Node

	if numNodes > 0 {
		_, err := nodes[0].WaitForLeader(15 * time.Second)
		if err != nil {
			log.Fatalf("Failed to find leader after 15 seconds: %v", err)
		}
	}

	for _, node := range nodes {
		if node.IsLeader() {
			leaderNode = node
			break
		}
	}

	if leaderNode == nil {
		log.Fatalf("No leader elected after 15 seconds")
	}
	log.Printf("Leader elected: Node ID=%s, Address=%s", leaderNode.NodeID(), leaderNode.RaftAddr())

	for _, node := range nodes {
		if node.NodeID() == leaderNode.NodeID() {
			continue
		}
		log.Printf("Attempting to add voter %s (%s) to leader %s", node.NodeID(), node.RaftAddr(), leaderNode.NodeID())
		err := leaderNode.AddVoter(node.GetConfig().NodeID, node.GetConfig().Addr, 0, 0)
		if err != nil {
			log.Printf("Warning: failed to add voter %s to cluster: %v", node.NodeID(), err)
		} else {
			log.Printf("Node %s added to cluster as voter.", node.NodeID())
		}
	}

	for i, node := range nodes {
		time.Sleep(1 * time.Second)
		status := node.Stats()
		leaderID, leaderAddr := node.LeaderWithID()
		log.Printf("Node %d (%s): State=%s, IsLeader=%t, Term=%s, LastLogIndex=%s, RecognizedLeaderAddr=%s, RecognizedLeaderID=%s",
			i, node.NodeID(), status["state"], node.IsLeader(), status["term"], status["last_log_index"], leaderAddr, leaderID)
	}

	log.Println("Raft cluster server is running. Press Ctrl+C to shutdown.")

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-ctx.Done():
		log.Println("Server context cancelled.")
	case s := <-sigCh:
		log.Printf("Received signal: %v. Shutting down...", s)
	}

	for i := len(nodes) - 1; i >= 0; i-- {
		n := nodes[i]
		log.Printf("Shutting down node %s...", n.NodeID())
		if err := n.Shutdown(); err != nil {
			log.Printf("Error shutting down node %s: %v", n.NodeID(), err)
		} else {
			log.Printf("Node %s shutdown complete.", n.NodeID())
		}
		if transportToClose, ok := n.Transport().(interface{ Close() error }); ok {
			if err := transportToClose.Close(); err != nil {
				log.Printf("Error closing transport for node %s: %v", n.NodeID(), err)
			}
		}
	}
	log.Println("All nodes shut down. Exiting.")
}

// serverCmd はサーバーを起動するためのコマンド (明示的に指定する場合)
// この定義は root.go に移管する
// var serverCmd = &cobra.Command{
// 	Use:   "server",
// 	Short: "Starts the Raft NoSQL database server cluster",
// 	Run: func(cmd *cobra.Command, args []string) {
// 		runServer()
// 	},
// }

// rootCmd の定義と init() は root.go に移管する
// var rootCmd = &cobra.Command{...}
// func init() {...}

func main() {
	Execute() // root.go で定義された Execute を呼び出す
}
