package main

import (
	"fmt"
	"log"

	// "time"

	"day42_raft_nosql_simulator_local_test/internal/client" // client パッケージをインポート

	"github.com/spf13/cobra"
)

var (
	// TokioApiClient // 未使用のためコメントアウト
	tableNameCreate        string
	partitionKeyNameCreate string
	sortKeyNameCreate      string
	// targetNodeAddr         string // root.goのグローバル永続フラグを使用するため削除
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
		// if targetNodeAddr == "" {
		// 	log.Fatalf("Error: --target-addr is required")
		// }

		apiClient := client.NewAPIClient(targetNodeAddr)

		log.Printf("Sending CreateTable request to %s for table '%s' (PK: %s, SK: %s)...",
			targetNodeAddr, tableNameCreate, partitionKeyNameCreate, sortKeyNameCreate)

		resp, err := apiClient.CreateTable(tableNameCreate, partitionKeyNameCreate, sortKeyNameCreate)
		if err != nil {
			log.Fatalf("CreateTable API call failed: %v", err)
		}

		fmt.Printf("CreateTable API call successful.\nMessage: %s\n", resp.Message)
		if resp.FSMResponse != nil {
			fmt.Printf("FSM Response: %v\n", resp.FSMResponse)
		}
	},
}

func init() {
	// create-table コマンドのフラグ設定
	createTableCmd.Flags().StringVarP(&tableNameCreate, "table-name", "t", "", "Name of the table to create (required)")
	createTableCmd.Flags().StringVarP(&partitionKeyNameCreate, "partition-key", "p", "", "Name of the partition key (required)")
	createTableCmd.Flags().StringVarP(&sortKeyNameCreate, "sort-key", "s", "", "Name of the sort key (optional)")
	// createTableCmd.Flags().StringVarP(&targetNodeAddr, "target-addr", "a", "", "Address of the Raft node (required)") // root.go で定義済みのため削除

	// ルートコマンドにtableコマンドを追加する (tableCmd があればそれに追加)
	// 通常はroot.goのinit()で tableCmd を rootCmd.AddCommand(tableCmd) のように追加し、
	// 現時点では直接rootCmdに追加するが、将来的には tableCmd のような中間コマンドを設ける
	// var tableCmd = &cobra.Command{Use: "table", Short: "Manage tables"}
	// tableCmd.AddCommand(createTableCmd)
	// rootCmd.AddCommand(tableCmd)
	rootCmd.AddCommand(createTableCmd) // root.go で定義された rootCmd に追加
}
