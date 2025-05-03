package main

import (
	"context" // 結果表示用に JSON を使用
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
		query := strings.Join(parts[1:], " ")
		lowerQuery := strings.ToLower(query)
		if !strings.HasPrefix(lowerQuery, "* from ") && !strings.HasPrefix(lowerQuery, "count(*) from ") {
			fmt.Println("Currently only 'SELECT * FROM <table_name>' and 'SELECT COUNT(*) FROM <table_name>' are supported.")
			return
		}
		trimmedQuery := strings.TrimSuffix(query, ";")
		executeSelectQuery(context.Background(), trimmedQuery)
	default:
		fmt.Printf("Unknown command: %s. Enter 'help' for commands.\n", command)
	}
}

func executeSelectQuery(ctx context.Context, query string) {
	rows, err := currentDB.DB.QueryContext(ctx, "SELECT "+query)
	if err != nil {
		fmt.Printf("Error executing query: %v\n", err)
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		fmt.Printf("Error getting columns: %v\n", err)
		return
	}
	if len(cols) == 0 {
		fmt.Println("(no results)")
		return
	}

	var results [][]interface{}
	for rows.Next() {
		rowValues := make([]interface{}, len(cols))
		rowPointers := make([]interface{}, len(cols))
		for i := range rowValues {
			rowPointers[i] = &rowValues[i]
		}

		if err := rows.Scan(rowPointers...); err != nil {
			fmt.Printf("Error scanning row: %v\n", err)
			return
		}
		results = append(results, rowValues)
	}

	if err := rows.Err(); err != nil {
		fmt.Printf("Error during row iteration: %v\n", err)
		return
	}

	if len(results) == 0 {
		fmt.Println("(no results)")
		return
	}

	printTable(cols, results)
}

func printTable(columns []string, data [][]interface{}) {
	w := tabwriter.NewWriter(os.Stdout, 0, 0, 2, ' ', 0)

	fmt.Fprintln(w, strings.Join(columns, "\t"))
	headerSeparators := make([]string, len(columns))
	for i := range columns {
		headerSeparators[i] = strings.Repeat("-", len(columns[i]))
	}
	fmt.Fprintln(w, strings.Join(headerSeparators, "\t"))

	for _, row := range data {
		rowStr := make([]string, len(row))
		for i, val := range row {
			if b, ok := val.([]byte); ok {
				rowStr[i] = string(b)
			} else if val == nil {
				rowStr[i] = "NULL"
			} else {
				rowStr[i] = fmt.Sprintf("%v", val)
			}
		}
		fmt.Fprintln(w, strings.Join(rowStr, "\t"))
	}

	w.Flush()
}

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
		fmt.Println("Not connected to a database.")
		return
	}
	rows, err := currentDB.DB.QueryContext(context.Background(), fmt.Sprintf("PRAGMA table_info(%s);", tableName))
	if err != nil {
		fmt.Printf("Error fetching schema for table %s: %v\n", tableName, err)
		return
	}
	defer rows.Close()

	fmt.Printf("Schema for table %s:\n", tableName)
	cols, _ := rows.Columns()
	var results [][]interface{}
	for rows.Next() {
		rowValues := make([]interface{}, len(cols))
		rowPointers := make([]interface{}, len(cols))
		for i := range rowValues {
			rowPointers[i] = &rowValues[i]
		}
		if err := rows.Scan(rowPointers...); err != nil {
			fmt.Printf("Error scanning schema row: %v\n", err)
			return
		}
		results = append(results, rowValues)
	}
	if err := rows.Err(); err != nil {
		fmt.Printf("Error iterating schema: %v\n", err)
	}

	if len(results) == 0 {
		fmt.Printf("Table %s not found or has no columns.\n", tableName)
		return
	}
	printTable(cols, results)
}
