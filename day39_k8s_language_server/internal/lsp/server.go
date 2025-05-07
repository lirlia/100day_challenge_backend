package lsp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"

	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/document"
	"go.lsp.dev/jsonrpc2"
	protocol "go.lsp.dev/protocol"
)

// Handler is the core LSP request handler for KLS.
// It holds state like the document manager and the jsonrpc2 connection.
type Handler struct {
	conn       jsonrpc2.Conn
	docManager *document.DocumentManager
	logger     *log.Logger
	// No conn field needed here as Replier is passed to the handler function.
}

// NewHandler creates a new KLS LSP Handler.
// conn is needed for sending notifications.
func NewHandler(conn jsonrpc2.Conn, docManager *document.DocumentManager, logger *log.Logger) *Handler {
	logger.Println("Creating new KLS Handler instance.")
	return &Handler{
		conn:       conn,
		docManager: docManager,
		logger:     logger,
	}
}

// CreateRPCHandler creates a jsonrpc2.Handler function that closes over the KLS Handler.
func (h *Handler) CreateRPCHandler() jsonrpc2.Handler {
	return func(ctx context.Context, reply jsonrpc2.Replier, req jsonrpc2.Request) error {
		h.logger.Printf("RPC Handler: Method=%s", req.Method())

		// Attempt to cast to *jsonrpc2.Call to access ID if it's a request expecting a response
		// Notifications might not have an ID or might be of a different concrete type.
		// The Replier handles the ID internally.

		switch req.Method() {
		case protocol.MethodInitialize:
			var params protocol.InitializeParams
			if err := json.Unmarshal(req.Params(), &params); err != nil {
				// For parsing errors on initialize, LSP spec suggests an error response.
				// The ID might be tricky if params are malformed such that ID itself cannot be read.
				// However, jsonrpc2.Replier should handle this if req has an ID.
				// If req is not a Call, ID would be nil.
				// Let's assume reply will figure out the ID or send a general error.
				return reply(ctx, nil, &jsonrpc2.Error{
					Code:    jsonrpc2.ParseError,
					Message: fmt.Sprintf("initialize: failed to unmarshal params: %v", err),
				})
			}
			result, rpcErr := h.handleInitialize(ctx, &params)
			return reply(ctx, result, rpcErr)

		case protocol.MethodInitialized:
			var params protocol.InitializedParams
			if err := json.Unmarshal(req.Params(), &params); err != nil {
				h.logger.Printf("Failed to unmarshal InitializedParams: %v. This is a notification, no error response sent.", err)
				return nil // Notifications do not send error responses
			}
			h.handleInitialized(ctx, &params)
			return nil // No response for notifications

		case protocol.MethodShutdown:
			// Shutdown can have null params or no params field. It expects a response.
			// Check if req.Params() is nil or "null"
			if !(req.Params() == nil || string(req.Params()) == "null") {
				return reply(ctx, nil, &jsonrpc2.Error{
					Code:    jsonrpc2.InvalidParams,
					Message: "shutdown: expected no parameters or null",
				})
			}
			_, rpcErr := h.handleShutdown(ctx)
			return reply(ctx, nil, rpcErr) // Success, result is null, or an error

		case protocol.MethodExit:
			h.handleExit(ctx) // Notification, no response
			return nil

		case protocol.MethodTextDocumentDidOpen:
			var params protocol.DidOpenTextDocumentParams
			if err := json.Unmarshal(req.Params(), &params); err != nil {
				h.logger.Printf("Failed to unmarshal DidOpenTextDocumentParams: %v", err)
				return nil
			}
			h.handleTextDocumentDidOpen(ctx, &params)
			return nil

		case protocol.MethodTextDocumentDidChange:
			var params protocol.DidChangeTextDocumentParams
			if err := json.Unmarshal(req.Params(), &params); err != nil {
				h.logger.Printf("Failed to unmarshal DidChangeTextDocumentParams: %v", err)
				return nil
			}
			h.handleTextDocumentDidChange(ctx, &params)
			return nil

		case protocol.MethodTextDocumentDidClose:
			var params protocol.DidCloseTextDocumentParams
			if err := json.Unmarshal(req.Params(), &params); err != nil {
				h.logger.Printf("Failed to unmarshal DidCloseTextDocumentParams: %v", err)
				return nil
			}
			h.handleTextDocumentDidClose(ctx, &params)
			return nil

		case protocol.MethodTextDocumentDidSave:
			var params protocol.DidSaveTextDocumentParams
			if err := json.Unmarshal(req.Params(), &params); err != nil {
				h.logger.Printf("Failed to unmarshal DidSaveTextDocumentParams: %v", err)
				return nil
			}
			h.handleTextDocumentDidSave(ctx, &params)
			return nil

		// Example for a request that might need an ID for logging or other purposes,
		// though Replier handles sending the response with the correct ID.
		// case protocol.MethodTextDocumentCompletion:
		// 	var params protocol.CompletionParams
		// 	if err := json.Unmarshal(req.Params(), &params); err != nil {
		// 		// Log and reply with parse error
		// 		// Determine if req is a Call to get ID for logging, if needed.
		// 		// call, ok := req.(*jsonrpc2.Call)
		// 		// if ok { h.logger.Printf("Parse error on completion for ID: %v", call.ID()) }
		// 		return reply(ctx, nil, &jsonrpc2.Error{
		// 			Code: jsonrpc2.CodeParseError,
		// 			Message: fmt.Sprintf("completion: %v", err),
		// 		})
		// 	}
		// 	// result, rpcErr := h.handleCompletion(ctx, &params) // Assuming handleCompletion exists
		// 	// return reply(ctx, result, rpcErr)

		default:
			// Check if it's a request (expects response) or notification
			// A bit tricky since jsonrpc2.Request doesn't directly expose ID without casting to Call
			// However, if reply is called with a non-nil error for a notification, it might be an issue.
			// The jsonrpc2 library might handle not sending replies for notifications if Replier is used correctly.
			// If it's a request that's not supported:
			if call, ok := req.(*jsonrpc2.Call); ok { // Only try to reply if it's a Call (has an ID)
				h.logger.Printf("Unhandled method call: %s for ID: %v", req.Method(), call.ID())
				return reply(ctx, nil, &jsonrpc2.Error{
					Code:    jsonrpc2.MethodNotFound,
					Message: fmt.Sprintf("method not supported: %s", req.Method()),
				})
			}
			// If it's a notification that's not supported:
			h.logger.Printf("Ignoring unhandled notification: %s", req.Method())
			return nil
		}
	}
}

// replyError helper is effectively replaced by calling `reply(ctx, nil, &jsonrpc2.Error{...})`
// func (h *Handler) replyError(ctx context.Context, reqID jsonrpc2.ID, code jsonrpc2.Code, message string) error { ... }

// handleInitialize handles the 'initialize' LSP request.
// ... existing code ...
// handleInitialized handles the 'initialized' LSP notification.
// ... existing code ...
// handleShutdown handles the 'shutdown' LSP request.
// ... existing code ...
// handleExit handles the 'exit' LSP notification.
// ... existing code ...
// handleTextDocumentDidOpen handles 'textDocument/didOpen' notifications.
// ... existing code ...
// handleTextDocumentDidChange handles 'textDocument/didChange' notifications.
// ... existing code ...
// handleTextDocumentDidClose handles 'textDocument/didClose' notifications.
// ... existing code ...
// handleTextDocumentDidSave handles 'textDocument/didSave' notifications.
// ... existing code ...
