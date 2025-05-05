package rdbms

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/xwb1989/sqlparser"
)

// ExecuteSQL はSQL文をパースして実行します。
func (db *Database) ExecuteSQL(sql string) (string, error) {
	stmt, err := sqlparser.Parse(sql)
	if err != nil {
		return "", fmt.Errorf("failed to parse SQL: %w", err)
	}

	switch stmt := stmt.(type) {
	case *sqlparser.DDL:
		return db.executeDDL(stmt)
	case *sqlparser.Insert:
		return db.executeInsert(stmt)
	case *sqlparser.Select:
		return db.executeSelect(stmt)
	case *sqlparser.Delete:
		return db.executeDelete(stmt)
	default:
		return "", fmt.Errorf("unsupported statement type: %T", stmt)
	}
}

// executeDDL は DDL 文 (CREATE TABLE のみサポート) を実行します。
func (db *Database) executeDDL(ddl *sqlparser.DDL) (string, error) {
	if ddl.Action != sqlparser.CreateStr { //現状CREATEのみサポート
		return "", fmt.Errorf("unsupported DDL action: %s (only CREATE TABLE is supported)", ddl.Action)
	}
	if ddl.TableSpec == nil {
		return "", fmt.Errorf("invalid CREATE TABLE statement: missing table specification")
	}

	tableName := ddl.NewName.Name.String()
	if tableName == "" {
		return "", fmt.Errorf("invalid CREATE TABLE statement: missing table name")
	}

	var columns []ColumnDefinition
	pkDefined := false
	for _, colSpec := range ddl.TableSpec.Columns {
		colName := colSpec.Name.String()
		colType := colSpec.Type.Type // e.g., "int", "varchar", etc.

		var ourType ColumnType
		isPK := false

		switch colType {
		case "integer":
			ourType = TypeInteger
			if colName == "id" { // id INTEGER は 主キーとみなす規約
				isPK = true
				if pkDefined {
					return "", fmt.Errorf("multiple primary key definitions (convention is 'id INTEGER PRIMARY KEY')")
				}
				pkDefined = true
			}
		case "text": // sqlparser は "text" を varchar として解釈する場合があるかもしれないが、シンプルに扱う
			ourType = TypeText
		case "varchar": // TEXTとして扱う
			ourType = TypeText
		default:
			// sqlparserが PRIMARY KEY 制約をどのようにパースするか注意
			// colSpec.Type.KeyOpt == columndef.PrimaryKeyOpt などで判定可能
			if colSpec.Type.KeyOpt == 1 { // 1 が PrimaryKeyOpt に相当するか要確認
				if colName == "id" && colType == "integer" {
					ourType = TypeInteger
					isPK = true
					if pkDefined {
						return "", fmt.Errorf("multiple primary key definitions (convention is 'id INTEGER PRIMARY KEY')")
					}
					pkDefined = true
				} else {
					return "", fmt.Errorf("primary key must be 'id INTEGER PRIMARY KEY'")
				}
			} else {
				return "", fmt.Errorf("unsupported column type: %s for column %s", colType, colName)
			}
		}

		// PRIMARY KEY制約が明示されている場合 (id INTEGER PRIMARY KEY)
		if colSpec.Type.KeyOpt == 1 { // 再度PKチェック (明示的な指定)
			if colName != "id" || ourType != TypeInteger {
				return "", fmt.Errorf("primary key must be 'id INTEGER PRIMARY KEY'")
			}
			isPK = true     // 上の規約と重複しても問題ないはず
			if !pkDefined { // 'id integer' だけの場合の補完
				pkDefined = true
			}
		}

		columns = append(columns, ColumnDefinition{
			Name:         colName,
			Type:         ourType,
			IsPrimaryKey: isPK,
		})
	}

	if !pkDefined {
		return "", fmt.Errorf("primary key 'id INTEGER PRIMARY KEY' not found in table '%s' definition", tableName)
	}

	err := db.CreateTable(tableName, columns)
	if err != nil {
		return "", fmt.Errorf("failed to create table '%s': %w", tableName, err)
	}
	return fmt.Sprintf("Table '%s' created successfully.", tableName), nil
}

