package main

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json" // 結果表示用に JSON を使用
	"fmt"
	"os"
	"reflect"
	"strconv"
	"strings"
	"time"

	"github.com/lirlia/100day_challenge_backend/day31_go_orm/orm" // DB接続用に必要
)

// --- CLI アプリケーションで使用するモデル定義 ---
type User struct {
	ID        int64          `db:"id"`
	Name      string         `db:"name"`
	Email     sql.NullString `db:"email"`
	CreatedAt time.Time      `db:"created_at"`
	UpdatedAt time.Time      `db:"updated_at"`
	Posts     []Post         `orm:"hasmany:user_id"` // Preload 用に追加
}

type Post struct {
	ID          int64        `db:"id"`
	UserID      int64        `db:"user_id"`
	Title       string       `db:"title"`
	Body        *string      `db:"body"`
	PublishedAt sql.NullTime `db:"published_at"`
}

// --- ここまでモデル定義 ---

var currentDB *orm.DB // 現在接続中の DB インスタンス
var currentTX *orm.TX // 現在アクティブなトランザクション (未実装)

func main() {
	reader := bufio.NewReader(os.Stdin)
	fmt.Println("Interactive ORM Shell (Day 31)")
	fmt.Println("Enter 'help' for commands, 'exit' to quit.")

	for {
		// プロンプト表示
		prompt := "> "
		if currentDB != nil {
			// 接続中の DB ファイル名を表示したいが、orm.DB は元々の DSN を保持していない
			// 簡単のため、接続状態のみ示す
			prompt = "(connected) > "
			if currentTX != nil {
				prompt = "(tx) > "
			}
		}
		fmt.Print(prompt)

		input, err := reader.ReadString('\n')
		if err != nil {
			fmt.Println("Error reading input:", err)
			break // EOF などでループを抜ける
		}

		input = strings.TrimSpace(input)
		if input == "" {
			continue
		}

		parts := strings.Fields(input)
		command := strings.ToLower(parts[0])
		args := parts[1:]

		switch command {
		case "exit", "quit":
			fmt.Println("Exiting.")
			if currentTX != nil {
				fmt.Println("Warning: Active transaction rolled back.")
				currentTX.Rollback() // 暗黙的にロールバック
			}
			if currentDB != nil {
				currentDB.Close()
			}
			return // プログラム終了
		case "help":
			printHelp()
		case "connect":
			handleConnect(args)
		case "disconnect":
			handleDisconnect()
		case "insert":
			handleInsert(args)
		case "select": // select コマンドを処理
			handleSelect(args)
		case "select_one", "delete", "begin", "commit", "rollback":
			fmt.Println("Command not yet implemented:", command)
		default:
			fmt.Println("Unknown command:", command)
			printHelp()
		}
	}
}

func printHelp() {
	fmt.Println("Available commands:")
	fmt.Println("  connect <db_file_path>  - Connect to a SQLite database file.")
	fmt.Println("  disconnect              - Disconnect from the current database.")
	fmt.Println("  help                    - Show this help message.")
	fmt.Println("  exit / quit             - Exit the shell.")
	fmt.Println("  --- ORM Commands ---")
	fmt.Println("  insert <Model> <f=v> ...- Insert a new record.")
	fmt.Println("  select <Model> [...]    - Select records (use 'help select' for options).")
	fmt.Println("  select_one <Model> <id> - Select a single record by ID.")
	fmt.Println("  delete <Model> <id>     - Delete a record by ID.")
	fmt.Println("  begin                   - Begin a transaction.")
	fmt.Println("  commit                  - Commit the current transaction.")
	fmt.Println("  rollback                - Rollback the current transaction.")
	fmt.Println("  --- ORM Commands (Not Implemented Yet) ---")
	fmt.Println("  insert <Model> <f=v> ...")
	fmt.Println("  select <Model> [where \"q\" args...] [order \"c\" args...] [limit N] [offset N] [preload F]")
	fmt.Println("  select_one <Model> <id>")
	fmt.Println("  delete <Model> <id>")
	fmt.Println("  begin")
	fmt.Println("  commit")
	fmt.Println("  rollback")
}

func handleConnect(args []string) {
	if len(args) != 1 {
		fmt.Println("Usage: connect <db_file_path>")
		return
	}
	dbPath := args[0]

	if currentDB != nil {
		fmt.Println("Already connected. Disconnect first.")
		return
	}
	if currentTX != nil {
		fmt.Println("Error: Cannot connect while in a transaction.") // 通常発生しないはず
		return
	}

	// ../orm を参照するため、パスは実行時のカレントディレクトリからの相対パス
	// シェルは day31_go_orm/cli で実行される想定
	// TODO: パス解決をより堅牢にする (絶対パスを渡せるようにするなど)
	db, err := orm.Open(dbPath)
	if err != nil {
		fmt.Printf("Error connecting to database '%s': %v\n", dbPath, err)
		return
	}

	// 簡単な Ping で接続確認
	if err := db.PingContext(context.Background()); err != nil {
		fmt.Printf("Error pinging database '%s': %v\n", dbPath, err)
		db.Close() // 接続失敗したら閉じる
		return
	}

	currentDB = db
	fmt.Printf("Connected to %s\n", dbPath)
}

