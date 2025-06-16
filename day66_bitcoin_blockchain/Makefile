# Day66 - Bitcoin Blockchain Implementation Makefile

.PHONY: build test clean run install deps lint fmt vet help

# デフォルトターゲット
default: help

# バイナリ出力ディレクトリ
BIN_DIR := bin
BINARY_NAME := bitcoin
MAIN_PATH := cmd/bitcoin/main.go

# ビルド
build: deps
	@echo "Building binary..."
	@mkdir -p $(BIN_DIR)
	go build -o $(BIN_DIR)/$(BINARY_NAME) $(MAIN_PATH)
	@echo "Build complete: $(BIN_DIR)/$(BINARY_NAME)"

# テスト実行
test:
	@echo "Running tests..."
	go test -v ./...
	@echo "Tests complete."

# カバレッジ付きテスト
test-coverage:
	@echo "Running tests with coverage..."
	go test -v -coverprofile=coverage.out ./...
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

# 依存関係インストール
deps:
	@echo "Installing dependencies..."
	go mod tidy
	go mod download

# 依存関係更新
update-deps:
	@echo "Updating dependencies..."
	go get -u ./...
	go mod tidy

# Linting
lint:
	@echo "Running linter..."
	golangci-lint run

# フォーマット
fmt:
	@echo "Formatting code..."
	go fmt ./...

# Vet
vet:
	@echo "Running go vet..."
	go vet ./...

# すべてのチェック
check: fmt vet lint test

# 実行 (ブロックチェーン作成)
run-create:
	@echo "Creating blockchain..."
	./$(BIN_DIR)/$(BINARY_NAME) blockchain create --address 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa

# 実行 (ウォレット作成)
run-wallet:
	@echo "Creating wallet..."
	./$(BIN_DIR)/$(BINARY_NAME) wallet create

# 実行 (ヘルプ)
run-help:
	./$(BIN_DIR)/$(BINARY_NAME) --help

# クリーンアップ
clean:
	@echo "Cleaning up..."
	rm -rf $(BIN_DIR)
	rm -f coverage.out coverage.html
	rm -f blockchain.db
	@echo "Cleanup complete."

# 開発環境セットアップ
dev-setup: deps
	@echo "Setting up development environment..."
	@if ! command -v golangci-lint >/dev/null 2>&1; then \
		echo "Installing golangci-lint..."; \
		go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest; \
	fi
	@echo "Development setup complete."

# デバッグビルド
debug-build:
	@echo "Building debug binary..."
	@mkdir -p $(BIN_DIR)
	go build -gcflags="all=-N -l" -o $(BIN_DIR)/$(BINARY_NAME)-debug $(MAIN_PATH)

# リリースビルド
release-build:
	@echo "Building release binary..."
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o $(BIN_DIR)/$(BINARY_NAME)-linux-amd64 $(MAIN_PATH)
	CGO_ENABLED=0 GOOS=darwin GOARCH=amd64 go build -ldflags="-w -s" -o $(BIN_DIR)/$(BINARY_NAME)-darwin-amd64 $(MAIN_PATH)
	CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -ldflags="-w -s" -o $(BIN_DIR)/$(BINARY_NAME)-windows-amd64.exe $(MAIN_PATH)

# ベンチマーク
bench:
	@echo "Running benchmarks..."
	go test -bench=. -benchmem ./...

# ヘルプ
help:
	@echo "Day66 - Bitcoin Blockchain Implementation"
	@echo ""
	@echo "Available targets:"
	@echo "  build          - Build the bitcoin binary"
	@echo "  test           - Run tests"
	@echo "  test-coverage  - Run tests with coverage report"
	@echo "  deps           - Install dependencies"
	@echo "  update-deps    - Update dependencies"
	@echo "  lint           - Run linter"
	@echo "  fmt            - Format code"
	@echo "  vet            - Run go vet"
	@echo "  check          - Run fmt, vet, lint, and test"
	@echo "  run-create     - Create blockchain (after build)"
	@echo "  run-wallet     - Create wallet (after build)"
	@echo "  run-help       - Show CLI help (after build)"
	@echo "  clean          - Clean build artifacts"
	@echo "  dev-setup      - Setup development environment"
	@echo "  debug-build    - Build debug binary"
	@echo "  release-build  - Build release binaries"
	@echo "  bench          - Run benchmarks"
	@echo "  help           - Show this help"
	@echo ""
	@echo "Example workflow:"
	@echo "  make dev-setup"
	@echo "  make build"
	@echo "  make test"
	@echo "  make run-help"
