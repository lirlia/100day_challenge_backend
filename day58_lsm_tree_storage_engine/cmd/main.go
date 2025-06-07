package main

import (
	"flag"
	"fmt"
	"log"
	"path/filepath"

	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/cli"
)

func main() {
	var (
		dataDir = flag.String("data", "./data", "Data directory for LSM engine")
		demo    = flag.Bool("demo", false, "Run demo mode")
		help    = flag.Bool("help", false, "Show help message")
	)
	flag.Parse()

	if *help {
		printUsage()
		return
	}

	// Ensure data directory is absolute
	absDataDir, err := filepath.Abs(*dataDir)
	if err != nil {
		log.Fatalf("Failed to get absolute path for data directory: %v", err)
	}

	// Create CLI instance
	cliInstance, err := cli.NewCLI(absDataDir)
	if err != nil {
		log.Fatalf("Failed to create CLI: %v", err)
	}

	fmt.Printf("LSM-Tree Storage Engine\n")
	fmt.Printf("Data directory: %s\n", absDataDir)
	fmt.Println()

	if *demo {
		// Run demo mode
		fmt.Println("Running in demo mode...")
		if err := cliInstance.Demo(); err != nil {
			log.Fatalf("Demo failed: %v", err)
		}
	} else {
		// Run interactive CLI
		fmt.Println("Starting interactive CLI...")
		if err := cliInstance.Run(); err != nil {
			log.Fatalf("CLI failed: %v", err)
		}
	}
}

func printUsage() {
	fmt.Println("LSM-Tree Storage Engine")
	fmt.Println()
	fmt.Println("USAGE:")
	fmt.Println("  lsm-tree [OPTIONS]")
	fmt.Println()
	fmt.Println("OPTIONS:")
	fmt.Println("  -data <dir>    Data directory (default: ./data)")
	fmt.Println("  -demo          Run demo mode")
	fmt.Println("  -help          Show this help message")
	fmt.Println()
	fmt.Println("EXAMPLES:")
	fmt.Println("  # Start interactive CLI")
	fmt.Println("  lsm-tree")
	fmt.Println()
	fmt.Println("  # Run demo with custom data directory")
	fmt.Println("  lsm-tree -data /tmp/lsm-data -demo")
	fmt.Println()
	fmt.Println("  # Start CLI with custom data directory")
	fmt.Println("  lsm-tree -data /tmp/lsm-data")
	fmt.Println()
	fmt.Println("INTERACTIVE COMMANDS:")
	fmt.Println("  put <key> <value>    - Store a key-value pair")
	fmt.Println("  get <key>            - Retrieve value for a key")
	fmt.Println("  delete <key>         - Delete a key")
	fmt.Println("  scan [prefix] [limit] - Scan keys with optional prefix")
	fmt.Println("  stats                - Show engine statistics")
	fmt.Println("  flush                - Force flush MemTable to SSTable")
	fmt.Println("  help                 - Show help in CLI")
	fmt.Println("  exit                 - Exit the CLI")
}
