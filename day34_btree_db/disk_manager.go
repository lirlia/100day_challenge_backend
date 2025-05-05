package rdbms

import (
	"errors"
	"fmt"
	"io"
	"os"
	"sync"
)

// PageSize は1ページのサイズ (バイト単位)
const PageSize = 4096 // 4KB

// PageData は1ページ分の生データ
type PageData [PageSize]byte

// PageID represents the identifier for a page on disk.
// Use uint32 for compatibility with binary encoding size.
type PageID uint32

// InvalidPageID represents an invalid or non-existent page.
const InvalidPageID PageID = 0

// Errors related to disk operations
var (
	ErrPageNotFound     = errors.New("page not found")
	ErrMetadataNotFound = errors.New("metadata not found or invalid")
)

// DiskManager はディスク上のデータベースファイルのページ管理を担当します。
type DiskManager struct {
	dbFile       *os.File
	pageSize     int64
	nextPageID   PageID
	mu           sync.Mutex          // ファイルアクセスとメタデータ更新の同期用
	freelist     map[PageID]struct{} // 解放されたページIDのリスト (メモリ上)
	metadata     Metadata
	metadataSize int64 // メタデータのおおよそのサイズ（ページ0に収まるか確認用）
}

const MetadataPageID = 0
const DefaultPageSize = 4096 // 4KB

// NewDiskManager は指定されたパスのデータベースファイルを開き、DiskManagerを初期化します。
// ファイルが存在しない場合は新しく作成されます。
func NewDiskManager(dbFilePath string) (*DiskManager, error) {
	file, err := os.OpenFile(dbFilePath, os.O_RDWR|os.O_CREATE, 0666)
	if err != nil {
		return nil, fmt.Errorf("failed to open database file %s: %w", dbFilePath, err)
	}

	dm := &DiskManager{
		dbFile:   file,
		pageSize: DefaultPageSize,
		freelist: make(map[PageID]struct{}),
	}

	fileInfo, err := file.Stat()
	if err != nil {
		file.Close() // エラー時はファイルを閉じる
		return nil, fmt.Errorf("failed to get file info for %s: %w", dbFilePath, err)
	}

	if fileInfo.Size() == 0 {
		// 新規ファイル: メタデータページを初期化
		fmt.Println("Initialized new database file.")
		dm.metadata = Metadata{
			NextPageID: 1,                             // 0はメタデータページなので1から開始
			TableRoots: make(map[string]PageID),       // 空のマップで初期化
			Schemas:    make(map[string]*TableSchema), // ポインタのマップで初期化
		}
		dm.nextPageID = dm.metadata.NextPageID     // nextpageidも初期化
		if err := dm.writeMetadata(); err != nil { // 新しいメタデータを書き込む
			file.Close()
			return nil, fmt.Errorf("failed to initialize metadata page: %w", err)
		}
	} else {
		// 既存ファイル: メタデータを読み込む
		fmt.Println("Opened existing database file.")
		if err := dm.readMetadata(); err != nil {
			file.Close()
			return nil, fmt.Errorf("failed to read metadata from existing file: %w", err)
		}
		// Ensure Schemas map is initialized if loaded metadata had nil map
		if dm.metadata.Schemas == nil {
			dm.metadata.Schemas = make(map[string]*TableSchema) // ポインタのマップで初期化
		}
		// ReadMetadata内で dm.metadata と dm.nextPageID が設定される
		fmt.Printf("Next Page ID: %d\n", dm.nextPageID)
		// TODO: Read free list from disk if implemented
	}

	return dm, nil
}

// AllocatePage は新しいページを割り当て、そのページIDを返します。
func (dm *DiskManager) AllocatePage() (PageID, error) {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	// TODO: Check freelist first

	pageID := dm.nextPageID
	dm.nextPageID++                        // 次のページIDをインクリメント
	dm.metadata.NextPageID = dm.nextPageID // メタデータも更新

	// ファイルサイズが不足している場合は拡張する (0埋め)
	fileInfo, err := dm.dbFile.Stat()
	if err != nil {
		return 0, fmt.Errorf("failed to get file info before allocate: %w", err)
	}
	requiredSize := int64(pageID) * dm.pageSize
	if fileInfo.Size() < requiredSize {
		if err := dm.dbFile.Truncate(requiredSize); err != nil {
			return 0, fmt.Errorf("failed to truncate file to %d bytes: %w", requiredSize, err)
		}
	}

	fmt.Printf("Allocated Page ID: %d\n", pageID)
	// 新規割当なのでディスク書き込みは不要。書き込みは WritePage/WriteNode 時に行われる。
	// メタデータの更新は Close 時などに行われる (頻繁な書き込みを避けるため)

	return pageID, nil
}

