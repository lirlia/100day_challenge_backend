package orm

import (
	"context"
	"database/sql"
	"errors" // エラー定義用
	"fmt"
	"log"
	"reflect"
	"regexp"
	"strings"
	"sync"
	"time" // time パッケージを追加

	"github.com/iancoleman/strcase" // テーブル名変換用
)

// --- モデル定義 (テストや外部利用のためにエクスポート) ---

type User struct {
	ID        int64          `db:"id"`
	Name      string         `db:"name"`
	Email     sql.NullString `db:"email"`
	CreatedAt time.Time      `db:"created_at"`
	UpdatedAt time.Time      `db:"updated_at"`
	Posts     []Post         `orm:"hasmany:user_id,association_foreignkey:ID"` // リレーションタグを明確化
}

type Post struct {
	ID        int64     `db:"id"`
	UserID    int64     `db:"user_id"`
	Title     string    `db:"title"`
	Content   string    `db:"content"`
	CreatedAt time.Time `db:"created_at"`
	UpdatedAt time.Time `db:"updated_at"`
	User      *User     `orm:"belongsTo:UserID,association_foreignkey:ID"` // Optional: belongsTo 関係も定義可能
}

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

// RelationInfo はリレーション情報を保持します。
type RelationInfo struct {
	FieldName             string       // User 構造体の Posts フィールド名
	RelatedType           reflect.Type // Post 構造体の型
	ForeignKey            string       // Post 構造体の UserID フィールド名 (users テーブルの ID を参照)
	AssociationForeignKey string       // User 構造体の ID フィールド名 (posts テーブルの user_id から参照される)
}

// executor は *sql.DB または *sql.Tx の共通インターフェースを定義します。
// これにより、DB と TX で CRUD メソッドの実装を共通化できます。
type executor interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
	// QueryBuilder を返すメソッド
	Model(model interface{}) *QueryBuilder
	Table(tableName string) *QueryBuilder
}

// executor インターフェースを *DB と *TX が満たすようにコンパイル時にチェック
var _ executor = (*DB)(nil)
var _ executor = (*TX)(nil)

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
		if errors.Is(err, sql.ErrTxDone) {
			return nil
		}
		return fmt.Errorf("orm: failed to rollback transaction: %w", err)
	}
	return nil
}

// --- Query Builder ---

// whereCondition は WHERE 句の条件を表します。
type whereCondition struct {
	query string
	args  []interface{}
}

// QueryBuilder はクエリ構築のための中間オブジェクトです。
type QueryBuilder struct {
	executor  executor         // DB or TX
	modelType reflect.Type     // 操作対象のモデルの型情報 (Table() の場合は nil もありうる)
	tableName string           // 操作対象のテーブル名
	fields    string           // SELECT するフィールド (デフォルトは "*")
	wheres    []whereCondition // WHERE 条件
	orders    []string         // ORDER BY 条件
	limit     *int             // LIMIT 条件
	offset    *int             // OFFSET 条件
	preloads  map[string]bool  // Preload するフィールド名を格納 (キー: フィールド名, 値: true)
	ctx       context.Context  // クエリ実行時のコンテキスト
}

// Model はクエリビルドの起点となり、操作対象のモデルを指定します。
func (db *DB) Model(model interface{}) *QueryBuilder {
	return newModelQueryBuilder(db, context.Background(), model)
}

// Model はトランザクション内でクエリビルドの起点となります。
func (tx *TX) Model(model interface{}) *QueryBuilder {
	return newModelQueryBuilder(tx, context.Background(), model)
}

// Table はクエリビルドの起点となり、操作対象のテーブル名を直接指定します。
func (db *DB) Table(tableName string) *QueryBuilder {
	return newTableQueryBuilder(db, context.Background(), tableName)
}

// Table はトランザクション内でテーブル名を指定してクエリビルドの起点となります。
func (tx *TX) Table(tableName string) *QueryBuilder {
	return newTableQueryBuilder(tx, context.Background(), tableName)
}

// newModelQueryBuilder は QueryBuilder のインスタンスを初期化します。
func newModelQueryBuilder(exec executor, ctx context.Context, model interface{}) *QueryBuilder {
	val := reflect.ValueOf(model)
	if val.Kind() != reflect.Ptr || val.IsNil() {
		log.Panicf("orm: Model() expects a non-nil pointer to a struct, got %T", model)
	}
	modelType := val.Elem().Type()
	if modelType.Kind() != reflect.Struct {
		log.Panicf("orm: Model() expects a pointer to a struct, got pointer to %s", modelType.Kind())
	}

	tableName := getTableName(modelType)

	return &QueryBuilder{
		executor:  exec,
		modelType: modelType,
		tableName: tableName,
		fields:    "*",
		wheres:    make([]whereCondition, 0),
		orders:    make([]string, 0),
		preloads:  make(map[string]bool),
		ctx:       ctx,
	}
}

