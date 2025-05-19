BINARY_NAME=day42_raft_nosql_simulator
CLI_OUTPUT_DIR=.
GO_FILES=$(shell find . -name '*.go' -not -path "./vendor/*")

.PHONY: all build clean test run-e2e run-e2e-verbose server cli help run-consistency-test

all: build

# ビルド
build: fmt vet
	@echo "Building CLI binary..."
	@go build -o $(CLI_OUTPUT_DIR)/$(BINARY_NAME) ./cmd/cli
	@echo "Build successful: $(CLI_OUTPUT_DIR)/$(BINARY_NAME)"

# Goサーバー（クラスタ）の起動 (フォアグラウンド)
# DATA_DIR を指定可能にする (デフォルトは ./data)
server: build
	@echo "Starting Raft NoSQL server cluster..."
	@$(CLI_OUTPUT_DIR)/$(BINARY_NAME) server --data-dir-root $${DATA_DIR:-data}

# CLIコマンドの実行 (例: テーブル作成)
# TARGET_ADDR と TABLE_NAME を指定可能にする
cli-create-table: build
	@echo "Running CLI: create-table..."
	@$(CLI_OUTPUT_DIR)/$(BINARY_NAME) create-table \
		--target-addr ${TARGET_ADDR:-localhost:8100} \
		--table-name ${TABLE_NAME:-TestTableFromMake} \
		--partition-key Artist \
		--sort-key SongTitle

# テスト
test: fmt vet
	@echo "Running unit tests..."
	@go test -v ./internal/...
	@echo "Unit tests completed."

# E2Eテストの実行 (test_e2e.sh を利用)
run-e2e:
	@echo "Running E2E tests..."
	@./test_e2e.sh
	@echo "E2E tests completed."

# E2Eテストの実行 (詳細出力付き test_e2e.sh に -x オプションがある場合)
run-e2e-verbose:
	@echo "Running E2E tests with verbose output..."
	@bash -x ./test_e2e.sh
	@echo "E2E tests completed."

# 結果整合性テストの実行 (test_eventual_consistency.sh を利用)
run-consistency-test:
	@echo "Running Eventual Consistency tests..."
	@./test_eventual_consistency.sh
	@echo "Eventual Consistency tests completed."

# フォーマットとLinter
fmt: ## フォーマットを実行 (go fmt)
	@echo "Formatting Go files..."
	@go fmt ./...

vet: ## 静的解析を実行 (go vet)
	@echo "Running go vet..."
	@go vet ./...

# クリーンアップ
clean:
	@echo "Cleaning up build artifacts and data..."
	@/bin/rm -f $(CLI_OUTPUT_DIR)/$(BINARY_NAME)
	@/bin/rm -rf data node0_data node1_data node2_data logs_e2e_test raft.db # raft.db も削除対象に追加
	@echo "Cleanup finished."

# ヘルプメッセージ
help:
	@echo "Usage: make [target]"
	@echo ""
	@echo "Targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'


.DEFAULT_GOAL := help
