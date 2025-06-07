package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/spf13/cobra"
	"github.com/lirlia/100day_challenge_backend/day61_container_runtime/internal/storage"
)

const (
	appName    = "container"
	appVersion = "0.1.0"
)

var (
	// Global flags
	dataDir   string
	verbose   bool
	debugMode bool
)

func main() {
	rootCmd := &cobra.Command{
		Use:     appName,
		Short:   "Simple container runtime",
		Long:    `A simple container runtime that can pull and run Docker images`,
		Version: appVersion,
		PersistentPreRun: func(cmd *cobra.Command, args []string) {
			// Initialize data directory
			if err := initializeDataDir(); err != nil {
				fmt.Fprintf(os.Stderr, "Error initializing data directory: %v\n", err)
				os.Exit(1)
			}
		},
	}

	// Global flags
	rootCmd.PersistentFlags().StringVar(&dataDir, "data-dir", "./data", "Data directory for images and containers")
	rootCmd.PersistentFlags().BoolVar(&verbose, "verbose", false, "Enable verbose output")
	rootCmd.PersistentFlags().BoolVar(&debugMode, "debug", false, "Enable debug mode")

	// Add subcommands
	rootCmd.AddCommand(pullCmd())
	rootCmd.AddCommand(listCmd())
	rootCmd.AddCommand(runCmd())
	rootCmd.AddCommand(inspectCmd())

	// Execute root command
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

// initializeDataDir creates necessary data directories
func initializeDataDir() error {
	dirs := []string{
		filepath.Join(dataDir, "images"),
		filepath.Join(dataDir, "layers"),
		filepath.Join(dataDir, "containers"),
	}

	for _, dir := range dirs {
		if err := os.MkdirAll(dir, 0755); err != nil {
			return fmt.Errorf("failed to create directory %s: %w", dir, err)
		}
	}

	if debugMode {
		fmt.Printf("Data directories initialized at: %s\n", dataDir)
	}

	return nil
}

// Helper function for verbose logging
func logVerbose(format string, args ...interface{}) {
	if verbose {
		fmt.Printf("[VERBOSE] "+format+"\n", args...)
	}
}

// Helper function for debug logging
func logDebug(format string, args ...interface{}) {
	if debugMode {
		fmt.Printf("[DEBUG] "+format+"\n", args...)
	}
}

// getStorageManager returns a storage manager instance
func getStorageManager() *storage.Manager {
	return storage.NewManager(dataDir)
}

// getDataDir returns the current data directory
func getDataDir() string {
	return dataDir
}