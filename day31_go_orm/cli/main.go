package main

import (
	"context" // 結果表示用に JSON を使用
	"database/sql"
	"fmt"
	"os"
	"reflect" // reflect を追加
	"sort"    // カラムソート用
	"strings"
	"text/tabwriter"

	prompt "github.com/c-bata/go-prompt"                          // bufio の代わりに go-prompt を使う
	"github.com/lirlia/100day_challenge_backend/day31_go_orm/orm" // DB接続用に必要
	_ "github.com/mattn/go-sqlite3"
)

// --- CLI アプリケーションで使用するモデル定義 ---
// type User struct {
// 	ID        int64          `db:"id"`
// 	Name      string         `db:"name"`
// 	Email     sql.NullString `db:"email"`
// 	CreatedAt time.Time      `db:"created_at"`
// 	UpdatedAt time.Time      `db:"updated_at"`
// 	Posts     []Post         `orm:"hasmany:user_id"` // Preload 用に追加
// }

// type Post struct {
// 	ID          int64        `db:"id"`
// 	UserID      int64        `db:"user_id"`
// 	Title       string       `db:"title"`
// 	Body        *string      `db:"body"`
// 	PublishedAt sql.NullTime `db:"published_at"`
// }

// --- ここまでモデル定義 ---

var currentDB *orm.DB // グローバル変数名を db から currentDB に変更
// var currentTX *orm.TX // 削除: CLI ではトランザクション管理はしない
var currentDBFile string

// --- モデルレジストリ --- START
// 文字列のモデル名から reflect.Type を引くためのマップ
// アプリケーションで利用するモデルをここに追加する
var modelRegistry = make(map[string]reflect.Type)

func init() {
	// Register models from the orm package
	// Note: We need access to the actual types defined in the orm package.
	// For simplicity, let's assume User and Post are defined in orm package.
	// If they are in a different package, adjust the import and type names.
	modelRegistry["User"] = reflect.TypeOf(orm.User{})
	modelRegistry["Post"] = reflect.TypeOf(orm.Post{})
}

// --- モデルレジストリ --- END

// --- コマンド定義 (更新) ---
var commands = []prompt.Suggest{
	{Text: "connect", Description: "<database_file> Connect to a SQLite database file."},
	{Text: "disconnect", Description: "Disconnect from the current database."},
	{Text: "tables", Description: "List tables in the current database."},
	{Text: "schema", Description: "<table_name> Show the schema of a table."},
	{Text: "find", Description: "<model> [where <cond>] [order <col> [asc|desc]] [limit <n>] [offset <n>] Find records."},
	{Text: "first", Description: "<model> [where <cond>] [order <col> [asc|desc]] Find first record."},
	{Text: "count", Description: "<model> [where <cond>] Count records."},
	{Text: "help", Description: "Show this help message."},
	{Text: "exit", Description: "Exit the shell."},
	{Text: "quit", Description: "Exit the shell."},
}

func main() {
	fmt.Println("Interactive ORM Shell (Day 31 with go-prompt)")
	fmt.Println("Enter 'help' for commands, type and press TAB for completion, 'exit' to quit.")

	// プロンプトのカスタマイズ関数
	livePrefixFunc := func() (string, bool) {
		prefix := "> "
		if currentDB != nil {
			prefix = fmt.Sprintf("(%s) > ", currentDBFile)
		}
		return prefix, true // 常にライブプレフィックスを有効にする
	}

	p := prompt.New(
		executor,
		completer,
		prompt.OptionTitle("orm-shell"),
		prompt.OptionPrefix("> "),               // デフォルトプレフィックス
		prompt.OptionLivePrefix(livePrefixFunc), // 動的プレフィックス
		prompt.OptionInputTextColor(prompt.Yellow),
		// prompt.OptionHistory([]string{"connect orm_shell.db", "tables", "schema users"}), // 履歴の初期値 (オプション)
	)
	p.Run() // REPL を起動
}