// executeInsert は INSERT 文を実行します。
func (db *Database) executeInsert(insert *sqlparser.Insert) (string, error) {
	tableName := insert.Table.Name.String()

	// カラム名のリストを取得 (指定されていれば)
	var colNames []string
	if len(insert.Columns) > 0 {
		for _, col := range insert.Columns {
			colNames = append(colNames, col.String())
		}
	} else {
		// カラム指定がない場合、スキーマから全カラムを取得する (id含む)
		schema, err := db.GetTable(tableName)
		if err != nil {
			return "", err
		}
		for _, colDef := range schema.Columns {
			colNames = append(colNames, colDef.Name)
		}
	}

	// VALUES 句から値を取得 (現状 1 行のみ対応)
	rows, ok := insert.Rows.(sqlparser.Values)
	if !ok || len(rows) != 1 {
		return "", fmt.Errorf("INSERT statement must have exactly one VALUES row")
	}
	values := rows[0]

	if len(colNames) != len(values) {
		return "", fmt.Errorf("column count doesn't match value count")
	}

	rowData := make(map[string]interface{})
	for i, valExpr := range values {
		colName := colNames[i]
		switch val := valExpr.(type) {
		case *sqlparser.SQLVal:
			switch val.Type {
			case sqlparser.StrVal:
				rowData[colName] = string(val.Val)
			case sqlparser.IntVal:
				// sqlparserはintを[]byteで返すので変換
				intVal, err := strconv.ParseInt(string(val.Val), 10, 64)
				if err != nil {
					return "", fmt.Errorf("invalid integer value for column '%s': %s", colName, string(val.Val))
				}
				// id カラムは KeyType (int) にする必要があるかもしれないが、InsertRow側で処理される
				rowData[colName] = intVal // InsertRow がよしなに処理してくれる前提
			default:
				return "", fmt.Errorf("unsupported value type %v for column '%s'", val.Type, colName)
			}
		default:
			return "", fmt.Errorf("unsupported expression type in VALUES clause for column '%s'", colName)
		}
	}

	// id が含まれているか確認
	if _, ok := rowData["id"]; !ok {
		return "", fmt.Errorf("missing primary key 'id' in INSERT statement")
	}

	err := db.InsertRow(tableName, rowData)
	if err != nil {
		return "", fmt.Errorf("failed to insert row into table '%s': %w", tableName, err)
	}

	return "1 row inserted.", nil
}

// executeSelect は SELECT 文を実行します。
func (db *Database) executeSelect(sel *sqlparser.Select) (string, error) {
	if len(sel.From) != 1 {
		return "", fmt.Errorf("SELECT statement must have exactly one table in FROM clause")
	}
	tableNameNode, ok := sel.From[0].(*sqlparser.AliasedTableExpr)
	if !ok {
		return "", fmt.Errorf("invalid FROM clause")
	}
	tableName := sqlparser.GetTableName(tableNameNode.Expr).String()

	// SELECT カラムリストの解析
	selectedColumns, err := db.parseSelectColumns(sel, tableName)
	if err != nil {
		return "", err
	}

	var rows []map[string]interface{}

	// WHERE 句の解析と実行
	if sel.Where == nil {
		// WHERE 句がない場合: 全件スキャン
		rows, err = db.ScanTable(tableName)
		if err != nil {
			return "", fmt.Errorf("error scanning table '%s': %w", tableName, err)
		}
	} else {
		// WHERE 句がある場合
		var startKey, endKey *KeyType
		var includeStart, includeEnd bool = true, false // Default: >= start, < end
		var isExactMatchQuery bool = false

		if err := parseWhereClause(sel.Where.Expr, &startKey, &endKey, &includeStart, &includeEnd, &isExactMatchQuery); err != nil {
			return "", fmt.Errorf("error parsing WHERE clause: %w", err)
		}

		// 実行
		if isExactMatchQuery && startKey != nil {
			row, err := db.SearchRow(tableName, *startKey)
			if err != nil {
				if errors.Is(err, ErrNotFound) {
					rows = []map[string]interface{}{}
				} else {
					return "", fmt.Errorf("error searching row in table '%s' for key %d: %w", tableName, *startKey, err)
				}
			} else {
				rows = []map[string]interface{}{row}
			}
		} else {
			rows, err = db.ScanTableRange(tableName, startKey, endKey, includeStart, includeEnd)
			if err != nil {
				return "", fmt.Errorf("error scanning table range in '%s': %w", tableName, err)
			}
		}
	}

	// 結果を文字列として整形
	return formatSelectResults(rows, selectedColumns), nil
}

