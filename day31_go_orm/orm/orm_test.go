package orm_test

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"reflect"
	"testing"
	"time"

	"github.com/lirlia/100day_challenge_backend/day31_go_orm/orm"
	_ "github.com/mattn/go-sqlite3"
)

const testDBFile = "./test_orm.db"

// --- Test Setup & Teardown ---

func setupTestDB(t *testing.T) (*orm.DB, func()) {
	_ = os.Remove(testDBFile)
	db, err := orm.Open(testDBFile)
	if err != nil {
		t.Fatalf("Failed to open test database: %v", err)
	}

	// テーブル作成 (ctx 不要)
	_, err = db.Exec(`DROP TABLE IF EXISTS posts;`) // posts を先に削除 (FK 制約のため)
	if err != nil {
		t.Fatalf("Failed to drop posts table: %v", err)
	}
	_, err = db.Exec(`DROP TABLE IF EXISTS users;`)
	if err != nil {
		t.Fatalf("Failed to drop users table: %v", err)
	}

	_, err = db.Exec(`
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

	_, err = db.Exec(`
	CREATE TABLE posts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER NOT NULL,
		title TEXT NOT NULL,
		content TEXT,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
	);
	`)
	if err != nil {
		db.Close()
		t.Fatalf("Failed to create posts table: %v", err)
	}

	// orm パッケージのキャッシュクリア関数を呼び出す (エクスポートされている前提)
	orm.ClearStructInfoCache()

	teardown := func() {
		db.Close()
	}

	return db, teardown
}

// --- Test Models (Redefined locally) ---
type User struct {
	ID        int64          `db:"id"`
	Name      string         `db:"name"`
	Email     sql.NullString `db:"email"`
	CreatedAt time.Time      `db:"created_at"`
	UpdatedAt time.Time      `db:"updated_at"`
	Posts     []Post         `orm:"hasmany:user_id"` // Keep orm tag for internal logic if needed
}

type Post struct {
	ID        int64     `db:"id"`
	UserID    int64     `db:"user_id"`
	Title     string    `db:"title"`
	Content   string    `db:"content"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
}

// Local cache clear function (needs access to orm internals or uses a separate mechanism)
// This is a workaround. Ideally, the ORM provides a test helper.
var localStructInfoCache = make(map[reflect.Type]interface{}) // Simplified local cache simulation
func clearStructInfoCache() {
	// We can't directly clear the orm package's cache from orm_test.
	// For this test, we might rely on the fact that each test run starts clean,
	// or simulate clearing if needed (e.g., by resetting a local map if tests share state,
	// which they shouldn't ideally).
	// Calling orm.ClearStructInfoCache() here if it were correctly accessible would be ideal.
	// Since it's causing issues, we'll just log a note here.
	fmt.Println("Note: Struct info cache clearing is simulated/skipped in test due to access issues.")
	// If orm.ClearStructInfoCache becomes accessible, replace the above line with:
	// orm.ClearStructInfoCache()
}

// --- Test Cases ---