// --- executor 関数 ---
// ユーザーの入力を処理する
func executor(in string) {
	in = strings.TrimSpace(in)
	if in == "" {
		return
	} else if in == "quit" || in == "exit" {
		if currentDB != nil {
			currentDB.Close()
		}
		fmt.Println("Exiting.")
		os.Exit(0) // go-prompt を使う場合、os.Exit で終了する必要がある
	}

	processCommand(in) // 既存のコマンド処理関数を呼び出す
}

// --- completer 関数 (更新) ---
func completer(d prompt.Document) []prompt.Suggest {
	wordBeforeCursor := d.GetWordBeforeCursor()
	currentLine := d.TextBeforeCursor()
	args := strings.Fields(currentLine)
	suggestions := []prompt.Suggest{} // 候補を初期化

	// 1. コマンド名の補完
	// 引数がない場合、または最初の引数を入力中で末尾がスペースでない場合
	if len(args) == 0 || (len(args) == 1 && !strings.HasSuffix(currentLine, " ")) {
		return prompt.FilterHasPrefix(commands, wordBeforeCursor, true)
	}

	// 2. コマンド引数の補完
	if len(args) >= 1 {
		command := strings.ToLower(args[0])
		switch command {
		case "schema":
			// "schema " の後にモデル名を提案
			if len(args) == 1 && strings.HasSuffix(currentLine, " ") { // Suggest table/model name after "schema "
				modelNames := getRegisteredModelNames()
				for _, name := range modelNames {
					suggestions = append(suggestions, prompt.Suggest{Text: name})
				}
				return suggestions
			}
			// モデル名を入力中にフィルタリング
			if len(args) == 2 && !strings.HasSuffix(currentLine, " ") { // Filtering model name
				modelNames := getRegisteredModelNames()
				for _, name := range modelNames {
					suggestions = append(suggestions, prompt.Suggest{Text: name})
				}
				return prompt.FilterHasPrefix(suggestions, wordBeforeCursor, true)
			}

		case "find", "first", "count":
			// コマンド名の直後 + スペースでモデル名を提案
			if len(args) == 1 && strings.HasSuffix(currentLine, " ") {
				modelNames := getRegisteredModelNames()
				for _, name := range modelNames {
					suggestions = append(suggestions, prompt.Suggest{Text: name})
				}
				return suggestions
			}
			// モデル名を入力中にフィルタリング
			if len(args) == 2 && !strings.HasSuffix(currentLine, " ") {
				modelNames := getRegisteredModelNames()
				for _, name := range modelNames {
					suggestions = append(suggestions, prompt.Suggest{Text: name})
				}
				return prompt.FilterHasPrefix(suggestions, wordBeforeCursor, true)
			}

			// --- モデル名入力後のキーワード提案 ---
			if len(args) >= 2 {
				modelName := args[1]
				// 入力されたモデル名が有効かチェック
				if _, isValidModel := modelRegistry[modelName]; isValidModel {

					// 提案可能なキーワード
					availableKeywords := map[string]bool{"where": true, "order": true}
					if command == "find" {
						availableKeywords["limit"] = true
						availableKeywords["offset"] = true
					}

					// 既に使用されたキーワードを除外
					usedKeywords := make(map[string]bool)
					for i := 2; i < len(args); i++ {
						// Check if arg[i] is a potential keyword before lowercasing
						lowerArg := strings.ToLower(args[i])
						if _, ok := availableKeywords[lowerArg]; ok {
							// Crude check to see if it's likely a keyword vs part of a 'where' clause
							// If the previous arg wasn't 'where', assume it's a keyword
							if i > 2 && strings.ToLower(args[i-1]) != "where" {
								usedKeywords[lowerArg] = true
							} else if i == 2 { // First word after model name is always a keyword if it matches
								usedKeywords[lowerArg] = true
							}
						}
					}

					// 現在のカーソル位置や直前の引数に基づいて、何を提案すべきか判断
					contextAllowsKeywords := false
					// 1. モデル名の直後 (`find User `)
					if len(args) == 2 && strings.HasSuffix(currentLine, " ") {
						contextAllowsKeywords = true
					}
					// 2. 前のキーワードの引数が終わった後 (より正確な判定が必要)
					if len(args) > 2 {
						lastArg := args[len(args)-1]
						prevArg := args[len(args)-2]
						// 簡単な判定: 'order col asc/desc' の後や 'limit num', 'offset num' の後
						if strings.ToLower(prevArg) == "order" && (strings.ToLower(lastArg) == "asc" || strings.ToLower(lastArg) == "desc") && strings.HasSuffix(currentLine, " ") {
							contextAllowsKeywords = true
						} else if (strings.ToLower(prevArg) == "limit" || strings.ToLower(prevArg) == "offset") && isNumber(lastArg) && strings.HasSuffix(currentLine, " ") {
							contextAllowsKeywords = true
						}
						// 'where'句の終わりを判定するのは難しいので、'where'の後には常にキーワードを許可する（簡易的）
						// if strings.ToLower(prevArg) == "where" { contextAllowsKeywords = true }
						// Consider suggesting keywords if the last argument doesn't seem like part of a where clause
						// or if the last word being typed looks like a keyword start
						if strings.HasSuffix(currentLine, " ") { // Only suggest keywords after a space
							lastKeyword := ""
							for i := len(args) - 1; i >= 2; i-- {
								if _, ok := availableKeywords[strings.ToLower(args[i])]; ok {
									lastKeyword = strings.ToLower(args[i])
									break
								}
							}
							if lastKeyword == "where" { // After where, it's hard to tell, don't suggest keywords for now
								contextAllowsKeywords = false
							} else {
								contextAllowsKeywords = true // Allow keywords after other conditions potentially
							}
						}

					}

					// キーワードを提案するコンテキストの場合
					if contextAllowsKeywords {
						for keyword := range availableKeywords {
							if !usedKeywords[keyword] {
								suggestions = append(suggestions, prompt.Suggest{Text: keyword})
							}
						}
						// フィルタリングして返す (wordBeforeCursor が空ならそのまま返す)
						if wordBeforeCursor == "" {
							return suggestions
						}
						return prompt.FilterHasPrefix(suggestions, wordBeforeCursor, true)
					}

					// --- 特定のキーワード引数の提案 ---

					// "where" の後にカラム名を提案
					if len(args) == 3 && strings.ToLower(args[2]) == "where" && strings.HasSuffix(currentLine, " ") {
						modelType := modelRegistry[modelName]
						columnSuggestions := getModelColumnSuggestions(modelType)
						return columnSuggestions
					}
					// "where" の後にカラム名を入力中にフィルタリング
					if len(args) == 4 && strings.ToLower(args[2]) == "where" && !strings.HasSuffix(currentLine, " ") {
						modelType := modelRegistry[modelName]
						columnSuggestions := getModelColumnSuggestions(modelType)
						return prompt.FilterHasPrefix(columnSuggestions, wordBeforeCursor, true)
					}
					// TODO: "where <col> " の後に演算子 (=, !=, >, <, like など) を提案する
					// TODO: "where <col> = " の後に値の型に応じた提案 (文字列？数値？)

					// "order" の後にカラム名 or asc/desc
					if len(args) == 3 && strings.ToLower(args[2]) == "order" && strings.HasSuffix(currentLine, " ") {
						modelType := modelRegistry[modelName]
						columnSuggestions := getModelColumnSuggestions(modelType)
						orderSuggestions := append(columnSuggestions, prompt.Suggest{Text: "asc"}, prompt.Suggest{Text: "desc"}) // カラム名 + asc/desc
						return orderSuggestions
					}
					if len(args) == 4 && strings.ToLower(args[2]) == "order" && !strings.HasSuffix(currentLine, " ") {
						modelType := modelRegistry[modelName]
						columnSuggestions := getModelColumnSuggestions(modelType)
						orderSuggestions := append(columnSuggestions, prompt.Suggest{Text: "asc"}, prompt.Suggest{Text: "desc"})
						return prompt.FilterHasPrefix(orderSuggestions, wordBeforeCursor, true)
					}
					// "order <col>" の後に asc/desc
					if len(args) == 4 && strings.ToLower(args[2]) == "order" && strings.HasSuffix(currentLine, " ") {
						orderSuggestions := []prompt.Suggest{{Text: "asc"}, {Text: "desc"}}
						return orderSuggestions
					}
					if len(args) == 5 && strings.ToLower(args[2]) == "order" && !strings.HasSuffix(currentLine, " ") {
						orderSuggestions := []prompt.Suggest{{Text: "asc"}, {Text: "desc"}}
						return prompt.FilterHasPrefix(orderSuggestions, wordBeforeCursor, true) // filter asc/desc
					}
				}
			}

		case "connect":
			// ファイル名の補完は省略
			return []prompt.Suggest{}
		}
	}

	// 一致するものがなければ空の候補を返す
	return suggestions
}