// newTableQueryBuilder は QueryBuilder のインスタンスを初期化します。
func newTableQueryBuilder(exec executor, ctx context.Context, tableName string) *QueryBuilder {
	if tableName == "" {
		log.Panicf("orm: Table() requires a non-empty table name")
	}
	return &QueryBuilder{
		executor:  exec,
		modelType: nil, // モデル型は指定されない
		tableName: tableName,
		fields:    "*",
		wheres:    make([]whereCondition, 0),
		orders:    make([]string, 0),
		preloads:  make(map[string]bool), // Table() では Preload は無効
		ctx:       ctx,
	}
}

// WithContext は QueryBuilder に紐づく context を設定します。
func (qb *QueryBuilder) WithContext(ctx context.Context) *QueryBuilder {
	qb.ctx = ctx
	return qb
}

// Where は WHERE 条件を追加します。
func (qb *QueryBuilder) Where(query string, args ...interface{}) *QueryBuilder {
	qb.wheres = append(qb.wheres, whereCondition{query: query, args: args})
	return qb
}

// 正規表現: ORDER BY句として安全な文字のみを許可
var stricterSafeOrderByPattern = regexp.MustCompile(`^\s*[a-zA-Z0-9_.]+(\s+(?i:asc|desc))?(\s*,\s*[a-zA-Z0-9_.]+(\s+(?i:asc|desc))?)*\s*$`)

// Order は ORDER BY 条件を追加します。
func (qb *QueryBuilder) Order(value string) *QueryBuilder {
	if !isValidOrderByClause(value) {
		log.Printf("WARN: Ignoring potentially unsafe ORDER BY clause: %q", value)
		return qb
	}
	qb.orders = append(qb.orders, value)
	return qb
}

// Limit は LIMIT 条件を設定します。
func (qb *QueryBuilder) Limit(value int) *QueryBuilder {
	qb.limit = &value
	return qb
}

// Offset は OFFSET 条件を設定します。
func (qb *QueryBuilder) Offset(value int) *QueryBuilder {
	qb.offset = &value
	return qb
}

// Preload は関連データを Eager Loading するように指定します。
// 引数 field は、モデル構造体内の関連フィールド名 (例: "Posts") です。
// Table() で QueryBuilder を作成した場合は効果がありません。
func (qb *QueryBuilder) Preload(field string) *QueryBuilder {
	if qb.modelType == nil {
		log.Printf("WARN: Preload(\"%s\") called on QueryBuilder created with Table(), has no effect.", field)
		return qb
	}
	qb.preloads[field] = true
	return qb
}

// Select は構築されたクエリを実行し、結果を dest (構造体のスライスへのポインタ) にスキャンします。
// Preload が指定されている場合、関連データも取得します。
func (qb *QueryBuilder) Select(dest interface{}) error {
	if qb.modelType == nil {
		return fmt.Errorf("orm: Select() requires QueryBuilder created with Model(), use ScanMaps() for QueryBuilder created with Table()")
	}
	query, args := qb.buildSelectQuery()
	err := selectMulti(qb.ctx, qb.executor, dest, query, args...)
	if err != nil {
		return err
	}
	// Preload 処理
	if len(qb.preloads) > 0 {
		if err := processPreloads(qb.ctx, qb.executor, dest, qb.preloads); err != nil {
			return fmt.Errorf("orm: failed during preload: %w", err)
		}
	}
	return nil
}

