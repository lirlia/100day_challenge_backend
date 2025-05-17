package main

import (
	"encoding/json"
	"fmt"
	"log"

	"github.com/spf13/cobra"
	// "github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/client"
)

var (
	tableNamePut string
	itemDataPut  string // JSON文字列として受け取る

	tableNameGet string
	itemKeyGet   string // PK (とSK) を含むJSONオブジェクト文字列としてキーを受け取るか、個別のフラグでPK, SKを受け取るか
	// 今回は簡略化のため、PK と SK (オプショナル) を文字列で指定する方式を採用
	partitionKeyGet string
	sortKeyGet      string
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
		if err := json.Unmarshal([]byte(itemDataPut), &itemParsed); err != nil {
			log.Fatalf("Error: item-data is not a valid JSON: %v", err)
		}

		// TODO: Implement actual client call
		log.Printf("CLI: put-item called for Table: %s, Item: %s (target: %s)", tableNamePut, itemDataPut, targetNodeAddr)
		fmt.Printf("Simulating: Item %v put into table '%s'. (Target: %s)\n", itemParsed, tableNamePut, targetNodeAddr)
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

		// TODO: Implement actual client call
		// キーの組み立て (PKのみ、または PK_SK)
		// これはKVStoreのキー形式に依存する。クライアント側ではPKとSKを別々に送り、サーバー側で組み立てるのが良いか。
		// ここではシミュレーションなので、PKとSKを表示するだけ。
		log.Printf("CLI: get-item called for Table: %s, PK: %s, SK: %s (target: %s)", tableNameGet, partitionKeyGet, sortKeyGet, targetNodeAddr)
		fmt.Printf("Simulating: Get item from table '%s' with PK '%s', SK '%s'. (Target: %s) => Item not found (simulation)\n", tableNameGet, partitionKeyGet, sortKeyGet, targetNodeAddr)
	},
}

func init() {
	putItemCmd.Flags().StringVarP(&tableNamePut, "table-name", "t", "", "Name of the table (required)")
	putItemCmd.Flags().StringVarP(&itemDataPut, "item-data", "d", "", "Item data as a JSON string (required)")
	// TODO: put-item に --item-key (PK_SK形式) を追加するか、PKとSKを個別に指定するフラグを追加することも検討。
	// DynamoDBのようにitem-data内にキーを含めるのが一般的かもしれない。

	getItemCmd.Flags().StringVarP(&tableNameGet, "table-name", "t", "", "Name of the table (required)")
	getItemCmd.Flags().StringVarP(&partitionKeyGet, "partition-key", "p", "", "Partition key value (required)")
	getItemCmd.Flags().StringVarP(&sortKeyGet, "sort-key", "s", "", "Sort key value (optional)")

	rootCmd.AddCommand(putItemCmd)
	rootCmd.AddCommand(getItemCmd)
}
