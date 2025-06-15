.PHONY: build clean test run-namenode run-datanode run-cluster stop-cluster help

# Variables
BINARY_DIR = bin
NAMENODE_BIN = $(BINARY_DIR)/namenode
DATANODE_BIN = $(BINARY_DIR)/datanode
DFS_BIN = $(BINARY_DIR)/dfs

# Build all binaries
build:
	@echo "Building binaries..."
	@mkdir -p $(BINARY_DIR)
	go build -o $(NAMENODE_BIN) ./cmd/namenode
	go build -o $(DATANODE_BIN) ./cmd/datanode
	go build -o $(DFS_BIN) ./cmd/dfs
	@echo "Build complete!"

# Clean build artifacts
clean:
	@echo "Cleaning..."
	/bin/rm -rf $(BINARY_DIR)
	/bin/rm -rf data/
	@echo "Clean complete!"

# Run tests
test:
	@echo "Running tests..."
	go test -v ./...

# Install dependencies
deps:
	@echo "Installing dependencies..."
	go mod tidy
	go mod download

# Generate gRPC code
proto:
	@echo "Generating gRPC code..."
	export PATH=$PATH:$(go env GOPATH)/bin && protoc --go_out=. --go_opt=paths=source_relative --go-grpc_out=. --go-grpc_opt=paths=source_relative proto/dfs.proto

# Run NameNode
run-namenode: build
	@echo "Starting NameNode..."
	./$(NAMENODE_BIN)

# Run DataNode
run-datanode: build
	@echo "Starting DataNode..."
	./$(DATANODE_BIN) -id=$(ID) -port=$(PORT)

# Start cluster (NameNode + 3 DataNodes)
run-cluster: build
	@echo "Starting DFS cluster..."
	@echo "Starting NameNode..."
	./$(NAMENODE_BIN) > logs/namenode.log 2>&1 &
	@sleep 2
	@echo "Starting DataNode 1..."
	./$(DATANODE_BIN) -id=datanode1 -port=9001 > logs/datanode1.log 2>&1 &
	@sleep 1
	@echo "Starting DataNode 2..."
	./$(DATANODE_BIN) -id=datanode2 -port=9002 > logs/datanode2.log 2>&1 &
	@sleep 1
	@echo "Starting DataNode 3..."
	./$(DATANODE_BIN) -id=datanode3 -port=9003 > logs/datanode3.log 2>&1 &
	@sleep 2
	@echo "DFS cluster started!"
	@echo "Check logs in logs/ directory"

# Stop cluster
stop-cluster:
	@echo "Stopping DFS cluster..."
	@pkill -f namenode || true
	@pkill -f datanode || true
	@echo "DFS cluster stopped!"

# Create test file
create-test-file:
	@echo "Creating test file..."
	@mkdir -p test_data
	@echo "This is a test file for the distributed file system." > test_data/test.txt
	@echo "Line 2: Testing chunk distribution" >> test_data/test.txt
	@echo "Line 3: Multiple replicas should be created" >> test_data/test.txt
	@for i in {1..100}; do echo "Line $$((i+3)): Adding more content to test chunking" >> test_data/test.txt; done
	@echo "Test file created: test_data/test.txt ($(shell wc -c < test_data/test.txt) bytes)"

# Test basic operations
test-ops: build create-test-file
	@echo "Testing basic DFS operations..."
	@echo "1. Uploading file..."
	./$(DFS_BIN) put test_data/test.txt /test.txt
	@echo "2. Listing files..."
	./$(DFS_BIN) ls /
	@echo "3. Getting file info..."
	./$(DFS_BIN) info /test.txt
	@echo "4. Downloading file..."
	./$(DFS_BIN) get /test.txt test_data/downloaded.txt
	@echo "5. Comparing files..."
	@diff test_data/test.txt test_data/downloaded.txt && echo "Files match!" || echo "Files differ!"
	@echo "6. Deleting file..."
	./$(DFS_BIN) rm /test.txt
	@echo "Basic operations test complete!"

# Create logs directory
setup:
	@mkdir -p logs data/namenode data/datanode1 data/datanode2 data/datanode3 test_data scripts

# Run failure tests
failure-test: build
	@echo "=== 障害試験実行 ==="
	@mkdir -p logs scripts
	@chmod +x scripts/failure_test.sh
	@./scripts/failure_test.sh

# Show help
help:
	@echo "Available targets:"
	@echo "  build         - Build all binaries"
	@echo "  clean         - Clean build artifacts and data"
	@echo "  test          - Run unit tests"
	@echo "  proto         - Generate gRPC code from protobuf"
	@echo "  deps          - Install dependencies"
	@echo "  setup         - Create necessary directories"
	@echo "  run-namenode  - Run NameNode server"
	@echo "  run-datanode  - Run DataNode server (use ID=datanode1 PORT=9001)"
	@echo "  run-cluster   - Start full cluster (NameNode + 3 DataNodes)"
	@echo "  stop-cluster  - Stop the cluster"
	@echo "  test-ops      - Test basic DFS operations"
	@echo "  failure-test  - Run comprehensive failure tests"
	@echo "  help          - Show this help message"
	@echo ""
	@echo "Examples:"
	@echo "  make setup"
	@echo "  make run-cluster"
	@echo "  make test-ops"
	@echo "  make stop-cluster"
