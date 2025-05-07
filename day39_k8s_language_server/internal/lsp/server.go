package lsp

import (
	"context"
	"fmt"
	"log"

	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/document"
	lsp "github.com/sourcegraph/go-lsp"
	"github.com/sourcegraph/jsonrpc2"
)

// Handler is the core LSP request handler for KLS.
// It implements jsonrpc2.Handler.
type Handler struct {
	conn       *jsonrpc2.Conn
	docManager *document.DocumentManager
	logger     *log.Logger
	// schemaManager *schema.Manager // Future: if schema access needs more state
}

// NewHandler creates a new KLS LSP Handler.
func NewHandler(docManager *document.DocumentManager, logger *log.Logger) *Handler {
	return &Handler{
		docManager: docManager,
		logger:     logger,
	}
}

// Handle dispatches incoming JSON-RPC requests to the appropriate LSP method handlers.
func (h *Handler) Handle(ctx context.Context, conn *jsonrpc2.Conn, req *jsonrpc2.Request) {
	// Store the connection for sending notifications, etc.
	if h.conn == nil {
		h.conn = conn
	}

	// Example of how to log incoming requests (can be made more sophisticated)
	// h.logger.Printf("LSP Request: Method=%s, Params=%s", req.Method, string(req.Params))

	var err error
	switch req.Method {
	case lsp.MethodInitialize:
		var params lsp.InitializeParams
		if err = unmarshalParams(*req.Params, &params); err == nil {
			result, errHandle := h.handleInitialize(ctx, &params)
			reply(ctx, conn, req, result, errHandle)
		}
	case lsp.MethodInitialized:
		var params lsp.InitializedParams
		if err = unmarshalParams(*req.Params, &params); err == nil {
			h.handleInitialized(ctx, &params)
			// No reply for notifications
		}
	case lsp.MethodShutdown:
		if req.Params == nil || string(*req.Params) == "null" || len(*req.Params) == 0 {
			result, errHandle := h.handleShutdown(ctx)
			reply(ctx, conn, req, result, errHandle)
		} else {
			err = &jsonrpc2.Error{Code: jsonrpc2.CodeInvalidParams, Message: "shutdown: expected no parameters or null"}
		}
	case lsp.MethodExit:
		h.handleExit(ctx) // No reply for exit
		conn.Close()      // Close the connection as per LSP spec for exit
		return            // Stop further processing

	// Document Synchronization
	case lsp.MethodTextDocumentDidOpen:
		var params lsp.DidOpenTextDocumentParams
		if err = unmarshalParams(*req.Params, &params); err == nil {
			h.handleTextDocumentDidOpen(ctx, &params)
		}
	case lsp.MethodTextDocumentDidChange:
		var params lsp.DidChangeTextDocumentParams
		if err = unmarshalParams(*req.Params, &params); err == nil {
			h.handleTextDocumentDidChange(ctx, &params)
		}
	case lsp.MethodTextDocumentDidClose:
		var params lsp.DidCloseTextDocumentParams
		if err = unmarshalParams(*req.Params, &params); err == nil {
			h.handleTextDocumentDidClose(ctx, &params)
		}
	case lsp.MethodTextDocumentDidSave:
		var params lsp.DidSaveTextDocumentParams
		if err = unmarshalParams(*req.Params, &params); err == nil {
			h.handleTextDocumentDidSave(ctx, &params)
		}

	// TODO: Implement other LSP methods (completion, hover, diagnostics, formatting, etc.)
	// case lsp.MethodTextDocumentCompletion:
	// case lsp.MethodTextDocumentHover:
	// case lsp.MethodTextDocumentFormatting:

	default:
		if req.Notif {
			h.logger.Printf("Ignoring unhandled notification: %s", req.Method)
			return
		}
		err = &jsonrpc2.Error{Code: jsonrpc2.CodeMethodNotFound, Message: fmt.Sprintf("method not supported: %s", req.Method)}
	}

	if err != nil {
		h.logger.Printf("Error handling LSP request %s: %v. Params: %s", req.Method, err, string(*req.Params))
		if req.Notif {
			return // Do not reply to notifications with errors
		}
		if e, ok := err.(*jsonrpc2.Error); ok {
			reply(ctx, conn, req, nil, e)
		} else {
			// Convert general errors to LSP-compliant errors if necessary
			reply(ctx, conn, req, nil, &jsonrpc2.Error{Code: jsonrpc2.CodeInternalError, Message: err.Error()})
		}
	}
}
