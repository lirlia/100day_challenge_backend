package rdbms

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

// Helper to create a DiskManager for testing, ensuring cleanup
func setupDiskManager(t *testing.T) (*DiskManager, string) {
	t.Helper()
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "test_disk.dbf")
	dm, err := NewDiskManager(filePath)
	if err != nil {
		t.Fatalf("setupDiskManager failed: %v", err)
	}
	// Ensure the file is closed at the end of the test
	t.Cleanup(func() {
		err := dm.Close()
		if err != nil {
			// Log error, but don't fail the test just for cleanup error
			t.Logf("Warning: error closing disk manager during cleanup: %v", err)
		}
	})
	return dm, filePath
}

func TestNewDiskManager(t *testing.T) {
	tempDir := t.TempDir()
	filePath := filepath.Join(tempDir, "new_disk_manager_test.dbf")

	// 1. New file creation
	dm, err := NewDiskManager(filePath)
	if err != nil {
		t.Fatalf("NewDiskManager failed for new file: %v", err)
	}
	if dm == nil {
		t.Fatal("NewDiskManager returned nil manager")
	}
	if dm.dbFile == nil {
		t.Fatal("DiskManager file handle is nil after creation")
	}
	if dm.nextPageID != 1 { // Data pages start from 1
		t.Errorf("Expected nextPage 1 for new file, got %d", dm.nextPageID)
	}
	// Check if file exists and has minimum size (at least one page for metadata)
	info, err := os.Stat(filePath)
	if err != nil {
		t.Fatalf("os.Stat failed after new file creation: %v", err)
	}
	// Expect at least the default page size because we write the metadata page
	if info.Size() < DefaultPageSize {
		t.Errorf("New file size is %d, expected at least %d (one page)", info.Size(), DefaultPageSize)
	}
	err = dm.Close()
	if err != nil {
		t.Fatalf("Failed to close disk manager after new file test: %v", err)
	}

	// 2. Reopening existing file (metadata only)
	dm, err = NewDiskManager(filePath)
	if err != nil {
		t.Fatalf("NewDiskManager failed when reopening metadata-only file: %v", err)
	}
	if dm.nextPageID != 1 { // Should still be 1 as no data pages were added
		t.Errorf("Expected nextPage 1 when reopening metadata-only file, got %d", dm.nextPageID)
	}

	// 3. Simulate a file with existing data pages by writing some
	page1ID, _ := dm.AllocatePage() // Allocate page 1
	page2ID, _ := dm.AllocatePage() // Allocate page 2
	var dummyData PageData
	_ = dm.WritePage(page1ID, dummyData[:]) // Write dummy data to page 1
	_ = dm.WritePage(page2ID, dummyData[:]) // Write dummy data to page 2
	currentNextPageID := dm.nextPageID      // Should be 3 now

	// Close the current dm
	err = dm.Close()
	if err != nil {
		t.Fatalf("Failed to close dm before reopening test data file: %v", err)
	}

	// Reopen the file (it should now contain metadata + 2 pages)
	dm, err = NewDiskManager(filePath)
	if err != nil {
		t.Fatalf("NewDiskManager failed reopening file with data pages: %v", err)
	}
	// nextPage should be what it was before closing (3)
	if dm.nextPageID != currentNextPageID {
		t.Errorf("Expected nextPage %d for file with metadata + 2 pages, got %d", currentNextPageID, dm.nextPageID)
	}
	err = dm.Close()
	if err != nil {
		t.Fatalf("Failed to close disk manager finally: %v", err)
	}
}

