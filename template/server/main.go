package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/internal/infrastructure/server"
)

func main() {
	// ロガーの設定
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// サーバーの初期化
	srv, err := server.NewServer()
	if err != nil {
		slog.Error("failed to initialize server", "error", err)
		os.Exit(1)
	}

	// シグナルハンドリングの設定
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	slog.Info("starting server on :8080")

	// サーバーの起動
	if err := srv.Start(ctx); err != nil {
		slog.Error("failed to start server", "error", err)
		os.Exit(1)
	}

	// 追加: サーバーのシャットダウン完了を待機
	<-ctx.Done()
}