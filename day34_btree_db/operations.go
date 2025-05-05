package rdbms

import (
	"bytes"
	"encoding/gob"
	"fmt"
)

// --- Payload Serialization/Deserialization (Moved from schema.go) ---

// serializePayload は map[string]interface{} を gob エンコードして []byte にします。
func serializePayload(payload map[string]interface{}) ([]byte, error) {
	var buf bytes.Buffer
	encoder := gob.NewEncoder(&buf)
	err := encoder.Encode(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to gob encode payload: %w", err)
	}
	return buf.Bytes(), nil
}

// deserializePayload は gob エンコードされた []byte を map[string]interface{} にデコードします。
func deserializePayload(data []byte) (map[string]interface{}, error) {
	var payload map[string]interface{}
	buf := bytes.NewBuffer(data)
	decoder := gob.NewDecoder(buf)
	err := decoder.Decode(&payload)
	if err != nil {
		return nil, fmt.Errorf("failed to gob decode payload: %w", err)
	}
	return payload, nil
}

// --- Database CRUD Operations ---

// CreateTable は新しいテーブルを作成します (内部関数)。
// NOTE: This method modifies the Database internal state (schemas map) and DiskManager metadata.
func (db *Database) CreateTable(tableName string, columns []ColumnDefinition) error {
	db.mu.Lock()
	defer db.mu.Unlock()

	if _, exists := db.schemas[tableName]; exists {
		return fmt.Errorf("table '%s' already exists", tableName)
	}
	// Check if table root already exists in metadata (e.g., unclean shutdown?)
	if _, exists := db.dm.GetTableRoot(tableName); exists {
		// This case is ambiguous. Maybe try to load schema or return error?
		// For now, let's return an error to prevent overwriting.
		return fmt.Errorf("table '%s' already has an entry in disk metadata, but not in memory schema", tableName)
	}

	// --- Schema Validation (uses types from schema.go) ---
	schema := &TableSchema{
		TableName: tableName,
		Columns:   columns,
		columnMap: make(map[string]*ColumnDefinition),
	}
	foundPK := false
	for i := range columns {
		col := &columns[i]
		if _, exists := schema.columnMap[col.Name]; exists {
			return fmt.Errorf("duplicate column name '%s' in table '%s'", col.Name, tableName)
		}
		if col.Type != TypeInteger && col.Type != TypeText {
			return fmt.Errorf("unsupported column type '%s' for column '%s'", col.Type, col.Name)
		}
		schema.columnMap[col.Name] = col
		if col.Name == "id" && col.Type == TypeInteger { // Convention PK
			col.IsPrimaryKey = true
			if foundPK {
				return fmt.Errorf("multiple primary key definitions (convention is 'id INTEGER PRIMARY KEY')")
			}
			schema.pkColumn = col.Name
			foundPK = true
		} else if col.IsPrimaryKey {
			return fmt.Errorf("primary key must be 'id INTEGER PRIMARY KEY'")
		}
	}
	if !foundPK {
		return fmt.Errorf("primary key 'id INTEGER PRIMARY KEY' not found in table '%s'", tableName)
	}
	// --- End Schema Validation ---

	// --- Create B+Tree Root Page ---
	newRootPageID, err := db.dm.AllocatePage()
	if err != nil {
		return fmt.Errorf("failed to allocate root page for table '%s': %w", tableName, err)
	}

	// Create an empty leaf node as the initial root
	// Use defaultDegree from the database instance
	emptyRootNode := NewLeafNode(newRootPageID, db.defaultDegree)

	// Write the empty root node to the allocated page
	if err := db.dm.WriteNode(emptyRootNode); err != nil {
		// TODO: Deallocate newRootPageID if write fails?
		return fmt.Errorf("failed to write initial root node for table '%s': %w", tableName, err)
	}

	// --- Register Table in Metadata ---
	if err := db.dm.SetTableRoot(tableName, newRootPageID); err != nil {
		// TODO: Deallocate page and cleanup?
		return fmt.Errorf("failed to set table root in metadata for '%s': %w", tableName, err)
	}

	// ★ Save the schema pointer to metadata
	if err := db.dm.SetTableSchema(schema); err != nil { // Pass the pointer
		// TODO: Cleanup? Deallocate page, remove root entry?
		return fmt.Errorf("failed to save schema to metadata for table '%s': %w", tableName, err)
	}

	// Store schema pointer in memory cache
	db.schemas[tableName] = schema // Store the pointer
	fmt.Printf("INFO: Table '%s' created successfully with root page %d and schema saved.\n", tableName, newRootPageID)

	return nil
}