func TestDiskManager_AllocatePage(t *testing.T) {
	dm, _ := setupDiskManager(t)

	// First allocation should be page ID 1
	pageID1, err := dm.AllocatePage()
	if err != nil {
		t.Fatalf("AllocatePage failed: %v", err)
	}
	if pageID1 != 1 {
		t.Errorf("Expected first allocated page ID to be 1, got %d", pageID1)
	}
	if dm.nextPageID != 2 { // Check if nextPage was incremented
		t.Errorf("Expected nextPage to be 2 after first allocation, got %d", dm.nextPageID)
	}

	// Second allocation should be page ID 2
	pageID2, err := dm.AllocatePage()
	if err != nil {
		t.Fatalf("AllocatePage failed: %v", err)
	}
	if pageID2 != 2 {
		t.Errorf("Expected second allocated page ID to be 2, got %d", pageID2)
	}
	if dm.nextPageID != 3 { // Check increment again
		t.Errorf("Expected nextPage to be 3 after second allocation, got %d", dm.nextPageID)
	}
}

func TestDiskManager_ReadWritePage(t *testing.T) {
	dm, _ := setupDiskManager(t)

	pageID, err := dm.AllocatePage() // Allocate page 1
	if err != nil {
		t.Fatalf("AllocatePage failed: %v", err)
	}

	// Prepare write data
	var writeData PageData
	copy(writeData[:], "TestData for Page 1") // Use a meaningful string

	// Write the page
	err = dm.WritePage(pageID, writeData[:]) // Pass slice
	if err != nil {
		t.Fatalf("WritePage failed for page %d: %v", pageID, err)
	}

	// Prepare read buffer
	var readData PageData

	// Read the page back
	err = dm.ReadPage(pageID, readData[:]) // Pass slice
	if err != nil {
		t.Fatalf("ReadPage failed for page %d: %v", pageID, err)
	}

	// Compare written and read data
	if !bytes.Equal(writeData[:], readData[:]) {
		t.Errorf("Read data does not match written data for page %d", pageID)
		// Log the actual data (limited length for readability)
		t.Logf("Wrote: %q...", writeData[:30])
		t.Logf("Read:  %q...", readData[:30])
	}
}

func TestDiskManager_ReadWriteMultiplePages(t *testing.T) {
	dm, _ := setupDiskManager(t)

	pageID1, err := dm.AllocatePage() // Page 1
	if err != nil {
		t.Fatalf("AllocatePage failed: %v", err)
	}
	pageID2, err := dm.AllocatePage() // Page 2
	if err != nil {
		t.Fatalf("AllocatePage failed: %v", err)
	}

	var writeData1, writeData2 PageData
	copy(writeData1[:], "Content for Page One")
	copy(writeData2[:], "Content for Page Two")

	err = dm.WritePage(pageID1, writeData1[:]) // Pass slice
	if err != nil {
		t.Fatalf("WritePage failed for page %d: %v", pageID1, err)
	}
	err = dm.WritePage(pageID2, writeData2[:]) // Pass slice
	if err != nil {
		t.Fatalf("WritePage failed for page %d: %v", pageID2, err)
	}

	var readData1, readData2 PageData
	err = dm.ReadPage(pageID1, readData1[:]) // Pass slice
	if err != nil {
		t.Fatalf("ReadPage failed for page %d: %v", pageID1, err)
	}
	err = dm.ReadPage(pageID2, readData2[:]) // Pass slice
	if err != nil {
		t.Fatalf("ReadPage failed for page %d: %v", pageID2, err)
	}

	if !bytes.Equal(writeData1[:], readData1[:]) {
		t.Errorf("Data mismatch for page %d", pageID1)
	}
	if !bytes.Equal(writeData2[:], readData2[:]) {
		t.Errorf("Data mismatch for page %d", pageID2)
	}
}

func TestDiskManager_ReadUnallocatedPage(t *testing.T) {
	dm, _ := setupDiskManager(t)

	unallocatedPageID := PageID(5) // Assume page 5 is far beyond allocated pages
	var readData PageData
	err := dm.ReadPage(unallocatedPageID, readData[:]) // Pass slice

	if !errors.Is(err, ErrPageNotFound) {
		t.Errorf("Expected ErrPageNotFound when reading unallocated page %d, but got: %v", unallocatedPageID, err)
	}
}