// --- ヘルパー関数 (カラム名取得を追加) ---
// モデルの型情報からカラム名（フィールド名）の Suggestion リストを取得
func getModelColumnSuggestions(modelType reflect.Type) []prompt.Suggest {
	if modelType.Kind() == reflect.Ptr {
		modelType = modelType.Elem()
	}
	if modelType.Kind() != reflect.Struct {
		return []prompt.Suggest{}
	}

	suggestions := []prompt.Suggest{}
	// モデルのフィールドを走査
	// TODO: orm パッケージの StructInfo を利用してリレーションを除外する方が堅牢
	for i := 0; i < modelType.NumField(); i++ {
		field := modelType.Field(i)
		if field.IsExported() {
			// 簡単なチェック: フィールドの型がスライスやポインタでない場合をカラム候補とする
			// (より正確には orm タグを見るべき)
			if field.Type.Kind() != reflect.Slice && field.Type.Kind() != reflect.Ptr && field.Type.Kind() != reflect.Interface {
				suggestions = append(suggestions, prompt.Suggest{Text: field.Name})
			}
		}
	}
	return suggestions
}

// modelRegistry からモデル名（キー）のスライスを取得
func getRegisteredModelNames() []string {
	names := make([]string, 0, len(modelRegistry))
	for k := range modelRegistry {
		names = append(names, k)
	}
	sort.Strings(names) // ソートして返す
	return names
}

