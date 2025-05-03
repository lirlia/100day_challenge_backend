package orm_test

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/lirlia/100day_challenge_backend/day31_go_orm/orm" // 作成した ORM パッケージ
	_ "github.com/mattn/go-sqlite3"                               // SQLite ドライバー
)

const testDBFile = "./test_orm.db"

// --- Test Setup & Teardown ---

func setupTestDB(t *testing.T) (*orm.DB, func()) {
	// テスト開始前に古いDBファイルを削除
	_ = os.Remove(testDBFile)

	db, err := orm.Open(testDBFile)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}

	// テーブル作成
	ctx := context.Background()
	_, err = db.Exec(ctx, `DROP TABLE IF EXISTS users;`)
	if err != nil {
		t.Fatalf("Failed to drop users table: %v", err)
	}
	_, err = db.Exec(ctx, `DROP TABLE IF EXISTS posts;`) // 別のテーブルもテスト用に用意
	if err != nil {
		t.Fatalf("Failed to drop posts table: %v", err)
	}

	_, err = db.Exec(ctx, `
	CREATE TABLE users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		name TEXT NOT NULL,
		email TEXT UNIQUE,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`)
	if err != nil {
		db.Close()
		t.Fatalf("Failed to create users table: %v", err)
	}

	_, err = db.Exec(ctx, `
	CREATE TABLE posts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		title TEXT NOT NULL,
		body TEXT,
		published_at DATETIME,
		FOREIGN KEY (user_id) REFERENCES users(id)
	);
	`)
	if err != nil {
		db.Close()
		t.Fatalf("Failed to create posts table: %v", err)
	}

	// クリーンアップ関数
	teardown := func() {
		db.Close()
		// テスト後にDBファイルを削除
		// _ = os.Remove(testDBFile) // デバッグ用に残す場合もある
	}

	return db, teardown
}

// --- Test Models ---

type User struct {
	ID        int64          `db:"id"`
	Name      string         `db:"name"`
	Email     sql.NullString `db:"email"`
	CreatedAt time.Time      `db:"created_at"`
	UpdatedAt time.Time      `db:"updated_at"`
}

// Post テーブル名が "posts" なので構造体名と一致。Insert で自動判別されるかテスト
type Post struct {
	ID          int64        `db:"id"`
	UserID      int64        `db:"user_id"`
	Title       string       `db:"title"`
	Body        *string      `db:"body"`         // ポインタ型で NULL をテスト
	PublishedAt sql.NullTime `db:"published_at"` // sql.NullTime で NULL をテスト
}

// --- Test Cases ---

