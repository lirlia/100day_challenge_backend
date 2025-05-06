package tests

import (
	"database/sql"
	"errors"
	"os"
	"testing"
	"time"

	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/store"
	_ "github.com/mattn/go-sqlite3"
)

func TestDBConnectionAndSchemaInit(t *testing.T) {
	// Test with temporary file database
	t.Run("FileDB", func(t *testing.T) {
		db, cleanup := SetupTestDB(t)
		defer cleanup()

		if err := db.Ping(); err != nil {
			t.Errorf("Failed to ping temporary file DB: %v", err)
		}
		// Check if root node exists (basic schema check)
		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM inodes WHERE id = 1").Scan(&count)
		if err != nil {
			t.Fatalf("Failed to query root node in file DB: %v", err)
		}
		if count != 1 {
			t.Errorf("Expected 1 root node in file DB, got %d", count)
		}
	})

	// Test with in-memory database
	t.Run("InMemoryDB", func(t *testing.T) {
		db, cleanup := SetupInMemoryTestDB(t)
		defer cleanup()

		if err := db.Ping(); err != nil {
			t.Errorf("Failed to ping in-memory DB: %v", err)
		}
		// Check if root node exists (basic schema check)
		var count int
		err := db.QueryRow("SELECT COUNT(*) FROM inodes WHERE id = 1").Scan(&count)
		if err != nil {
			t.Fatalf("Failed to query root node in in-memory DB: %v", err)
		}
		if count != 1 {
			t.Errorf("Expected 1 root node in in-memory DB, got %d", count)
		}
	})
}