// 文字列が数字かどうかを判定する簡易関数
func isNumber(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}

func printHelp() {
	// help コマンドの出力も go-prompt の Suggestion に合わせる
	fmt.Println("Available commands:")
	for _, cmd := range commands {
		fmt.Printf("  %-10s - %s\n", cmd.Text, cmd.Description)
	}
}

func connectDB(filename string) {
	var err error
	if currentDB != nil {
		currentDB.Close()
	}
	dbInstance, err := orm.Open(filename)
	if err != nil {
		fmt.Printf("Error connecting to database %s: %v\n", filename, err)
		return
	}
	err = dbInstance.PingContext(context.Background())
	if err != nil {
		fmt.Printf("Error pinging database %s: %v\n", filename, err)
		dbInstance.Close()
		return
	}
	currentDB = dbInstance
	currentDBFile = filename
	fmt.Printf("Connected to %s\n", filename)
}

func disconnectDB() {
	if currentDB == nil {
		fmt.Println("Not connected.")
		return
	}
	err := currentDB.Close()
	if err != nil {
		fmt.Println("Error closing database:", err)
		// エラーがあっても参照はクリアする
	}
	currentDB = nil
	currentDBFile = ""
	fmt.Println("Disconnected.")
}

func processCommand(line string) {
	parts := strings.Fields(line)
	if len(parts) == 0 {
		return
	}
	command := strings.ToLower(parts[0])

	switch command {
	case "help":
		printHelp()
	case "connect":
		if len(parts) != 2 {
			fmt.Println("Usage: connect <database_file>")
			return
		}
		connectDB(parts[1])
	case "disconnect":
		disconnectDB()
	case "tables":
		showTables() // 実装は getRegisteredModelNames を使うように変更しても良い
	case "schema":
		if len(parts) != 2 {
			fmt.Println("Usage: schema <table_name or model_name>")
			return
		}
		// テーブル名かモデル名でスキーマ表示 (テーブル名優先)
		showSchema(parts[1])
	case "find", "first", "count":
		if currentDB == nil {
			fmt.Println("Not connected to a database.")
			return
		}
		if len(parts) < 2 {
			fmt.Printf("Usage: %s <model> [options...]\n", command)
			return
		}

		// modelName := strings.ToLower(parts[1]) // ユーザー入力のモデル名をそのまま使う
		modelName := parts[1]
		modelType, ok := modelRegistry[modelName]
		if !ok {
			fmt.Printf("Unknown model: %s. Registered models: %v\n", modelName, getRegisteredModelNames())
			return
		}

		// オプションのパース (簡易版)
		var whereClause string
		var orderClause string
		var limit *int
		var offset *int

		remainingParts := parts[2:]
		i := 0
		for i < len(remainingParts) {
			keyword := strings.ToLower(remainingParts[i])
			i++
			switch keyword {
			case "where":
				whereStartIndex := i
				// "order", "limit", "offset" が来るまでを where 句とする
				for i < len(remainingParts) && !isKeyword(remainingParts[i]) {
					i++
				}
				if whereStartIndex < i {
					whereClause = strings.Join(remainingParts[whereStartIndex:i], " ")
					fmt.Printf("DEBUG: Parsed WHERE clause: %s\n", whereClause) // デバッグ用
				} else {
					fmt.Println("Error: Missing condition after 'where'.")
					return
				}
			case "order":
				if i < len(remainingParts) {
					orderColumn := remainingParts[i]
					i++
					orderDir := "ASC" // デフォルト
					if i < len(remainingParts) && (strings.ToLower(remainingParts[i]) == "asc" || strings.ToLower(remainingParts[i]) == "desc") {
						orderDir = strings.ToUpper(remainingParts[i])
						i++
					}
					orderClause = fmt.Sprintf("%s %s", orderColumn, orderDir)
					fmt.Printf("DEBUG: Parsed ORDER clause: %s\n", orderClause) // デバッグ用
				} else {
					fmt.Println("Error: Missing column after 'order'.")
					return
				}
			case "limit":
				if command != "find" {
					fmt.Printf("Error: 'limit' is only supported for 'find' command.\n")
					return
				}
				if i < len(remainingParts) {
					n, err := parseInt(remainingParts[i])
					if err != nil {
						fmt.Printf("Error: Invalid number for 'limit': %v\n", err)
						return
					}
					limit = &n
					i++
					fmt.Printf("DEBUG: Parsed LIMIT: %d\n", *limit) // デバッグ用
				} else {
					fmt.Println("Error: Missing number after 'limit'.")
					return
				}
			case "offset":
				if command != "find" {
					fmt.Printf("Error: 'offset' is only supported for 'find' command.\n")
					return
				}
				if i < len(remainingParts) {
					n, err := parseInt(remainingParts[i])
					if err != nil {
						fmt.Printf("Error: Invalid number for 'offset': %v\n", err)
						return
					}
					offset = &n
					i++
					fmt.Printf("DEBUG: Parsed OFFSET: %d\n", *offset) // デバッグ用
				} else {
					fmt.Println("Error: Missing number after 'offset'.")
					return
				}
			default:
				fmt.Printf("Unknown option or keyword: %s\n", remainingParts[i-1])
				return
			}
		}

		// パース結果を使って実行
		switch command {
		case "find":
			executeFind(context.Background(), modelType, whereClause, orderClause, limit, offset)
		case "first":
			executeFirst(context.Background(), modelType, whereClause, orderClause)
		case "count":
			executeCount(context.Background(), modelType, whereClause)
		}

	default:
		fmt.Println("Unknown command:", command)
		printHelp()
	}
}