// SelectOne は構築されたクエリを実行し、最初の結果を dest (構造体へのポインタ) にスキャンします。
// 暗黙的に LIMIT 1 が設定されます。結果がない場合は sql.ErrNoRows を返します。
// Preload が指定されている場合、関連データも取得します。
func (qb *QueryBuilder) SelectOne(dest interface{}) error {
	if qb.modelType == nil {
		return fmt.Errorf("orm: SelectOne() requires QueryBuilder created with Model()")
	}
	originalLimit := qb.limit
	limitOne := 1
	qb.limit = &limitOne
	defer func() { qb.limit = originalLimit }()

	query, args := qb.buildSelectQuery()
	err := selectOne(qb.ctx, qb.executor, dest, query, args...)
	if err != nil {
		// sql.ErrNoRows はエラーとして扱わない場合もあるが、ここでは返す
		return err
	}
	// Preload 処理 (単一レコードに対しても行う)
	if len(qb.preloads) > 0 {
		// SelectOne の結果はポインタなので、一時的なスライスに入れる
		sliceDest := reflect.MakeSlice(reflect.SliceOf(reflect.TypeOf(dest)), 0, 1)
		sliceDest = reflect.Append(sliceDest, reflect.ValueOf(dest))
		sliceDestPtr := reflect.New(sliceDest.Type())
		sliceDestPtr.Elem().Set(sliceDest)

		if err := processPreloads(qb.ctx, qb.executor, sliceDestPtr.Interface(), qb.preloads); err != nil {
			return fmt.Errorf("orm: failed during preload for SelectOne: %w", err)
		}
	}
	return nil
}

// ScanMaps は構築されたクエリを実行し、結果を map のスライス (dest: *[]map[string]interface{}) にスキャンします。
// モデル構造体を使わずに、任意のクエリ結果を取得する場合に便利です。
func (qb *QueryBuilder) ScanMaps(dest *[]map[string]interface{}) error {
	if dest == nil {
		return fmt.Errorf("orm: ScanMaps requires a non-nil destination pointer")
	}
	query, args := qb.buildSelectQuery()
	rows, err := qb.executor.QueryContext(qb.ctx, query, args...)
	if err != nil {
		return fmt.Errorf("orm: failed to execute query for ScanMaps: %w", err)
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("orm: failed to get columns for ScanMaps: %w", err)
	}

	results := make([]map[string]interface{}, 0)
	for rows.Next() {
		columnsData := make([]interface{}, len(cols))
		columnPointers := make([]interface{}, len(cols))
		for i := range columnsData {
			columnPointers[i] = &columnsData[i]
		}

		if err := rows.Scan(columnPointers...); err != nil {
			return fmt.Errorf("orm: failed to scan row for ScanMaps: %w", err)
		}

		rowData := make(map[string]interface{})
		for i, colName := range cols {
			val := columnPointers[i].(*interface{})
			// []byte は string に変換、nil は nil のまま、他はそのまま
			if b, ok := (*val).([]byte); ok {
				rowData[colName] = string(b)
			} else {
				rowData[colName] = *val
			}
		}
		results = append(results, rowData)
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("orm: error during row iteration for ScanMaps: %w", err)
	}

	*dest = results
	return nil
}

// Count は構築されたクエリに合致するレコード数を取得し、dest ( *int64 ) に格納します。
func (qb *QueryBuilder) Count(dest *int64) error {
	if dest == nil {
		return fmt.Errorf("orm: Count requires a non-nil destination pointer")
	}
	query, args := qb.buildCountQuery()
	row := qb.executor.QueryRowContext(qb.ctx, query, args...)
	err := row.Scan(dest)
	if err != nil {
		// 結果がない場合は count が 0 なので ErrNoRows は無視してよい
		if errors.Is(err, sql.ErrNoRows) {
			*dest = 0
			return nil
		}
		return fmt.Errorf("orm: failed to scan count result: %w", err)
	}
	return nil
}

// Insert は指定されたデータ (構造体のポインタ) をデータベースに挿入します。
// モデルの型は Model() で指定されたものと一致する必要があります。
// 成功した場合、挿入されたレコードの LastInsertId を構造体の ID フィールドに設定します。
func (qb *QueryBuilder) Insert(data interface{}) (sql.Result, error) {
	if qb.modelType == nil {
		return nil, fmt.Errorf("orm: Insert() requires QueryBuilder created with Model()")
	}
	dataType := reflect.TypeOf(data)
	if dataType.Kind() != reflect.Ptr || dataType.Elem() != qb.modelType {
		return nil, fmt.Errorf("orm: data type mismatch in Insert(). Expected pointer to %s, got %T", qb.modelType.Name(), data)
	}

	dataVal := reflect.ValueOf(data).Elem()

	exec, ok := qb.executor.(executorInternal)
	if !ok {
		return nil, fmt.Errorf("orm: internal error - executor does not implement executorInternal")
	}
	result, err := insert(qb.ctx, exec, data)
	if err != nil {
		return result, err // insert 内でエラーフォーマット済み
	}

	// --- 追加: LastInsertId を取得して ID フィールドに設定 --- START
	lastID, err := result.LastInsertId()
	if err == nil && lastID != 0 {
		structInfo, errInfo := getStructInfo(qb.modelType)
		if errInfo == nil {
			idFieldName := ""
			// "id" カラムに対応するフィールド名を探す
			for col, name := range structInfo.columnToField {
				if col == "id" { // TODO: プライマリキーカラム名を特定するより良い方法
					idFieldName = name
					break
				}
			}

			if idFieldName != "" {
				idFieldIndex, ok := structInfo.fieldIndex[idFieldName]
				if ok {
					idField := dataVal.Field(idFieldIndex)
					if idField.IsValid() && idField.CanSet() && idField.Type().Kind() == reflect.Int64 {
						idField.SetInt(lastID)
					}
				}
			} else {
				log.Printf("WARN: Could not find field corresponding to primary key column 'id' in struct %s to set LastInsertId.", qb.modelType.Name())
			}
		} else {
			log.Printf("WARN: Failed to get struct info for %s to set LastInsertId: %v", qb.modelType.Name(), errInfo)
		}
	} else if err != nil {
		// LastInsertId がサポートされていない、またはエラーが発生した場合 (無視することが多い)
		// log.Printf("DEBUG: Could not get LastInsertId after insert: %v", err)
	}
	// --- 追加: LastInsertId を取得して ID フィールドに設定 --- END

	return result, nil
}

