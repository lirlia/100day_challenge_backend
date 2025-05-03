package orm

import (
	"context"
	"database/sql"
	"fmt"
	"reflect"
	"strings"
	"sync"

	// sqlite3 driver を内部的に利用するためインポートするが、呼び出し元で再度インポートする必要はない
	_ "github.com/mattn/go-sqlite3"
)

// DB は ORM のメイン構造体で、*sql.DB をラップします。
type DB struct {
	*sql.DB
	mu sync.RWMutex // 将来的な拡張のため (今回は未使用)
}

// TX はトランザクションを表す構造体で、*sql.Tx をラップします。
type TX struct {
	*sql.Tx
	db *DB // トランザクションが属する DB への参照 (将来的な利用のため)
}

// Open は新しい DB 接続を開きます。
// dataSourceName は SQLite ファイルのパスなど、ドライバー固有の接続文字列です。
func Open(dataSourceName string) (*DB, error) {
	db, err := sql.Open("sqlite3", dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("orm: failed to open database: %w", err)
	}
	// すぐに Ping して接続を確認する
	if err := db.Ping(); err != nil {
		db.Close() // Ping に失敗したら閉じる
		return nil, fmt.Errorf("orm: failed to ping database: %w", err)
	}
	return &DB{DB: db}, nil
}

// PingContext はデータベースへの接続を確認します。
func (db *DB) PingContext(ctx context.Context) error {
	if err := db.DB.PingContext(ctx); err != nil {
		return fmt.Errorf("orm: failed to ping database: %w", err)
	}
	return nil
}

// Close はデータベース接続を閉じます。
func (db *DB) Close() error {
	if err := db.DB.Close(); err != nil {
		return fmt.Errorf("orm: failed to close database: %w", err)
	}
	return nil
}

// BeginTx は新しいトランザクションを開始します。
func (db *DB) BeginTx(ctx context.Context, opts *sql.TxOptions) (*TX, error) {
	tx, err := db.DB.BeginTx(ctx, opts)
	if err != nil {
		return nil, fmt.Errorf("orm: failed to begin transaction: %w", err)
	}
	return &TX{Tx: tx, db: db}, nil
}

// Commit はトランザクションをコミットします。
func (tx *TX) Commit() error {
	if err := tx.Tx.Commit(); err != nil {
		return fmt.Errorf("orm: failed to commit transaction: %w", err)
	}
	return nil
}

// Rollback はトランザクションをロールバックします。
func (tx *TX) Rollback() error {
	if err := tx.Tx.Rollback(); err != nil {
		// sql.ErrTxDone はすでにコミット/ロールバックされている場合のエラーなので、無視して良いことが多い
		if err == sql.ErrTxDone {
			return nil
		}
		return fmt.Errorf("orm: failed to rollback transaction: %w", err)
	}
	return nil
}

// --- CRUD 操作 ---

// executor は *sql.DB または *sql.Tx の共通インターフェースを定義します。
// これにより、DB と TX で CRUD メソッドの実装を共通化できます。
type executor interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// Insert は構造体データをデータベースに挿入します。
// data は挿入するデータを持つ構造体へのポインタである必要があります。
// 自動インクリメントなどで設定された ID は data には反映されません。
func (db *DB) Insert(ctx context.Context, data interface{}) (sql.Result, error) {
	return insert(ctx, db.DB, data)
}

// SelectOne はクエリを実行し、結果の最初の行を dest (構造体へのポインタ) にスキャンします。
// 行が見つからない場合は sql.ErrNoRows を返します。
func (db *DB) SelectOne(ctx context.Context, dest interface{}, query string, args ...interface{}) error {
	return selectOne(ctx, db.DB, dest, query, args...)
}

// Select はクエリを実行し、すべての結果行を dest (構造体のスライスへのポインタ) にスキャンします。
func (db *DB) Select(ctx context.Context, dest interface{}, query string, args ...interface{}) error {
	return selectMulti(ctx, db.DB, dest, query, args...)
}

// Update は指定された UPDATE 文を実行します。
func (db *DB) Update(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	return exec(ctx, db.DB, query, args...)
}

// Delete は指定された DELETE 文を実行します。
func (db *DB) Delete(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	return exec(ctx, db.DB, query, args...)
}

// Exec は Update や Delete と同じですが、任意の SQL 文を実行できます。
// 結果行を返さないクエリに使用します。
func (db *DB) Exec(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	return exec(ctx, db.DB, query, args...)
}

// --- TX (トランザクション) の CRUD 操作 ---

// Insert はトランザクション内で構造体データを挿入します。
func (tx *TX) Insert(ctx context.Context, data interface{}) (sql.Result, error) {
	return insert(ctx, tx.Tx, data)
}

// SelectOne はトランザクション内でクエリを実行し、結果の最初の行をスキャンします。
func (tx *TX) SelectOne(ctx context.Context, dest interface{}, query string, args ...interface{}) error {
	return selectOne(ctx, tx.Tx, dest, query, args...)
}

