package main

import (
	"database/sql"
	"log"
	"net/http"
	"os"

	_ "github.com/go-sql-driver/mysql"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/handler/web"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infrastructure/mysql"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
)

func main() {
	// データベース接続
	db, err := sql.Open("mysql", "root:password@tcp(localhost:3306)/todo_app?parseTime=true")
	if err != nil {
		log.Fatal(err)
	}
	defer db.Close()

	// リポジトリの初期化
	todoRepo := mysql.NewTodoRepository(db)
	userRepo := mysql.NewUserRepository(db)

	// ユースケースの初期化
	todoUseCase := usecase.NewTodoUseCase(todoRepo)
	userUseCase := usecase.NewUserUseCase(userRepo)

	// Webハンドラーの初期化
	webHandler, err := web.NewWebHandler(todoUseCase, userUseCase)
	if err != nil {
		log.Fatal(err)
	}

	// ルーティングの設定
	mux := http.NewServeMux()
	webHandler.RegisterRoutes(mux)

	// 静的ファイルの提供
	fs := http.FileServer(http.Dir("static"))
	mux.Handle("/static/", http.StripPrefix("/static/", fs))

	// サーバーの起動
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	if err := http.ListenAndServe(":"+port, mux); err != nil {
		log.Fatal(err)
	}
}
