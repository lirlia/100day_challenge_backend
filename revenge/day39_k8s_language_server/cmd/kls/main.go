package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"

	"go.lsp.dev/jsonrpc2"

	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/document"   // ドキュメントマネージャー
	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/k8s/schema" // スキーマローダー
	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/lsp"        // LSPハンドラ
)

func main() {
	// Setup logging to stderr
	logger := log.New(os.Stderr, "[kls] ", log.LstdFlags|log.Lshortfile)
	logger.Println("KLS (Kubernetes Language Server) starting...")

	// Load OpenAPI schemas
	logger.Println("Loading Kubernetes OpenAPI schemas...")
	if err := schema.LoadAndParseSchemas(); err != nil {
		logger.Fatalf("FATAL: Failed to load OpenAPI schemas: %v.", err)
	}
	logger.Println("Kubernetes OpenAPI schemas loaded successfully.")

	docManager := document.NewDocumentManager()

	logger.Println("LSP server configured. Creating stdio stream and connection...")

	stream := jsonrpc2.NewStream(stdrwc{})
	ctx := context.Background()
	conn := jsonrpc2.NewConn(stream)

	klsHandler := lsp.NewHandler(conn, docManager, logger)
	rpcHandler := klsHandler.CreateRPCHandler()

	srv := jsonrpc2.HandlerServer(rpcHandler)

	logger.Println("Starting JSON-RPC server on stdio...")
	if err := srv.ServeStream(ctx, conn); err != nil &&
		err != io.EOF && err != context.Canceled {
		logger.Fatalf("LSP server error: %v", err)
	}
	logger.Println("LSP server finished.")
}

// stdrwc is a simple ReadWriteCloser that wraps os.Stdin and os.Stdout.
// jsonrpc2.NewBufferedStream expects an io.ReadWriteCloser.
type stdrwc struct{}

func (stdrwc) Read(p []byte) (int, error) {
	return os.Stdin.Read(p)
}

func (stdrwc) Write(p []byte) (int, error) {
	return os.Stdout.Write(p)
}

func (stdrwc) Close() error {
	if err := os.Stdin.Close(); err != nil {
		return err
	}
	return os.Stdout.Close()
}

// LogLSPMessage is a utility function to log LSP messages if needed for debugging.
// It can be called within the handler methods.
func LogLSPMessage(logger *log.Logger, method string, params interface{}, result interface{}, err error) {
	paramsJSON, _ := json.Marshal(params)
	resultJSON, _ := json.Marshal(result)
	logMsg := fmt.Sprintf("LSP: Method=%s", method)
	if len(paramsJSON) > 2 { // Assuming {} is 2 bytes
		logMsg += fmt.Sprintf(", Params=%s", string(paramsJSON))
	}
	if err != nil {
		logMsg += fmt.Sprintf(", Error=%v", err)
	}
	if len(resultJSON) > 2 && string(resultJSON) != "null" {
		logMsg += fmt.Sprintf(", Result=%s", string(resultJSON))
	}
	logger.Println(logMsg)
}
