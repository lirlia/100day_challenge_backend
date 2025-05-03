package main

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"strings"
	"text/tabwriter"

	"github.com/lirlia/100day_challenge_backend/day31_go_orm/orm"
	_ "github.com/mattn/go-sqlite3"
)

var db *orm.DB
var currentDBFile string

func printHelp() {
	fmt.Println("Available commands:")
	fmt.Println("  connect <database_file> - Connect to a SQLite database file.")
	fmt.Println("  disconnect              - Disconnect from the current database.")
	fmt.Println("  tables                  - List tables in the current database.")
	fmt.Println("  schema <table_name>     - Show the schema of a table.")
	fmt.Println("  select * from <table> - Execute a SELECT * query.")
	fmt.Println("  select count(*) from <table> - Execute a SELECT COUNT(*) query.")
	fmt.Println("  help                    - Show this help message.")
	fmt.Println("  exit / quit             - Exit the shell.")
}

func connectDB(filename string) {
	var err error
	if db != nil {
		db.Close()
	}
	db, err = orm.Open(filename)
	if err != nil {
		fmt.Printf("Error connecting to database %s: %v\\n", filename, err)
		db = nil
		return
	}
	err = db.PingContext(context.Background())
	if err != nil {
		fmt.Printf("Error pinging database %s: %v\\n", filename, err)
		db.Close()
		db = nil
		return
	}
	currentDBFile = filename
	fmt.Printf("Connected to %s\\n", filename)
}

func disconnectDB() {
	if db == nil {
		fmt.Println("Not connected to a database.")
		return
	}
	db.Close()
	db = nil
	currentDBFile = ""
	fmt.Println("Disconnected.")
}

func showTables() {
	if db == nil {
		fmt.Println("Not connected to a database.")
		return
	}
	rows, err := db.DB.QueryContext(context.Background(), "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;")
	if err != nil {
		fmt.Printf("Error fetching tables: %v\\n", err)
		return
	}
	defer rows.Close()

	fmt.Println("Tables:")
	for rows.Next() {
		var tableName string
		if err := rows.Scan(&tableName); err != nil {
			fmt.Printf("Error scanning table name: %v\\n", err)
			continue
		}
		fmt.Printf("  %s\\n", tableName)
	}
	if err := rows.Err(); err != nil {
		fmt.Printf("Error iterating tables: %v\\n", err)
	}
}

func showSchema(tableName string) {
	if db == nil {
		fmt.Println("Not connected to a database.")
		return
	}
	// PRAGMA table_info() を使用してスキーマ情報を取得
	rows, err := db.DB.QueryContext(context.Background(), fmt.Sprintf("PRAGMA table_info(%s);", tableName))
	if err != nil {
		fmt.Printf("Error fetching schema for table %s: %v\\n", tableName, err)
		return
	}
	defer rows.Close()

	fmt.Printf("Schema for table %s:\\n", tableName)
	// 結果を整形して表示 (例: cid, name, type, notnull, dflt_value, pk)
	cols, _ := rows.Columns()
	var results [][]interface{}
	for rows.Next() {
		rowValues := make([]interface{}, len(cols))
		rowPointers := make([]interface{}, len(cols))
		for i := range rowValues {
			rowPointers[i] = &rowValues[i]
		}
		if err := rows.Scan(rowPointers...); err != nil {
			fmt.Printf("Error scanning schema row: %v\\n", err)
			return
		}
		results = append(results, rowValues)
	}
	if err := rows.Err(); err != nil {
		fmt.Printf("Error iterating schema: %v\\n", err)
	}

	if len(results) == 0 {
		fmt.Printf("Table %s not found or has no columns.\\n", tableName)
		return
	}
	printTable(cols, results)
}

func processCommand(line string) bool {
	parts := strings.Fields(line)
	if len(parts) == 0 {
		return true
	}
	command := strings.ToLower(parts[0])

	switch command {
	case "exit", "quit":
		if db != nil {
			db.Close()
		}
		fmt.Println("Exiting.")
		return false
	case "help":
		printHelp()
	case "connect":
		if len(parts) != 2 {
			fmt.Println("Usage: connect <database_file>")
			return true
		}
		connectDB(parts[1])
	case "disconnect":
		disconnectDB()
	case "tables":
		showTables()
	case "schema":
		if len(parts) != 2 {
			fmt.Println("Usage: schema <table_name>")
			return true
		}
		showSchema(parts[1])
	case "select":
		if db == nil {
			fmt.Println("Not connected to a database.")
			return true
		}
		query := strings.Join(parts[1:], " ")
		if !strings.HasPrefix(strings.ToLower(query), "* from") && !strings.HasPrefix(strings.ToLower(query), "count(*)") {
			fmt.Println("Currently only 'SELECT * FROM <table_name>' and 'SELECT COUNT(*) FROM <table_name>' are supported.")
			return true
		}
		executeSelectQuery(context.Background(), query)
	default:
		fmt.Printf("Unknown command: %s. Enter 'help' for commands.\\n", command)
	}
	return true
}

func executeSelectQuery(ctx context.Context, query string) {
	rows, err := db.DB.QueryContext(ctx, "SELECT "+query)
	if err != nil {
		fmt.Printf("Error executing query: %v\\n", err)
		return
	}
	defer rows.Close()

	cols, err := rows.Columns()
	if err != nil {
		fmt.Printf("Error getting columns: %v\\n", err)
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
			fmt.Printf("Error scanning row: %v\\n", err)
			return
		}
		results = append(results, rowValues)
	}

	if err := rows.Err(); err != nil {
		fmt.Printf("Error during row iteration: %v\\n", err)
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

func main() {
	reader := bufio.NewReader(os.Stdin)
	fmt.Println("Interactive ORM Shell (Day 31)")
	fmt.Println("Enter 'help' for commands, 'exit' to quit.")

	for {
		prompt := "> "
		if db != nil {
			prompt = fmt.Sprintf("(%s) > ", currentDBFile)
		}
		fmt.Print(prompt)

		line, err := reader.ReadString('\n')
		if err != nil {
			fmt.Println("Error reading input:", err)
			break
		}
		line = strings.TrimSpace(line)

		if !processCommand(line) {
			break
		}
	}
}