// --- ヘルパー関数 (追加) ---
func isKeyword(s string) bool {
	lower := strings.ToLower(s)
	return lower == "where" || lower == "order" || lower == "limit" || lower == "offset"
}

func parseInt(s string) (int, error) {
	var n int
	_, err := fmt.Sscan(s, &n)
	return n, err
}

// --- ORM 実行関数 (新規) ---
func executeFind(ctx context.Context, modelType reflect.Type, whereClause, orderClause string, limit, offset *int) {
	// モデルのポインタのスライスを作成 (例: *[]orm.User)
	sliceType := reflect.SliceOf(reflect.PtrTo(modelType))
	destSlice := reflect.New(sliceType)

	// QueryBuilder を構築
	modelPtr := reflect.New(modelType).Interface() // Model() にはポインタを渡す
	qb := currentDB.Model(modelPtr)
	if whereClause != "" {
		qb = qb.Where(whereClause) // 引数なし
	}
	if orderClause != "" {
		qb = qb.Order(orderClause)
	}
	if limit != nil {
		qb = qb.Limit(*limit)
	}
	if offset != nil {
		qb = qb.Offset(*offset)
	}

	// 実行
	err := qb.Select(destSlice.Interface())
	if err != nil {
		fmt.Printf("Error executing find: %v\n", err)
		return
	}

	// 結果表示
	printStructs(destSlice.Elem())
}

