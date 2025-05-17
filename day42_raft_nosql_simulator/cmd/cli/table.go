package main

import (
	"fmt"
	"log"
	"os"

	"github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/client"
	"github.com/spf13/cobra"
)

var (
	tableNameCreate      string
	partitionKeyName     string
	sortKeyName          string
	tableNameDeleteTable string
)

var createTableCmd = &cobra.Command{
	Use:   "create-table",
	Short: "Create a new table",
	Run: func(cmd *cobra.Command, args []string) {
		if targetNodeAddr == "" {
			fmt.Fprintln(os.Stderr, "Error: --target-addr must be specified")
			os.Exit(1)
		}
		apiClient := client.NewAPIClient(targetNodeAddr)
		log.Printf("Sending CreateTable request to %s for table '%s' (PK: %s, SK: %s)...", targetNodeAddr, tableNameCreate, partitionKeyName, sortKeyName)
		resp, err := apiClient.CreateTable(tableNameCreate, partitionKeyName, sortKeyName)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error creating table: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("CreateTable API call successful.\\nMessage: %s\\n", resp.Message)
		if resp.FSMResponse != nil {
			fmt.Printf("FSM Response: %v\\n", resp.FSMResponse)
		}
	},
}

var deleteTableCmd = &cobra.Command{
	Use:   "delete-table",
	Short: "Delete a table",
	Run: func(cmd *cobra.Command, args []string) {
		if targetNodeAddr == "" {
			fmt.Fprintln(os.Stderr, "Error: --target-addr must be specified")
			os.Exit(1)
		}
		apiClient := client.NewAPIClient(targetNodeAddr)
		log.Printf("Sending DeleteTable request to %s for table '%s'...", targetNodeAddr, tableNameDeleteTable)
		resp, err := apiClient.DeleteTable(tableNameDeleteTable)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error deleting table: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("DeleteTable API call successful.\\nMessage: %s\\n", resp.Message)
		if resp.FSMResponse != nil {
			fmt.Printf("FSM Response: %v\\n", resp.FSMResponse)
		}
	},
}

func init() {
	// RootCmd.AddCommand(createTableCmd) // root.go で追加する
	createTableCmd.Flags().StringVar(&tableNameCreate, "table-name", "", "Name of the table to create (required)")
	createTableCmd.Flags().StringVar(&partitionKeyName, "partition-key-name", "pk", "Name of the partition key attribute")
	createTableCmd.Flags().StringVar(&sortKeyName, "sort-key-name", "", "Name of the sort key attribute (optional)")
	createTableCmd.MarkFlagRequired("table-name")

	// RootCmd.AddCommand(deleteTableCmd) // root.go で追加する
	deleteTableCmd.Flags().StringVar(&tableNameDeleteTable, "table-name", "", "Name of the table to delete (required)")
	deleteTableCmd.MarkFlagRequired("table-name")
}
