package cli

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/lirlia/100day_challenge_backend/day58_lsm_tree_storage_engine/internal/engine"
)

// CLI represents the command line interface for the LSM engine
type CLI struct {
	engine *engine.LSMEngine
	reader *bufio.Reader
}

// NewCLI creates a new CLI instance
func NewCLI(dataDir string) (*CLI, error) {
	config := engine.DefaultLSMEngineConfig(dataDir)
	// Reduce compaction interval for demo purposes
	config.CompactionIntervalMs = 30000 // 30 seconds

	lsmEngine, err := engine.NewLSMEngine(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create LSM engine: %w", err)
	}

	return &CLI{
		engine: lsmEngine,
		reader: bufio.NewReader(os.Stdin),
	}, nil
}

// Run starts the CLI main loop
func (c *CLI) Run() error {
	defer c.engine.Close()

	fmt.Println("=== LSM-Tree Storage Engine CLI ===")
	fmt.Println("Available commands:")
	c.printHelp()
	fmt.Println()

	for {
		fmt.Print("lsm> ")

		line, err := c.reader.ReadString('\n')
		if err != nil {
			return fmt.Errorf("failed to read input: %w", err)
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parts := strings.Fields(line)
		if len(parts) == 0 {
			continue
		}

		command := strings.ToLower(parts[0])
		args := parts[1:]

		switch command {
		case "put":
			c.handlePut(args)
		case "get":
			c.handleGet(args)
		case "delete", "del":
			c.handleDelete(args)
		case "scan":
			c.handleScan(args)
		case "stats":
			c.handleStats()
		case "flush":
			c.handleFlush()
		case "compact":
			c.handleCompact()
		case "help", "h":
			c.printHelp()
		case "exit", "quit", "q":
			fmt.Println("Goodbye!")
			return nil
		default:
			fmt.Printf("Unknown command: %s. Type 'help' for available commands.\n", command)
		}
	}
}

// handlePut handles the PUT command
func (c *CLI) handlePut(args []string) {
	if len(args) < 2 {
		fmt.Println("Usage: put <key> <value>")
		return
	}

	key := args[0]
	value := strings.Join(args[1:], " ")

	start := time.Now()
	err := c.engine.Put(key, []byte(value))
	elapsed := time.Since(start)

	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	fmt.Printf("OK (%.2fms)\n", float64(elapsed.Nanoseconds())/1000000)
}

// handleGet handles the GET command
func (c *CLI) handleGet(args []string) {
	if len(args) != 1 {
		fmt.Println("Usage: get <key>")
		return
	}

	key := args[0]

	start := time.Now()
	value, found, err := c.engine.Get(key)
	elapsed := time.Since(start)

	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	if !found {
		fmt.Printf("Key not found (%.2fms)\n", float64(elapsed.Nanoseconds())/1000000)
		return
	}

	fmt.Printf("%s (%.2fms)\n", string(value), float64(elapsed.Nanoseconds())/1000000)
}

// handleDelete handles the DELETE command
func (c *CLI) handleDelete(args []string) {
	if len(args) != 1 {
		fmt.Println("Usage: delete <key>")
		return
	}

	key := args[0]

	start := time.Now()
	err := c.engine.Delete(key)
	elapsed := time.Since(start)

	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	fmt.Printf("OK (%.2fms)\n", float64(elapsed.Nanoseconds())/1000000)
}

// handleScan handles the SCAN command (list keys with prefix)
func (c *CLI) handleScan(args []string) {
	var prefix string
	var limit int = 10

	if len(args) > 0 {
		prefix = args[0]
	}
	if len(args) > 1 {
		if l, err := strconv.Atoi(args[1]); err == nil && l > 0 {
			limit = l
		}
	}

	fmt.Printf("Scanning keys with prefix '%s' (limit: %d):\n", prefix, limit)

	// This is a simplified scan - in a real implementation, you'd want
	// to implement proper range scanning in the engine
	found := 0
	for i := 0; i < 1000 && found < limit; i++ {
		testKey := fmt.Sprintf("%s%d", prefix, i)
		if _, exists, err := c.engine.Get(testKey); err == nil && exists {
			fmt.Printf("  %s\n", testKey)
			found++
		}
	}

	if found == 0 {
		fmt.Println("  No keys found")
	} else {
		fmt.Printf("Found %d keys\n", found)
	}
}

// handleStats handles the STATS command
func (c *CLI) handleStats() {
	stats := c.engine.Stats()

	fmt.Println("=== LSM Engine Statistics ===")
	fmt.Printf("MemTable Size: %s\n", formatBytes(stats.MemTableSize))
	fmt.Printf("MemTable Entries: %d\n", stats.MemTableEntries)
	fmt.Printf("Deleted Keys: %d\n", stats.DeletedKeys)
	fmt.Printf("SSTable Count: %d\n", stats.SSTableCount)

	if len(stats.LevelCounts) > 0 {
		fmt.Println("Level Distribution:")
		for level := 0; level < 8; level++ {
			if count, exists := stats.LevelCounts[level]; exists && count > 0 {
				fmt.Printf("  Level %d: %d files\n", level, count)
			}
		}
	}
}

// handleFlush handles the FLUSH command
func (c *CLI) handleFlush() {
	start := time.Now()
	err := c.engine.Flush()
	elapsed := time.Since(start)

	if err != nil {
		fmt.Printf("Error: %v\n", err)
		return
	}

	fmt.Printf("Flush completed (%.2fms)\n", float64(elapsed.Nanoseconds())/1000000)
}

// handleCompact handles the COMPACT command (note: this is usually automatic)
func (c *CLI) handleCompact() {
	fmt.Println("Manual compaction is not directly exposed.")
	fmt.Println("The engine performs automatic background compaction.")
	fmt.Println("You can check stats to see current level distribution.")
}

// printHelp prints available commands
func (c *CLI) printHelp() {
	fmt.Println("Commands:")
	fmt.Println("  put <key> <value>  - Store a key-value pair")
	fmt.Println("  get <key>          - Retrieve value for a key")
	fmt.Println("  delete <key>       - Delete a key")
	fmt.Println("  scan [prefix] [limit] - Scan keys with optional prefix (default limit: 10)")
	fmt.Println("  stats              - Show engine statistics")
	fmt.Println("  flush              - Force flush MemTable to SSTable")
	fmt.Println("  compact            - Show compaction info")
	fmt.Println("  help               - Show this help message")
	fmt.Println("  exit               - Exit the CLI")
}

// formatBytes formats byte count to human readable format
func formatBytes(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// Demo runs a demonstration of the LSM engine capabilities
func (c *CLI) Demo() error {
	defer c.engine.Close()

	fmt.Println("=== LSM-Tree Storage Engine Demo ===")
	fmt.Println()

	// Demo data insertion
	fmt.Println("1. Inserting demo data...")
	demoData := map[string]string{
		"user:1001":    "Alice Johnson",
		"user:1002":    "Bob Smith",
		"user:1003":    "Carol Davis",
		"product:2001": "Laptop Computer",
		"product:2002": "Wireless Mouse",
		"order:3001":   "Order for user:1001",
		"order:3002":   "Order for user:1002",
	}

	for key, value := range demoData {
		if err := c.engine.Put(key, []byte(value)); err != nil {
			return fmt.Errorf("failed to put %s: %w", key, err)
		}
		fmt.Printf("  PUT %s = %s\n", key, value)
	}

	fmt.Printf("\nInserted %d records\n", len(demoData))

	// Demo data retrieval
	fmt.Println("\n2. Retrieving data...")
	testKeys := []string{"user:1001", "product:2001", "order:3001", "nonexistent"}

	for _, key := range testKeys {
		value, found, err := c.engine.Get(key)
		if err != nil {
			return fmt.Errorf("failed to get %s: %w", key, err)
		}

		if found {
			fmt.Printf("  GET %s = %s\n", key, string(value))
		} else {
			fmt.Printf("  GET %s = <not found>\n", key)
		}
	}

	// Demo deletion
	fmt.Println("\n3. Deleting a record...")
	deleteKey := "user:1002"
	if err := c.engine.Delete(deleteKey); err != nil {
		return fmt.Errorf("failed to delete %s: %w", deleteKey, err)
	}
	fmt.Printf("  DELETE %s\n", deleteKey)

	// Verify deletion
	if _, found, err := c.engine.Get(deleteKey); err != nil {
		return fmt.Errorf("failed to verify deletion: %w", err)
	} else if found {
		fmt.Printf("  ERROR: %s should be deleted\n", deleteKey)
	} else {
		fmt.Printf("  VERIFIED: %s is deleted\n", deleteKey)
	}

	// Demo update
	fmt.Println("\n4. Updating a record...")
	updateKey := "user:1001"
	newValue := "Alice Johnson (Updated)"
	if err := c.engine.Put(updateKey, []byte(newValue)); err != nil {
		return fmt.Errorf("failed to update %s: %w", updateKey, err)
	}
	fmt.Printf("  UPDATE %s = %s\n", updateKey, newValue)

	// Verify update
	if value, found, err := c.engine.Get(updateKey); err != nil {
		return fmt.Errorf("failed to verify update: %w", err)
	} else if !found {
		fmt.Printf("  ERROR: %s should exist\n", updateKey)
	} else {
		fmt.Printf("  VERIFIED: %s = %s\n", updateKey, string(value))
	}

	// Show final stats
	fmt.Println("\n5. Final statistics:")
	c.handleStats()

	fmt.Println("\nDemo completed successfully!")
	return nil
}
