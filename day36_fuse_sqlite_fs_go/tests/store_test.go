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

func TestDataStoreOperations(t *testing.T) {
	db, cleanup := SetupInMemoryTestDB(t)
	defer cleanup()

	s := store.NewSQLStore(db)

	// Create a test file first
	fileNode := &models.Node{
		ParentID: 1,
		Name:     "data_test.txt",
		IsDir:    false,
		Mode:     0644,
	}
	testFile, err := s.CreateNode(fileNode)
	if err != nil {
		t.Fatalf("Failed to create test file for data operations: %v", err)
	}

	// 1. Write Initial Data
	t.Run("WriteInitialData", func(t *testing.T) {
		data := []byte("Hello, FUSE!")
		n, err := s.WriteData(testFile.ID, 0, data)
		if err != nil {
			t.Fatalf("WriteData failed: %v", err)
		}
		if n != len(data) {
			t.Errorf("WriteData returned %d bytes, expected %d", n, len(data))
		}

		// Verify size and mtime update
		updatedNode, _ := s.GetNode(testFile.ID)
		if updatedNode.Size != int64(len(data)) {
			t.Errorf("Inode size not updated correctly: expected %d, got %d", len(data), updatedNode.Size)
		}
		// Mtime should be updated (equal or later than the original creation time, comparing Unix seconds)
		originalMtimeUnix := testFile.Mtime.Unix()
		updatedMtimeUnix := updatedNode.Mtime.Unix()
		if updatedMtimeUnix < originalMtimeUnix { // Compare Unix timestamps (seconds)
			t.Errorf("Inode mtime (Unix) decreased after write: original=%d, updated=%d (times: %v / %v)",
				originalMtimeUnix, updatedMtimeUnix, testFile.Mtime, updatedNode.Mtime)
		}
		if updatedMtimeUnix == originalMtimeUnix {
			// Log if Unix seconds are the same, which is acceptable
			t.Logf("Mtime (Unix) unchanged (likely due to test speed and second precision): original=%d (%v)", originalMtimeUnix, testFile.Mtime)
		}
	})

	// 2. Read Initial Data
	t.Run("ReadInitialData", func(t *testing.T) {
		expectedData := []byte("Hello, FUSE!")
		readData, err := s.ReadData(testFile.ID, 0, len(expectedData)+10) // Read more than available
		if err != nil {
			t.Fatalf("ReadData failed: %v", err)
		}
		if string(readData) != string(expectedData) {
			t.Errorf("ReadData returned %q, expected %q", string(readData), string(expectedData))
		}
	})

	// 3. Overwrite Part of the Data
	t.Run("OverwriteData", func(t *testing.T) {
		newData := []byte("World") // Overwrite ", FUSE!"
		offset := int64(7)         // Start after "Hello, "
		n, err := s.WriteData(testFile.ID, offset, newData)
		if err != nil {
			t.Fatalf("WriteData (overwrite) failed: %v", err)
		}
		if n != len(newData) {
			t.Errorf("WriteData (overwrite) returned %d bytes, expected %d", n, len(newData))
		}

		expectedCombined := "Hello, World"
		updatedNode, _ := s.GetNode(testFile.ID)
		if updatedNode.Size != int64(len(expectedCombined)) {
			t.Errorf("Inode size after overwrite incorrect: expected %d, got %d", len(expectedCombined), updatedNode.Size)
		}

		readData, _ := s.ReadData(testFile.ID, 0, 100)
		if string(readData) != expectedCombined {
			t.Errorf("ReadData after overwrite returned %q, expected %q", string(readData), expectedCombined)
		}
	})

	// 4. Read with Offset
	t.Run("ReadWithOffset", func(t *testing.T) {
		expectedData := []byte("World")
		offset := int64(7)
		readData, err := s.ReadData(testFile.ID, offset, len(expectedData))
		if err != nil {
			t.Fatalf("ReadData with offset failed: %v", err)
		}
		if string(readData) != string(expectedData) {
			t.Errorf("ReadData with offset returned %q, expected %q", string(readData), string(expectedData))
		}
	})

	// 5. Write Past EOF (Extend File)
	t.Run("WritePastEOF", func(t *testing.T) {
		extendData := []byte("!!!")
		offset := int64(len("Hello, World")) // Write right after the current end
		n, err := s.WriteData(testFile.ID, offset, extendData)
		if err != nil {
			t.Fatalf("WriteData (extend) failed: %v", err)
		}
		if n != len(extendData) {
			t.Errorf("WriteData (extend) returned %d bytes, expected %d", n, len(extendData))
		}

		expectedExtended := "Hello, World!!!"
		updatedNode, _ := s.GetNode(testFile.ID)
		if updatedNode.Size != int64(len(expectedExtended)) {
			t.Errorf("Inode size after extend incorrect: expected %d, got %d", len(expectedExtended), updatedNode.Size)
		}

		readData, _ := s.ReadData(testFile.ID, 0, 100)
		if string(readData) != expectedExtended {
			t.Errorf("ReadData after extend returned %q, expected %q", string(readData), expectedExtended)
		}
	})

	// 6. Write with Gap (Should fill with zeros - implicitly handled by slice allocation)
	t.Run("WriteWithGap", func(t *testing.T) {
		gapData := []byte("END")
		offset := int64(len("Hello, World!!!") + 5) // Leave a 5-byte gap
		n, err := s.WriteData(testFile.ID, offset, gapData)
		if err != nil {
			t.Fatalf("WriteData (gap) failed: %v", err)
		}
		if n != len(gapData) {
			t.Errorf("WriteData (gap) returned %d bytes, expected %d", n, len(gapData))
		}

		expectedGap := "Hello, World!!!\x00\x00\x00\x00\x00END"
		updatedNode, _ := s.GetNode(testFile.ID)
		if updatedNode.Size != int64(len(expectedGap)) {
			t.Errorf("Inode size after gap write incorrect: expected %d, got %d", len(expectedGap), updatedNode.Size)
		}

		readData, _ := s.ReadData(testFile.ID, 0, 100)
		if string(readData) != expectedGap {
			t.Errorf("ReadData after gap write returned %q, expected %q", string(readData), expectedGap)
		}
	})

	// 7. Delete Data (Truncate)
	t.Run("DeleteData", func(t *testing.T) {
		err := s.DeleteData(testFile.ID)
		if err != nil {
			t.Fatalf("DeleteData failed: %v", err)
		}

		// Verify data is empty
		readData, _ := s.ReadData(testFile.ID, 0, 100)
		if len(readData) != 0 {
			t.Errorf("ReadData after DeleteData returned %d bytes, expected 0", len(readData))
		}

		// Verify size is 0
		updatedNode, _ := s.GetNode(testFile.ID)
		if updatedNode.Size != 0 {
			t.Errorf("Inode size after DeleteData incorrect: expected 0, got %d", updatedNode.Size)
		}
	})

	// 8. Read/Write Directory (Should Fail)
	t.Run("ReadWriteDirectory", func(t *testing.T) {
		rootDir, _ := s.GetNode(1)
		_, err := s.ReadData(rootDir.ID, 0, 10)
		if err == nil {
			t.Error("ReadData on directory succeeded unexpectedly")
		}
		_, err = s.WriteData(rootDir.ID, 0, []byte("test"))
		if err == nil {
			t.Error("WriteData on directory succeeded unexpectedly")
		}
	})
}
