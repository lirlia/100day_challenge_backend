package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"os/signal"
	"syscall"

	_ "github.com/go-sql-driver/mysql"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infrastructure/mysql"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infrastructure/server"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
)

func initDB() *sql.DB {
	db, err := sql.Open("mysql", "root:password@tcp(localhost:3306)/todo?parseTime=true")
	if err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatalf("Failed to ping database: %v", err)
	}

	return db
}

func main() {
	// 依存関係の初期化
	db := initDB()
	todoRepo := mysql.NewTodoRepository(db)
	todoUsecase := usecase.NewTodoUsecase(todoRepo)

	// サーバーの初期化
	srv, err := server.NewServer(todoUsecase)
	if err != nil {
		log.Fatalf("Failed to initialize server: %v", err)
	}

	// シグナルハンドリングの設定
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// サーバーの起動
	if err := srv.Start(ctx); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