// parseSelectColumns は SELECT 文から選択されたカラム名のリストを解析します。
// SELECT * の場合はテーブルスキーマから全カラム名を取得します。
func (db *Database) parseSelectColumns(sel *sqlparser.Select, tableName string) ([]string, error) {
	var selectedColumns []string
	isSelectStar := false

	if len(sel.SelectExprs) > 0 {
		if _, isStar := sel.SelectExprs[0].(*sqlparser.StarExpr); isStar {
			isSelectStar = true
		} else {
			// 指定されたカラム名を取得
			for _, selectExpr := range sel.SelectExprs {
				aliasedExpr, ok := selectExpr.(*sqlparser.AliasedExpr)
				if !ok {
					// This case should not happen if sqlparser guarantees AliasedExpr for non-Star exprs
					// If it can happen, we need to handle other sqlparser.SelectExpr types.
					// For now, assume it's always AliasedExpr or StarExpr based on prior check.
					return nil, fmt.Errorf("unexpected select expression type: %T", selectExpr)
				}
				col, ok := aliasedExpr.Expr.(*sqlparser.ColName)
				if !ok {
					return nil, fmt.Errorf("unsupported expression in select list (expected column name): %T", aliasedExpr.Expr)
				}
				selectedColumns = append(selectedColumns, col.Name.String())
			}
		}
	} else {
		return nil, fmt.Errorf("no columns selected") // SELECT句がない場合
	}

	// SELECT *
	if isSelectStar {
		// カラム指定がない場合、スキーマから全カラムを取得する (id含む)
		schema, err := db.GetTable(tableName)
		if err != nil {
			return nil, err
		}
		selectedColumns = []string{} // Reset in case other columns were accidentally added
		for _, colDef := range schema.Columns {
			selectedColumns = append(selectedColumns, colDef.Name)
		}
	}

	return selectedColumns, nil
}

// formatSelectResults は取得した行データを整形して文字列にします。
func formatSelectResults(rows []map[string]interface{}, selectedColumns []string) string {
	var resultStr strings.Builder
	if len(rows) == 0 {
		resultStr.WriteString("(0 rows)\n")
	} else {
		// Original formatting (--- Row X ---)
		for i, row := range rows {
			resultStr.WriteString(fmt.Sprintf("--- Row %d ---\n", i+1))
			for _, colName := range selectedColumns {
				if val, ok := row[colName]; ok {
					// Handle different types for cleaner output if necessary
					switch v := val.(type) {
					case []byte:
						resultStr.WriteString(fmt.Sprintf("%s: %s\n", colName, string(v))) // Assuming byte slices are strings
					default:
						resultStr.WriteString(fmt.Sprintf("%s: %v\n", colName, v))
					}
				} else {
					resultStr.WriteString(fmt.Sprintf("%s: NULL\n", colName))
				}
			}
		}
	}
	return resultStr.String()
}

// parseWhereClause は WHERE 句の式を再帰的に解析し、範囲スキャンのためのキー範囲を設定します。
// 対応する条件: id = ?, id > ?, id >= ?, id < ?, id <= ?, およびこれらの AND 結合。
func parseWhereClause(expr sqlparser.Expr, startKey **KeyType, endKey **KeyType, includeStart *bool, includeEnd *bool, isExactMatchQuery *bool) error {
	switch expr := expr.(type) {
	case *sqlparser.ComparisonExpr:
		return handleComparisonExpr(expr, startKey, endKey, includeStart, includeEnd, isExactMatchQuery)

	case *sqlparser.AndExpr:
		if err := parseWhereClause(expr.Left, startKey, endKey, includeStart, includeEnd, isExactMatchQuery); err != nil {
			return err
		}
		if err := parseWhereClause(expr.Right, startKey, endKey, includeStart, includeEnd, isExactMatchQuery); err != nil {
			return err
		}
		return nil
	default:
		return fmt.Errorf("unsupported WHERE clause expression type: %T", expr)
	}
}