func TestInsertAndSelectOne(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	now := time.Now().Truncate(time.Second)

	// 1. Insert User
	newUser := orm.User{
		Name:      "Alice",
		Email:     sql.NullString{String: "alice@example.com", Valid: true},
		CreatedAt: now,
		UpdatedAt: now,
	}
	_, err := db.Model(&orm.User{}).Insert(&newUser)
	if err != nil {
		t.Fatalf("Insert failed: %v", err)
	}
	fmt.Printf("Inserted user with ID: %d\n", newUser.ID)

	// 2. SelectOne で取得して確認
	var fetchedUser orm.User
	err = db.Model(&orm.User{}).Where("id = ?", newUser.ID).SelectOne(&fetchedUser)
	if err != nil {
		t.Fatalf("SelectOne failed: %v", err)
	}

	// 検証 (CreatedAt/UpdatedAt はDBデフォルトなので比較しない)
	if fetchedUser.ID != newUser.ID {
		t.Errorf("Fetched ID mismatch: got %d, want %d", fetchedUser.ID, newUser.ID)
	}
	if fetchedUser.Name != newUser.Name {
		t.Errorf("Fetched Name mismatch: got %s, want %s", fetchedUser.Name, newUser.Name)
	}
	if !fetchedUser.Email.Valid || fetchedUser.Email.String != newUser.Email.String {
		t.Errorf("Fetched Email mismatch: got %v, want %v", fetchedUser.Email, newUser.Email)
	}
	fmt.Printf("Fetched user: %+v\n", fetchedUser)

	// 3. 存在しない ID で SelectOne
	var notFoundUser orm.User
	err = db.Model(&orm.User{}).Where("id = ?", 99999).SelectOne(&notFoundUser)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("Expected sql.ErrNoRows for non-existent user, got: %v", err)
	}

	// 4. Post を Insert
	postTitle := "First Post"
	postContent := "This is the content."
	newPost := orm.Post{
		UserID:  newUser.ID,
		Title:   postTitle,
		Content: postContent,
	}
	_, err = db.Model(&orm.Post{}).Insert(&newPost)
	if err != nil {
		t.Fatalf("Insert Post failed: %v", err)
	}
	fmt.Printf("Inserted post with ID: %d\n", newPost.ID)

	// 5. Post を SelectOne で取得して確認
	var fetchedPost orm.Post
	err = db.Model(&orm.Post{}).Where("id = ?", newPost.ID).SelectOne(&fetchedPost)
	if err != nil {
		t.Fatalf("SelectOne Post failed: %v", err)
	}

	if fetchedPost.ID != newPost.ID {
		t.Errorf("Fetched Post ID mismatch: got %d, want %d", fetchedPost.ID, newPost.ID)
	}
	if fetchedPost.UserID != newPost.UserID {
		t.Errorf("Fetched Post UserID mismatch: got %d, want %d", fetchedPost.UserID, newPost.UserID)
	}
	if fetchedPost.Title != newPost.Title {
		t.Errorf("Fetched Post Title mismatch: got %s, want %s", fetchedPost.Title, newPost.Title)
	}
	if fetchedPost.Content != postContent {
		t.Errorf("Fetched Post Content mismatch: got %s, want %s", fetchedPost.Content, postContent)
	}
	fmt.Printf("Fetched post: %+v\n", fetchedPost)
}

func TestSelectMultiple(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	user1 := orm.User{Name: "User1", Email: sql.NullString{"u1@e.com", true}}
	user2 := orm.User{Name: "User2", Email: sql.NullString{"u2@e.com", true}}
	_, err := db.Model(&orm.User{}).Insert(&user1)
	if err != nil {
		t.Fatalf("Insert user1 failed: %v", err)
	}
	_, err = db.Model(&orm.User{}).Insert(&user2)
	if err != nil {
		t.Fatalf("Insert user2 failed: %v", err)
	}

	var users []orm.User
	err = db.Model(&orm.User{}).Order("id ASC").Select(&users)
	if err != nil {
		t.Fatalf("Select multiple users failed: %v", err)
	}

	if len(users) != 2 {
		t.Fatalf("Expected 2 users, got %d", len(users))
	}
	if users[0].Name != user1.Name || users[1].Name != user2.Name {
		t.Errorf("Fetched users mismatch: got names %s, %s", users[0].Name, users[1].Name)
	}
	fmt.Printf("Fetched users: %+v\n", users)

	var limitedUsers []orm.User
	err = db.Model(&orm.User{}).Order("id ASC").Limit(1).Offset(1).Select(&limitedUsers)
	if err != nil {
		t.Fatalf("Select with limit/offset failed: %v", err)
	}
	if len(limitedUsers) != 1 {
		t.Fatalf("Expected 1 user with limit/offset, got %d", len(limitedUsers))
	}
	if limitedUsers[0].Name != user2.Name {
		t.Errorf("Expected second user with limit/offset, got name %s", limitedUsers[0].Name)
	}
	fmt.Printf("Fetched limited user: %+v\n", limitedUsers)
}

func TestUpdateAndDelete(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	user := orm.User{Name: "ToUpdate", Email: sql.NullString{"update@e.com", true}}
	_, err := db.Model(&orm.User{}).Insert(&user)
	if err != nil {
		t.Fatalf("Insert user failed: %v", err)
	}
	userID := user.ID

	newName := "UpdatedName"
	result, err := db.Exec("UPDATE users SET name = ? WHERE id = ?", newName, userID)
	if err != nil {
		t.Fatalf("Update failed: %v", err)
	}
	rowsAffected, _ := result.RowsAffected()
	if rowsAffected != 1 {
		t.Errorf("Expected 1 row affected by update, got %d", rowsAffected)
	}

	var updatedUser orm.User
	err = db.Model(&orm.User{}).Where("id = ?", userID).SelectOne(&updatedUser)
	if updatedUser.Name != newName {
		t.Errorf("Name not updated: got %s, want %s", updatedUser.Name, newName)
	}
	fmt.Printf("Updated user: %+v\n", updatedUser)

	result, err = db.Exec("DELETE FROM users WHERE id = ?", userID)
	if err != nil {
		t.Fatalf("Delete failed: %v", err)
	}
	rowsAffected, _ = result.RowsAffected()
	if rowsAffected != 1 {
		t.Errorf("Expected 1 row affected by delete, got %d", rowsAffected)
	}

	var deletedUser orm.User
	err = db.Model(&orm.User{}).Where("id = ?", userID).SelectOne(&deletedUser)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("Expected sql.ErrNoRows after delete, got %v", err)
	}
	fmt.Println("User deleted successfully")
}