// Select はトランザクション内でクエリを実行し、すべての結果行をスキャンします。
func (tx *TX) Select(ctx context.Context, dest interface{}, query string, args ...interface{}) error {
	return selectMulti(ctx, tx.Tx, dest, query, args...)
}

// Update はトランザクション内で UPDATE 文を実行します。
func (tx *TX) Update(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	return exec(ctx, tx.Tx, query, args...)
}

// Delete はトランザクション内で DELETE 文を実行します。
func (tx *TX) Delete(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	return exec(ctx, tx.Tx, query, args...)
}

// Exec はトランザクション内で任意の SQL 文を実行します。
func (tx *TX) Exec(ctx context.Context, query string, args ...interface{}) (sql.Result, error) {
	return exec(ctx, tx.Tx, query, args...)
}

// --- 内部 CRUD 実装 ---

// insert は executor を使って INSERT 文を生成・実行します。
func insert(ctx context.Context, exec executor, data interface{}) (sql.Result, error) {
	val := reflect.ValueOf(data)
	if val.Kind() != reflect.Ptr || val.IsNil() {
		return nil, fmt.Errorf("orm: data must be a non-nil pointer to a struct")
	}
	elem := val.Elem()
	if elem.Kind() != reflect.Struct {
		return nil, fmt.Errorf("orm: data must be a pointer to a struct")
	}

	structInfo, err := getStructInfo(elem.Type())
	if err != nil {
		return nil, fmt.Errorf("orm: failed to get struct info for insert: %w", err)
	}

	// テーブル名の決定 (デフォルトは構造体名を小文字にしたもの。将来的にはカスタマイズ可能に)
	tableName := strings.ToLower(elem.Type().Name()) + "s" // 簡単な複数形

	var columns []string
	var values []interface{}
	var placeholders []string

	for dbCol, fieldName := range structInfo.columnToField {
		fieldIndex, ok := structInfo.fieldIndex[fieldName]
		if !ok {
			continue // 基本的にありえない
		}
		fieldVal := elem.Field(fieldIndex)

		// dbタグで指定されたカラムのみを対象とする (主キーなどは除外したい場合があるが、今回はシンプルに全フィールド)
		// TODO: オートインクリメント主キーなどを Insert 対象から除外するオプション
		if dbCol == "id" { // 仮: id カラムは自動生成されると仮定してスキップ (より汎用的な方法が必要)
			continue
		}

		columns = append(columns, dbCol)
		values = append(values, fieldVal.Interface())
		placeholders = append(placeholders, "?")
	}

	if len(columns) == 0 {
		return nil, fmt.Errorf("orm: no columns found to insert for struct %s", elem.Type().Name())
	}

	query := fmt.Sprintf("INSERT INTO %s (%s) VALUES (%s)",
		tableName,
		strings.Join(columns, ", "),
		strings.Join(placeholders, ", "),
	)

	result, err := exec.ExecContext(ctx, query, values...)
	if err != nil {
		return nil, fmt.Errorf("orm: failed to execute insert: %w", err)
	}
	return result, nil
}

// selectOne は executor を使って単一行を取得・スキャンします。
func selectOne(ctx context.Context, exec executor, dest interface{}, query string, args ...interface{}) error {
	rows, err := exec.QueryContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("orm: query failed for selectOne: %w", err)
	}
	defer rows.Close()

	if !rows.Next() {
		if err := rows.Err(); err != nil {
			return fmt.Errorf("orm: row iteration failed for selectOne: %w", err)
		}
		return sql.ErrNoRows // 行が見つからなかった場合は標準エラーを返す
	}

	if err := scanRow(rows, dest); err != nil {
		// scanRow 内でエラーフォーマット済み
		return err
	}

	// Next() がまだ残っていないか確認 (単一行のはず)
	if rows.Next() {
		// 厳密にはエラーとするべきかもしれないが、最初の行だけ返す仕様とする
		// log.Printf("orm: warning - selectOne query returned more than one row")
	}

	return rows.Close() // Close 時のエラーも確認
}

// selectMulti は executor を使って複数行を取得・スキャンします。
func selectMulti(ctx context.Context, exec executor, dest interface{}, query string, args ...interface{}) error {
	rows, err := exec.QueryContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("orm: query failed for select: %w", err)
	}
	defer rows.Close()

	if err := scanRows(rows, dest); err != nil {
		// scanRows 内でエラーフォーマット済み
		return err
	}

	return rows.Close() // Close 時のエラーも確認
}

// exec は executor を使って結果行を返さないクエリを実行します。
func exec(ctx context.Context, exec executor, query string, args ...interface{}) (sql.Result, error) {
	result, err := exec.ExecContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("orm: failed to execute query: %w", err)
	}
	return result, nil
}

// --- ヘルパー関数 ---

// fieldMapping は構造体のフィールド情報をキャッシュするためのマップ (型 -> フィールド名 -> フィールドインデックス)
var structInfoCache = sync.Map{} // map[reflect.Type]cachedStructInfo

type cachedStructInfo struct {
	// フィールド名 -> フィールドインデックス
	fieldIndex map[string]int
	// DBカラム名 -> フィールド名
	columnToField map[string]string
}

