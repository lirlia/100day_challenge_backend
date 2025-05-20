package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	// "time" // time.Sleep が不要になるのでコメントアウト可能

	"github.com/gorilla/mux"
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
	muxRouter := mux.NewRouter()
	log.Println("main: About to register web handlers...")
	web.RegisterHandlers(muxRouter, routerMgr)

	log.Println("---------------- REGISTERED ROUTES START ----------------")
	// 'router' 変数名を 'rt' に変更 (引数名がパッケージ名と衝突するため)
	err = muxRouter.Walk(func(route *mux.Route, rt *mux.Router, ancestors []*mux.Route) error {
		pathTemplate, _ := route.GetPathTemplate()
		methods, _ := route.GetMethods()
		log.Printf("ROUTE: Path: %s, Methods: %v", pathTemplate, methods)
		return nil
	})
	if err != nil {
		log.Printf("Error walking routes: %v", err)
	}
	log.Println("---------------- REGISTERED ROUTES END ------------------")

	port := "8080"
	log.Printf("Starting web management interface on :%s (This will block. Press Ctrl+C to stop here in the terminal)", port)

	// シグナルハンドリングを ListenAndServe の前に設定するか、ListenAndServe がエラーで終了した後にクリーンアップを実行する形にする
	// ここではシンプルにするため、ListenAndServe の後にクリーンアップが来るようにするが、
	// 実際には ListenAndServe が正常終了することは稀（エラー発生時のみ）。
	// したがって、シグナルハンドリングは別のgoroutineで行うのが一般的。
	// 今回のデバッグ目的では、サーバーがCtrl+Cで停止すればよしとする。
	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		<-stopChan // シグナルを待機
		log.Println("Shutting down application via signal...")
		// Stop all routers managed by routerMgr
		activeRouters := routerMgr.ListRouters()
		for _, r := range activeRouters {
			log.Printf("Stopping router %s via manager...", r.ID)
			if err := routerMgr.RemoveRouter(r.ID); err != nil {
				log.Printf("Error stopping/removing router %s: %v", r.ID, err)
			}
		}
		log.Println("Virtual router application stopped by signal.")
		os.Exit(0) // シグナルで正常終了
	}()

	// http.ListenAndServe をメインスレッドで直接呼び出す
	serverErr := http.ListenAndServe(":"+port, muxRouter)
	if serverErr != nil && serverErr != http.ErrServerClosed { // ErrServerClosed は Shutdown() 時に発生するので無視
		log.Fatalf("FATAL: Failed to start web server: %v", serverErr)
	}
	log.Println("Server execution finished.") // 通常ここには来ないか、Shutdown後に来る
}