// buildSelectQuery は QueryBuilder の状態から SELECT 文と引数を構築します。
func (qb *QueryBuilder) buildSelectQuery() (string, []interface{}) {
	var query strings.Builder
	args := make([]interface{}, 0)

	fmt.Fprintf(&query, "SELECT %s FROM %s", qb.fields, qb.tableName)

	if len(qb.wheres) > 0 {
		query.WriteString(" WHERE ")
		for i, w := range qb.wheres {
			if i > 0 {
				query.WriteString(" AND ")
			}
			query.WriteString("(")
			query.WriteString(w.query)
			query.WriteString(")")
			args = append(args, w.args...)
		}
	}

	if len(qb.orders) > 0 {
		query.WriteString(" ORDER BY ")
		query.WriteString(strings.Join(qb.orders, ", "))
	}

	if qb.limit != nil {
		fmt.Fprintf(&query, " LIMIT %d", *qb.limit)
	}

	if qb.offset != nil {
		fmt.Fprintf(&query, " OFFSET %d", *qb.offset)
	}

	return query.String(), args
}

// buildCountQuery は QueryBuilder の状態から SELECT COUNT(*) 文と引数を構築します。
func (qb *QueryBuilder) buildCountQuery() (string, []interface{}) {
	var query strings.Builder
	args := make([]interface{}, 0)

	fmt.Fprintf(&query, "SELECT COUNT(*) FROM %s", qb.tableName)

	if len(qb.wheres) > 0 {
		query.WriteString(" WHERE ")
		for i, w := range qb.wheres {
			if i > 0 {
				query.WriteString(" AND ")
			}
			query.WriteString("(")
			query.WriteString(w.query)
			query.WriteString(")")
			args = append(args, w.args...)
		}
	}
	// COUNT では ORDER BY, LIMIT, OFFSET は不要

	return query.String(), args
}

// --- executorInternal (インターフェース定義を追加) ---
// executorInternal は *sql.DB または *sql.Tx の共通インターフェース (内部ヘルパー用)
type executorInternal interface {
	ExecContext(ctx context.Context, query string, args ...interface{}) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...interface{}) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...interface{}) *sql.Row
}

// --- 既存の CRUD 操作 (QueryBuilder を内部で使うように変更も検討) ---
// ... (executor interface definition) ...

// --- CRUD 実装ヘルパー ---

