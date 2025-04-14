// cmd/server/main.go
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	// 追加
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infra/datastore"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infrastructure/server" // infra/server を使う
)

func main() {
	// === ロガーの設定 ===
	logLevel := slog.LevelInfo // デフォルトは Info
	if os.Getenv("LOG_LEVEL") == "DEBUG" {
		logLevel = slog.LevelDebug
	}
	logger := slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: logLevel}))
	slog.SetDefault(logger)
	slog.Info("logger initialized", "level", logLevel.String())

	// === 設定の読み込み (環境変数から) ===
	dbCfg := datastore.DBConfig{
		User:     getEnv("DB_USER", "user"),
		Password: getEnv("DB_PASSWORD", "password"),
		Host:     getEnv("DB_HOST", "127.0.0.1"), // Docker Compose のサービス名ではなく localhost を参照
		Port:     getEnv("DB_PORT", "3306"),      // docker-compose.yml で公開したポート
		DBName:   getEnv("DB_NAME", "todo_app_db"),
		Charset:  getEnv("DB_CHARSET", "utf8mb4"),
		Loc:      getEnv("DB_LOC", "Local"),
	}
	serverCfg := server.Config{
		Addr:   ":" + getEnv("PORT", "8080"),
		DBConf: dbCfg,
	}
	slog.Info("configuration loaded", "serverAddr", serverCfg.Addr, "dbHost", dbCfg.Host, "dbPort", dbCfg.Port, "dbName", dbCfg.DBName)

	// === サーバーの初期化 (依存性注入) ===
	srv, err := server.NewServer(serverCfg) // DI コンテナがあればそれを使うのが望ましい
	if err != nil {
		slog.Error("failed to initialize server", "error", err)
		os.Exit(1)
	}

	// === シグナルハンドリングとサーバー起動/シャットダウン ===
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	// サーバーの起動とシャットダウン完了待機
	if err := srv.Start(ctx); err != nil {
		slog.Error("server execution failed", "error", err)
		os.Exit(1)
	}

	slog.Info("application finished")
}

// getEnv は環境変数を取得し、なければデフォルト値を返します。
func getEnv(key, fallback string) string {
	if value, ok := os.LookupEnv(key); ok {
		return value
	}
	slog.Debug("environment variable not set, using fallback", "key", key, "fallback", fallback)
	return fallback
}