func TestTransaction(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()
	ctx := context.Background()

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("BeginTx failed: %v", err)
	}

	userInTx := orm.User{Name: "TX User", Email: sql.NullString{"tx@e.com", true}}
	_, err = tx.Model(&orm.User{}).Insert(&userInTx)
	if err != nil {
		tx.Rollback()
		t.Fatalf("Insert within TX failed: %v", err)
	}
	userID := userInTx.ID

	if err := tx.Commit(); err != nil {
		t.Fatalf("Commit failed: %v", err)
	}

	var committedUser orm.User
	err = db.Model(&orm.User{}).Where("id = ?", userID).SelectOne(&committedUser)
	if err != nil {
		t.Fatalf("Select after commit failed: %v", err)
	}
	if committedUser.Name != userInTx.Name {
		t.Errorf("Committed user name mismatch")
	}
	fmt.Println("Commit successful")

	tx, err = db.BeginTx(ctx, nil)
	if err != nil {
		t.Fatalf("BeginTx for rollback test failed: %v", err)
	}

	userRollback := orm.User{Name: "Rollback User", Email: sql.NullString{"rollback@e.com", true}}
	_, err = tx.Model(&orm.User{}).Insert(&userRollback)
	if err != nil {
		tx.Rollback()
		t.Fatalf("Insert before rollback failed: %v", err)
	}
	rollbackUserID := userRollback.ID

	if err := tx.Rollback(); err != nil {
		t.Fatalf("Rollback failed: %v", err)
	}

	var rollbackUser orm.User
	err = db.Model(&orm.User{}).Where("id = ?", rollbackUserID).SelectOne(&rollbackUser)
	if !errors.Is(err, sql.ErrNoRows) {
		t.Errorf("Expected sql.ErrNoRows after rollback, got %v", err)
	}
	fmt.Println("Rollback successful")
}