// insert は INSERT 文を構築して実行します。
func insert(ctx context.Context, exec executorInternal, data interface{}) (sql.Result, error) {
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

	// テーブル名の決定ロジックを共通化
	tableName := getTableName(elem.Type())

	var columns []string
	var values []interface{}
	var placeholders []string

	for dbCol, fieldName := range structInfo.columnToField {
		fieldIndex, ok := structInfo.fieldIndex[fieldName]
		if !ok {
			log.Printf("WARN: Field index not found for fieldName '%s' in struct %s during insert.", fieldName, elem.Type().Name())
			continue
		}

		fieldVal := elem.Field(fieldIndex)

		// TODO: オートインクリメント主キーなどを Insert 対象から除外するオプション (改善)
		// 主キーがゼロ値の場合（通常は auto increment で設定されるため）は除外する方が良い場合がある
		// 例: if dbCol == "id" && fieldVal.IsZero() { continue }
		if dbCol == "id" { // 仮: id カラムは自動生成されると仮定してスキップ (より堅牢な判定が必要かも)
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
		// エラー内容をもう少し具体的にログ出力する
		log.Printf("ERROR: Insert failed for query: %s, args: %v, error: %v", query, values, err)
		return nil, fmt.Errorf("orm: failed to execute insert: %w", err)
	}
	return result, nil
}

// selectOne は SELECT クエリを実行し、最初の行を構造体にスキャンします。
func selectOne(ctx context.Context, exec executorInternal, dest interface{}, query string, args ...interface{}) error {
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

// selectMulti は SELECT クエリを実行し、複数の行を構造体のスライスにスキャンします。
func selectMulti(ctx context.Context, exec executorInternal, dest interface{}, query string, args ...interface{}) error {
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

// exec は ExecContext を呼び出す単純なラッパーです。
func exec(ctx context.Context, exec executorInternal, query string, args ...interface{}) (sql.Result, error) {
	return exec.ExecContext(ctx, query, args...)
}

// --- リフレクション・スキャンヘルパー ---

var (
	// 修正: キャッシュの値型をポインタに
	structInfoCache = make(map[reflect.Type]*cachedStructInfo)
	structInfoMutex sync.RWMutex
)

// ClearStructInfoCache はテスト目的などで構造体情報キャッシュをクリアします。
func ClearStructInfoCache() {
	structInfoMutex.Lock()
	defer structInfoMutex.Unlock()
	// キャッシュを新しく作り直すことでクリアする
	structInfoCache = make(map[reflect.Type]*cachedStructInfo)
}

// cachedStructInfo は構造体の型情報をキャッシュするための構造体です。
type cachedStructInfo struct {
	// フィールド名 -> フィールドインデックス
	fieldIndex map[string]int
	// DBカラム名 -> フィールド名
	columnToField map[string]string
	relations     map[string]RelationInfo // リレーションフィールド名 -> RelationInfo
}

// getStructInfo は構造体の型情報をキャッシュするための構造体です。
func getStructInfo(structType reflect.Type) (*cachedStructInfo, error) {
	structInfoMutex.RLock()
	cached, found := structInfoCache[structType]
	structInfoMutex.RUnlock()
	if found {
		return cached, nil
	}

	structInfoMutex.Lock()
	defer structInfoMutex.Unlock()
	cached, found = structInfoCache[structType]
	if found {
		return cached, nil
	}

	info := cachedStructInfo{
		fieldIndex:    make(map[string]int),
		columnToField: make(map[string]string),
		relations:     make(map[string]RelationInfo),
	}

	numFields := structType.NumField()

	// --- 1. DB カラムとフィールドのマッピングを作成 --- START
	for i := 0; i < numFields; i++ {
		field := structType.Field(i)

		if !field.IsExported() {
			continue
		}

		dbTag := field.Tag.Get("db")

		if dbTag == "-" {
			continue
		}

		columnName := strcase.ToSnake(field.Name)
		if dbTag != "" {
			columnName = dbTag
		}

		info.fieldIndex[field.Name] = i
		info.columnToField[columnName] = field.Name
	}
	// --- 1. DB カラムとフィールドのマッピングを作成 --- END

	// --- 2. リレーション情報を解析・構築 --- START
	for i := 0; i < numFields; i++ {
		field := structType.Field(i)

		if !field.IsExported() {
			continue
		}

		ormTag := field.Tag.Get("orm")

		if ormTag == "-" || ormTag == "" {
			continue
		}

		parts := strings.Split(ormTag, ",")
		relationTypeRaw := strings.TrimSpace(parts[0])
		relationTypeParts := strings.SplitN(relationTypeRaw, ":", 2)
		relationType := relationTypeParts[0]

		if relationType == "hasmany" {
			if field.Type.Kind() != reflect.Slice {
				log.Printf("WARN: hasmany relation field '%s' in %s must be a slice, skipping relation.", field.Name, structType.Name())
				continue
			}
			relatedType := field.Type.Elem()
			if relatedType.Kind() == reflect.Ptr {
				relatedType = relatedType.Elem()
			}
			if relatedType.Kind() != reflect.Struct {
				log.Printf("WARN: hasmany relation field '%s' in %s must be a slice of structs or pointers to structs, skipping relation.", field.Name, structType.Name())
				continue
			}

			var foreignKey string
			var assocForeignKey string
			params := make(map[string]string)

			if len(parts) > 1 {
				firstParam := strings.TrimSpace(parts[1])
				startIndex := 2
				if !strings.Contains(firstParam, ":") {
					foreignKey = firstParam
				} else {
					// 最初のパラメータが key:value 形式だった場合、解析対象に含めるため startIndex を 1 に戻す
					startIndex = 1
				}
				// params マップ解析
				for _, part := range parts[startIndex:] {
					kv := strings.SplitN(part, ":", 2)
					if len(kv) == 2 {
						params[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
					}
				}
			}

			if foreignKey == "" {
				foreignKey = strcase.ToSnake(structType.Name()) + "_id"
				log.Printf("DEBUG: Using default ForeignKey '%s' for relation '%s' in %s", foreignKey, field.Name, structType.Name())
			}

			assocForeignKey = params["association_foreignkey"]

			if assocForeignKey == "" {
				assocKeyFieldName := "ID"
				idField, idFound := structType.FieldByName(assocKeyFieldName)
				if idFound {
					idDbTag := idField.Tag.Get("db")
					if idDbTag != "" && idDbTag != "-" {
						assocForeignKey = idDbTag
					} else {
						assocForeignKey = strcase.ToSnake(assocKeyFieldName)
					}
				} else {
					assocForeignKey = "id"
				}
				log.Printf("DEBUG: Using default AssociationForeignKey '%s' for relation '%s' in %s", assocForeignKey, field.Name, structType.Name())
			} else {
				assocKeyField, found := structType.FieldByNameFunc(func(name string) bool { return name == assocForeignKey })
				if found {
					dbTag := assocKeyField.Tag.Get("db")
					if dbTag != "" && dbTag != "-" {
						assocForeignKey = dbTag
					} else {
						assocForeignKey = strcase.ToSnake(assocKeyField.Name)
					}
				}
			}

			info.relations[field.Name] = RelationInfo{
				FieldName:             field.Name,
				RelatedType:           relatedType,
				ForeignKey:            foreignKey,
				AssociationForeignKey: assocForeignKey,
			}
		}

		if relationType == "belongsTo" {
			if !(field.Type.Kind() == reflect.Ptr && field.Type.Elem().Kind() == reflect.Struct) && field.Type.Kind() != reflect.Struct {
				log.Printf("WARN: belongsTo relation field '%s' in %s must be a struct or a pointer to a struct, skipping relation.", field.Name, structType.Name())
				continue
			}
			relatedType := field.Type
			if relatedType.Kind() == reflect.Ptr {
				relatedType = relatedType.Elem()
			}

			var foreignKey string
			var assocForeignKey string
			params := make(map[string]string)

			if len(parts) > 1 {
				firstParam := strings.TrimSpace(parts[1])
				startIndex := 2
				if !strings.Contains(firstParam, ":") {
					foreignKey = firstParam
				} else {
					startIndex = 1
				}
				for _, part := range parts[startIndex:] {
					kv := strings.SplitN(part, ":", 2)
					if len(kv) == 2 {
						params[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
					}
				}
			}

			if foreignKey == "" {
				// デフォルト: 関連モデル名 + ID (例: User -> UserID)
				foreignKey = relatedType.Name() + "ID"
				// 現在の構造体にその名前のフィールドがあるか確認し、なければスネークケースも試す
				_, fkFound := structType.FieldByName(foreignKey)
				if !fkFound {
					fkSnake := strcase.ToSnake(foreignKey)
					_, fkSnakeFound := structType.FieldByNameFunc(func(name string) bool { return strcase.ToSnake(name) == fkSnake })
					if fkSnakeFound {
						// UserID or user_id フィールドが実際に存在するか確認する方がより正確だが、一旦命名規則ベースで進める
						// foreignKey = ... // 必要に応じて実際のフィールド名に合わせる
					}
				}
				log.Printf("DEBUG: Using default ForeignKey '%s' for relation '%s' in %s", foreignKey, field.Name, structType.Name())
			}

			assocForeignKey = params["association_foreignkey"]

			if assocForeignKey == "" {
				// デフォルト: 関連モデルのプライマリキーカラム名 (通常は "id")
				assocKeyFieldName := "ID"
				// 関連モデル(relatedType)からフィールドを探す
				idField, idFound := relatedType.FieldByName(assocKeyFieldName)
				if idFound {
					idDbTag := idField.Tag.Get("db")
					if idDbTag != "" && idDbTag != "-" {
						assocForeignKey = idDbTag
					} else {
						assocForeignKey = strcase.ToSnake(assocKeyFieldName)
					}
				} else {
					assocForeignKey = "id"
				}
				log.Printf("DEBUG: Using default AssociationForeignKey '%s' for relation '%s' in %s", assocForeignKey, field.Name, structType.Name())
			} else {
				// タグで association_foreignkey がフィールド名で指定された場合、関連モデルからカラム名に変換する試み
				assocKeyField, found := relatedType.FieldByNameFunc(func(name string) bool { return name == assocForeignKey })
				if found {
					dbTag := assocKeyField.Tag.Get("db")
					if dbTag != "" && dbTag != "-" {
						assocForeignKey = dbTag
					} else {
						assocForeignKey = strcase.ToSnake(assocKeyField.Name)
					}
				}
			}

			info.relations[field.Name] = RelationInfo{
				FieldName:             field.Name,
				RelatedType:           relatedType,
				ForeignKey:            foreignKey,      // 例: posts テーブルの user_id カラム (FK がある方)
				AssociationForeignKey: assocForeignKey, // 例: users テーブルの id カラム (参照される方)
			}
		}
	}
	// --- 2. リレーション情報を解析・構築 --- END

	structInfoCache[structType] = &info
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

// getTableName は構造体の型からテーブル名を推測します。
// デフォルトでは構造体名をスネークケースの複数形にします (例: User -> users, ProductOrder -> product_orders)。
// TODO: TableName() string メソッドによるオーバーライドをサポートする。
func getTableName(structType reflect.Type) string {
	// 構造体名を取得
	name := structType.Name()
	// スネークケースに変換
	snakeName := strcase.ToSnake(name)
	// 簡単な複数形化 (末尾が s, x, z, ch, sh で終わらない場合は s を追加)
	if strings.HasSuffix(snakeName, "s") ||
		strings.HasSuffix(snakeName, "x") ||
		strings.HasSuffix(snakeName, "z") ||
		strings.HasSuffix(snakeName, "ch") ||
		strings.HasSuffix(snakeName, "sh") {
		return snakeName // そのまま返すか、es をつけるかなどのルールは複雑
	} else {
		return snakeName + "s"
	}
}

// isValidOrderByClause は ORDER BY 句として安全な文字列か検証します。
func isValidOrderByClause(clause string) bool {
	// より厳格なパターンを使用
	// TrimSpace は不要になった（正規表現が前後の空白も許容するため）が、念のため残しても良い
	return stricterSafeOrderByPattern.MatchString(clause)
}

// --- Preload 処理ヘルパー (関数定義を追加) ---

// processPreloads は取得済みのデータ (dest: 構造体のスライスへのポインタ) に対して、
// 指定されたリレーション (preloads map) のデータを取得し、関連付けます。
func processPreloads(ctx context.Context, exec executorInternal, dest interface{}, preloads map[string]bool) error {
	destVal := reflect.ValueOf(dest)
	if destVal.Kind() != reflect.Ptr || destVal.IsNil() {
		return fmt.Errorf("orm: processPreloads expects a non-nil pointer to slice destination, got %T", dest)
	}
	sliceVal := destVal.Elem()
	if sliceVal.Kind() != reflect.Slice {
		return fmt.Errorf("orm: processPreloads destination must be a pointer to slice, got pointer to %s", sliceVal.Kind())
	}
	if sliceVal.Len() == 0 {
		return nil // データがなければ何もしない
	}

	// スライスの要素の型を取得
	elemType := sliceVal.Type().Elem()
	isPtrElem := false
	if elemType.Kind() == reflect.Ptr {
		elemType = elemType.Elem()
		isPtrElem = true
	}
	if elemType.Kind() != reflect.Struct {
		return fmt.Errorf("orm: processPreloads slice element must be a struct or pointer to struct, got %s", sliceVal.Type().Elem().Kind())
	}

	structInfo, err := getStructInfo(elemType)
	if err != nil {
		return fmt.Errorf("orm: failed to get struct info for preload base type %s: %w", elemType.Name(), err)
	}

	for fieldName := range preloads {
		relation, ok := structInfo.relations[fieldName]
		if !ok {
			return fmt.Errorf("orm: preload field '%s' not found or not a valid relation in struct %s", fieldName, elemType.Name())
		}

		// 1. 関連付けに必要なキー (親 ID) を収集
		assocKeys := make([]interface{}, 0, sliceVal.Len())
		keyToParentMap := make(map[interface{}][]reflect.Value) // 親ID -> 親要素のリスト

		for i := 0; i < sliceVal.Len(); i++ {
			parentElem := sliceVal.Index(i) // 親要素 (ポインタまたは値)
			if isPtrElem {
				parentElem = parentElem.Elem() // ポインタの場合は中身を取得
			}
			// 親の AssociationForeignKey (通常は ID) の値を取得
			assocKeyField := parentElem.FieldByNameFunc(func(name string) bool {
				return name == relation.AssociationForeignKey || strcase.ToSnake(name) == relation.AssociationForeignKey
			})

			if !assocKeyField.IsValid() {
				found := false
				for j := 0; j < parentElem.NumField(); j++ {
					f := parentElem.Type().Field(j)
					colName := f.Tag.Get("db")
					if colName == "" {
						colName = strcase.ToSnake(f.Name)
					}
					if colName == relation.AssociationForeignKey {
						assocKeyField = parentElem.Field(j)
						found = true
						break
					}
				}
				if !found {
					return fmt.Errorf("orm: association key field '%s' not found in parent struct %s for relation %s", relation.AssociationForeignKey, elemType.Name(), fieldName)
				}
			}
			assocKeyValue := assocKeyField.Interface()
			assocKeys = append(assocKeys, assocKeyValue)
			parentValueToMap := sliceVal.Index(i)
			keyToParentMap[assocKeyValue] = append(keyToParentMap[assocKeyValue], parentValueToMap)
		}

		if len(assocKeys) == 0 {
			continue
		}

		// 2. 関連データを一括取得
		relatedTableName := getTableName(relation.RelatedType)
		inPlaceholders := strings.Repeat("?,", len(assocKeys)-1) + "?"
		query := fmt.Sprintf("SELECT * FROM %s WHERE %s IN (%s)", relatedTableName, relation.ForeignKey, inPlaceholders)

		relatedSliceType := reflect.SliceOf(relation.RelatedType)
		relatedResultsSlice := reflect.MakeSlice(relatedSliceType, 0, 0)
		relatedResultsPtr := reflect.New(relatedResultsSlice.Type())
		relatedResultsPtr.Elem().Set(relatedResultsSlice)

		err := selectMulti(ctx, exec, relatedResultsPtr.Interface(), query, assocKeys...)
		if err != nil {
			return fmt.Errorf("orm: failed to fetch related data for %s: %w", fieldName, err)
		}

		relatedData := relatedResultsPtr.Elem()

		// 3. 関連データを親要素にセット
		for i := 0; i < relatedData.Len(); i++ {
			relatedElem := relatedData.Index(i)
			foreignKeyField := relatedElem.FieldByNameFunc(func(name string) bool {
				return name == relation.ForeignKey || strcase.ToSnake(name) == relation.ForeignKey
			})

			if !foreignKeyField.IsValid() {
				found := false
				for j := 0; j < relatedElem.NumField(); j++ {
					f := relatedElem.Type().Field(j)
					colName := f.Tag.Get("db")
					if colName == "" {
						colName = strcase.ToSnake(f.Name)
					}
					if colName == relation.ForeignKey {
						foreignKeyField = relatedElem.Field(j)
						found = true
						break
					}
				}
				if !found {
					return fmt.Errorf("orm: foreign key field '%s' not found in related struct %s for relation %s", relation.ForeignKey, relation.RelatedType.Name(), fieldName)
				}
			}
			foreignKeyValue := foreignKeyField.Interface()

			if parents, found := keyToParentMap[foreignKeyValue]; found {
				for _, parentVal := range parents {
					parentField := parentVal
					if parentVal.Kind() == reflect.Ptr {
						parentField = parentVal.Elem()
					}
					relationSliceField := parentField.FieldByName(relation.FieldName)
					if !relationSliceField.IsValid() || !relationSliceField.CanSet() {
						log.Printf("WARN: Cannot find or set relation field %s in parent %s", relation.FieldName, parentField.Type().Name())
						continue
					}
					if relationSliceField.Kind() != reflect.Slice {
						log.Printf("WARN: Relation field %s in parent %s is not a slice", relation.FieldName, parentField.Type().Name())
						continue
					}

					sliceElemKind := relationSliceField.Type().Elem().Kind()
					if sliceElemKind == reflect.Ptr {
						relatedElemPtr := reflect.New(relatedElem.Type())
						relatedElemPtr.Elem().Set(relatedElem)
						relationSliceField.Set(reflect.Append(relationSliceField, relatedElemPtr))
					} else {
						relationSliceField.Set(reflect.Append(relationSliceField, relatedElem))
					}
				}
			}
		}
	}

	return nil
}