// getStructInfo は構造体のフィールド名とDBカラム名のマッピング情報を解析・キャッシュします。
// 構造体自体ではなく、構造体の型 (reflect.Type) をキーにしてキャッシュします。
func getStructInfo(structType reflect.Type) (*cachedStructInfo, error) {
	if structType.Kind() != reflect.Struct {
		return nil, fmt.Errorf("orm: expected a struct type, got %s", structType.Kind())
	}

	if cached, ok := structInfoCache.Load(structType); ok {
		return cached.(*cachedStructInfo), nil
	}

	info := cachedStructInfo{
		fieldIndex:    make(map[string]int),
		columnToField: make(map[string]string),
	}

	numFields := structType.NumField()
	for i := 0; i < numFields; i++ {
		field := structType.Field(i)

		// エクスポートされていないフィールドはスキップ
		if !field.IsExported() {
			continue
		}

		dbTag := field.Tag.Get("db")

		// db:"-" タグがあればスキップ
		if dbTag == "-" {
			continue
		}

		// タグがなければフィールド名をそのままカラム名として使う
		columnName := field.Name
		if dbTag != "" {
			columnName = dbTag
		}

		info.fieldIndex[field.Name] = i
		info.columnToField[columnName] = field.Name
	}

	structInfoCache.Store(structType, &info)
	return &info, nil
}

// scanRow は sql.Rows から単一のレコードを dest (構造体へのポインタ) にスキャンします。
func scanRow(rows *sql.Rows, dest interface{}) error {
	val := reflect.ValueOf(dest)
	if val.Kind() != reflect.Ptr || val.IsNil() {
		return fmt.Errorf("orm: dest must be a non-nil pointer")
	}

	elem := val.Elem()
	if elem.Kind() != reflect.Struct {
		return fmt.Errorf("orm: dest must be a pointer to a struct")
	}

	structInfo, err := getStructInfo(elem.Type())
	if err != nil {
		return fmt.Errorf("orm: failed to get struct info for type %s: %w", elem.Type(), err)
	}

	columns, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("orm: failed to get columns: %w", err)
	}

	values := make([]interface{}, len(columns))
	for i, colName := range columns {
		fieldName, ok := structInfo.columnToField[colName]
		if !ok {
			// マッピング対象外のカラムは sql.RawBytes で受け取る (無視する)
			values[i] = new(sql.RawBytes)
			continue
		}
		fieldIndex, ok := structInfo.fieldIndex[fieldName]
		if !ok {
			// 基本的にここには来ないはず
			return fmt.Errorf("orm: internal error - field index not found for %s", fieldName)
		}
		fieldVal := elem.Field(fieldIndex)
		if !fieldVal.CanAddr() || !fieldVal.CanSet() {
			return fmt.Errorf("orm: cannot set field %s (unexported or unaddressable?)", fieldName)
		}
		values[i] = fieldVal.Addr().Interface() // フィールドのアドレスを渡す
	}

	if err := rows.Scan(values...); err != nil {
		return fmt.Errorf("orm: failed to scan row: %w", err)
	}

	return nil
}

// scanRows は sql.Rows から複数のレコードを dest (構造体のスライスへのポインタ) にスキャンします。
func scanRows(rows *sql.Rows, dest interface{}) error {
	val := reflect.ValueOf(dest)
	if val.Kind() != reflect.Ptr || val.IsNil() {
		return fmt.Errorf("orm: dest must be a non-nil pointer to a slice")
	}

	sliceVal := val.Elem()
	if sliceVal.Kind() != reflect.Slice {
		return fmt.Errorf("orm: dest must be a pointer to a slice")
	}

	// スライスの要素の型を取得 (例: []User なら User)
	structType := sliceVal.Type().Elem()
	if structType.Kind() != reflect.Struct {
		// ポインタのスライス ([]*User) も考慮する
		if !(structType.Kind() == reflect.Ptr && structType.Elem().Kind() == reflect.Struct) {
			return fmt.Errorf("orm: slice elements must be structs or pointers to structs, got %s", structType.Kind())
		}
		structType = structType.Elem() // ポインタの場合はその要素の型を取得
	}

	// スキャン前にスライスをクリアする（または新しいスライスを作成する）
	sliceVal.Set(reflect.MakeSlice(sliceVal.Type(), 0, 0))

	for rows.Next() {
		// 新しい構造体のインスタンスを作成 (ポインタか値か)
		newElemPtr := reflect.New(structType)
		newElemVal := newElemPtr.Interface()

		if err := scanRow(rows, newElemVal); err != nil {
			return err // scanRow 内でエラーフォーマット済み
		}

		// スライスに追加 (値かポインタか)
		if sliceVal.Type().Elem().Kind() == reflect.Ptr {
			sliceVal = reflect.Append(sliceVal, newElemPtr)
		} else {
			sliceVal = reflect.Append(sliceVal, newElemPtr.Elem())
		}
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("orm: error iterating rows: %w", err)
	}

	// 更新されたスライスを元のポインタに設定し直す
	val.Elem().Set(sliceVal)

	return nil
}