func TestQueryBuilder(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()
	u1 := orm.User{Name: "Query User 1", Email: sql.NullString{"q1@e.com", true}}
	u2 := orm.User{Name: "Query User 2", Email: sql.NullString{"q2@e.com", true}}
	u3 := orm.User{Name: "Another User", Email: sql.NullString{"q3@e.com", true}}
	_, err := db.Model(&orm.User{}).Insert(&u1)
	if err != nil {
		t.Fatalf("Insert u1 failed: %v", err)
	}
	_, err = db.Model(&orm.User{}).Insert(&u2)
	if err != nil {
		t.Fatalf("Insert u2 failed: %v", err)
	}
	_, err = db.Model(&orm.User{}).Insert(&u3)
	if err != nil {
		t.Fatalf("Insert u3 failed: %v", err)
	}

	p1 := orm.Post{UserID: u1.ID, Title: "Q Post 1", Content: "aaa"}
	p2 := orm.Post{UserID: u1.ID, Title: "Q Post 2", Content: "bbb"}
	p3 := orm.Post{UserID: u2.ID, Title: "Q Post 3", Content: "ccc"}
	_, err = db.Model(&orm.Post{}).Insert(&p1)
	if err != nil {
		t.Fatalf("Insert p1 failed: %v", err)
	}
	_, err = db.Model(&orm.Post{}).Insert(&p2)
	if err != nil {
		t.Fatalf("Insert p2 failed: %v", err)
	}
	_, err = db.Model(&orm.Post{}).Insert(&p3)
	if err != nil {
		t.Fatalf("Insert p3 failed: %v", err)
	}

	t.Run("Select with Where and Order", func(t *testing.T) {
		var users []orm.User
		err := db.Model(&orm.User{}).
			Where("name LIKE ?", "Query User%").
			Order("id DESC").
			Select(&users)
		if err != nil {
			t.Fatalf("QB Select failed: %v", err)
		}
		if len(users) != 2 {
			t.Errorf("Expected 2 users, got %d", len(users))
		}
		if len(users) > 0 && users[0].Name != u2.Name {
			t.Errorf("Expected user %s first due to ORDER BY id DESC, got %s", u2.Name, users[0].Name)
		}
		fmt.Printf("QB Select (Where, Order): %+v\n", users)
	})

	t.Run("SelectOne with Where", func(t *testing.T) {
		var user orm.User
		err := db.Model(&orm.User{}).
			Where("email = ?", u1.Email.String).
			SelectOne(&user)
		if err != nil {
			t.Fatalf("QB SelectOne failed: %v", err)
		}
		if user.Name != u1.Name {
			t.Errorf("QB SelectOne fetched wrong user: got %s, want %s", user.Name, u1.Name)
		}
		fmt.Printf("QB SelectOne: %+v\n", user)
	})

	t.Run("Select with Limit and Offset", func(t *testing.T) {
		var users []orm.User
		err := db.Model(&orm.User{}).
			Order("id ASC").
			Limit(1).
			Offset(1).
			Select(&users)
		if err != nil {
			t.Fatalf("QB Select (Limit, Offset) failed: %v", err)
		}
		if len(users) != 1 {
			t.Errorf("Expected 1 user, got %d", len(users))
		}
		if len(users) > 0 && users[0].Name != u2.Name {
			t.Errorf("Expected user %s at offset 1, got %s", u2.Name, users[0].Name)
		}
		fmt.Printf("QB Select (Limit, Offset): %+v\n", users)
	})

	t.Run("Invalid Order clause is ignored", func(t *testing.T) {
		var users []orm.User
		err := db.Model(&orm.User{}).Order("id; DROP TABLE users").Select(&users)
		if err != nil {
			t.Fatalf("QB Select with invalid order failed: %v", err)
		}
		if len(users) < 3 {
			t.Errorf("Expected at least 3 users, got %d", len(users))
		}
		fmt.Printf("QB Select (invalid order ignored): %+v\n", users)
	})

	t.Run("Complex valid Order clause", func(t *testing.T) {
		var usersComplexOrder []orm.User
		err := db.Model(&orm.User{}).Order(" name ASC , id DESC ").Select(&usersComplexOrder)
		if err != nil {
			t.Fatalf("QB Select with complex valid order failed: %v", err)
		}
		if len(usersComplexOrder) < 3 {
			t.Errorf("Expected at least 3 users, got %d", len(usersComplexOrder))
		}
		fmt.Printf("QB Select (complex valid order): %+v\n", usersComplexOrder)
	})
}

func TestPreload(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()
	u1 := orm.User{Name: "Preload User 1"}
	u2 := orm.User{Name: "Preload User 2"}
	_, err := db.Model(&orm.User{}).Insert(&u1)
	if err != nil {
		t.Fatalf("Insert u1 failed: %v", err)
	}
	_, err = db.Model(&orm.User{}).Insert(&u2)
	if err != nil {
		t.Fatalf("Insert u2 failed: %v", err)
	}

	p1 := orm.Post{UserID: u1.ID, Title: "P1 Title", Content: "c1"}
	p2 := orm.Post{UserID: u1.ID, Title: "P2 Title", Content: "c2"}
	p3 := orm.Post{UserID: u2.ID, Title: "P3 Title", Content: "c3"}
	_, err = db.Model(&orm.Post{}).Insert(&p1)
	if err != nil {
		t.Fatalf("Insert p1 failed: %v", err)
	}
	_, err = db.Model(&orm.Post{}).Insert(&p2)
	if err != nil {
		t.Fatalf("Insert p2 failed: %v", err)
	}
	_, err = db.Model(&orm.Post{}).Insert(&p3)
	if err != nil {
		t.Fatalf("Insert p3 failed: %v", err)
	}

	t.Run("Select all users with Posts preloaded", func(t *testing.T) {
		var users []orm.User
		err := db.Model(&orm.User{}).Preload("Posts").Order("id").Select(&users)
		if err != nil {
			t.Fatalf("Preload failed: %v", err)
		}
		if len(users) != 2 {
			t.Fatalf("Expected 2 users, got %d", len(users))
		}

		user1 := users[0]
		if user1.Name != u1.Name {
			t.Errorf("Fetched wrong user 1: %s", user1.Name)
		}
		if len(user1.Posts) != 2 {
			t.Errorf("Expected 2 posts for user 1, got %d", len(user1.Posts))
		} else {
			if user1.Posts[0].Title != p1.Title || user1.Posts[1].Title != p2.Title {
				t.Errorf("User 1 posts mismatch: got %+v", user1.Posts)
			}
		}

		user2 := users[1]
		if user2.Name != u2.Name {
			t.Errorf("Fetched wrong user 2: %s", user2.Name)
		}
		if len(user2.Posts) != 1 {
			t.Errorf("Expected 1 post for user 2, got %d", len(user2.Posts))
		} else {
			if user2.Posts[0].Title != p3.Title {
				t.Errorf("User 2 posts mismatch: got %+v", user2.Posts)
			}
		}
		fmt.Printf("Users with Preload: %+v\n", users)
	})

	t.Run("Select one user with Posts preloaded", func(t *testing.T) {
		var user User
		err := db.Model(&User{}).Where("id = ?", u1.ID).Preload("Posts").SelectOne(&user)
		if err != nil {
			t.Fatalf("SelectOne with Preload failed: %v", err)
		}
		if user.Name != u1.Name {
			t.Errorf("SelectOne fetched wrong user: %s", user.Name)
		}
		if len(user.Posts) != 2 {
			t.Errorf("Expected 2 posts for user 1 in SelectOne, got %d", len(user.Posts))
		} else {
			if user.Posts[0].Title != p1.Title || user.Posts[1].Title != p2.Title {
				t.Errorf("User 1 posts mismatch in SelectOne: got %+v", user.Posts)
			}
		}
		fmt.Printf("User with Preload (SelectOne): %+v\n", user)
	})
}

