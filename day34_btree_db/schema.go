package rdbms

import (
	"bytes"
	"encoding/gob"
	"errors"
	"fmt"
)

func init() {
	// Register TableSchema type for gob encoding/decoding
	gob.Register(TableSchema{})
	// Optionally register other custom types if needed, e.g., ColumnDefinition
	gob.Register(ColumnDefinition{})
}

var ErrNotFound = errors.New("record not found") // Define ErrNotFound

// ColumnType はカラムのデータ型を表す簡易的な型です。
type ColumnType string

const (
	TypeInteger ColumnType = "INTEGER"
	TypeText    ColumnType = "TEXT"
)

// ColumnDefinition はテーブルのカラム定義を表します。
type ColumnDefinition struct {
	Name         string
	Type         ColumnType
	IsPrimaryKey bool
}

// TableSchema はテーブルのスキーマ情報を保持します。
type TableSchema struct {
	TableName string
	Columns   []ColumnDefinition
	columnMap map[string]*ColumnDefinition `gob:"-"` // Map for quick column lookup by name (Excluded from gob)
	pkColumn  string                       // Name of the primary key column (Needs explicit encoding)
}

// --- Gob Encoding/Decoding for TableSchema ---

// temporary struct for gob encoding/decoding TableSchema
type tableSchemaGob struct {
	TableName string
	Columns   []ColumnDefinition
	PkColumn  string // Use exported name for gob
}

// GobEncode implements the gob.GobEncoder interface for TableSchema.
func (ts *TableSchema) GobEncode() ([]byte, error) {
	if DebugModeEnabled {
		fmt.Printf("DEBUG: GobEncode called for TableSchema: %s\n", ts.TableName) // Debug log
	}
	// Create a temporary struct with exported fields to encode
	temp := tableSchemaGob{
		TableName: ts.TableName,
		Columns:   ts.Columns,
		PkColumn:  ts.pkColumn, // Store pkColumn
	}

	var buf bytes.Buffer
	encoder := gob.NewEncoder(&buf)
	if err := encoder.Encode(temp); err != nil {
		if DebugModeEnabled {
			fmt.Printf("ERROR: GobEncode failed for TableSchema %s: %v\n", ts.TableName, err) // Debug log
		}
		return nil, fmt.Errorf("failed to gob encode TableSchema: %w", err)
	}
	return buf.Bytes(), nil
}

// GobDecode implements the gob.GobDecoder interface for TableSchema.
func (ts *TableSchema) GobDecode(data []byte) error {
	if DebugModeEnabled {
		fmt.Println("DEBUG: GobDecode called for TableSchema") // Debug log
	}
	var temp tableSchemaGob
	buf := bytes.NewBuffer(data)
	decoder := gob.NewDecoder(buf)
	if err := decoder.Decode(&temp); err != nil {
		if DebugModeEnabled {
			fmt.Printf("ERROR: GobDecode failed to decode temp struct: %v\n", err) // Debug log
		}
		return fmt.Errorf("failed to gob decode into temporary TableSchema: %w", err)
	}

	// Populate the actual TableSchema fields
	ts.TableName = temp.TableName
	ts.Columns = temp.Columns
	ts.pkColumn = temp.PkColumn // Restore pkColumn
	if DebugModeEnabled {
		fmt.Printf("DEBUG: GobDecode successful for TableSchema: %s\n", ts.TableName) // Debug log
	}

	// Rebuild the columnMap after decoding
	ts.columnMap = make(map[string]*ColumnDefinition)
	for i := range ts.Columns {
		col := &ts.Columns[i]
		ts.columnMap[col.Name] = col
	}
	if DebugModeEnabled {
		fmt.Printf("DEBUG: Rebuilt columnMap for %s: %v\n", ts.TableName, ts.columnMap) // Debug log
	}

	return nil
}

// --- End Gob Encoding/Decoding ---

// serializePayload moved to operations.go
/*
func serializePayload(payload map[string]interface{}) ([]byte, error) {
// ... implementation ...
}
*/

// deserializePayload moved to operations.go
/*
func deserializePayload(data []byte) (map[string]interface{}, error) {
// ... implementation ...
}
*/
