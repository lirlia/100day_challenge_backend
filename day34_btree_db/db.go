package rdbms

import (
	"fmt"
	"sync"
)

// DebugModeEnabled controls whether debug logs are printed.
var DebugModeEnabled bool

// SetDebugMode enables or disables the debug logging globally for the rdbms package.
func SetDebugMode(enabled bool) {
	DebugModeEnabled = enabled
}

// init moved to schema.go
/*
func init() {
	// Register TableSchema type for gob encoding/decoding
	gob.Register(TableSchema{})
	// Optionally register other custom types if needed, e.g., ColumnDefinition
	gob.Register(ColumnDefinition{})
}
*/

// ErrNotFound moved to schema.go
// var ErrNotFound = errors.New("record not found") // Define ErrNotFound

// ColumnType moved to schema.go
/*
type ColumnType string

const (
	TypeInteger ColumnType = "INTEGER"
	TypeText    ColumnType = "TEXT"
)
*/

// ColumnDefinition moved to schema.go
/*
type ColumnDefinition struct {
	Name         string
	Type         ColumnType
	IsPrimaryKey bool
}
*/

// TableSchema moved to schema.go
/*
type TableSchema struct {
	TableName string
	Columns   []ColumnDefinition
	columnMap map[string]*ColumnDefinition `gob:"-"` // Map for quick column lookup by name (Excluded from gob)
	pkColumn  string                       // Name of the primary key column (Needs explicit encoding)
}
*/

// tableSchemaGob moved to schema.go
/*
type tableSchemaGob struct {
	TableName string
	Columns   []ColumnDefinition
	PkColumn  string // Use exported name for gob
}
*/

// GobEncode moved to schema.go
/*
func (ts *TableSchema) GobEncode() ([]byte, error) {
// ... implementation ...
}
*/

// GobDecode moved to schema.go
/*
func (ts *TableSchema) GobDecode(data []byte) error {
// ... implementation ...
}
*/

// Database はデータベース全体の状態を管理します。
type Database struct {
	dm            *DiskManager
	mu            sync.RWMutex // Protects schemas map and potentially other shared resources
	schemas       map[string]*TableSchema
	treeCache     map[string]*BTree // Cache for loaded B+Trees
	defaultDegree int
}

// NewDatabase は新しいDatabaseインスタンスを作成します。
func NewDatabase(dbFilePath string, defaultDegree int) (*Database, error) {
	if defaultDegree < 2 {
		defaultDegree = DefaultDegree
	}
	dm, err := NewDiskManager(dbFilePath)
	if err != nil {
		return nil, fmt.Errorf("failed to initialize disk manager for %s: %w", dbFilePath, err)
	}

	// Load existing schemas from Disk Manager metadata
	loadedSchemas := dm.GetAllTableSchemas() // Returns map[string]*TableSchema
	// No need to copy, NewDatabase is the owner for now.
	// We might need locking if schemas can be modified concurrently later.
	schemasMap := loadedSchemas // Directly assign the map

	return &Database{
		schemas:       schemasMap, // Use loaded schemas
		defaultDegree: defaultDegree,
		dm:            dm,
	}, nil
}

// CreateTable は新しいテーブルを作成します (内部関数)。
// Moved to operations.go
/*
func (db *Database) CreateTable(tableName string, columns []ColumnDefinition) error {
// ... implementation ...
}
*/

// serializePayload moved to schema.go
/*
func serializePayload(payload map[string]interface{}) ([]byte, error) {
// ... implementation ...
}
*/

// deserializePayload moved to schema.go
/*
func deserializePayload(data []byte) (map[string]interface{}, error) {
// ... implementation ...
}
*/

// getTableSchemaInternal retrieves the schema. It no longer returns a BTree directly.
func (db *Database) getTableSchemaInternal(tableName string) (*TableSchema, error) {
	db.mu.RLock()
	defer db.mu.RUnlock()
	schema, schemaExists := db.schemas[tableName]
	if !schemaExists {
		return nil, fmt.Errorf("table '%s' not found", tableName)
	}
	return schema, nil
}

// GetTable is now primarily for getting the schema. Getting BTree requires LoadBTree.
func (db *Database) GetTable(tableName string) (*TableSchema, error) {
	return db.getTableSchemaInternal(tableName)
}

// LoadTableBTree retrieves the BTree for a table.
// This should be called by operations needing the BTree (Insert, Select, Delete).
func (db *Database) LoadTableBTree(tableName string) (*BTree, error) {
	db.mu.RLock() // Lock for reading schema and dm
	defer db.mu.RUnlock()

	schema, schemaExists := db.schemas[tableName]
	if !schemaExists {
		return nil, fmt.Errorf("schema not found for table '%s'", tableName)
	}

	rootPageID, rootExists := db.dm.GetTableRoot(tableName)
	if !rootExists {
		// This implies inconsistency between in-memory schema and disk metadata
		return nil, fmt.Errorf("metadata root entry not found for table '%s', but schema exists", tableName)
	}
	if rootPageID == InvalidPageID {
		// This might happen if the table was just created but something failed?
		return nil, fmt.Errorf("invalid root page ID found in metadata for table '%s'", tableName)
	}

	// --- Load or Create BTree Object ---
	// We need a way to create a BTree instance associated with an existing root.
	// Assume NewBTree can handle this or add a LoadBTree function.
	// Let's modify NewBTree to accept an optional rootPageID.
	// If rootPageID is valid, load; otherwise, create new.
	// Passing 0 as degree here means NewBTree should read it from metadata or use default?
	// Let's pass the known degree.
	tree, err := NewBTree(db.dm, rootPageID, db.defaultDegree) // Assume NewBTree is modified
	if err != nil {
		return nil, fmt.Errorf("failed to load B+Tree for table '%s' (root %d): %w", tableName, rootPageID, err)
	}

	_ = schema // Use schema if needed later (e.g., for degree?)
	return tree, nil
}

// --- Data Manipulation Methods (Moved to operations.go) ---

// InsertRow moved to operations.go

// SearchRow moved to operations.go

// DeleteRow moved to operations.go

// UpdateRow moved to operations.go

// ScanTable moved to operations.go

// ScanTableRange moved to operations.go

// --- Database Management Methods ---

// GetTableNames returns a slice of table names currently known to the database.
func (db *Database) GetTableNames() []string {
	db.mu.RLock()
	defer db.mu.RUnlock()
	tableNames := make([]string, 0, len(db.schemas))
	for name := range db.schemas {
		tableNames = append(tableNames, name)
	}
	return tableNames
}

// Close closes the database connection by closing the disk manager.
func (db *Database) Close() error {
	db.mu.Lock() // Acquire write lock to prevent reads during close
	defer db.mu.Unlock()
	if db.dm != nil {
		err := db.dm.Close()
		db.dm = nil // Mark dm as closed
		return err
	}
	return nil
}