// DeallocatePage は指定されたページIDを解放済みとしてマークします。
func (dm *DiskManager) DeallocatePage(pageID PageID) error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if pageID == MetadataPageID {
		return fmt.Errorf("cannot deallocate metadata page 0")
	}
	fmt.Printf("Deallocating Page ID: %d (Freelist not implemented)\n", pageID)
	// TODO: Add pageID to freelist
	// TODO: Persist freelist
	dm.freelist[pageID] = struct{}{} // Add to in-memory freelist for now
	return nil
}

// ReadPage は指定されたページIDのデータを読み込み、data バッファに格納します。
func (dm *DiskManager) ReadPage(pageID PageID, data []byte) error {
	if pageID == MetadataPageID {
		return fmt.Errorf("cannot read metadata page 0 via ReadPage")
	}
	if len(data) != int(dm.pageSize) {
		return fmt.Errorf("data buffer size (%d) must match page size (%d)", len(data), dm.pageSize)
	}

	dm.mu.Lock() // ReadAt はスレッドセーフだが、ファイルサイズ変更との競合を避けるためにロック
	defer dm.mu.Unlock()

	offset := int64(pageID) * dm.pageSize
	n, err := dm.dbFile.ReadAt(data, offset)

	if err != nil {
		// ページが存在しない範囲を読み込もうとした場合、EOF が返る可能性がある
		if err == io.EOF {
			// ファイル終端に達したが、一部読めた場合と全く読めなかった場合を区別
			if n == 0 {
				return fmt.Errorf("page %d not found (read beyond file end): %w", pageID, ErrPageNotFound)
			} else {
				// ページの一部しか読めなかった場合 (通常は発生しないはずだが)
				return fmt.Errorf("partial read for page %d (%d bytes read): %w", pageID, n, err)
			}
		} else {
			// その他の I/O エラー
			return fmt.Errorf("failed to read page %d from file: %w", pageID, err)
		}
	} else if n != int(dm.pageSize) {
		// EOF ではないが、要求されたサイズを読み込めなかった場合
		return fmt.Errorf("short read for page %d: expected %d bytes, got %d", pageID, dm.pageSize, n)
	}

	return nil
}

// WritePage は指定されたページIDに data の内容を書き込みます。
func (dm *DiskManager) WritePage(pageID PageID, data []byte) error {
	if pageID == MetadataPageID {
		return fmt.Errorf("cannot write metadata page 0 via WritePage")
	}
	if len(data) != int(dm.pageSize) {
		return fmt.Errorf("data size (%d) must match page size (%d)", len(data), dm.pageSize)
	}

	dm.mu.Lock() // WriteAt はスレッドセーフだが、ファイルサイズ変更との競合を避けるためにロック
	defer dm.mu.Unlock()

	offset := int64(pageID) * dm.pageSize

	// ファイルサイズが足りない場合は拡張 (WriteAtが自動で行わないため)
	fileInfo, err := dm.dbFile.Stat()
	if err != nil {
		return fmt.Errorf("failed to get file info before write: %w", err)
	}
	requiredSize := offset + dm.pageSize
	if fileInfo.Size() < requiredSize {
		if err := dm.dbFile.Truncate(requiredSize); err != nil {
			return fmt.Errorf("failed to truncate file to %d bytes for page %d: %w", requiredSize, pageID, err)
		}
	}

	// ページデータを書き込む
	n, err := dm.dbFile.WriteAt(data, offset)
	if err != nil {
		return fmt.Errorf("failed to write page %d to file: %w", pageID, err)
	}
	if n != int(dm.pageSize) {
		return fmt.Errorf("short write for page %d: expected %d bytes, wrote %d", pageID, dm.pageSize, n)
	}

	return nil
}

// Close は DiskManager をクリーンアップし、ファイルを閉じます。
// メタデータの最終書き込みも行います。
func (dm *DiskManager) Close() error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	if dm.dbFile == nil {
		return nil // すでに閉じられている
	}

	fmt.Println("Flushing metadata before closing...")
	// メタデータをファイルに書き込む
	if err := dm.writeMetadataInternal(); err != nil {
		// Close処理中のエラーはログに出力するが、ファイルのCloseは試みる
		fmt.Printf("Warning: failed to write metadata on close: %v\n", err)
		// エラーを返すか、そのままCloseに進むか？ -> Closeは試みる
	}

	err := dm.dbFile.Close()
	dm.dbFile = nil // ファイルポインタをnilにして、閉じていることを示す
	if err != nil {
		return fmt.Errorf("failed to close database file: %w", err)
	}
	fmt.Println("Database file closed.")
	return nil
}