// InsertRow inserts a new row into the specified table.
func (db *Database) InsertRow(tableName string, rowData map[string]interface{}) error {
	// Get schema first (read lock)
	schema, err := db.getTableSchemaInternal(tableName)
	if err != nil {
		return err
	}

	// Load the BTree (read lock, might need upgrade later?)
	tree, err := db.LoadTableBTree(tableName)
	if err != nil {
		return err // Error loading tree
	}
	// --- Validate rowData against schema (read lock is sufficient) ---
	validatedPayload := make(map[string]interface{})
	var pkValue KeyType
	pkFound := false
	for _, colDef := range schema.Columns {
		value, exists := rowData[colDef.Name]
		if !exists {
			continue
		}
		switch colDef.Type {
		case TypeInteger:
			var intVal int64
			switch v := value.(type) {
			case int:
				intVal = int64(v)
			case KeyType:
				intVal = int64(v)
			case int64:
				intVal = v
			default:
				return fmt.Errorf("invalid type for column '%s' (expected INTEGER), got %T", colDef.Name, value)
			}
			if colDef.Name == schema.pkColumn {
				pkValue = KeyType(intVal)
				pkFound = true
				validatedPayload[colDef.Name] = intVal
			} else {
				validatedPayload[colDef.Name] = intVal
			}
		case TypeText:
			strVal, ok := value.(string)
			if !ok {
				return fmt.Errorf("invalid type for column '%s' (expected TEXT), got %T", colDef.Name, value)
			}
			validatedPayload[colDef.Name] = strVal
		default:
			return fmt.Errorf("internal error: unsupported column type %s", colDef.Type)
		}
	}
	for key := range rowData {
		if _, ok := schema.columnMap[key]; !ok {
			return fmt.Errorf("column '%s' does not exist", key)
		}
	}
	if !pkFound {
		return fmt.Errorf("primary key column '%s' missing", schema.pkColumn)
	}
	// --- End Validation ---

	// --- Serialize and Insert ---
	serializedData, err := serializePayload(validatedPayload)
	if err != nil {
		return fmt.Errorf("failed to serialize row data for table '%s': %w", tableName, err)
	}

	// Perform BTree Insert (this method needs appropriate locking)
	if err := tree.Insert(tableName, pkValue, serializedData); err != nil {
		return fmt.Errorf("failed to insert row into table '%s': %w", tableName, err)
	}

	return nil
}

// SearchRow searches for a row by its primary key (id).
// Returns (map[string]interface{}, error). Error is ErrNotFound if key doesn't exist.
func (db *Database) SearchRow(tableName string, id KeyType) (map[string]interface{}, error) {
	// Get schema (read lock)
	_, err := db.getTableSchemaInternal(tableName) // Need schema mainly for validation if implemented
	if err != nil {
		return nil, err
	}

	// Load BTree (read lock)
	tree, err := db.LoadTableBTree(tableName)
	if err != nil {
		return nil, err // Error loading tree
	}

	// Perform BTree Search
	serializedData, found := tree.Search(id)
	if !found {
		return nil, ErrNotFound // Use ErrNotFound
	}
	if serializedData == nil {
		// This case might indicate an internal issue (found=true, but data=nil)
		return nil, fmt.Errorf("internal error: BTree search found key %d but returned nil data", id)
	}

	// Deserialize the payload
	payload, err := deserializePayload(serializedData)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize row data for id %d in table '%s': %w", id, tableName, err)
	}

	return payload, nil
}

// DeleteRow deletes a row by its primary key (id).
func (db *Database) DeleteRow(tableName string, id KeyType) error {
	// Get schema (read lock)
	_, err := db.getTableSchemaInternal(tableName)
	if err != nil {
		return err
	}
	// Load BTree (needs appropriate lock for delete)
	tree, err := db.LoadTableBTree(tableName)
	if err != nil {
		return err
	}
	// Perform BTree Delete, passing tableName
	if err := tree.Delete(tableName, id); err != nil { // Pass tableName
		return fmt.Errorf("failed to delete row with id %d from table '%s': %w", id, tableName, err)
	}
	return nil
}

