package main

import (
	"context"
	"database/sql"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/go-sql-driver/mysql"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infrastructure/mysql"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infrastructure/server"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
)

func initDB() *sql.DB {
	dsn := "root:password@tcp(localhost:3306)/todo?parseTime=true"
	var db *sql.DB
	var err error

	maxRetries := 5
	for i := 0; i < maxRetries; i++ {
		db, err = sql.Open("mysql", dsn)
		if err != nil {
			slog.Warn("Failed to open database connection", "error", err, "retry", i+1)
			time.Sleep(5 * time.Second)
			continue
		}

		err = db.Ping()
		if err == nil {
			slog.Info("Successfully connected to database")
			return db
		}

		slog.Warn("Failed to ping database", "error", err, "retry", i+1)
		db.Close()
		time.Sleep(5 * time.Second)
	}

	slog.Error("Failed to connect to database after multiple retries", "error", err)
	os.Exit(1)
	return nil
}

func main() {
	// ロガーの設定
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	slog.SetDefault(logger)

	// 依存関係の初期化
	db := initDB()
	todoRepo := mysql.NewTodoRepository(db)
	userRepo := mysql.NewUserRepository(db)
	todoUsecase := usecase.NewTodoUsecase(todoRepo, userRepo)

	// サーバーの初期化
	srv, err := server.NewServer(todoUsecase)
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