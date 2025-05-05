package rdbms

import (
	"bytes"
	"encoding/binary"
	"encoding/gob"
	"fmt"
	"io"
)

// Metadata layout constants (needed here as well)
const (
	MetaActualDataSizeOffset = 0 // 4 bytes (uint32 for actual gob data size)
	MetaGobDataOffset        = 4 // Offset where gob data starts
)

// Metadata はデータベースファイルのメタデータ（ページ0）に保存される情報です。
type Metadata struct {
	NextPageID PageID
	TableRoots map[string]PageID
	Schemas    map[string]*TableSchema
}

// writeMetadata は現在のメタデータをページ0に書き込みます。
func (dm *DiskManager) writeMetadata() error {
	dm.mu.Lock()
	defer dm.mu.Unlock()
	return dm.writeMetadataInternal()
}

// readMetadata はページ0からメタデータを読み込みます。
func (dm *DiskManager) readMetadata() error {
	dm.mu.Lock()
	defer dm.mu.Unlock()

	// Read the entire metadata page (page 0)
	pageData := make([]byte, dm.pageSize)
	n, err := dm.dbFile.ReadAt(pageData, 0)
	if err != nil {
		// Distinguish EOF due to empty/short file vs other errors
		if err == io.EOF && n == 0 {
			// This might happen if the file was created but never written to (e.g., crash)
			// Consider initializing default metadata here?
			return fmt.Errorf("metadata page is empty or could not be read: %w", ErrMetadataNotFound)
		} else if err != nil && err != io.EOF {
			return fmt.Errorf("failed to read metadata page: %w", err)
		} // Allow partial read if EOF is reached but some data read (n > 0)
	}

	// Read the actual data size from the prefix
	if n < MetaGobDataOffset {
		return fmt.Errorf("metadata page too short to read data size (%d bytes)", n)
	}
	actualDataSize := binary.LittleEndian.Uint32(pageData[MetaActualDataSizeOffset:])

	// Check if the stored size makes sense
	maxPossibleSize := uint32(n - MetaGobDataOffset)
	if actualDataSize > maxPossibleSize {
		return fmt.Errorf("stored metadata size (%d) exceeds available data in page (%d)", actualDataSize, maxPossibleSize)
	}

	// Create a buffer with only the actual gob data
	buf := bytes.NewBuffer(pageData[MetaGobDataOffset : MetaGobDataOffset+int(actualDataSize)])
	decoder := gob.NewDecoder(buf)
	var loadedMetadata Metadata
	if err := decoder.Decode(&loadedMetadata); err != nil {
		// Check for EOF specifically, might indicate corrupted size prefix
		if err == io.EOF {
			return fmt.Errorf("failed to decode metadata: unexpected end of data (likely corrupted size prefix or data): %w", err)
		}
		return fmt.Errorf("failed to decode metadata: %w", err)
	}

	dm.metadata = loadedMetadata
	dm.metadataSize = int64(actualDataSize) // Store the read size
	dm.nextPageID = dm.metadata.NextPageID
	if dm.metadata.TableRoots == nil {
		dm.metadata.TableRoots = make(map[string]PageID)
	}
	if dm.metadata.Schemas == nil {
		dm.metadata.Schemas = make(map[string]*TableSchema)
	}

	return nil
}

// --- New Methods for Table Root and Schema Management ---

// GetTableRoot は指定されたテーブル名のルートページIDを取得します。
func (dm *DiskManager) GetTableRoot(tableName string) (PageID, bool) {
	dm.mu.Lock() // Lock for reading metadata map
	defer dm.mu.Unlock()
	// メタデータが最新でない可能性を考慮する場合、ここでreadMetadataを呼ぶか、
	// 定期的に読み込む必要があるが、簡略化のためメモリ上のキャッシュを読む
	root, exists := dm.metadata.TableRoots[tableName]
	return root, exists
}

// SetTableRoot は指定されたテーブル名のルートページIDを設定（または更新）します。
func (dm *DiskManager) SetTableRoot(tableName string, root PageID) error {
	dm.mu.Lock()
	// Update the map in memory
	dm.metadata.TableRoots[tableName] = root
	dm.mu.Unlock() // Unlock before writing metadata to avoid nested lock

	// Write the updated metadata back to disk
	return dm.writeMetadata()
}

