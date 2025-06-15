package main

import (
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/internal/namenode"
	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/config"
)

func main() {
	var configPath = flag.String("config", "", "path to config file")
	flag.Parse()

	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("Starting NameNode...")

	// 設定を読み込み
	cfg, err := config.LoadConfig(*configPath)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}

	// NameNodeサーバーを作成
	server, err := namenode.NewServer(cfg)
	if err != nil {
		log.Fatalf("Failed to create NameNode server: %v", err)
	}

	// グレースフルシャットダウンの設定
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// サーバーをバックグラウンドで開始
	go func() {
		if err := server.Start(); err != nil {
			log.Fatalf("Failed to start NameNode server: %v", err)
		}
	}()

	// シャットダウンシグナルを待機
	<-sigChan
	log.Println("Shutting down NameNode...")
	server.Stop()
	log.Println("NameNode stopped")
}