func executeFirst(ctx context.Context, modelType reflect.Type, whereClause, orderClause string) {
	dest := reflect.New(modelType).Interface() // ポインタを作成 (例: *orm.User)

	qb := currentDB.Model(dest) // dest を直接 Model に渡せる
	if whereClause != "" {
		qb = qb.Where(whereClause)
	}
	if orderClause != "" {
		qb = qb.Order(orderClause)
	}

	err := qb.SelectOne(dest)
	if err != nil {
		if err == sql.ErrNoRows {
			fmt.Println("(no rows)")
		} else {
			fmt.Printf("Error executing first: %v\n", err)
		}
		return
	}

	// 結果表示 (単一の構造体ポインタ)
	printStruct(reflect.ValueOf(dest))
}

func executeCount(ctx context.Context, modelType reflect.Type, whereClause string) {
	var count int64
	modelPtr := reflect.New(modelType).Interface()
	qb := currentDB.Model(modelPtr)
	if whereClause != "" {
		qb = qb.Where(whereClause)
	}

	err := qb.Count(&count)
	if err != nil {
		fmt.Printf("Error executing count: %v\n", err)
		return
	}

	fmt.Printf("Count: %d\n", count)
}

// --- 結果表示関数 (新規) ---
// 構造体のスライスを表形式で表示
func printStructs(sliceVal reflect.Value) {
	if sliceVal.Kind() != reflect.Slice {
		fmt.Println("[printStructs] Error: input is not a slice")
		return
	}
	if sliceVal.Len() == 0 {
		fmt.Println("(no rows)")
		return
	}

	// 最初の要素から型情報を取得
	elem := sliceVal.Index(0)
	if elem.Kind() == reflect.Ptr {
		elem = elem.Elem()
	}
	if elem.Kind() != reflect.Struct {
		fmt.Println("[printStructs] Error: slice element is not a struct or pointer to struct")
		return
	}
	structType := elem.Type()

	// ヘッダー行 (フィールド名)
	var headers []string
	fieldMap := make(map[string]int) // フィールド名 -> インデックス
	for i := 0; i < structType.NumField(); i++ {
		field := structType.Field(i)
		if field.IsExported() {
			// TODO: db タグを見てカラム名にするか、リレーションを除外するか？
			//       今回はシンプルにフィールド名をそのまま使う
			headers = append(headers, field.Name)
			fieldMap[field.Name] = i
		}
	}
	sort.Strings(headers) // ヘッダーをソート

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', tabwriter.Debug)
	defer w.Flush()

	fmt.Fprintln(w, strings.Join(headers, "\t"))

	// データ行
	for i := 0; i < sliceVal.Len(); i++ {
		rowVal := sliceVal.Index(i)
		if rowVal.Kind() == reflect.Ptr {
			rowVal = rowVal.Elem()
		}

		var row []string
		for _, header := range headers {
			fieldIndex := fieldMap[header]
			fieldVal := rowVal.Field(fieldIndex)
			row = append(row, fmt.Sprintf("%v", fieldVal.Interface()))
		}
		fmt.Fprintln(w, strings.Join(row, "\t"))
	}
}

