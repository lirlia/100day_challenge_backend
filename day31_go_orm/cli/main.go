package main

import (
	"context" // 結果表示用に JSON を使用
	"database/sql"
	"fmt"
	"os"
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

// --- コマンド定義 ---
var commands = []prompt.Suggest{
	{Text: "connect", Description: "<database_file> Connect to a SQLite database file."},
	{Text: "disconnect", Description: "Disconnect from the current database."},
	{Text: "tables", Description: "List tables in the current database."},
	{Text: "schema", Description: "<table_name> Show the schema of a table."},
	{Text: "select", Description: "* from <table> / count(*) from <table> Execute a SELECT query."},
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

// --- completer 関数 ---
// 補完候補を生成する
func completer(d prompt.Document) []prompt.Suggest {
	wordBeforeCursor := d.GetWordBeforeCursor()
	currentLine := d.TextBeforeCursor()
	args := strings.Fields(currentLine)

	// 1. コマンド名の補完
	if len(args) <= 1 && !strings.Contains(currentLine, " ") {
		return prompt.FilterHasPrefix(commands, wordBeforeCursor, true)
	}

	// 2. コマンド引数の補完
	if len(args) >= 1 {
		command := strings.ToLower(args[0])
		switch command {
		case "schema":
			// "schema " の後にテーブル名を補完
			if len(args) == 2 {
				tableNames := getTableNames()
				tableSuggestions := make([]prompt.Suggest, len(tableNames))
				for i, name := range tableNames {
					tableSuggestions[i] = prompt.Suggest{Text: name}
				}
				return prompt.FilterHasPrefix(tableSuggestions, wordBeforeCursor, true)
			}
		case "select":
			// "select " の後
			if len(args) >= 2 {
				// "select * " の後
				if strings.ToLower(args[1]) == "*" && len(args) >= 3 && strings.ToLower(args[2]) == "from" {
					// "select * from " の後にテーブル名を補完
					if len(args) == 4 {
						tableNames := getTableNames()
						tableSuggestions := make([]prompt.Suggest, len(tableNames))
						for i, name := range tableNames {
							tableSuggestions[i] = prompt.Suggest{Text: name}
						}
						return prompt.FilterHasPrefix(tableSuggestions, wordBeforeCursor, true)
					}
				}
				// "select count(*) " の後
				if strings.ToLower(args[1]) == "count(*)" && len(args) >= 3 && strings.ToLower(args[2]) == "from" {
					// "select count(*) from " の後にテーブル名を補完
					if len(args) == 4 {
						tableNames := getTableNames()
						tableSuggestions := make([]prompt.Suggest, len(tableNames))
						for i, name := range tableNames {
							tableSuggestions[i] = prompt.Suggest{Text: name}
						}
						return prompt.FilterHasPrefix(tableSuggestions, wordBeforeCursor, true)
					}
				}
				// "select " の直後で '*' や 'count(*)' を補完
				if len(args) == 2 {
					selectArgs := []prompt.Suggest{
						{Text: "*", Description: "Select all columns"},
						{Text: "count(*)", Description: "Count rows"},
					}
					return prompt.FilterHasPrefix(selectArgs, wordBeforeCursor, true)
				}
				// "select * " や "select count(*) " の後で 'from' を補完
				if len(args) == 3 && (strings.ToLower(args[1]) == "*" || strings.ToLower(args[1]) == "count(*)") {
					fromSuggestion := []prompt.Suggest{{Text: "from"}}
					return prompt.FilterHasPrefix(fromSuggestion, wordBeforeCursor, true)
				}
			}
		case "connect":
			// connect の後のファイルパス補完は実装が複雑なので省略
			return []prompt.Suggest{}
		}
	}

	return []prompt.Suggest{} // 上記以外は補完しない
}

// --- ヘルパー関数: テーブル名取得 ---
func getTableNames() []string {
	if currentDB == nil {
		return []string{}
	}
	rows, err := currentDB.DB.QueryContext(context.Background(), "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name;")
	if err != nil {
		// エラーは無視して空のスライスを返す (補完のため)
		return []string{}
	}
	defer rows.Close()

	var tables []string
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err == nil {
			tables = append(tables, tableName)
		}
	}
	return tables
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
		showTables()
	case "schema":
		if len(parts) != 2 {
			fmt.Println("Usage: schema <table_name>")
			return
		}
		showSchema(parts[1])
	case "select":
		if currentDB == nil {
			fmt.Println("Not connected to a database.")
			return
		}
		// select クエリのパース (簡易版)
		// 例: "select * from users", "select count(*) from posts", "select * from users where id = 1"
		if len(parts) < 4 || strings.ToLower(parts[2]) != "from" {
			fmt.Println("Usage: select * from <table_name> [where ...]")
			fmt.Println("   or: select count(*) from <table_name> [where ...]")
			return
		}

		selectTarget := strings.ToLower(parts[1])
		tableName := parts[3]
		whereClause := ""
		var whereArgs []interface{}

		if len(parts) > 4 {
			if strings.ToLower(parts[4]) == "where" {
				// 簡単のため、where 句全体を文字列として扱い、引数は ? のみサポートする簡易実装
				// 例: "where id = ?", args: [1] (引数は文字列として解釈される)
				if len(parts) > 5 {
					whereParts := parts[5:]
					// where 句を再構築 (スペースで結合)
					whereClause = strings.Join(whereParts, " ")
					// ? の数を数え、それに対応する引数を末尾から取得しようと試みる
					// この実装は非常に脆弱で、実際の SQL インジェクション対策にはなりません
					// 本来はプレースホルダとその値を安全に分離・処理する必要があります
					// placeholderCount := strings.Count(whereClause, "?") // 未使用なので削除
					// whereParts から引数を抽出するロジックは複雑なので一旦省略。args は空のまま。
					fmt.Println("WARN: WHERE clause arguments are not fully supported in this simple parser.")
					// WHERE句を args なしで設定（WHERE id = 1 のような直接指定のみ動作）
					whereArgs = nil
				} else {
					fmt.Println("Usage: select ... where <condition>")
					return
				}
			} else {
				fmt.Println("Only WHERE clause is supported after table name.")
				return
			}
		}

		if selectTarget == "count(*)" {
			executeCountQuery(context.Background(), tableName, whereClause, whereArgs)
		} else if selectTarget == "*" {
			executeSelectStarQuery(context.Background(), tableName, whereClause, whereArgs)
		} else {
			fmt.Println("Only 'select *' or 'select count(*)' is supported.")
		}

	default:
		fmt.Println("Unknown command:", command)
		printHelp()
	}
}

