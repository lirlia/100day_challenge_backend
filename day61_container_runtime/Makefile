.PHONY: build run clean test deps fmt lint install help

# Go parameters
GOCMD=go
GOBUILD=$(GOCMD) build
GOCLEAN=$(GOCMD) clean
GOTEST=$(GOCMD) test
GOGET=$(GOCMD) get
GOMOD=$(GOCMD) mod

# Binary parameters
BINARY_NAME=container
BINARY_PATH=bin/$(BINARY_NAME)
MAIN_PATH=cmd/container

# Build flags
BUILD_FLAGS=-ldflags="-s -w"

# Default target
all: deps build

# Install dependencies
deps:
	@echo "Installing dependencies..."
	$(GOMOD) download
	$(GOMOD) tidy

# Build the binary
build: deps
	@echo "Building $(BINARY_NAME)..."
	@mkdir -p bin
	$(GOBUILD) $(BUILD_FLAGS) -o $(BINARY_PATH) $(MAIN_PATH)/*.go
	@echo "Binary built at $(BINARY_PATH)"

# Build with debug info
build-debug: deps
	@echo "Building $(BINARY_NAME) with debug info..."
	@mkdir -p bin
	$(GOBUILD) -o $(BINARY_PATH) $(MAIN_PATH)/*.go

# Run the application (with args support)
run: build
	@echo "Running $(BINARY_NAME)..."
	./$(BINARY_PATH) $(ARGS)

# Clean build artifacts
clean:
	@echo "Cleaning..."
	$(GOCLEAN)
	@rm -rf bin/
	@rm -rf data/

# Run tests
test:
	@echo "Running tests..."
	$(GOTEST) -v ./...

# Run tests with coverage
test-coverage:
	@echo "Running tests with coverage..."
	$(GOTEST) -v -coverprofile=coverage.out ./...
	$(GOCMD) tool cover -html=coverage.out -o coverage.html

# Format code
fmt:
	@echo "Formatting code..."
	$(GOCMD) fmt ./...

# Lint code (requires golangci-lint)
lint:
	@echo "Linting code..."
	@which golangci-lint > /dev/null || (echo "golangci-lint not installed" && exit 1)
	golangci-lint run

# Install the binary
install: build
	@echo "Installing $(BINARY_NAME)..."
	cp $(BINARY_PATH) /usr/local/bin/$(BINARY_NAME)

# Quick test commands
test-pull:
	./$(BINARY_PATH) pull busybox:latest

test-list:
	./$(BINARY_PATH) list

test-run:
	./$(BINARY_PATH) run busybox:latest /bin/echo "Hello Container!"

test-inspect:
	./$(BINARY_PATH) inspect busybox:latest

# Development setup
dev-setup:
	@echo "Setting up development environment..."
	$(GOGET) github.com/spf13/cobra@latest
	$(GOMOD) tidy

# Initialize data directories
init-dirs:
	@echo "Creating data directories..."
	@mkdir -p data/images
	@mkdir -p data/layers
	@mkdir -p data/containers

# Show help
help:
	@echo "Available targets:"
	@echo "  build         Build the binary"
	@echo "  build-debug   Build with debug information"
	@echo "  run           Run the application (use ARGS='pull busybox:latest')"
	@echo "  clean         Clean build artifacts and data"
	@echo "  test          Run tests"
	@echo "  test-coverage Run tests with coverage"
	@echo "  fmt           Format code"
	@echo "  lint          Lint code"
	@echo "  install       Install binary to /usr/local/bin"
	@echo "  deps          Install dependencies"
	@echo "  dev-setup     Setup development environment"
	@echo "  init-dirs     Create data directories"
	@echo "  test-pull     Test pull command with busybox"
	@echo "  test-list     Test list command"
	@echo "  test-run      Test run command"
	@echo "  test-inspect  Test inspect command"
	@echo "  help          Show this help"
	@echo ""
	@echo "Examples:"
	@echo "  make build"
	@echo "  make run ARGS='pull busybox:latest'"
	@echo "  make run ARGS='list'"
	@echo "  make run ARGS='run busybox:latest /bin/echo hello'"