package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"

	"github.com/sourcegraph/jsonrpc2"

	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/document"    // ドキュメントマネージャー
	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/k8s/schema"  // スキーマローダー
	kls_lsp "github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/lsp" // LSPハンドラ
)

func main() {
	// Setup logging to stderr
	logger := log.New(os.Stderr, "[kls] ", log.LstdFlags|log.Lshortfile)
	logger.Println("Kubernetes Language Server (KLS) starting...")

	// Load OpenAPI schemas
	logger.Println("Loading Kubernetes OpenAPI schemas...")
	if err := schema.LoadAndParseSchemas(); err != nil {
		logger.Fatalf("FATAL: Failed to load OpenAPI schemas: %v. Please ensure embed directive in internal/k8s/schema/loader.go is correct and embed package is imported.", err)
	}
	logger.Println("Kubernetes OpenAPI schemas loaded successfully.")

	docManager := document.NewDocumentManager()
	serverHandler := kls_lsp.NewHandler(docManager, logger)

	logger.Println("LSP server configured. Listening on stdin/stdout...")

	<-jsonrpc2.NewConn(context.Background(), jsonrpc2.NewBufferedStream(stdrwc{}, jsonrpc2.VSCodeObjectCodec{}), serverHandler).DisconnectNotify()
	logger.Println("LSP server stopped.")
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
