package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/web"
)

var routerMgr *router.RouterManager

func main() {
	log.Println("Starting virtual router application with web management...")

	routerMgr = router.NewRouterManager()

	// 初期ルーターとリンクのセットアップ (例)
	// Web UIから追加・削除できるようにするため、ここでは最小限にするか、設定ファイルから読み込む等を将来的に検討
	_, err := routerMgr.AddRouter("R1", "10.0.1.1/24", router.DefaultMTU)
	if err != nil {
		log.Fatalf("Failed to add initial router R1: %v", err)
	}
	log.Println("main: Router R1 added successfully.")

	_, err = routerMgr.AddRouter("R2", "10.0.2.1/24", router.DefaultMTU)
	if err != nil {
		log.Fatalf("Failed to add initial router R2: %v", err)
	}
	log.Println("main: Router R2 added successfully.")

	// リンク用のIPアドレスを、各ルータのTUN IPとは異なるセグメントにする
	// 例えば、R1-R2間リンクを 10.255.0.1 と 10.255.0.2 で構成
	err = routerMgr.AddLinkBetweenRouters("R1", "R2", "10.255.0.1", "10.255.0.2", 10)
	if err != nil {
		log.Fatalf("Failed to add initial link R1-R2: %v", err)
	}
	log.Println("main: Link R1-R2 added successfully.")

	// Webサーバーの設定と起動
	log.Println("main: About to register web handlers...")
	web.RegisterHandlers(routerMgr)

	port := "8080"
	log.Printf("Starting web management interface on :%s", port)
	go func() {
		log.Println("Web server goroutine started. Attempting to listen on port " + port)
		err := http.ListenAndServe(":"+port, nil)
		if err != nil {
			log.Fatalf("FATAL: Failed to start web server: %v", err)
		}
		log.Println("Web server ListenAndServe finished without error (this should not happen normally).")
	}()

	// Give the goroutine a moment to start and potentially fail
	time.Sleep(100 * time.Millisecond)

	log.Println("Application started. Routers are running. Web UI at http://localhost:8080. Press Ctrl+C to stop.")

	// Ctrl+Cなどのシグナルを待機してクリーンアップ
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	<-sigChan

	log.Println("Shutting down application...")
	// Stop all routers managed by routerMgr
	// This needs a method in RouterManager or iterate here
	activeRouters := routerMgr.ListRouters()
	for _, r := range activeRouters {
		log.Printf("Stopping router %s via manager...", r.ID)
		if err := routerMgr.RemoveRouter(r.ID); err != nil {
			log.Printf("Error stopping/removing router %s: %v", r.ID, err)
		}
	}

	log.Println("Virtual router application stopped.")
}