func TestDiskManager_ReadPageZero(t *testing.T) {
	dm, _ := setupDiskManager(t)
	var readData PageData
	err := dm.ReadPage(0, readData[:]) // Pass slice
	if err == nil {
		t.Errorf("Expected error when reading page 0, but got nil")
	}
}

func TestDiskManager_WritePageZero(t *testing.T) {
	dm, _ := setupDiskManager(t)
	var writeData PageData
	err := dm.WritePage(0, writeData[:]) // Pass slice
	if err == nil {
		t.Errorf("Expected error when writing page 0, but got nil")
	}
}

func TestDiskManager_ReadWriteMetadata(t *testing.T) {
	dm, _ := setupDiskManager(t)
	defer dm.Close()

	// Modify metadata in memory
	testTableName := "my_table"
	var testRootPageID PageID = 5
	dm.mu.Lock() // Lock to modify metadata map
	if dm.metadata.TableRoots == nil {
		dm.metadata.TableRoots = make(map[string]PageID)
	}
	dm.metadata.TableRoots[testTableName] = testRootPageID
	dm.mu.Unlock()

	// Write metadata (using internal method as WriteMetadata is not public)
	if err := dm.writeMetadata(); err != nil {
		t.Fatalf("writeMetadata failed: %v", err)
	}

	// Create a new DiskManager instance for the same file to read metadata
	dm2, err := NewDiskManager(dm.dbFile.Name()) // Reopen the same file
	if err != nil {
		t.Fatalf("NewDiskManager (reopen) failed: %v", err)
	}
	defer dm2.Close()

	// Verify the loaded metadata
	dm2.mu.Lock() // Lock to read metadata map
	loadedRoot, exists := dm2.metadata.TableRoots[testTableName]
	dm2.mu.Unlock()
	if !exists {
		t.Errorf("Metadata for table '%s' not found after write/read", testTableName)
	}
	if loadedRoot != testRootPageID {
		t.Errorf("Read metadata mismatch for table '%s'. Got %d, want %d", testTableName, loadedRoot, testRootPageID)
	}
}

func TestDiskManager_Close(t *testing.T) {
	dm, _ := setupDiskManager(t) // Setup also handles cleanup

	// Close it explicitly
	err := dm.Close()
	if err != nil {
		t.Errorf("First Close failed: %v", err)
	}

	// Check if file handle is nil
	// (Accessing dm.file directly isn't ideal, but okay for test)
	if dm.dbFile != nil {
		t.Errorf("File handle should be nil after Close, but it's not")
	}

	// Closing again should be safe (no-op or return nil)
	err = dm.Close()
	if err != nil {
		t.Errorf("Closing an already closed manager returned an error: %v", err)
	}

	// Attempting operations after close should fail
	var data PageData
	err = dm.ReadPage(1, data[:]) // Pass slice
	if err == nil {
		t.Errorf("ReadPage should fail after Close")
	}
	err = dm.WritePage(1, data[:]) // Pass slice
	if err == nil {
		t.Errorf("WritePage should fail after Close")
	}
	// AllocatePage might panic or return 0/error
	// _ = dm.AllocatePage() // Uncomment to test if it panics or returns error
}

func TestDiskManager_ReadPage_NotFound(t *testing.T) {
	dm, _ := setupDiskManager(t)
	defer dm.Close()
	var readData PageData
	err := dm.ReadPage(999, readData[:]) // Pass slice
	if err == nil {
		t.Errorf("Expected error when reading non-existent page, got nil")
	}
	// TODO: Check for a specific error type if DiskManager returns one
}

func TestDiskManager_WritePage_InvalidSize(t *testing.T) {
	dm, _ := setupDiskManager(t)
	defer dm.Close()
	pageID, err := dm.AllocatePage()
	if err != nil {
		t.Fatalf("AllocatePage failed: %v", err)
	}
	invalidData := make([]byte, PageSize-1) // Incorrect size
	err = dm.WritePage(pageID, invalidData)
	if err == nil {
		t.Errorf("Expected error when writing data with invalid size, got nil")
	}
}