func TestInsertAndSelectOne(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()
	now := time.Now().Truncate(time.Second) // SQLite の精度に合わせる

	// 1. Insert User
	newUser := User{
		Name:      "Alice",
		Email:     sql.NullString{String: "alice@example.com", Valid: true},
		CreatedAt: now, // Insert では無視される想定だが、テストデータとして入れておく
		UpdatedAt: now,
	}
	result, err := db.Insert(ctx, &newUser) // Insert にはポインタを渡す
	if err != nil {
		t.Fatalf("Insert failed: %v", err)
	}
	lastID, err := result.LastInsertId()
	if err != nil {
		t.Fatalf("Failed to get last insert ID: %v", err)
	}
	if lastID == 0 {
		t.Fatal("Expected last insert ID to be non-zero")
	}
	fmt.Printf("Inserted user with ID: %d\n", lastID)

	// 2. SelectOne で取得して確認
	var fetchedUser User
	err = db.SelectOne(ctx, &fetchedUser, "SELECT * FROM users WHERE id = ?", lastID)
	if err != nil {
		t.Fatalf("SelectOne failed: %v", err)
	}

	// 検証
	if fetchedUser.ID != lastID {
		t.Errorf("Fetched ID mismatch: got %d, want %d", fetchedUser.ID, lastID)
	}
	if fetchedUser.Name != newUser.Name {
		t.Errorf("Fetched Name mismatch: got %s, want %s", fetchedUser.Name, newUser.Name)
	}
	if !fetchedUser.Email.Valid || fetchedUser.Email.String != newUser.Email.String {
		t.Errorf("Fetched Email mismatch: got %v, want %v", fetchedUser.Email, newUser.Email)
	}
	// CreatedAt/UpdatedAt は DB のデフォルト値が入るはずなので newUser とは比較しない
	if fetchedUser.CreatedAt.IsZero() || fetchedUser.UpdatedAt.IsZero() {
		t.Errorf("Expected CreatedAt/UpdatedAt to be set by DB default, got zero value")
	}
	fmt.Printf("Fetched user: %+v\n", fetchedUser)

	// 3. 存在しない ID で SelectOne
	var notFoundUser User
	err = db.SelectOne(ctx, &notFoundUser, "SELECT * FROM users WHERE id = ?", 99999)
	if err != sql.ErrNoRows {
		t.Errorf("Expected sql.ErrNoRows for non-existent user, got: %v", err)
	}

	// 4. ポインタ型の NULL フィールドを持つ Post を Insert
	postTitle := "First Post"
	postBody := "This is the body."
	newPost := Post{
		UserID: lastID,
		Title:  postTitle,
		Body:   &postBody, // ポインタを渡す
		// PublishedAt は NULL のまま
	}
	result, err = db.Insert(ctx, &newPost)
	if err != nil {
		t.Fatalf("Insert Post failed: %v", err)
	}
	lastPostID, _ := result.LastInsertId()
	if lastPostID == 0 {
		t.Fatal("Expected last post insert ID to be non-zero")
	}
	fmt.Printf("Inserted post with ID: %d\n", lastPostID)

	// 5. Post を SelectOne で取得して確認
	var fetchedPost Post
	err = db.SelectOne(ctx, &fetchedPost, "SELECT * FROM posts WHERE id = ?", lastPostID)
	if err != nil {
		t.Fatalf("SelectOne Post failed: %v", err)
	}

	if fetchedPost.ID != lastPostID {
		t.Errorf("Fetched Post ID mismatch: got %d, want %d", fetchedPost.ID, lastPostID)
	}
	if fetchedPost.UserID != newPost.UserID {
		t.Errorf("Fetched Post UserID mismatch: got %d, want %d", fetchedPost.UserID, newPost.UserID)
	}
	if fetchedPost.Title != newPost.Title {
		t.Errorf("Fetched Post Title mismatch: got %s, want %s", fetchedPost.Title, newPost.Title)
	}
	if fetchedPost.Body == nil || *fetchedPost.Body != postBody {
		t.Errorf("Fetched Post Body mismatch: got %v, want %s", fetchedPost.Body, postBody)
	}
	if fetchedPost.PublishedAt.Valid {
		t.Errorf("Expected PublishedAt to be NULL (Valid=false), got %v", fetchedPost.PublishedAt)
	}
	fmt.Printf("Fetched post: %+v\n", fetchedPost)
}