func handleDisconnect() {
	if currentDB == nil {
		fmt.Println("Not connected.")
		return
	}
	if currentTX != nil {
		fmt.Println("Warning: Active transaction rolled back during disconnect.")
		currentTX.Rollback()
		currentTX = nil
	}
	err := currentDB.Close()
	if err != nil {
		fmt.Println("Error closing database:", err)
		// エラーがあっても参照はクリアする
	}
	currentDB = nil
	fmt.Println("Disconnected.")
}

// handleInsert は insert コマンドを処理します。
// Usage: insert <ModelName> <field1=value1> <field2=value2> ...
func handleInsert(args []string) {
	executor := getExecutor()
	if executor == nil {
		fmt.Println("Not connected. Use 'connect <db_file>' first.")
		return
	}
	if len(args) < 2 {
		fmt.Println("Usage: insert <ModelName> <field1=value1> [field2=value2]...")
		return
	}

	modelName := args[0]
	fieldArgs := args[1:]

	modelPtr, err := getModelInstanceFromName(modelName)
	if err != nil {
		fmt.Println(err)
		return
	}

	modelVal := reflect.ValueOf(modelPtr).Elem()

	fmt.Printf("Preparing to insert into %s:\n", modelName)
	for _, fieldArg := range fieldArgs {
		parts := strings.SplitN(fieldArg, "=", 2)
		if len(parts) != 2 {
			fmt.Printf("  Invalid field format: %s (expected field=value)\n", fieldArg)
			continue
		}
		fieldName := parts[0]
		valueStr := parts[1]

		// ID は自動採番なので設定しない
		if strings.ToLower(fieldName) == "id" {
			fmt.Println("  Skipping ID field (auto-increment)")
			continue
		}
		// hasmany フィールドも設定しない
		if _, ok := modelVal.Type().FieldByName(fieldName); ok {
			fieldInfo, _ := modelVal.Type().FieldByName(fieldName)
			ormTag := fieldInfo.Tag.Get("orm")
			if strings.HasPrefix(ormTag, "hasmany:") {
				fmt.Printf("  Skipping hasmany field: %s\n", fieldName)
				continue
			}
		}

		field := modelVal.FieldByName(fieldName)
		if !field.IsValid() || !field.CanSet() {
			fmt.Printf("  Field not found or not settable: %s\n", fieldName)
			continue
		}

		fmt.Printf("  Setting %s = %s\n", fieldName, valueStr)
		if err := setFieldValue(field, valueStr); err != nil {
			fmt.Printf("    Error setting field %s: %v\n", fieldName, err)
		}
	}

	ctx := context.Background()
	result, insertErr := executor.Insert(ctx, modelPtr)

	if insertErr != nil {
		fmt.Printf("Error inserting record: %v\n", insertErr)
		return
	}

	lastID, err := result.LastInsertId()
	if err != nil {
		fmt.Printf("Successfully inserted, but could not get last insert ID: %v\n", err)
	} else {
		fmt.Printf("Successfully inserted record with ID: %d\n", lastID)
		// ID をモデルに反映 (もし可能なら)
		idField := modelVal.FieldByName("ID")
		if idField.IsValid() && idField.CanSet() && (idField.Kind() == reflect.Int || idField.Kind() == reflect.Int64) {
			idField.SetInt(lastID)
		}
	}
}

// handleSelect は select コマンドを処理します。
// 現時点では、モデルの全件取得のみをサポートします。
// TODO: where, order, limit, offset, preload のオプションを追加
func handleSelect(args []string) {
	executor := getExecutor()
	if executor == nil {
		fmt.Println("Not connected. Use 'connect <db_file>' first.")
		return
	}
	if len(args) < 1 {
		fmt.Println("Usage: select <ModelName>")
		return
	}

	modelName := args[0]
	modelPtr, err := getModelInstanceFromName(modelName)
	if err != nil {
		fmt.Println(err)
		return
	}

	// args[1:] を解析してクエリビルダを構築 (将来の拡張)
	// 現時点では全件取得
	qb := executor.Model(modelPtr)

	// --- ここから引数解析とクエリビルダ設定 (将来の拡張ポイント) ---
	// 例: preload の処理 (簡易版)
	preloadFields := []string{}
	otherArgs := []string{} // preload 以外の引数
	i := 1                  // args のインデックス (modelName の次から)
	for i < len(args) {
		keyword := strings.ToLower(args[i])
		if keyword == "preload" && i+1 < len(args) {
			preloadFields = append(preloadFields, args[i+1])
			i += 2 // preload とフィールド名分進める
		} else {
			otherArgs = append(otherArgs, args[i])
			i++
		}
	}
	// TODO: otherArgs を使って where, order, limit, offset を処理する

	for _, field := range preloadFields {
		fmt.Printf("Applying Preload: %s\n", field)
		qb = qb.Preload(field) // QueryBuilder を更新
	}
	// --- ここまで引数解析 ---

	// 結果を格納するためのスライスを作成
	sliceType := reflect.SliceOf(reflect.TypeOf(modelPtr).Elem())
	resultsSlice := reflect.MakeSlice(sliceType, 0, 0)
	resultsPtr := reflect.New(resultsSlice.Type())
	resultsPtr.Elem().Set(resultsSlice)

	// クエリ実行
	ctx := context.Background()
	err = qb.Select(ctx, resultsPtr.Interface()) // ポインタを渡す
	if err != nil {
		fmt.Printf("Error selecting records: %v\n", err)
		return
	}

	// 結果を表示 (JSON 形式)
	results := resultsPtr.Elem().Interface()
	jsonData, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		fmt.Printf("Error formatting results as JSON: %v\n", err)
		fmt.Printf("Fetched %d records.\n", resultsPtr.Elem().Len())
		return
	}

	fmt.Printf("Found %d records:\n", resultsPtr.Elem().Len())
	fmt.Println(string(jsonData))
}

