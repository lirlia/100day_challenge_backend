package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	targetNodeAddr string // ターゲットノードのRAFTアドレス (例: 127.0.0.1:8000)
	// targetNodeID string // 将来的にはNodeIDで指定も検討
	dataDirRoot string // 追加: サーバーのデータディレクトリのルート
)

// rootCmd は全てのサブコマンドのベースとなるルートコマンドです。
var rootCmd = &cobra.Command{
	Use:   "raft-nosql-cli",
	Short: "A CLI for interacting with the Raft-based NoSQL database.",
	Long: `raft-nosql-cli is a command-line interface to manage and interact with
a distributed NoSQL database built on top of the Raft consensus algorithm.`,
	//Args: func(cmd *cobra.Command, args []string) error { // serverコマンドがデフォルトなので削除
	//	if len(args) == 0 {
	//		return nil
	//	}
	//	return nil
	//},
	//Run: func(cmd *cobra.Command, args []string) { // serverコマンドがデフォルトなので削除
	//	if len(args) == 0 {
	//		runServer()
	//		return
	//	}
	//	cmd.Usage()
	//},
}

// serverCmd はサーバーを起動するためのコマンド
var serverCmd = &cobra.Command{
	Use:   "server",
	Short: "Starts the Raft NoSQL database server cluster",
	Run: func(cmd *cobra.Command, args []string) {
		// dataDirRoot フラグが設定されていれば、main.go の dataDirBase を更新
		if dataDirRoot != "" {
			SetDataDirBase(dataDirRoot) // main.go のセッターを呼び出す
		}
		runServer() // runServer() は main.go で定義されている (同じパッケージなのでアクセス可能)
	},
}

// Execute はルートコマンドを実行します。これは main.main() から呼び出されます。
// この関数はアプリケーションのライフサイクル全体のエラーを処理します。
func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

func init() {
	// グローバル永続フラグ
	rootCmd.PersistentFlags().StringVar(&targetNodeAddr, "target-addr", "", "Target node Raft address (e.g., 127.0.0.1:8000). If empty, a random node or leader might be chosen by the command.")

	// serverCmd にローカルフラグを追加
	serverCmd.Flags().StringVar(&dataDirRoot, "data-dir-root", "./data", "Root directory for server data storage.")

	rootCmd.AddCommand(serverCmd)

	// ここに他のコマンド (table, itemなど) を追加していく
	// rootCmd.AddCommand(tableCmd)
	// rootCmd.AddCommand(itemCmd)
}

// // 将来的に tableCmd などを別ファイルに分ける場合の例
// func addTableCommands(root *cobra.Command) {
// 	 tableCmd := &cobra.Command{
// 		Use:   "table",
// 		Short: "Manage tables",
// 	 }
// 	 // tableCmd.AddCommand(createTableCmd) ...
// 	 root.AddCommand(tableCmd)
// }
