package main

import (
	"flag"
	"fmt"
	"io" // Import io package
	"os"
	"strings"

	"github.com/c-bata/go-prompt"
	rdbms "github.com/lirlia/100day_challenge_backend/day34_btree_db"
)

// DefaultDegree はBTreeのデフォルト次数です
// const DefaultDegree = 3 // Now using rdbms.DefaultDegree

var db *rdbms.Database // Use the imported package type

func executor(in string) {
	in = strings.TrimSpace(in)
	lowerIn := strings.ToLower(in)

	switch lowerIn {
	case "quit", "exit", ".quit", ".exit":
		fmt.Println("Bye!")
		if db != nil {
			db.Close() // Close the database on exit
		}
		os.Exit(0)
	case "", " ":
		return // Ignore empty input
	case ".tables":
		if db == nil {
			fmt.Println("Error: Database not initialized.")
			return
		}
		tableNames := db.GetTableNames()
		if len(tableNames) == 0 {
			fmt.Println("(No tables)")
		} else {
			fmt.Println(strings.Join(tableNames, "\n"))
		}
		return
	}

	// Assume any other input is SQL
	if db == nil {
		fmt.Println("Error: Database not initialized.")
		return
	}
	result, err := db.ExecuteSQL(in)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error executing SQL: %v\n", err) // Print errors to stderr
	} else {
		fmt.Println(result) // Print results to stdout
	}
}

func completer(d prompt.Document) []prompt.Suggest {
	// Basic completion for commands and keywords
	s := []prompt.Suggest{
		{Text: "SELECT", Description: "Select data"},
		{Text: "INSERT INTO", Description: "Insert data"},
		{Text: "CREATE TABLE", Description: "Create a new table"},
		{Text: "DELETE FROM", Description: "Delete data"},
		{Text: "WHERE", Description: "Filter condition"},
		{Text: "FROM", Description: "Specify table"},
		{Text: "VALUES", Description: "Specify values for insert"},
		{Text: ".tables", Description: "List tables"},
		{Text: "quit", Description: "Exit the CLI"},
		{Text: "exit", Description: "Exit the CLI"},
	}
	// TODO: Add table name completion?
	return prompt.FilterHasPrefix(s, d.GetWordBeforeCursor(), true)
}

func main() {
	dbPath := flag.String("db", "rdbms.db", "Path to the database file")
	debugMode := flag.Bool("debug", false, "Enable debug logging") // Add debug flag
	flag.Parse()

	// Set debug mode in the rdbms package
	rdbms.SetDebugMode(*debugMode)

	var err error
	// Use default degree from the rdbms package
	db, err = rdbms.NewDatabase(*dbPath, rdbms.DefaultDegree)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error opening database %s: %v\n", *dbPath, err)
		os.Exit(1)
	}
	// Defer closing the database connection
	defer func() {
		if db != nil {
			fmt.Println("\nClosing database...")
			if err := db.Close(); err != nil {
				fmt.Fprintf(os.Stderr, "Error closing database: %v\n", err)
			}
		}
	}()

	// Check if stdin is a terminal
	fileInfo, _ := os.Stdin.Stat()
	isTerminal := (fileInfo.Mode() & os.ModeCharDevice) != 0

	if isTerminal {
		// Interactive mode
		fmt.Printf("rdbms CLI (DB: %s)\n", *dbPath)
		fmt.Println("Enter SQL commands or .tables, quit, exit.")
		p := prompt.New(
			executor,
			completer,
			prompt.OptionPrefix("rdbms> "),
			prompt.OptionTitle("rdbms-cli"),
		)
		p.Run()
	} else {
		// Non-interactive mode (read from stdin)
		inputBytes, err := io.ReadAll(os.Stdin)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error reading from stdin: %v\n", err)
			os.Exit(1)
		}
		sql := string(inputBytes)
		sql = strings.TrimSpace(sql)

		if sql == "" {
			// No input provided, exit gracefully
			os.Exit(0)
		}

		// Execute the SQL read from stdin
		result, err := db.ExecuteSQL(sql)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error executing SQL: %v\n", err)
			// Optionally exit with non-zero status on error in non-interactive mode
			// os.Exit(1)
		} else {
			fmt.Print(result) // Print result directly without extra newline if already included
		}
		// No need to call os.Exit(0) here, main will exit naturally after defer runs.
	}
}