func TestSelectMultiple(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()

	// データ投入
	usersToInsert := []User{
		{Name: "Charlie", Email: sql.NullString{String: "charlie@example.com", Valid: true}},
		{Name: "David"}, // Email is NULL
		{Name: "Eve", Email: sql.NullString{String: "eve@example.com", Valid: true}},
	}
	insertedIDs := make([]int64, len(usersToInsert))
	for i, u := range usersToInsert {
		res, err := db.Insert(ctx, &u)
		if err != nil {
			t.Fatalf("Failed to insert user %d: %v", i, err)
		}
		insertedIDs[i], _ = res.LastInsertId()
	}

	// 1. Select all users
	var fetchedUsers []User
	err := db.Select(ctx, &fetchedUsers, "SELECT * FROM users ORDER BY id")
	if err != nil {
		t.Fatalf("Select multiple users failed: %v", err)
	}

	if len(fetchedUsers) != len(usersToInsert) {
		t.Fatalf("Fetched user count mismatch: got %d, want %d", len(fetchedUsers), len(usersToInsert))
	}

	// 簡単な検証
	for i, fetched := range fetchedUsers {
		if fetched.ID != insertedIDs[i] {
			t.Errorf("User %d ID mismatch: got %d, want %d", i, fetched.ID, insertedIDs[i])
		}
		if fetched.Name != usersToInsert[i].Name {
			t.Errorf("User %d Name mismatch: got %s, want %s", i, fetched.Name, usersToInsert[i].Name)
		}
		// Email の NULL チェック
		if i == 1 { // David should have NULL email
			if fetched.Email.Valid {
				t.Errorf("User %d (David) Email should be NULL, but got %v", i, fetched.Email)
			}
		} else {
			if !fetched.Email.Valid || fetched.Email.String != usersToInsert[i].Email.String {
				t.Errorf("User %d Email mismatch: got %v, want %v", i, fetched.Email, usersToInsert[i].Email)
			}
		}
	}
	fmt.Printf("Fetched %d users.\n", len(fetchedUsers))

	// 2. Select with WHERE clause
	var eve User
	err = db.SelectOne(ctx, &eve, "SELECT * FROM users WHERE name = ?", "Eve")
	if err != nil {
		t.Fatalf("SelectOne Eve failed: %v", err)
	}
	if eve.Name != "Eve" {
		t.Errorf("SelectOne Eve name mismatch: got %s", eve.Name)
	}

	// 3. Select into slice of pointers
	var userPointers []*User
	err = db.Select(ctx, &userPointers, "SELECT * FROM users ORDER BY id")
	if err != nil {
		t.Fatalf("Select []*User failed: %v", err)
	}
	if len(userPointers) != len(usersToInsert) {
		t.Fatalf("Fetched user pointer count mismatch: got %d, want %d", len(userPointers), len(usersToInsert))
	}
	// 簡単な検証
	if userPointers[0].Name != "Charlie" {
		t.Errorf("First user pointer name mismatch: got %s", userPointers[0].Name)
	}
	fmt.Printf("Fetched %d user pointers.\n", len(userPointers))
}

func TestUpdateAndDelete(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()

	// データ投入
	frank := User{Name: "Frank", Email: sql.NullString{"frank@old.com", true}}
	res, _ := db.Insert(ctx, &frank)
	frankID, _ := res.LastInsertId()

	greg := User{Name: "Greg"}
	res, _ = db.Insert(ctx, &greg)
	gregID, _ := res.LastInsertId()

	// 1. Update Frank's email
	newEmail := "frank@new.com"
	result, err := db.Update(ctx, "UPDATE users SET email = ? WHERE id = ?", newEmail, frankID)
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		t.Fatalf("Failed to get rows affected: %v", err)
	}
	if rowsAffected != 1 {
		t.Errorf("Expected 1 row affected by update, got %d", rowsAffected)
	}

	// 確認
	var updatedFrank User
	err = db.SelectOne(ctx, &updatedFrank, "SELECT email FROM users WHERE id = ?", frankID)
	if err != nil {
		t.Fatalf("SelectOne after update failed: %v", err)
	}
	if !updatedFrank.Email.Valid || updatedFrank.Email.String != newEmail {
		t.Errorf("Email not updated correctly: got %v, want %s", updatedFrank.Email, newEmail)
	}
	fmt.Println("Frank's email updated.")

	// 2. Delete Greg
	result, err = db.Delete(ctx, "DELETE FROM users WHERE id = ?", gregID)
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	rowsAffected, err = result.RowsAffected()
	if err != nil {
		t.Fatalf("Failed to get rows affected after delete: %v", err)
	}
	if rowsAffected != 1 {
		t.Errorf("Expected 1 row affected by delete, got %d", rowsAffected)
	}

	// 確認 (SelectOne で ErrNoRows になるはず)
	var deletedGreg User
	err = db.SelectOne(ctx, &deletedGreg, "SELECT * FROM users WHERE id = ?", gregID)
	if err != sql.ErrNoRows {
		t.Errorf("Expected sql.ErrNoRows after delete, got %v", err)
	}
	fmt.Println("Greg deleted.")
}

