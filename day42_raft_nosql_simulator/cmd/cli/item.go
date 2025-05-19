package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/client"

	"github.com/spf13/cobra"
)

var (
	tableNamePut string
	itemDataPut  string // JSON文字列として受け取る

	tableNameGet string
	itemKeyGet   string // PK (とSK) を含むJSONオブジェクト文字列としてキーを受け取るか、個別のフラグでPK, SKを受け取るか
	// 今回は簡略化のため、PK と SK (オプショナル) を文字列で指定する方式を採用
	partitionKeyGet string
	sortKeyGet      string

	// DeleteItem 用フラグ
	tableNameDelete    string
	partitionKeyDelete string
	sortKeyDelete      string

	// QueryItems 用フラグ
	tableNameQuery     string
	partitionKeyQuery  string
	sortKeyPrefixQuery string
)

var putItemCmd = &cobra.Command{
	Use:   "put-item",
	Short: "Puts an item into a table",
	Long:  `Puts an item (provided as a JSON string) into the specified table.`,
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		if tableNamePut == "" {
			log.Fatalf("Error: table-name is required for put-item")
		}
		if itemDataPut == "" {
			log.Fatalf("Error: item-data (JSON string) is required for put-item")
		}

		var itemParsed map[string]interface{}
		err := json.Unmarshal([]byte(itemDataPut), &itemParsed)
		if err != nil {
			log.Fatalf("Error: item-data is not a valid JSON: %v", err)
		}

		if targetNodeAddr == "" {
			log.Fatalf("Error: --target-addr is required")
		}
		apiClient := client.NewAPIClient(targetNodeAddr)

		log.Printf("Sending PutItem request to %s for table '%s'...", targetNodeAddr, tableNamePut)
		resp, err := apiClient.PutItem(tableNamePut, itemParsed)
		if err != nil {
			log.Fatalf("PutItem API call failed: %v", err)
		}
		fmt.Printf("PutItem API call successful.\nMessage: %s\n", resp.Message)
		if resp.FSMResponse != nil {
			fmt.Printf("FSM Response: %v\n", resp.FSMResponse)
		}
	},
}

var getItemCmd = &cobra.Command{
	Use:   "get-item",
	Short: "Gets an item from a table",
	Long:  `Gets an item from the specified table using its partition key and optional sort key.`,
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		if tableNameGet == "" {
			log.Fatalf("Error: table-name is required for get-item")
		}
		if partitionKeyGet == "" {
			log.Fatalf("Error: partition-key is required for get-item")
		}

		if targetNodeAddr == "" {
			log.Fatalf("Error: --target-addr is required")
		}
		apiClient := client.NewAPIClient(targetNodeAddr)

		log.Printf("Sending GetItem request to %s for table '%s' (PK: %s, SK: %s)...",
			targetNodeAddr, tableNameGet, partitionKeyGet, sortKeyGet)

		resp, err := apiClient.GetItem(tableNameGet, partitionKeyGet, sortKeyGet)
		if err != nil {
			log.Fatalf("GetItem API call failed: %v", err)
		}

		fmt.Printf("GetItem API call successful.\n")
		if resp.Item != nil {
			fmt.Printf("Item: %s\n", string(resp.Item))
			fmt.Printf("Version: %d\n", resp.Version)
		} else {
			fmt.Println("Item not found or response format incorrect.")
		}
	},
}

var deleteItemCmd = &cobra.Command{
	Use:   "delete-item",
	Short: "Deletes an item from a table",
	Long:  `Deletes an item from the specified table using its partition key and optional sort key.`,
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		if tableNameDelete == "" {
			log.Fatalf("Error: table-name is required for delete-item")
		}
		if partitionKeyDelete == "" {
			log.Fatalf("Error: partition-key is required for delete-item")
		}

		if targetNodeAddr == "" {
			log.Fatalf("Error: --target-addr is required")
		}
		apiClient := client.NewAPIClient(targetNodeAddr)

		log.Printf("Sending DeleteItem request to %s for table '%s' (PK: %s, SK: %s)...",
			targetNodeAddr, tableNameDelete, partitionKeyDelete, sortKeyDelete)

		resp, err := apiClient.DeleteItem(tableNameDelete, partitionKeyDelete, sortKeyDelete)
		if err != nil {
			log.Fatalf("DeleteItem API call failed: %v", err)
		}
		fmt.Printf("DeleteItem API call successful.\nMessage: %s\n", resp.Message)
		if resp.FSMResponse != nil {
			fmt.Printf("FSM Response: %v\n", resp.FSMResponse)
		}
	},
}

