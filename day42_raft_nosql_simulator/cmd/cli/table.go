package main

import (
	"fmt"
	"log"

	"github.com/spf13/cobra"
	// "github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator/internal/client" // clientパッケージを後で作成・使用
)

var (
	// TokioApiClient // 未使用のためコメントアウト
	tableNameCreate        string
	partitionKeyNameCreate string
	sortKeyNameCreate      string
)

var createTableCmd = &cobra.Command{
	Use:   "create-table",
	Short: "Creates a new table in the NoSQL database",
	Long:  `Creates a new table with the specified name, partition key, and optional sort key.`,
	Args:  cobra.NoArgs, // 引数なし、フラグで指定
	Run: func(cmd *cobra.Command, args []string) {
		if tableNameCreate == "" {
			log.Fatalf("Error: table-name is required")
		}
		if partitionKeyNameCreate == "" {
			log.Fatalf("Error: partition-key is required")
		}

		// TODO: targetNodeAddr を使ってクライアントを作成し、リクエストを送信する
		// client, err := client.NewClient(targetNodeAddr) // targetNodeAddr は root.go で定義されたグローバル変数
		// if err != nil {
		// 	 log.Fatalf("Failed to create client: %v", err)
		// }
		// defer client.Close()

		// resp, err := client.CreateTable(tableNameCreate, partitionKeyNameCreate, sortKeyNameCreate, 5*time.Second)
		// if err != nil {
		// 	 log.Fatalf("Failed to create table %s: %v", tableNameCreate, err)
		// }

		// log.Printf("Table %s created successfully. Response: %v", tableNameCreate, resp)
		log.Printf("CLI: create-table called with TableName: %s, PK: %s, SK: %s (target: %s)", tableNameCreate, partitionKeyNameCreate, sortKeyNameCreate, targetNodeAddr)
		log.Println("TODO: Implement actual client call to Raft node")
		fmt.Printf("Simulating: Table '%s' created with PK '%s' and SK '%s'. (Target: %s)\n", tableNameCreate, partitionKeyNameCreate, sortKeyNameCreate, targetNodeAddr)
	},
}

func init() {
	// create-table コマンドのフラグ設定
	createTableCmd.Flags().StringVarP(&tableNameCreate, "table-name", "t", "", "Name of the table to create (required)")
	createTableCmd.Flags().StringVarP(&partitionKeyNameCreate, "partition-key", "p", "", "Name of the partition key (required)")
	createTableCmd.Flags().StringVarP(&sortKeyNameCreate, "sort-key", "s", "", "Name of the sort key (optional)")

	// ルートコマンドにtableコマンドを追加する (tableCmd があればそれに追加)
	// 現時点では直接rootCmdに追加するが、将来的には tableCmd のような中間コマンドを設ける
	// var tableCmd = &cobra.Command{Use: "table", Short: "Manage tables"}
	// tableCmd.AddCommand(createTableCmd)
	// rootCmd.AddCommand(tableCmd)
	rootCmd.AddCommand(createTableCmd) // root.go で定義された rootCmd に追加
}