func TestTransaction(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()

	// 1. Commit transaction
	tx1, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("BeginTx failed: %v", err)
	}

	henry := User{Name: "Henry"}
	res, err := tx1.Insert(ctx, &henry)
	if err != nil {
		tx1.Rollback() // エラーならロールバック
		t.Fatalf("Insert within tx failed: %v", err)
	}
	henryID, _ := res.LastInsertId()

	err = tx1.Commit()
	if err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	// 確認 (トランザクション外から見えるか)
	var fetchedHenry User
	err = db.SelectOne(ctx, &fetchedHenry, "SELECT * FROM users WHERE id = ?", henryID)
	if err != nil {
		t.Errorf("User inserted in committed tx not found: %v", err)
	}
	fmt.Println("Transaction committed successfully.")

	// 2. Rollback transaction
	tx2, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("BeginTx (for rollback) failed: %v", err)
	}

	ivan := User{Name: "Ivan"}
	_, err = tx2.Insert(ctx, &ivan)
	if err != nil {
		tx2.Rollback()
		t.Fatalf("Insert within tx (for rollback) failed: %v", err)
	}
	// ivanID, _ := res.LastInsertId() // ロールバックするので ID は不要

	err = tx2.Rollback()
	if err != nil {
		t.Fatalf("Rollback failed: %v", err)
	}

	// 確認 (Ivan が存在しないこと)
	var fetchedIvan User
	err = db.SelectOne(ctx, &fetchedIvan, "SELECT * FROM users WHERE name = ?", "Ivan")
	if err != sql.ErrNoRows {
		t.Errorf("Expected sql.ErrNoRows for user inserted in rolled back tx, got %v", err)
	}
	fmt.Println("Transaction rolled back successfully.")

	// 3. Transactional Select/Update
	tx3, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("BeginTx (for select/update) failed: %v", err)
	}

	// Henry を取得
	var henryInTx User
	err = tx3.SelectOne(ctx, &henryInTx, "SELECT * FROM users WHERE id = ?", henryID)
	if err != nil {
		tx3.Rollback()
		t.Fatalf("SelectOne within tx failed: %v", err)
	}

	// Henry の Email を更新
	newHenryEmail := "henry@tx.com"
	_, err = tx3.Update(ctx, "UPDATE users SET email = ? WHERE id = ?", newHenryEmail, henryID)
	if err != nil {
		tx3.Rollback()
		t.Fatalf("Update within tx failed: %v", err)
	}

	err = tx3.Commit()
	if err != nil {
		t.Fatalf("Commit after select/update failed: %v", err)
	}

	// 確認
	err = db.SelectOne(ctx, &fetchedHenry, "SELECT email FROM users WHERE id = ?", henryID)
	if err != nil {
		t.Fatalf("SelectOne after tx update failed: %v", err)
	}
	if !fetchedHenry.Email.Valid || fetchedHenry.Email.String != newHenryEmail {
		t.Errorf("Email not updated correctly in tx: got %v, want %s", fetchedHenry.Email, newHenryEmail)
	}
	fmt.Println("Transactional select/update successful.")
}

