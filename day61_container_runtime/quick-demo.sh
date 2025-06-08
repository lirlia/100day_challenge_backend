#!/bin/bash

# Quick Demo Script for Day61 Container Runtime
echo "🐳 Day61 Container Runtime - Quick Demo"
echo "========================================"
echo ""

# Build
echo "🔨 Building..."
go build -o bin/container cmd/container/*.go

# Show help
echo ""
echo "📖 CLI Commands:"
./bin/container --help

# Pull image
echo ""
echo "🐳 Pulling busybox:latest..."
./bin/container pull busybox:latest

# List images
echo ""
echo "📋 Local images:"
./bin/container list

# Run commands
echo ""
echo "🚀 Running container commands:"
echo ""
echo "$ echo \"Hello World\""
./bin/container run busybox:latest echo "Hello World"

echo ""
echo "$ ls /"
./bin/container run busybox:latest ls

echo ""
echo "$ pwd"
./bin/container run busybox:latest pwd

echo ""
echo "✅ Demo complete! Real Docker images working on Mac OS!"