// getModelInstanceFromName はモデル名を文字列で受け取り、
// 対応するモデルのゼロ値のポインタを返します。
func getModelInstanceFromName(name string) (interface{}, error) {
	switch strings.ToLower(name) {
	case "user":
		return &User{}, nil
	case "post":
		return &Post{}, nil
	default:
		return nil, fmt.Errorf("unknown model type: %s. Supported: User, Post", name)
	}
}

// setFieldValue はリフレクションを使用してフィールドに文字列値を設定します。
func setFieldValue(field reflect.Value, valueStr string) error {
	if !field.CanSet() {
		return fmt.Errorf("field cannot be set")
	}

	fieldType := field.Type()

	// ポインタ型の場合は、まずポインタの指す先の型を取得
	isPtr := false
	if fieldType.Kind() == reflect.Ptr {
		isPtr = true
		fieldType = fieldType.Elem() // ポインタの先の型
		// ポインタが nil の場合は初期化する必要がある
		if field.IsNil() {
			field.Set(reflect.New(fieldType)) // 新しい要素へのポインタを設定
		}
		// field 変数をポインタの先の要素を指すように更新
		field = field.Elem()
	}

	switch fieldType.Kind() {
	case reflect.String:
		field.SetString(valueStr)
	case reflect.Int, reflect.Int64:
		// 空文字列は 0 またはエラーとして扱うか？ここではエラーとする
		if valueStr == "" {
			if isPtr { // ポインタの場合は nil を設定
				field.Addr().Set(reflect.Zero(reflect.PtrTo(fieldType))) // field は Elem() されたものなので Addr() でポインタ取得
				return nil
			}
			return fmt.Errorf("empty string cannot be parsed as integer")
		}
		val, err := strconv.ParseInt(valueStr, 10, 64)
		if err != nil {
			return fmt.Errorf("invalid integer value '%s': %w", valueStr, err)
		}
		field.SetInt(val)
	case reflect.Struct:
		// sql.NullString, time.Time, sql.NullTime の処理
		if fieldType == reflect.TypeOf(sql.NullString{}) {
			ns := sql.NullString{String: valueStr, Valid: valueStr != ""}
			field.Set(reflect.ValueOf(ns))
		} else if fieldType == reflect.TypeOf(time.Time{}) {
			if valueStr == "" {
				if isPtr {
					field.Addr().Set(reflect.Zero(reflect.PtrTo(fieldType)))
					return nil
				}
				return fmt.Errorf("empty string cannot be parsed as time.Time")
			}
			t, err := parseTime(valueStr)
			if err != nil {
				return err
			}
			field.Set(reflect.ValueOf(t))
		} else if fieldType == reflect.TypeOf(sql.NullTime{}) {
			nt := sql.NullTime{}
			if valueStr != "" {
				t, err := parseTime(valueStr)
				if err != nil {
					return err
				}
				nt.Time = t
				nt.Valid = true
			}
			field.Set(reflect.ValueOf(nt))
		} else {
			return fmt.Errorf("unsupported struct type: %s", fieldType.Name())
		}
	// ポインタ型は上で処理済みなので、ここでは基本型のみ
	default:
		return fmt.Errorf("unsupported field type: %s", fieldType.Kind())
	}
	return nil
}

// parseTime はいくつかの一般的なフォーマットで時刻文字列をパースします。
func parseTime(valueStr string) (time.Time, error) {
	formats := []string{
		time.RFC3339Nano,
		time.RFC3339,
		"2006-01-02 15:04:05", // MySQL/SQLite DATETIME
		"2006-01-02",          // DATE
	}
	var t time.Time
	var err error
	for _, format := range formats {
		t, err = time.Parse(format, valueStr)
		if err == nil {
			return t, nil // パース成功
		}
	}
	// すべてのフォーマットで失敗した場合
	return time.Time{}, fmt.Errorf("invalid time format for '%s', tried formats: %v", valueStr, formats)
}

// getExecutor は現在のコンテキスト (トランザクション中か否か) に基づいて
// 適切な orm.Executor (DB または TX) を返します。
// 接続がない場合は nil を返します。
func getExecutor() orm.Executor {
	if currentTX != nil {
		return currentTX
	}
	// currentDB が nil でも orm.Executor インターフェースを満たす nil を返す
	return currentDB
}
