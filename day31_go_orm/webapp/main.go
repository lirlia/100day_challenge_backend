package main

import (
	"context"
	"database/sql"
	"html/template"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	// 作成した ORM パッケージをインポート
	"github.com/lirlia/100day_challenge_backend/day31_go_orm/orm"
)

const webappDBFile = "./webapp.db"
const templatesDir = "templates"

// User 構造体 (ORM テストと同じものを Web アプリ用に定義)
type User struct {
	ID        int64          `db:"id"`
	Name      string         `db:"name"`
	Email     sql.NullString `db:"email"`
	CreatedAt time.Time      `db:"created_at"`
	UpdatedAt time.Time      `db:"updated_at"`
}

var db *orm.DB
var templates *template.Template

func main() {
	var err error
	// --- データベース初期化 ---
	// アプリケーション用に新しい DB ファイルを使用
	// 既存ファイルがあれば削除 (開発用)
	_ = os.Remove(webappDBFile)

	db, err = orm.Open(webappDBFile)
	if err != nil {
		log.Fatalf("FATAL: Failed to open database: %v", err)
	}
	defer db.Close()
	log.Println("Database connected.")

	// テーブル作成 (存在しない場合)
	if err := setupSchema(context.Background()); err != nil {
		log.Fatalf("FATAL: Failed to setup database schema: %v", err)
	}
	log.Println("Database schema ready.")

	// --- テンプレートのパース ---
	templates, err = template.ParseGlob(templatesDir + "/*.html")
	if err != nil {
		log.Fatalf("FATAL: Failed to parse templates: %v", err)
	}
	log.Println("HTML templates parsed.")

	// --- HTTP ハンドラの設定 ---
	http.HandleFunc("/", indexHandler)
	http.HandleFunc("/add", addUserHandler)
	http.HandleFunc("/delete", deleteUserHandler)

	// --- サーバー起動 ---
	port := "8080"
	log.Printf("Starting server on :%s", port)
	if err := http.ListenAndServe(":"+port, nil); err != nil {
		log.Fatalf("FATAL: Failed to start server: %v", err)
	}
}

// setupSchema はデータベーススキーマ (users テーブル) を作成します。
func setupSchema(ctx context.Context) error {
	_, err := db.Exec(ctx, `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT UNIQUE,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`)
	return err
}

// --- HTTP ハンドラ関数 ---

// indexHandler はユーザー一覧を表示します。
func indexHandler(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	log.Printf("Handler: GET %s", r.URL.Path)

	ctx := r.Context()
	var users []User
	err := db.Select(ctx, &users, "SELECT * FROM users ORDER BY id DESC")
	if err != nil {
		log.Printf("ERROR: Failed to fetch users: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// データをテンプレートに渡してレンダリング
	data := map[string]interface{}{
		"Users": users,
	}
	err = templates.ExecuteTemplate(w, "index.html", data)
	if err != nil {
		log.Printf("ERROR: Failed to execute template index.html: %v", err)
		// エラーが発生してもヘッダーは書き込まれている可能性があるので http.Error は使わない
	}
}

// addUserHandler は新しいユーザーを追加します。
func addUserHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	log.Printf("Handler: POST %s", r.URL.Path)

	if err := r.ParseForm(); err != nil {
		log.Printf("ERROR: Failed to parse form: %v", err)
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}

	name := r.FormValue("name")
	email := r.FormValue("email")

	if name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	newUser := User{Name: name}
	if email != "" {
		newUser.Email = sql.NullString{String: email, Valid: true}
	}

	ctx := r.Context()
	_, err := db.Insert(ctx, &newUser)
	if err != nil {
		log.Printf("ERROR: Failed to insert user: %v", err)
		// email UNIQUE 制約違反の可能性など
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			http.Error(w, "Email already exists", http.StatusBadRequest)
		} else {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
		return
	}

	log.Printf("INFO: User added: Name=%s, Email=%s", name, email)
	// 追加後は一覧ページにリダイレクト
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// deleteUserHandler は指定された ID のユーザーを削除します。
func deleteUserHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	log.Printf("Handler: POST %s", r.URL.Path)

	// シンプルにするため、ID はフォームの値から取得
	if err := r.ParseForm(); err != nil {
		log.Printf("ERROR: Failed to parse delete form: %v", err)
		http.Error(w, "Bad Request", http.StatusBadRequest)
		return
	}
	idStr := r.FormValue("id")
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		log.Printf("ERROR: Invalid ID format: %v", err)
		http.Error(w, "Invalid ID", http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	result, err := db.Delete(ctx, "DELETE FROM users WHERE id = ?", id)
	if err != nil {
		log.Printf("ERROR: Failed to delete user with ID %d: %v", id, err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		log.Printf("WARN: No user found with ID %d to delete", id)
		// エラーにはしないがログは残す
	}

	log.Printf("INFO: User deleted: ID=%d", id)
	// 削除後は一覧ページにリダイレクト
	http.Redirect(w, r, "/", http.StatusSeeOther)
}
