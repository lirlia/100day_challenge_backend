package main

import (
	"fmt"
	"log"
	"os"
	"time"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/model"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infra/datastore"
	"gorm.io/gorm"
)

func main() {
	fmt.Println("Starting database seeder...")

	// データベース接続設定の読み込み (環境変数から)
	// server/main.go と同様の方法
	user := os.Getenv("MYSQL_USER")
	if user == "" {
		user = "user"
	}
	password := os.Getenv("MYSQL_PASSWORD")
	if password == "" {
		password = "password"
	}
	host := os.Getenv("DB_HOST")
	if host == "" {
		host = "127.0.0.1" // 通常は docker-compose 内のサービス名 (例: "db") を使うことが多い
	}
	port := os.Getenv("DB_PORT")
	if port == "" {
		port = "3306"
	}
	dbname := os.Getenv("MYSQL_DATABASE")
	if dbname == "" {
		dbname = "app"
	}

	config := datastore.DBConfig{
		User:     user,
		Password: password,
		Host:     host,
		Port:     port,
		DBName:   dbname,
	}

	// データベース接続
	db, err := datastore.NewDB(config)
	if err != nil {
		log.Fatalf("failed to connect database: %v", err)
	}

	fmt.Println("Database connection successful.")

	// ユーザーデータの投入 (存在しない場合)
	seedUsers(db)

	// ToDo データの投入 (User ID 1 に 100件)
	seedTodos(db, 1, 100) // User ID 1 に 100 件

	fmt.Println("Database seeding completed successfully.")
}

// seedUsers は初期ユーザーデータを投入します
func seedUsers(db *gorm.DB) {
	users := []model.User{
		{Name: "User A"}, // ID: 1 になる想定
		{Name: "User B"}, // ID: 2
		{Name: "User C"}, // ID: 3
	}

	for _, user := range users {
		// 既に同じ名前のユーザーが存在するか確認 (簡易的)
		var existingUser model.User
		if err := db.Where("name = ?", user.Name).First(&existingUser).Error; err == nil {
			fmt.Printf("User '%s' (ID: %d) already exists, skipping.\n", existingUser.Name, existingUser.ID)
			continue // 存在すればスキップ
		}

		// 存在しない場合のみ作成
		if err := db.Create(&user).Error; err != nil {
			log.Printf("failed to seed user %s: %v\n", user.Name, err)
		} else {
			fmt.Printf("Seeded user: %s (ID: %d)\n", user.Name, user.ID)
		}
	}
}

// seedTodos は指定されたユーザーIDに紐づくToDoデータを指定された件数投入します
func seedTodos(db *gorm.DB, userID int64, count int) {
	fmt.Printf("Seeding %d todos for user ID %d...\n", count, userID)

	// 既存の指定ユーザーの ToDo を削除 (毎回クリーンな状態にするため)
	fmt.Printf("Deleting existing todos for user ID %d...\n", userID)
	result := db.Where("user_id = ?", userID).Delete(&model.Todo{})
	if result.Error != nil {
		log.Printf("Failed to delete existing todos for user ID %d: %v\n", userID, result.Error)
		// エラーが発生しても続行する
	} else {
		fmt.Printf("Deleted %d existing todos for user ID %d.\n", result.RowsAffected, userID)
	}

	var todos []model.Todo
	for i := 1; i <= count; i++ {
		todos = append(todos, model.Todo{
			UserID:      userID,
			Title:       fmt.Sprintf("Test ToDo %03d for User %d", i, userID), // %03d でゼロ埋め
			Description: fmt.Sprintf("This is the description for test todo %d.", i),
			Status:      model.TodoStatusInProgress, // デフォルトステータス
			CreatedAt:   time.Now(),
			UpdatedAt:   time.Now(),
			// ArchivedAt は NULL (gorm.DeletedAt のゼロ値)
		})
	}

	// バルクインサート
	if err := db.CreateInBatches(todos, 50).Error; err != nil { // 50件ずつ分割して挿入
		log.Fatalf("failed to seed todos: %v", err)
	}

	fmt.Printf("Successfully seeded %d todos for user ID %d.\n", count, userID)
}
