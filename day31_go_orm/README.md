# Day 31: Go Simple ORM and CLI

SQLite 向けのシンプルな ORM ライブラリ (`orm` パッケージ) と、それを利用するインタラクティブな CLI シェル (`cli` パッケージ) を作成します。

https://github.com/user-attachments/assets/9c99a7f1-3e65-40b3-bfcd-9126a5d370de

[100日チャレンジ day31](https://zenn.dev/gin_nazo/scraps/2052f7288bad3c)

## ORM ライブラリ (`orm` パッケージ)

### コア機能

*   SQLite データベースへの接続・切断 (`Open`, `Close`, `PingContext`)。
*   基本的なトランザクション管理 (`BeginTx`, `Commit`, `Rollback`)。
*   Go の構造体とデータベーステーブル間のマッピング。
    *   構造体のフィールドには `db:"column_name"` タグを付与してカラム名を指定。
    *   `orm:"-"` タグでフィールドを無視。
    *   `orm:"pk"` タグで主キーを指定。
    *   `orm:"hasmany:fk_column"` や `orm:"belongsTo:fk_column"` タグでリレーションを定義（Preload 用）。
*   基本的な CRUD 操作 (`Insert`, `Update`, `Delete`, `SelectOne`, `Select`)。
    *   `Insert` は成功時に構造体の主キーフィールドに自動で ID を設定します。
*   `sql.Null*` 型およびポインタ型による NULL 値のハンドリング。
*   `reflect` パッケージを利用した動的な SQL 生成とデータマッピング。

### Query Builder

SQL クエリの生成を補助するシンプルな Query Builder を提供します。

*   `db.Model(&User{})`: 操作対象のモデル（構造体のポインタ）を指定します。
*   `Table("custom_users")`: (オプション) モデル名から推測されるテーブル名以外を使用する場合に指定します。
*   `Where("id = ? AND name = ?", 1, "Alice")`: WHERE 句を指定します。プレースホルダ (`?`) を使用できます。
*   `Order("created_at DESC")`: ORDER BY 句を指定します。
*   `Limit(10)`: LIMIT 句を指定します。
*   `Offset(20)`: OFFSET 句を指定します。
*   `Select(&users)`: 複数件取得し、結果をスライス（へのポインタ）に格納します。
*   `SelectOne(&user)`: 1件取得し、結果を構造体（へのポインタ）に格納します。`sql.ErrNoRows` が返る可能性があります。
*   `Count(&count)`: 条件に一致する件数を取得します。
*   `ScanMaps(&results)`: 結果を `[]map[string]interface{}` 形式で取得します。

### Preload (Eager Loading)

`hasmany` および `belongsTo` リレーションの Preload (Eager Loading) をサポートします。

*   `qb.Preload("Posts", "Author").Select(&users)` のように、`Preload` メソッドで関連データを同時に読み込むフィールド名を指定します。
*   構造体のフィールドに `orm:"hasmany:..."` または `orm:"belongsTo:..."` タグが必要です。

### テスト

`orm/orm_test.go` に主要機能のテストケースが含まれています。

```bash
cd orm
go test -v
```

## CLI シェル (`cli` パッケージ)

作成した ORM ライブラリを利用するためのインタラクティブなコマンドラインシェルです。`go-prompt` を利用しており、コマンド履歴や補完機能を持ちます。

### ビルド

```bash
# day31_go_orm ディレクトリ内で実行
cd cli
go build -o ../orm_shell .
cd ..
```
これにより `day31_go_orm` ディレクトリに `orm_shell` という実行ファイルが生成されます。

### 使い方

```bash
./orm_shell
```

シェルが起動したら、以下のコマンドが利用できます。

*   `connect <database_file>`: SQLite データベースファイルに接続します。 (例: `connect orm/test_orm.db`)
*   `disconnect`: 現在のデータベースから切断します。
*   `tables`: データベース内のテーブル一覧を表示します。
*   `schema <table_name or model_name>`: テーブルのスキーマ情報、または登録されているモデルのフィールド情報を表示します。
*   `find <ModelName> [where <condition>] [order <column> [asc|desc]] [limit <n>] [offset <n>]`: 複数レコードを検索します。
    *   `<ModelName>`: `User` や `Post` など、登録されているモデル名を指定します（大文字・小文字を区別）。
    *   `where`: SQL の WHERE 句の中身を指定します (例: `where "age > 25"`、`where "name = 'Alice'"` など)。**注意: 現在の実装では SQL インジェクション対策が不十分です。**
    *   `order`, `limit`, `offset` で結果の順序や範囲を指定できます。
*   `first <ModelName> [where <condition>] [order <column> [asc|desc]]`: 条件に合う最初の1レコードを検索します。
*   `count <ModelName> [where <condition>]`: 条件に合うレコード数をカウントします。
*   `help`: 利用可能なコマンドを表示します。
*   `exit` / `quit`: シェルを終了します。

**補完機能:**

*   コマンド名、モデル名、キーワード (`where`, `order`, `limit`, `offset`)、カラム名 (`where`, `order` の後) などを Tab キーで補完できます。

## 今後の改善点 (例)

*   ORM:
    *   `db` タグによるカラム名マッピングの改善（スネークケース変換など）
    *   より複雑なリレーション (many2many) のサポート
    *   より洗練された Query Builder (メソッドチェーンでの条件結合など)
    *   ロギング機能
    *   エラーハンドリングの改善
*   CLI:
    *   `where` 句の安全な引数バインディング
    *   `where` 句の演算子 (`=`, `!=`, `>`, `<`, `like` など) の補完
    *   `insert`, `update`, `delete` コマンドの実装
    *   Preload を利用するコマンド (`find User preload Posts`) の実装
    *   より詳細なエラー表示

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