// handleComparisonExpr は個々の比較式を処理します。
func handleComparisonExpr(comparison *sqlparser.ComparisonExpr, startKey **KeyType, endKey **KeyType, includeStart *bool, includeEnd *bool, isExactMatchQuery *bool) error {
	colName, ok := comparison.Left.(*sqlparser.ColName)
	if !ok || colName.Name.String() != "id" {
		return fmt.Errorf("WHERE clause must contain conditions on the 'id' column only")
	}

	val, ok := comparison.Right.(*sqlparser.SQLVal)
	if !ok || val.Type != sqlparser.IntVal {
		return fmt.Errorf("WHERE clause condition value must be an integer literal")
	}
	keyValInt, err := strconv.ParseInt(string(val.Val), 10, 64)
	if err != nil {
		return fmt.Errorf("invalid integer value in WHERE clause: %s", string(val.Val))
	}
	keyVal := KeyType(keyValInt)

	switch comparison.Operator {
	case sqlparser.EqualStr: // "="
		if *startKey != nil && (*startKey != &keyVal || !*includeStart) {
			return fmt.Errorf("conflicting WHERE conditions for exact match")
		}
		if *endKey != nil && (*endKey != &keyVal || !*includeEnd) {
			return fmt.Errorf("conflicting WHERE conditions for exact match")
		}
		*startKey = &keyVal
		*endKey = &keyVal
		*includeStart = true
		*includeEnd = true
		*isExactMatchQuery = true

	case sqlparser.GreaterThanStr: // ">"
		newStart := keyVal
		if *startKey == nil || newStart > **startKey || (newStart == **startKey && !*includeStart) {
			*startKey = &newStart
			*includeStart = false
		}
	case sqlparser.GreaterEqualStr: // ">="
		newStart := keyVal
		if *startKey == nil || newStart > **startKey || (newStart == **startKey && *includeStart) { // Only update if strictly greater or same with include
			*startKey = &newStart
			*includeStart = true
		}
	case sqlparser.LessThanStr: // "<"
		newEnd := keyVal
		if *endKey == nil || newEnd < **endKey || (newEnd == **endKey && !*includeEnd) {
			*endKey = &newEnd
			*includeEnd = false
		}
	case sqlparser.LessEqualStr: // "<="
		newEnd := keyVal
		if *endKey == nil || newEnd < **endKey || (newEnd == **endKey && *includeEnd) { // Only update if strictly lesser or same with include
			*endKey = &newEnd
			*includeEnd = true
		}
	default:
		return fmt.Errorf("unsupported comparison operator in WHERE clause: %s", comparison.Operator)
	}

	// 整合性チェック
	if *startKey != nil && *endKey != nil {
		if **startKey > **endKey {
			return fmt.Errorf("conflicting conditions: start key %d is greater than end key %d", **startKey, **endKey)
		}
		if **startKey == **endKey && (!*includeStart || !*includeEnd) {
			// 例: id > 5 AND id < 5, または id >= 5 AND id < 5 など
			return fmt.Errorf("conflicting conditions result in empty range around key %d", **startKey)
		}
	}
	// Reset exact match flag if we encounter non-equal conditions after an equal condition was set
	if comparison.Operator != sqlparser.EqualStr && *isExactMatchQuery {
		*isExactMatchQuery = false
	}

	return nil
}

// executeDelete は DELETE 文を実行します。
func (db *Database) executeDelete(del *sqlparser.Delete) (string, error) {
	if len(del.TableExprs) != 1 {
		return "", fmt.Errorf("DELETE statement must specify exactly one table")
	}
	tableName := sqlparser.GetTableName(del.TableExprs[0].(*sqlparser.AliasedTableExpr).Expr).String()

	if del.Where == nil {
		return "", fmt.Errorf("DELETE statement requires a WHERE clause (currently only WHERE id = ... is supported)")
	}

	// WHERE 句を解析して削除対象のIDを取得 (現状 id = ? のみサポート)
	compExpr, ok := del.Where.Expr.(*sqlparser.ComparisonExpr)
	if !ok || compExpr.Operator != sqlparser.EqualStr {
		return "", fmt.Errorf("DELETE WHERE clause currently only supports 'id = <value>'")
	}
	colName, ok := compExpr.Left.(*sqlparser.ColName)
	if !ok || colName.Name.String() != "id" {
		return "", fmt.Errorf("DELETE WHERE clause must filter by 'id' column")
	}
	val, ok := compExpr.Right.(*sqlparser.SQLVal)
	if !ok || val.Type != sqlparser.IntVal {
		return "", fmt.Errorf("DELETE WHERE clause condition value must be an integer literal")
	}

	deleteIDInt, err := strconv.ParseInt(string(val.Val), 10, 64)
	if err != nil {
		return "", fmt.Errorf("invalid integer value for id in DELETE WHERE clause: %s", string(val.Val))
	}
	deleteID := KeyType(deleteIDInt)

	err = db.DeleteRow(tableName, deleteID)
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return "0 rows deleted.", nil // Return 0 rows affected if not found
		}
		return "", fmt.Errorf("failed to delete row from table '%s': %w", tableName, err)
	}

	return "1 row deleted.", nil
}
