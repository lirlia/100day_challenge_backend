package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/lirlia/100day_challenge_backend/day50_go_proxy/config"
	"github.com/lirlia/100day_challenge_backend/day50_go_proxy/db"
	"github.com/lirlia/100day_challenge_backend/day50_go_proxy/proxy"
)

func main() {
	// 設定ファイルの読み込み
	cfgPath := "config/config.yml"
	if len(os.Args) > 1 {
		cfgPath = os.Args[1]
	}

	cfg, err := config.LoadConfig(cfgPath)
	if err != nil {
		log.Fatalf("設定ファイルの読み込みに失敗しました: %v", err)
	}

	// データベースの初期化 (キャッシュが有効な場合)
	if cfg.Cache.Enabled {
		if err := db.InitDB(cfg.Cache.SQLitePath); err != nil {
			log.Fatalf("データベースの初期化に失敗しました: %v", err)
		}
		defer db.CloseDB()
	}

	// CertManager の初期化
	certManager, err := proxy.NewCertManager(cfg.Proxy.CACertPath, cfg.Proxy.CAKeyPath)
	if err != nil {
		log.Fatalf("CertManager の初期化に失敗しました: %v", err)
	}

	// プロキシサーバーのハンドラを定義
	server := &http.Server{
		Addr: fmt.Sprintf("%s:%d", cfg.Proxy.Host, cfg.Proxy.Port),
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodConnect {
				proxy.HandleHTTPS(w, r, certManager, &cfg.Cache)
			} else {
				proxy.HandleHTTP(w, r, &cfg.Cache)
			}
		}),
	}

	// グレースフルシャットダウンのための準備
	go func() {
		log.Printf("プロキシサーバーを %s で起動します", server.Addr)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("%s でリッスンできませんでした: %v\n", server.Addr, err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	log.Println("プロキシサーバーをシャットダウンしています...")

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Fatalf("サーバーシャットダウンに失敗しました: %+v", err)
	}
	log.Println("プロキシサーバーは正常にシャットダウンしました")
}
