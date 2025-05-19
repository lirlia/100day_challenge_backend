package main

import (
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
)

func main() {
	log.Println("Starting virtual router application...")

	// ルーター1の設定
	r1ID := "R1"
	r1IPNetStr := "10.0.1.1/24"
	r1TunMTU := router.DefaultMTU
	r1LinkIPToR2 := net.ParseIP("192.168.0.1")

	// ルーター2の設定
	r2ID := "R2"
	r2IPNetStr := "10.0.2.1/24"
	r2TunMTU := router.DefaultMTU
	r2LinkIPToR1 := net.ParseIP("192.168.0.2")

	// ルーターインスタンスの作成
	r1, err := router.NewRouter(r1ID, r1IPNetStr, r1TunMTU)
	if err != nil {
		log.Fatalf("Failed to create router %s: %v", r1ID, err)
	}
	r2, err := router.NewRouter(r2ID, r2IPNetStr, r2TunMTU)
	if err != nil {
		log.Fatalf("Failed to create router %s: %v", r2ID, err)
	}

	// ルーター間リンク用のチャネル作成 (双方向)
	// R1 -> R2
	r1ToR2Chan := make(chan []byte, 128)
	// R2 -> R1
	r2ToR1Chan := make(chan []byte, 128)

	linkCost := 10

	// R1にR2へのリンクを追加
	err = r1.AddNeighborLink(r1LinkIPToR2, r2LinkIPToR1, r2ID, r1ToR2Chan, r2ToR1Chan, linkCost)
	if err != nil {
		log.Fatalf("Router %s: Failed to add neighbor link to %s: %v", r1ID, r2ID, err)
	}
	log.Printf("Router %s: Added link to %s (R1:%s <-> R2:%s)", r1ID, r2ID, r1LinkIPToR2, r2LinkIPToR1)

	// R2にR1へのリンクを追加 (チャネルは逆方向になる)
	err = r2.AddNeighborLink(r2LinkIPToR1, r1LinkIPToR2, r1ID, r2ToR1Chan, r1ToR2Chan, linkCost)
	if err != nil {
		log.Fatalf("Router %s: Failed to add neighbor link to %s: %v", r2ID, r1ID, err)
	}
	log.Printf("Router %s: Added link to %s (R2:%s <-> R1:%s)", r2ID, r1ID, r2LinkIPToR1, r1LinkIPToR2)

	// ルーターを起動
	if err := r1.Start(); err != nil {
		log.Fatalf("Failed to start router %s: %v", r1ID, err)
	}
	if err := r2.Start(); err != nil {
		log.Fatalf("Failed to start router %s: %v", r2ID, err)
	}

	log.Printf("Routers %s and %s started. TUN interfaces: %s (%s), %s (%s). Press Ctrl+C to stop.",
		r1.ID, r2.ID,
		r1.TUNInterface.Name(), r1.IPAddress.String(),
		r2.TUNInterface.Name(), r2.IPAddress.String(),
	)

	// Ctrl+Cなどのシグナルを待機してクリーンアップ
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down routers...")
	if err := r1.Stop(); err != nil {
		log.Printf("Error stopping router %s: %v", r1ID, err)
	}
	if err := r2.Stop(); err != nil {
		log.Printf("Error stopping router %s: %v", r2ID, err)
	}

	log.Println("Virtual router application stopped.")
}