func TestQueryBuilder(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	ctx := context.Background()

	// --- テストデータ準備 ---
	usersToInsert := []User{
		{Name: "Query User 1", Email: sql.NullString{"q1@example.com", true}},
		{Name: "Query User 2"},
		{Name: "Another User 3", Email: sql.NullString{"q3@example.com", true}},
		{Name: "Query User 4", Email: sql.NullString{"q4@example.com", true}},
	}
	insertedIDs := make([]int64, len(usersToInsert))
	for i, u := range usersToInsert {
		res, err := db.Insert(ctx, &u)
		if err != nil {
			t.Fatalf("QB Setup: Failed to insert user %d: %v", i, err)
		}
		insertedIDs[i], _ = res.LastInsertId()
	}

	// --- クエリビルダのテストケース ---

	// 1. 単純な SelectOne
	var user1 User
	err := db.Model(&User{}).Where("id = ?", insertedIDs[0]).SelectOne(&user1)
	if err != nil {
		t.Fatalf("QB SelectOne failed: %v", err)
	}
	if user1.ID != insertedIDs[0] || user1.Name != "Query User 1" {
		t.Errorf("QB SelectOne result mismatch: got %+v", user1)
	}
	fmt.Printf("QB SelectOne: %+v\n", user1)

	// 2. SelectOne で見つからない場合
	var notFound User
	err = db.Model(&User{}).Where("name = ?", "NonExistent").SelectOne(&notFound)
	if err != sql.ErrNoRows {
		t.Errorf("QB SelectOne expected sql.ErrNoRows, got %v", err)
	}

	// 3. 複数条件 (Where チェーン) と Order, Limit, Offset を使った Select
	var users []User
	err = db.Model(&User{}).
		Where("name LIKE ?", "Query User%"). // name が 'Query User' で始まる
		Where("email IS NOT NULL").          // email が NULL でない
		Order("id DESC").                    // ID 降順
		Limit(1).
		Offset(1).
		Select(&users)
	if err != nil {
		t.Fatalf("QB Select failed: %v", err)
	}

	// 期待される結果: Query User 4 (ID降順で2番目) は Skip され、Query User 1 (ID降順で3番目) が取れるはず
	// (q1@example.com, q4@example.com が該当し、ID 降順だと 4, 1。Offset 1, Limit 1 なので 1 が取れる)
	if len(users) != 1 {
		t.Fatalf("QB Select expected 1 user, got %d", len(users))
	}
	if users[0].ID != insertedIDs[0] || users[0].Name != "Query User 1" {
		t.Errorf("QB Select result mismatch: got %+v, expected User 1", users[0])
	}
	fmt.Printf("QB Select (Where, Order, Limit, Offset): %+v\n", users)

	// 4. Order なし Select
	var allQueryUsers []User
	err = db.Model(&User{}).Where("name LIKE ?", "Query User%").Select(&allQueryUsers)
	if err != nil {
		t.Fatalf("QB Select (no order) failed: %v", err)
	}
	// Query User 1, 2, 4 が取得されるはず (順序は不定)
	if len(allQueryUsers) != 3 {
		t.Errorf("QB Select (no order) expected 3 users, got %d", len(allQueryUsers))
	}
	foundNames := make(map[string]bool)
	for _, u := range allQueryUsers {
		foundNames[u.Name] = true
	}
	if !foundNames["Query User 1"] || !foundNames["Query User 2"] || !foundNames["Query User 4"] {
		t.Errorf("QB Select (no order) results mismatch: got %v", allQueryUsers)
	}
	fmt.Printf("QB Select (no order): %d users found.\n", len(allQueryUsers))

	// 5. トランザクション内でクエリビルダを使用
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("QB BeginTx failed: %v", err)
	}
	var user3 User
	err = tx.Model(&User{}).Where("name = ?", "Another User 3").SelectOne(&user3)
	if err != nil {
		tx.Rollback()
		t.Fatalf("QB SelectOne in TX failed: %v", err)
	}
	if user3.Name != "Another User 3" {
		tx.Rollback()
		t.Errorf("QB SelectOne in TX result mismatch: got %+v", user3)
	}
	fmt.Printf("QB SelectOne in TX: %+v\n", user3)

	// トランザクション内で Update (クエリビルダにはまだ Update/Delete はないが、TX の Exec は使える)
	newName := "Another User 3 Updated"
	_, err = tx.Update(ctx, "UPDATE users SET name = ? WHERE id = ?", newName, user3.ID)
	if err != nil {
		tx.Rollback()
		t.Fatalf("QB Update in TX failed: %v", err)
	}

	err = tx.Commit()
	if err != nil {
		t.Fatalf("QB Commit failed: %v", err)
	}

	// コミットされたか確認
	var updatedUser3 User
	err = db.Model(&User{}).Where("id = ?", user3.ID).SelectOne(&updatedUser3)
	if err != nil {
		t.Fatalf("QB SelectOne after TX commit failed: %v", err)
	}
	if updatedUser3.Name != newName {
		t.Errorf("QB SelectOne after TX commit mismatch: got %+v, want name %s", updatedUser3, newName)
	}
	fmt.Println("QB Transaction test successful.")
}