// UpdateRow updates an existing row identified by its primary key (id).
// updateData contains columns to update. PK cannot be updated.
func (db *Database) UpdateRow(tableName string, id KeyType, updateData map[string]interface{}) error {
	// Get Schema & Load BTree (similar to InsertRow)
	schema, err := db.getTableSchemaInternal(tableName)
	if err != nil {
		return err
	}
	tree, err := db.LoadTableBTree(tableName)
	if err != nil {
		return err
	}

	// --- Search for the existing row first ---
	existingValueBytes, found := tree.Search(id)
	if !found {
		// Row to update doesn't exist
		return fmt.Errorf("row with id %d not found in table '%s'", id, tableName)
	}

	// Deserialize existing payload
	existingPayload, err := deserializePayload(existingValueBytes)
	if err != nil {
		return fmt.Errorf("failed to deserialize existing row data for id %d: %w", id, err)
	}

	// --- Validate updateData and Merge with existingPayload ---
	// Start with the existing data
	updatedPayload := make(map[string]interface{})
	for k, v := range existingPayload {
		updatedPayload[k] = v
	}

	// Apply updates from updateData
	for colName, newValue := range updateData {
		colDef, exists := schema.columnMap[colName]
		if !exists {
			return fmt.Errorf("column '%s' does not exist in table '%s'", colName, tableName)
		}
		if colDef.IsPrimaryKey {
			// Prevent updating the primary key
			return fmt.Errorf("cannot update primary key column '%s'", colName)
		}

		// Validate type and update the payload map
		switch colDef.Type {
		case TypeInteger:
			var intVal int64
			switch v := newValue.(type) {
			case int:
				intVal = int64(v)
			case KeyType: // Allow KeyType as input
				intVal = int64(v)
			case int64:
				intVal = v
			default:
				return fmt.Errorf("invalid type for column '%s' (expected INTEGER), got %T", colDef.Name, newValue)
			}
			updatedPayload[colName] = intVal // Update the value in the map
		case TypeText:
			strVal, ok := newValue.(string)
			if !ok {
				return fmt.Errorf("invalid type for column '%s' (expected TEXT), got %T", colDef.Name, newValue)
			}
			updatedPayload[colName] = strVal // Update the value in the map
		default:
			return fmt.Errorf("internal error: unsupported column type %s", colDef.Type)
		}
	}

	// --- Serialize the *updated* payload ---
	updatedValueBytes, err := serializePayload(updatedPayload)
	if err != nil {
		return fmt.Errorf("failed to serialize updated row data for id %d: %w", id, err)
	}

	// --- Perform BTree Insert (which will now overwrite) ---
	if err := tree.Insert(tableName, id, updatedValueBytes); err != nil {
		// Although Insert should handle overwrite, catch potential errors
		return fmt.Errorf("failed to update row %d in table '%s' via BTree Insert: %w", id, tableName, err)
	}

	return nil
}

// ScanTable scans all rows in the specified table.
func (db *Database) ScanTable(tableName string) ([]map[string]interface{}, error) {
	// Get schema
	_, err := db.getTableSchemaInternal(tableName)
	if err != nil {
		return nil, err
	}
	// Load BTree
	tree, err := db.LoadTableBTree(tableName)
	if err != nil {
		return nil, err
	}

	// Use BTree Scan method (needs implementation in btree.go)
	results := make([]map[string]interface{}, 0)
	keyValuePairs, err := tree.ScanAll() // ScanAll returns []KeyValuePair, error
	if err != nil {
		return nil, fmt.Errorf("error starting scan on table '%s': %w", tableName, err)
	}

	// Loop through the returned slice instead of using an iterator
	for _, pair := range keyValuePairs {
		valueBytes := pair.Value

		payload, err := deserializePayload(valueBytes)
		if err != nil {
			fmt.Printf("Warning: Failed to deserialize row during scan (key %v): %v\n", pair.Key, err)
			continue // Skip corrupted row?
		}
		results = append(results, payload)
	}
	return results, nil
}

// ScanTableRange scans rows within a key range.
// startKey, endKey are optional pointers. nil means unbounded.
// includeStart, includeEnd control boundary inclusion.
func (db *Database) ScanTableRange(tableName string, startKey, endKey *KeyType, includeStart, includeEnd bool) ([]map[string]interface{}, error) {
	// Get schema & Load BTree (similar to ScanTable)
	_, err := db.getTableSchemaInternal(tableName)
	if err != nil {
		return nil, err
	}
	tree, err := db.LoadTableBTree(tableName)
	if err != nil {
		return nil, err
	}

	// --- Determine actual start and end keys for ScanRange ---
	// Use appropriate min/max values for KeyType if nil pointers are given.
	// Assuming KeyType is int or int64 for now.
	var actualStartKey KeyType = 0 // Or MinInt64 if appropriate
	actualIncludeStart := includeStart
	if startKey != nil {
		actualStartKey = *startKey
	} else {
		// If startKey was nil, we want to include everything from the beginning.
		actualIncludeStart = true // Override to include the effective start (0 or MinInt)
	}

	var actualEndKey KeyType = 1<<63 - 1 // Or MaxInt64
	actualIncludeEnd := includeEnd
	if endKey != nil {
		actualEndKey = *endKey
	} else {
		// If endKey was nil, we want to include everything up to the end.
		actualIncludeEnd = true // Override to include the effective end (MaxInt)
	}

	// Use BTree RangeScan method
	results := make([]map[string]interface{}, 0)
	keyValuePairs, err := tree.ScanRange(actualStartKey, actualEndKey, actualIncludeStart, actualIncludeEnd)
	if err != nil {
		return nil, fmt.Errorf("error starting range scan on table '%s': %w", tableName, err)
	}

	// Loop through the returned slice
	for _, pair := range keyValuePairs {
		valueBytes := pair.Value

		payload, err := deserializePayload(valueBytes)
		if err != nil {
			fmt.Printf("Warning: Failed to deserialize row during range scan (key %v): %v\n", pair.Key, err)
			continue
		}
		results = append(results, payload)
	}
	return results, nil
}