func TestNodeStoreOperations(t *testing.T) {
	db, cleanup := SetupInMemoryTestDB(t)
	defer cleanup()

	s := store.NewSQLStore(db)

	// 1. Get Root Node
	t.Run("GetRootNode", func(t *testing.T) {
		root, err := s.GetNode(1)
		if err != nil {
			t.Fatalf("Failed to get root node: %v", err)
		}
		if root == nil {
			t.Fatal("Root node is nil")
		}
		if root.ID != 1 || !root.IsDir || root.Name != "" {
			t.Errorf("Unexpected root node properties: %+v", root)
		}
	})

	// 2. Create Directory
	var testDir *models.Node
	t.Run("CreateDirectory", func(t *testing.T) {
		dir := &models.Node{
			ParentID: 1, // Root
			Name:     "testdir",
			IsDir:    true,
			Mode:     0755 | os.ModeDir,
			UID:      1000,
			GID:      1000,
		}
		var err error
		testDir, err = s.CreateNode(dir)
		if err != nil {
			t.Fatalf("Failed to create directory: %v", err)
		}
		if testDir.ID <= 1 || testDir.Name != "testdir" || !testDir.IsDir {
			t.Errorf("Unexpected created directory properties: %+v", testDir)
		}
		if testDir.Mode != (0755 | os.ModeDir) {
			t.Errorf("Expected directory mode %v, got %v", 0755|os.ModeDir, testDir.Mode)
		}
	})

	// 3. Get Child Node (Directory)
	t.Run("GetChildDirectory", func(t *testing.T) {
		child, err := s.GetChildNode(1, "testdir")
		if err != nil {
			t.Fatalf("Failed to get child directory: %v", err)
		}
		if child.ID != testDir.ID || child.Name != "testdir" {
			t.Errorf("Unexpected child directory properties: %+v", child)
		}
	})

	// 4. Create File
	var testFile *models.Node
	t.Run("CreateFile", func(t *testing.T) {
		file := &models.Node{
			ParentID: testDir.ID,
			Name:     "testfile.txt",
			IsDir:    false,
			Mode:     0644,
			Size:     0,
			UID:      1001,
			GID:      1001,
		}
		var err error
		testFile, err = s.CreateNode(file)
		if err != nil {
			t.Fatalf("Failed to create file: %v", err)
		}
		if testFile.ID <= 1 || testFile.Name != "testfile.txt" || testFile.IsDir {
			t.Errorf("Unexpected created file properties: %+v", testFile)
		}
		// Check if corresponding file_data entry exists
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM file_data WHERE inode_id = ?", testFile.ID).Scan(&count)
		if err != nil {
			t.Fatalf("Failed to check file_data for new file: %v", err)
		}
		if count != 1 {
			t.Errorf("Expected 1 file_data entry for new file %d, got %d", testFile.ID, count)
		}
	})

	// 5. List Children
	t.Run("ListChildren", func(t *testing.T) {
		childrenRoot, err := s.ListChildren(1)
		if err != nil {
			t.Fatalf("Failed to list children of root: %v", err)
		}
		if len(childrenRoot) != 1 || childrenRoot[0].ID != testDir.ID {
			t.Errorf("Unexpected children of root (expected 1, got %d):", len(childrenRoot))
			for i, child := range childrenRoot {
				t.Errorf("  Child %d: %+v", i, child)
			}
			t.Errorf("Expected child ID: %d", testDir.ID)
		}

		childrenDir, err := s.ListChildren(testDir.ID)
		if err != nil {
			t.Fatalf("Failed to list children of testdir: %v", err)
		}
		if len(childrenDir) != 1 || childrenDir[0].ID != testFile.ID {
			t.Errorf("Unexpected children of testdir: %+v", childrenDir)
		}
	})

	// 6. Update Node (File Size and Mode)
	t.Run("UpdateNode", func(t *testing.T) {
		testFile.Size = 1024
		testFile.Mode = 0600
		newMtime := time.Now().Add(time.Minute)
		testFile.Mtime = newMtime

		err := s.UpdateNode(testFile)
		if err != nil {
			t.Fatalf("Failed to update node: %v", err)
		}

		updatedFile, err := s.GetNode(testFile.ID)
		if err != nil {
			t.Fatalf("Failed to get updated node: %v", err)
		}
		if updatedFile.Size != 1024 || updatedFile.Mode != 0600 {
			t.Errorf("Node update failed. Expected Size=1024, Mode=0600. Got: Size=%d, Mode=%v", updatedFile.Size, updatedFile.Mode)
		}
		// Use Truncate for potentially small differences in time storage/retrieval
		if !updatedFile.Mtime.Truncate(time.Second).Equal(newMtime.Truncate(time.Second)) {
			t.Errorf("Node update failed. Expected Mtime=%v, Got: %v", newMtime, updatedFile.Mtime)
		}
	})

	// 7. Delete File
	t.Run("DeleteFile", func(t *testing.T) {
		err := s.DeleteNode(testFile.ID)
		if err != nil {
			t.Fatalf("Failed to delete file: %v", err)
		}

		_, err = s.GetNode(testFile.ID)
		if !errors.Is(err, os.ErrNotExist) {
			t.Errorf("Expected os.ErrNotExist after deleting file, got %v", err)
		}
		// Check if corresponding file_data entry is also deleted (due to CASCADE)
		var count int
		err = db.QueryRow("SELECT COUNT(*) FROM file_data WHERE inode_id = ?", testFile.ID).Scan(&count)
		if err != nil && !errors.Is(err, sql.ErrNoRows) { // ErrNoRows is expected if count is 0
			// Check specific SQLite error if needed, but count check is simpler
		}
		if count != 0 {
			t.Errorf("Expected 0 file_data entries after deleting file %d, got %d", testFile.ID, count)
		}
	})

	// 8. Delete Non-Empty Directory (Should Fail)
	t.Run("DeleteNonEmptyDirectory", func(t *testing.T) {
		// Recreate the file to make the directory non-empty
		file := &models.Node{ParentID: testDir.ID, Name: "temp.txt", IsDir: false, Mode: 0644}
		_, _ = s.CreateNode(file)

		err := s.DeleteNode(testDir.ID)
		if err == nil {
			t.Error("Expected error when deleting non-empty directory, but got nil")
		} else {
			// Check if the error indicates non-empty (can be improved)
			t.Logf("Got expected error deleting non-empty dir: %v", err)
		}
		// Clean up the temp file
		child, _ := s.GetChildNode(testDir.ID, "temp.txt")
		if child != nil {
			_ = s.DeleteNode(child.ID)
		}
	})

	// 9. Delete Empty Directory
	t.Run("DeleteEmptyDirectory", func(t *testing.T) {
		err := s.DeleteNode(testDir.ID)
		if err != nil {
			t.Fatalf("Failed to delete empty directory: %v", err)
		}
		_, err = s.GetNode(testDir.ID)
		if !errors.Is(err, os.ErrNotExist) {
			t.Errorf("Expected os.ErrNotExist after deleting directory, got %v", err)
		}
	})

	// 10. Get Non-Existent Node
	t.Run("GetNonExistentNode", func(t *testing.T) {
		_, err := s.GetNode(9999)
		if !errors.Is(err, os.ErrNotExist) {
			t.Errorf("Expected os.ErrNotExist for non-existent node, got %v", err)
		}
	})
}
