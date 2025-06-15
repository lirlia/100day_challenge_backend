package main

import (
	"fmt"
	"io"
	"log"
	"os"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/internal/client"
	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/config"
	"github.com/spf13/cobra"
)

var (
	configPath string
	verbose    bool
)

func main() {
	rootCmd := &cobra.Command{
		Use:   "dfs",
		Short: "Distributed File System Client",
		Long:  "A command line interface for the Distributed File System",
	}

	// グローバルフラグ
	rootCmd.PersistentFlags().StringVarP(&configPath, "config", "c", "", "config file path")
	rootCmd.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "verbose output")

	// サブコマンドを追加
	rootCmd.AddCommand(putCmd())
	rootCmd.AddCommand(getCmd())
	rootCmd.AddCommand(lsCmd())
	rootCmd.AddCommand(infoCmd())
	rootCmd.AddCommand(rmCmd())

	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
}

// putCmd ファイルアップロードコマンド
func putCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "put <local_file> <remote_path>",
		Short: "Upload a file to DFS",
		Long:  "Upload a local file to the distributed file system",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			localPath := args[0]
			remotePath := args[1]

			client, err := createClient()
			if err != nil {
				return fmt.Errorf("failed to create client: %w", err)
			}
			defer client.Close()

			return client.PutFile(localPath, remotePath)
		},
	}
}

// getCmd ファイルダウンロードコマンド
func getCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "get <remote_path> <local_file>",
		Short: "Download a file from DFS",
		Long:  "Download a file from the distributed file system",
		Args:  cobra.ExactArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			remotePath := args[0]
			localPath := args[1]

			client, err := createClient()
			if err != nil {
				return fmt.Errorf("failed to create client: %w", err)
			}
			defer client.Close()

			return client.GetFile(remotePath, localPath)
		},
	}
}

// lsCmd ファイル一覧コマンド
func lsCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "ls [path]",
		Short: "List files in DFS",
		Long:  "List files in the distributed file system",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			path := "/"
			if len(args) > 0 {
				path = args[0]
			}

			client, err := createClient()
			if err != nil {
				return fmt.Errorf("failed to create client: %w", err)
			}
			defer client.Close()

			return client.ListFiles(path)
		},
	}
}

// infoCmd ファイル情報コマンド
func infoCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "info <remote_path>",
		Short: "Show file information",
		Long:  "Show detailed information about a file in the distributed file system",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			remotePath := args[0]

			client, err := createClient()
			if err != nil {
				return fmt.Errorf("failed to create client: %w", err)
			}
			defer client.Close()

			return client.GetFileInfo(remotePath)
		},
	}
}

// rmCmd ファイル削除コマンド
func rmCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "rm <remote_path>",
		Short: "Delete a file from DFS",
		Long:  "Delete a file from the distributed file system",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			remotePath := args[0]

			client, err := createClient()
			if err != nil {
				return fmt.Errorf("failed to create client: %w", err)
			}
			defer client.Close()

			return client.DeleteFile(remotePath)
		},
	}
}

// createClient クライアントを作成
func createClient() (*client.Client, error) {
	if !verbose {
		log.SetOutput(io.Discard)
	}

	cfg, err := config.LoadConfig(configPath)
	if err != nil {
		return nil, fmt.Errorf("failed to load config: %w", err)
	}

	return client.NewClient(cfg)
}
