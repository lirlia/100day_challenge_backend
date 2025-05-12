package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day43_virtual_router/lib/router"
	"github.com/lirlia/100day_challenge_backend/day43_virtual_router/lib/web"
)

func main() {
	// コマンドライン引数の処理
	configFile := flag.String("config", "config.json", "設定ファイルのパス")
	webPort := flag.Int("web-port", 3001, "Webサーバーのポート")
	flag.Parse()

	// ロガーの設定
	log.SetOutput(os.Stdout)
	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Println("仮想ルーターシミュレーター起動中...")

	// ルーターマネージャーの初期化
	// 設定ファイルからルータートポロジーを読み込む
	rm, err := router.NewRouterManager(*configFile)
	if err != nil {
		log.Fatalf("ルーターマネージャーの初期化に失敗: %v", err)
	}

	// シグナルハンドラの設定
	signalCh := make(chan os.Signal, 1)
	signal.Notify(signalCh, syscall.SIGINT, syscall.SIGTERM)

	// ルーターマネージャーを起動
	if err := rm.Start(); err != nil {
		log.Fatalf("ルーターマネージャーの起動に失敗: %v", err)
	}
	defer rm.Stop()

	// Webサーバーの起動
	webServer := web.NewServer(*webPort, rm)
	go func() {
		log.Printf("Webサーバーを起動: http://localhost:%d", *webPort)
		if err := webServer.Start(); err != nil {
			log.Fatalf("Webサーバーの起動に失敗: %v", err)
		}
	}()

	// シグナルを受け取るまで待機
	sig := <-signalCh
	fmt.Printf("\n%sシグナルを受信. 終了処理を開始します...\n", sig)
}