// executeSelectQuery を select * と count(*) で分割

// executeSelectStarQuery は SELECT * クエリを実行し、結果を表形式で表示します。
func executeSelectStarQuery(ctx context.Context, tableName string, whereClause string, whereArgs []interface{}) {
	if currentDB == nil {
		fmt.Println("Not connected.")
		return
	}

	qb := currentDB.Table(tableName)
	if whereClause != "" {
		// 注意: この実装では whereArgs が常に nil なので、プレースホルダは使えません
		qb = qb.Where(whereClause) // Where に args を渡さない
	}

	var results []map[string]interface{}
	err := qb.ScanMaps(&results)
	if err != nil {
		fmt.Printf("Error executing select query: %v\n", err)
		return
	}

	if len(results) == 0 {
		fmt.Println("(no rows)")
		return
	}

	// printTable が map スライスを受け取れるように修正が必要
	printMapSliceTable(results)
}

// executeCountQuery は SELECT count(*) クエリを実行し、結果を表示します。
func executeCountQuery(ctx context.Context, tableName string, whereClause string, whereArgs []interface{}) {
	if currentDB == nil {
		fmt.Println("Not connected.")
		return
	}

	qb := currentDB.Table(tableName)
	if whereClause != "" {
		// 注意: この実装では whereArgs が常に nil なので、プレースホルダは使えません
		qb = qb.Where(whereClause) // Where に args を渡さない
	}

	var count int64
	err := qb.Count(&count)
	if err != nil {
		fmt.Printf("Error executing count query: %v\n", err)
		return
	}

	fmt.Printf("Count: %d\n", count)
}

// printTable を printMapSliceTable に変更し、[]map[string]interface{} を受け取るように修正
func printMapSliceTable(data []map[string]interface{}) {
	if len(data) == 0 {
		return // データがなければ何もしない
	}

	// 最初の行からカラム名を取得 (順序は保証されない点に注意)
	var columns []string
	for k := range data[0] {
		columns = append(columns, k)
	}
	// TODO: カラム順をある程度固定する (e.g., id を先頭に)

	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', tabwriter.Debug)
	defer w.Flush()

	// ヘッダー行
	fmt.Fprintln(w, strings.Join(columns, "\t"))
	// 区切り線 (オプション)
	// var separator []string
	// for _, col := range columns {
	// 	separator = append(separator, strings.Repeat("-", len(col)))
	// }
	// fmt.Fprintln(w, strings.Join(separator, "\t"))

	// データ行
	for _, rowMap := range data {
		var row []string
		for _, colName := range columns {
			val := rowMap[colName]
			row = append(row, fmt.Sprintf("%v", val)) // %v で様々な型を文字列化
		}
		fmt.Fprintln(w, strings.Join(row, "\t"))
	}
}

// 不要になった古い printTable 関数は削除
// func printTable(columns []string, data [][]interface{}) {
// ...
// }

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
