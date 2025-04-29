package schema

import "fmt"

// DataType はサポートするデータ型を表します。
type DataType int

const (
	UNKNOWN DataType = iota // 不明な型
	INTEGER
	TEXT
	BOOLEAN
	// TODO: 必要に応じて他の型 (e.g., REAL, DATE, TIMESTAMP) を追加
)

// String は DataType を文字列で返します。
func (dt DataType) String() string {
	switch dt {
	case INTEGER:
		return "INTEGER"
	case TEXT:
		return "TEXT"
	case BOOLEAN:
		return "BOOLEAN"
	default:
		return "UNKNOWN"
	}
}

// ForeignKey は外部キー制約を表します。
type ForeignKey struct {
	Table  string
	Column string
}

// Column はテーブルのカラム定義を表します。
type Column struct {
	Name       string
	Type       DataType
	NotNull    bool
	Unique     bool
	PrimaryKey bool
	ForeignKey *ForeignKey
}

// Table はデータベーステーブルのスキーマを表します。
type Table struct {
	Name    string
	Columns []*Column
	columnMap map[string]*Column // カラム名での高速な検索用
}

// NewTable は新しいテーブルスキーマを作成します。
func NewTable(name string, columns []*Column) *Table {
	table := &Table{
		Name:    name,
		Columns: columns,
		columnMap: make(map[string]*Column),
	}
	for _, col := range columns {
		table.columnMap[col.Name] = col
	}
	return table
}

// FindColumn は指定された名前のカラムを検索します。見つからない場合はエラーを返します。
func (t *Table) FindColumn(name string) (*Column, error) {
	col, ok := t.columnMap[name]
	if !ok {
		return nil, fmt.Errorf("column '%s' not found in table '%s'", name, t.Name)
	}
	return col, nil
}

// Schema はデータベース全体のスキーマを表します。
type Schema struct {
	Tables []*Table
	tableMap map[string]*Table // テーブル名での高速な検索用
}

// NewSchema は新しいデータベーススキーマを作成します。
func NewSchema(tables []*Table) *Schema {
	schema := &Schema{
		Tables: tables,
		tableMap: make(map[string]*Table),
	}
	for _, tbl := range tables {
		schema.tableMap[tbl.Name] = tbl
	}
	return schema
}

// FindTable は指定された名前のテーブルを検索します。見つからない場合はエラーを返します。
func (s *Schema) FindTable(name string) (*Table, error) {
	tbl, ok := s.tableMap[name]
	if !ok {
		return nil, fmt.Errorf("table '%s' not found in schema", name)
	}
	return tbl, nil
}

// SampleSchema はテストやデモ用のサンプルスキーマを返します。
func SampleSchema() *Schema {
	usersTable := NewTable("users", []*Column{
		{Name: "id", Type: INTEGER, PrimaryKey: true},
		{Name: "name", Type: TEXT, NotNull: true},
		{Name: "email", Type: TEXT, Unique: true},
		{Name: "is_active", Type: BOOLEAN, NotNull: true},
	})

	productsTable := NewTable("products", []*Column{
		{Name: "id", Type: INTEGER, PrimaryKey: true},
		{Name: "name", Type: TEXT, NotNull: true},
		{Name: "price", Type: INTEGER, NotNull: true}, // DECIMAL や REAL が適切かもしれないが、簡略化のためINTEGER
	})

	ordersTable := NewTable("orders", []*Column{
		{Name: "id", Type: INTEGER, PrimaryKey: true},
		{Name: "user_id", Type: INTEGER, ForeignKey: &ForeignKey{Table: "users", Column: "id"}},
		{Name: "product_id", Type: INTEGER, ForeignKey: &ForeignKey{Table: "products", Column: "id"}},
		{Name: "quantity", Type: INTEGER, NotNull: true},
		{Name: "total_amount", Type: INTEGER, NotNull: true},
		{Name: "status", Type: TEXT}, // 'pending', 'completed', 'cancelled' など
	})

	return NewSchema([]*Table{usersTable, productsTable, ordersTable})
}