// DeleteTableRoot は指定されたテーブル名のルート情報を削除します (DROP TABLE用)。
func (dm *DiskManager) DeleteTableRoot(tableName string) error {
	dm.mu.Lock()
	_, exists := dm.metadata.TableRoots[tableName]
	if !exists {
		dm.mu.Unlock()
		return fmt.Errorf("table '%s' not found in metadata for deletion", tableName)
	}
	delete(dm.metadata.TableRoots, tableName)
	dm.mu.Unlock()

	return dm.writeMetadata()
}

// GetTableSchema は指定されたテーブル名のスキーマ情報を取得します。
func (dm *DiskManager) GetTableSchema(tableName string) (*TableSchema, bool) {
	dm.mu.Lock()
	defer dm.mu.Unlock()
	schema, exists := dm.metadata.Schemas[tableName]
	return schema, exists
}

// SetTableSchema は指定されたテーブル名のスキーマ情報を設定（または更新）します。
// テーブル作成時に使用します。
func (dm *DiskManager) SetTableSchema(schema *TableSchema) error {
	if schema == nil {
		return fmt.Errorf("cannot set nil schema")
	}
	dm.mu.Lock()
	tableName := schema.TableName
	dm.metadata.Schemas[tableName] = schema
	dm.mu.Unlock()
	// Write the updated metadata back to disk
	return dm.writeMetadata()
}

// GetAllTableSchemas は全てのテーブルスキーマを取得します。
func (dm *DiskManager) GetAllTableSchemas() map[string]*TableSchema {
	dm.mu.Lock()
	defer dm.mu.Unlock()
	schemasCopy := make(map[string]*TableSchema)
	for name, schema := range dm.metadata.Schemas {
		schemasCopy[name] = schema // This copies the pointer, which is fine
	}
	return schemasCopy
}

// DeleteTableMetadata は指定されたテーブルのメタデータ (RootとSchema) を削除します。
func (dm *DiskManager) DeleteTableMetadata(tableName string) error {
	dm.mu.Lock()
	schemaExists := false
	if _, exists := dm.metadata.Schemas[tableName]; exists {
		delete(dm.metadata.Schemas, tableName)
		schemaExists = true
	}
	rootExists := false
	if _, exists := dm.metadata.TableRoots[tableName]; exists {
		delete(dm.metadata.TableRoots, tableName)
		rootExists = true
	}
	dm.mu.Unlock()

	if !schemaExists && !rootExists {
		return fmt.Errorf("table '%s' not found in metadata for deletion", tableName)
	}

	// Write updated metadata only if something was actually deleted
	if schemaExists || rootExists {
		return dm.writeMetadata()
	}
	return nil
}

// writeMetadataInternal はメタデータを実際にファイルに書き込みます (ロックなし)。
// writeMetadata と Close から呼び出されます。
func (dm *DiskManager) writeMetadataInternal() error {
	// 1. Serialize the current metadata object using gob
	var buf bytes.Buffer
	encoder := gob.NewEncoder(&buf)
	if err := encoder.Encode(dm.metadata); err != nil {
		return fmt.Errorf("failed to gob encode metadata: %w", err)
	}
	encodedData := buf.Bytes()
	actualDataSize := uint32(len(encodedData))

	// 2. Prepare the full metadata page data
	pageData := make([]byte, dm.pageSize)

	// 3. Write the actual data size prefix
	binary.LittleEndian.PutUint32(pageData[MetaActualDataSizeOffset:], actualDataSize)

	// 4. Copy the gob data into the page buffer
	requiredLength := MetaGobDataOffset + int(actualDataSize)
	if requiredLength > len(pageData) {
		return fmt.Errorf("encoded metadata size (%d) exceeds page size (%d)", requiredLength, dm.pageSize)
	}
	copy(pageData[MetaGobDataOffset:], encodedData)

	// 5. Write the entire page to disk at offset 0
	_, err := dm.dbFile.WriteAt(pageData, 0)
	if err != nil {
		return fmt.Errorf("failed to write metadata page: %w", err)
	}

	dm.metadataSize = int64(actualDataSize) // Update the stored size

	return nil
}