func TestTableQueryBuilder(t *testing.T) {
	db, teardown := setupTestDB(t)
	defer teardown()

	t.Run("ScanMaps selects data from specified table", func(t *testing.T) {
		_, err := db.Exec("INSERT INTO users (name, email) VALUES (?, ?), (?, ?)", "Table User 1", "table1@example.com", "Table User 2", "table2@example.com")
		if err != nil {
			t.Fatalf("Failed to insert test users: %v", err)
		}

		var results []map[string]interface{}
		err = db.Table("users").Where("name LIKE ?", "Table User%").Order("id ASC").ScanMaps(&results)

		if err != nil {
			t.Errorf("Table().ScanMaps() failed: %v", err)
		}

		if len(results) != 2 {
			t.Errorf("Expected 2 results, got %d", len(results))
		}

		if len(results) > 0 {
			if name, ok := results[0]["name"].(string); !ok || name != "Table User 1" {
				t.Errorf("Expected first user name to be 'Table User 1', got %v (%T)", results[0]["name"], results[0]["name"])
			}
			if email, ok := results[0]["email"].(string); !ok || email != "table1@example.com" {
				t.Errorf("Expected first user email to be 'table1@example.com', got %v (%T)", results[0]["email"], results[0]["email"])
			}
		}
	})

	t.Run("Count returns the correct number of records", func(t *testing.T) {
		_, err := db.Exec("INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?), (?, ?, ?)", 1, "Table Post 1", "c", 2, "Table Post 2", "c")
		if err != nil {
			t.Fatalf("Failed to insert test posts: %v", err)
		}

		var count int64
		err = db.Table("posts").Where("title LIKE ?", "Table Post%").Count(&count)

		if err != nil {
			t.Errorf("Table().Count() failed: %v", err)
		}

		if count != 2 {
			t.Errorf("Expected count to be 2, got %d", count)
		}
	})

	t.Run("Count returns 0 when no records match", func(t *testing.T) {
		var count int64
		err := db.Table("posts").Where("title = ?", "NonExistentTitle").Count(&count)

		if err != nil {
			t.Errorf("Table().Count() for no match failed: %v", err)
		}

		if count != 0 {
			t.Errorf("Expected count to be 0 for no match, got %d", count)
		}
	})

	t.Run("ScanMaps with no results returns empty slice", func(t *testing.T) {
		var results []map[string]interface{}
		err := db.Table("users").Where("name = ?", "NonExistentUser").ScanMaps(&results)

		if err != nil {
			t.Errorf("Table().ScanMaps() for no match failed: %v", err)
		}

		if len(results) != 0 {
			t.Errorf("Expected 0 results for ScanMaps with no match, got %d", len(results))
		}
	})
}