var queryItemsCmd = &cobra.Command{
	Use:   "query-items",
	Short: "Queries items from a table based on partition key and optional sort key prefix",
	Long:  `Queries items from a table. Requires a partition key, and can optionally filter by a sort key prefix.`,
	Args:  cobra.NoArgs,
	Run: func(cmd *cobra.Command, args []string) {
		if tableNameQuery == "" {
			log.Fatalf("Error: table-name is required for query-items")
		}
		if partitionKeyQuery == "" {
			log.Fatalf("Error: partition-key is required for query-items")
		}

		if targetNodeAddr == "" {
			log.Fatalf("Error: --target-addr is required")
		}
		apiClient := client.NewAPIClient(targetNodeAddr)

		log.Printf("Sending QueryItems request to %s for table '%s' (PK: %s, SKPrefix: %s)...",
			targetNodeAddr, tableNameQuery, partitionKeyQuery, sortKeyPrefixQuery)

		resp, err := apiClient.QueryItems(tableNameQuery, partitionKeyQuery, sortKeyPrefixQuery)
		if err != nil {
			log.Fatalf("QueryItems API call failed: %v", err)
		}

		fmt.Printf("QueryItems API call successful.\n")
		if resp.Items != nil && len(resp.Items) > 0 {
			fmt.Printf("Found %d item(s):\n", len(resp.Items))
			for i, item := range resp.Items {
				itemJSON, _ := json.MarshalIndent(item, "", "  ")
				fmt.Printf("Item %d:\n%s\n", i+1, string(itemJSON))
			}
		} else {
			fmt.Println("No items found or response format incorrect.")
		}
	},
}

func init() {
	// PutItem flags
	putItemCmd.Flags().StringVarP(&tableNamePut, "table-name", "t", "", "Name of the table (required)")
	putItemCmd.Flags().StringVarP(&itemDataPut, "item-data", "d", "", "Item data as a JSON string (required)")
	// TODO: put-item に --item-key (PK_SK形式) を追加するか、PKとSKを個別に指定するフラグを追加することも検討。
	// DynamoDBのようにitem-data内にキーを含めるのが一般的かもしれない。

	// GetItem flags
	getItemCmd.Flags().StringVarP(&tableNameGet, "table-name", "t", "", "Name of the table (required)")
	getItemCmd.Flags().StringVarP(&partitionKeyGet, "partition-key", "p", "", "Partition key value (required)")
	getItemCmd.Flags().StringVarP(&sortKeyGet, "sort-key", "s", "", "Sort key value (optional)")

	// DeleteItem flags
	deleteItemCmd.Flags().StringVarP(&tableNameDelete, "table-name", "t", "", "Name of the table (required)")
	deleteItemCmd.Flags().StringVarP(&partitionKeyDelete, "partition-key", "p", "", "Partition key value (required)")
	deleteItemCmd.Flags().StringVarP(&sortKeyDelete, "sort-key", "s", "", "Sort key value (optional)")

	// QueryItems flags
	queryItemsCmd.Flags().StringVarP(&tableNameQuery, "table-name", "t", "", "Name of the table (required)")
	queryItemsCmd.Flags().StringVarP(&partitionKeyQuery, "partition-key", "p", "", "Partition key value (required)")
	queryItemsCmd.Flags().StringVarP(&sortKeyPrefixQuery, "sort-key-prefix", "x", "", "Sort key prefix to query (optional)")

	// rootCmd.AddCommand(putItemCmd) // root.go で追加
	// rootCmd.AddCommand(getItemCmd) // root.go で追加
	// rootCmd.AddCommand(deleteItemCmd) // root.go で追加
	// rootCmd.AddCommand(queryItemsCmd) // root.go で追加
}
