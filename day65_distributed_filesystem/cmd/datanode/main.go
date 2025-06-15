package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/internal/datanode"
	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/config"
)

func main() {
	var configPath = flag.String("config", "", "path to config file")
	var nodeID = flag.String("id", "datanode1", "DataNode ID")
	var port = flag.Int("port", 9001, "DataNode port")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Printf("Starting DataNode %s...", *nodeID)

	// 設定を読み込み
	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// DataNode固有の設定を適用
	cfg = config.DataNodeConfigWithID(cfg, *nodeID, *port)

	// DataNodeサーバーを作成
	server, err := datanode.NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create DataNode server: %v", err)
	}

	// グレースフルシャットダウンの設定
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// サーバーをバックグラウンドで開始
	go func() {
		if err := server.Start(); err != nil {
			log.Fatalf("Failed to start DataNode server: %v", err)
		}
	}()

	// シャットダウンシグナルを待機
	<-sigChan
	log.Printf("Shutting down DataNode %s...", *nodeID)
	server.Stop()
	log.Printf("DataNode %s stopped", *nodeID)
}
