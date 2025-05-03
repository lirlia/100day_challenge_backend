# Day 31: Go Simple ORM for SQLite

`database/sql` インターフェースに準拠した SQLite 向けのシンプルな ORM ライブラリを作成します。

## 仕様

1.  **ターゲットDB:** SQLite
2.  **基本インターフェース:** `database/sql` の標準インターフェースを内部で利用し、ラップする形で提供します。
3.  **コア機能:**
    *   SQLite データベースへの接続・切断 (`Open`, `Close`, `PingContext`)。
    *   Go の構造体とデータベーステーブル間の基本的なマッピング。
        *   構造体のフィールドには `db:"column_name"` タグを付与してカラム名を指定できるようにします。
    *   基本的な CRUD 操作:
        *   `Insert(ctx context.Context, data interface{}) (sql.Result, error)`: 構造体データから INSERT 文を生成して実行。
        *   `SelectOne(ctx context.Context, dest interface{}, query string, args ...interface{}) error`: 指定されたクエリを実行し、結果を構造体にマッピング (単一レコード)。
        *   `Select(ctx context.Context, dest interface{}, query string, args ...interface{}) error`: 指定されたクエリを実行し、結果を構造体のスライスにマッピング (複数レコード)。`dest` はスライスへのポインタである必要があります。
        *   `Update(ctx context.Context, query string, args ...interface{}) (sql.Result, error)`: 指定された UPDATE 文を実行。
        *   `Delete(ctx context.Context, query string, args ...interface{}) (sql.Result, error)`: 指定された DELETE 文を実行。
    *   基本的なトランザクション管理 (`BeginTx`, `Commit`, `Rollback`)。トランザクション内でも同様の CRUD 操作を提供。
    *   `sql.Null*` 型およびポインタ型による NULL 値のハンドリングをサポート。
4.  **構造体マッピングの詳細:**
    *   `reflect` パッケージを利用して構造体のフィールドとタグを解析します。
    *   `db:"-"` タグが付与されたフィールドは無視します。
    *   タグがない場合はフィールド名をそのままカラム名とみなします (スネークケース変換は行いません)。明示的なタグ指定を推奨します。
5.  **エラーハンドリング:** `database/sql` が返すエラーをそのまま返すか、必要に応じてラップします。
6.  **非機能要件:**
    *   シンプルさ: 薄いラッパーを目指します。
    *   依存性: `github.com/mattn/go-sqlite3` のみ。

## スコープ外

*   複雑なクエリビルダ
*   リレーションシップの自動解決
*   マイグレーション機能
*   フック (BeforeSave, AfterFind など)
*   バルク操作の最適化
*   高度なコネクションプーリング設定
*   カスタムロギング機能
*   自動スキーマ生成・同期

## 使い方

```go
package main

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/lirlia/100day_challenge_backend/day31_go_orm/orm"
	// SQLite3 driver is implicitly used by the orm package
	// _ "github.com/mattn/go-sqlite3"
)

type User struct {
	ID        int64          `db:"id"`
	Name      string         `db:"name"`
	Email     sql.NullString `db:"email"` // NULL を許容するカラム
	CreatedAt time.Time      `db:"created_at"` // DB側でデフォルト値設定
	UpdatedAt time.Time      `db:"updated_at"` // DB側でデフォルト値設定
}

func main() {
	// テスト用に既存のDBファイルを削除
	_ = os.Remove("./example.db")

	db, err := orm.Open("./example.db") // orm.Open を使用
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}
	defer db.Close()

	ctx := context.Background()

	// テーブル作成 (初回のみ)
	// Exec メソッドを使ってスキーマを準備
	_, err = db.Exec(ctx, `
	CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT UNIQUE, -- Email は NULL を許容し、ユニーク制約を持つ
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`)
	if err != nil {
		log.Fatalf("Failed to create table: %v", err)
	}

	// --- Insert --- 
	fmt.Println("--- Insert --- ")
	newUser := User{Name: "Alice", Email: sql.NullString{String: "alice@example.com", Valid: true}}
	result, err := db.Insert(ctx, &newUser) // Insert にはポインタを渡す
	if err != nil {
		log.Fatalf("Failed to insert user: %v", err)
	}
	lastInsertID, _ := result.LastInsertId()
	fmt.Printf("Inserted user 'Alice' with ID: %d\n", lastInsertID)
	// 注意: Insert メソッドは挿入した構造体に ID を設定しません。
	// 必要であれば LastInsertId() を使って取得します。
	newUser.ID = lastInsertID

	// NULL Email のユーザーも挿入
	nullEmailUser := User{Name: "Bob"}
	resBob, err := db.Insert(ctx, &nullEmailUser)
	if err != nil {
		log.Fatalf("Failed to insert user Bob: %v", err)
	}
	bobID, _ := resBob.LastInsertId()
	fmt.Printf("Inserted user 'Bob' (NULL email) with ID: %d\n", bobID)

	// --- SelectOne --- 
	fmt.Println("\n--- SelectOne --- ")
	var fetchedUser User
	err = db.SelectOne(ctx, &fetchedUser, "SELECT * FROM users WHERE id = ?", lastInsertID) // Alice を取得
	if err != nil {
		log.Fatalf("Failed to select user Alice: %v", err)
	}
	fmt.Printf("Fetched user Alice: %+v\n", fetchedUser)

	var fetchedBob User
	err = db.SelectOne(ctx, &fetchedBob, "SELECT * FROM users WHERE id = ?", bobID) // Bob を取得
	if err != nil {
		log.Fatalf("Failed to select user Bob: %v", err)
	}
	fmt.Printf("Fetched user Bob: %+v\n", fetchedBob)

	// 存在しないユーザー
	var notFoundUser User
	err = db.SelectOne(ctx, &notFoundUser, "SELECT * FROM users WHERE id = ?", 999)
	if err == sql.ErrNoRows {
		fmt.Println("Successfully confirmed non-existent user returns sql.ErrNoRows")
	} else if err != nil {
		log.Fatalf("Error selecting non-existent user: %v", err)
	} else {
		log.Fatalf("Expected sql.ErrNoRows, but got a user: %+v", notFoundUser)
	}

	// --- Update --- 
	fmt.Println("\n--- Update --- ")
	// Insert another user (within a transaction)
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		log.Fatalf("Failed to begin transaction: %v", err)
	}
	bob := User{Name: "Bob"}
	_, err = tx.Insert(ctx, &bob)
	if err != nil {
		log.Printf("Failed to insert Bob, rolling back: %v", err)
		tx.Rollback() // エラー時はロールバック
		return
	}
	err = tx.Commit() // 成功したらコミット
	if err != nil {
		log.Fatalf("Failed to commit transaction: %v", err)
	}
	fmt.Println("Inserted Bob within a transaction")


	// Select multiple users
	var users []User
	err = db.Select(ctx, &users, "SELECT * FROM users ORDER BY id")
	if err != nil {
		log.Fatalf("Failed to select users: %v", err)
	}
	fmt.Println("All users:")
	for _, u := range users {
		fmt.Printf("  %+v
", u)
	}

	// Delete
	_, err = db.Delete(ctx, "DELETE FROM users WHERE id = ?", lastInsertID)
	if err != nil {
		log.Fatalf("Failed to delete user: %v", err)
	}
	fmt.Println("User deleted")
}

``` 