// 単一の構造体（ポインタ）を整形して表示
func printStruct(structPtrVal reflect.Value) {
	if structPtrVal.Kind() != reflect.Ptr || structPtrVal.IsNil() {
		fmt.Println("[printStruct] Error: input is not a valid pointer")
		return
	}
	structVal := structPtrVal.Elem()
	if structVal.Kind() != reflect.Struct {
		fmt.Println("[printStruct] Error: input does not point to a struct")
		return
	}
	structType := structVal.Type()

	fmt.Println("-- Result --")
	for i := 0; i < structType.NumField(); i++ {
		field := structType.Field(i)
		value := structVal.Field(i)
		if field.IsExported() {
			fmt.Printf("  %s: %v\n", field.Name, value.Interface())
		}
	}
	fmt.Println("------------")
}

// showTables, showSchema は変更なし

func showTables() {
	if currentDB == nil {
		fmt.Println("Not connected to a database.")
		return
	}
	rows, err := currentDB.DB.QueryContext(context.Background(), "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
	if err != nil {
		fmt.Printf("Error fetching tables: %v\n", err)
		return
	}
	defer rows.Close()

	fmt.Println("Tables:")
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			fmt.Printf("Error scanning table name: %v\n", err)
			continue
		}
		fmt.Printf("  %s\n", tableName)
	}
	if err := rows.Err(); err != nil {
		fmt.Printf("Error iterating tables: %v\n", err)
	}
}

func showSchema(tableName string) {
	if currentDB == nil {
		fmt.Println("Not connected.")
		return
	}
	query := fmt.Sprintf("PRAGMA table_info(%s);", tableName) // テーブル名を埋め込むが、本来は検証が必要
	rows, err := currentDB.DB.QueryContext(context.Background(), query)
	if err != nil {
		fmt.Printf("Error getting schema for table %s: %v\n", tableName, err)
		return
	}
	defer rows.Close()

	cols, _ := rows.Columns() // schema のカラム名は固定されているはず
	fmt.Printf("Schema for table '%s':\n", tableName)

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0) // tabwriter をここで使う
	defer w.Flush()

	// ヘッダー
	fmt.Fprintln(w, strings.Join(cols, "\t"))

	// データ
	for rows.Next() {
		// cid, name, type, notnull, dflt_value, pk
		var cid int
		var name, colType string
		var notnull int
		var dfltValue sql.NullString // NULL 許容
		var pk int

		if err := rows.Scan(&cid, &name, &colType, &notnull, &dfltValue, &pk); err != nil {
			fmt.Printf("Error scanning schema row: %v\n", err)
			continue
		}

		row := []string{
			fmt.Sprintf("%d", cid),
			name,
			colType,
			fmt.Sprintf("%d", notnull),
			fmt.Sprintf("%v", dfltValue.String), // NULL は空文字列になる
			fmt.Sprintf("%d", pk),
		}
		fmt.Fprintln(w, strings.Join(row, "\t"))
	}

	if err = rows.Err(); err != nil {
		fmt.Printf("Error iterating schema rows: %v\n", err)
	}
}
