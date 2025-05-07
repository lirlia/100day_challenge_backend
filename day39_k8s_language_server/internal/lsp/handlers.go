package lsp

import (
	"context"
	"encoding/json"
	"fmt"

	lsp "github.com/sourcegraph/go-lsp"
	"github.com/sourcegraph/jsonrpc2"
)

// Helper to unmarshal parameters
func unmarshalParams(raw json.RawMessage, v interface{}) error {
	if raw == nil {
		return nil // No params, nothing to do, not an error for some methods
	}
	return json.Unmarshal(raw, v)
}

// Helper to send responses
func reply(ctx context.Context, conn *jsonrpc2.Conn, req *jsonrpc2.Request, result interface{}, err *jsonrpc2.Error) {
	if err != nil {
		if sendErr := conn.ReplyWithError(ctx, req.ID, err); sendErr != nil {
			// Log internal error if sending reply itself fails
			// h.logger.Printf("Failed to send error reply for ID %s: %v", req.ID, sendErr)
			fmt.Printf("Failed to send error reply for ID %s: %v\n", req.ID, sendErr) // Temp log
		}
		return
	}
	if sendErr := conn.Reply(ctx, req.ID, result); sendErr != nil {
		// h.logger.Printf("Failed to send success reply for ID %s: %v", req.ID, sendErr)
		fmt.Printf("Failed to send success reply for ID %s: %v\n", req.ID, sendErr) // Temp log
	}
}

// --- LSP Method Handlers ---

func (h *Handler) handleInitialize(ctx context.Context, params *lsp.InitializeParams) (lsp.InitializeResult, *jsonrpc2.Error) {
	h.logger.Printf("Initialize request received. Client: %s %s, RootPath: %s, RootURI: %s",
		params.ClientInfo.Name, params.ClientInfo.Version, params.RootPath, params.RootURI)

	// TODO: Store client capabilities, workspace folders, etc.

	return lsp.InitializeResult{
		Capabilities: lsp.ServerCapabilities{
			TextDocumentSync: &lsp.TextDocumentSyncOptionsOrKind{
				Options: &lsp.TextDocumentSyncOptions{
					OpenClose: true,                                 // true if didOpen/didClose are supported
					Change:    lsp.TDSKFull,                         // Full sync for now
					WillSave:  false,                                // Not implementing willSave
					Save:      &lsp.SaveOptions{IncludeText: false}, // true if didSave is supported, IncludeText can be true if needed
				},
			},
			// CompletionProvider: &lsp.CompletionOptions{ // Example: Enable completion
			// 	TriggerCharacters: []string{":", " "},
			// },
			// HoverProvider: true, // Example: Enable hover
			// DocumentFormattingProvider: true, // Example: Enable document formatting
			// DiagnosticsProvider: &lsp.DiagnosticOptions{ // Example: Enable diagnostics
			// 	InterFileDependencies: false,
			// 	WorkspaceDiagnostics: false,
			// },
		},
	}, nil
}

func (h *Handler) handleInitialized(ctx context.Context, params *lsp.InitializedParams) {
	h.logger.Println("Client sent Initialized notification.")
	// This is a notification, so no response is sent.
	// Server can start sending server-initiated requests/notifications if needed (e.g., workspace diagnostics).
}

func (h *Handler) handleShutdown(ctx context.Context) (interface{}, *jsonrpc2.Error) {
	h.logger.Println("Shutdown request received.")
	// No specific actions required for shutdown other than responding with null and preparing for exit.
	// The actual exit happens on the 'exit' notification.
	return nil, nil
}

func (h *Handler) handleExit(ctx context.Context) {
	h.logger.Println("Exit notification received. Server will terminate.")
	// Perform any final cleanup if necessary before the connection is closed by the main loop.
}

// --- Document Synchronization Handlers ---

func (h *Handler) handleTextDocumentDidOpen(ctx context.Context, params *lsp.DidOpenTextDocumentParams) {
	h.logger.Printf("textDocument/didOpen: URI=%s, LangID=%s, Version=%d", params.TextDocument.URI, params.TextDocument.LanguageID, params.TextDocument.Version)
	doc := h.docManager.DidOpen(string(params.TextDocument.URI), params.TextDocument.Text, int32(params.TextDocument.Version))
	if doc == nil {
		h.logger.Printf("Error: Could not open or create document for URI: %s", params.TextDocument.URI)
		return
	}
	// Trigger initial diagnostics or other processing for the opened document
	// h.triggerDiagnostics(doc.URI) // Example
}

func (h *Handler) handleTextDocumentDidChange(ctx context.Context, params *lsp.DidChangeTextDocumentParams) {
	h.logger.Printf("textDocument/didChange: URI=%s, Version=%d", params.TextDocument.URI, params.TextDocument.Version)
	if len(params.ContentChanges) == 0 {
		h.logger.Println("Received DidChange with no content changes.")
		return
	}
	// Assuming full text sync (Options.Change = lsp.TDSKFull)
	// The LSP spec says for full sync, ContentChanges will have one item with the full new text.
	fullText := params.ContentChanges[0].Text

	doc, found := h.docManager.DidChange(string(params.TextDocument.URI), fullText, int32(params.TextDocument.Version))
	if !found {
		h.logger.Printf("Error: DidChange event for non-existent document URI: %s", params.TextDocument.URI)
		return
	}
	if doc == nil { // Should not happen if found is true, but defensive check
		h.logger.Printf("Error: Document became nil after DidChange for URI: %s", params.TextDocument.URI)
		return
	}
	// Trigger diagnostics or other processing for the changed document
	// h.triggerDiagnostics(doc.URI) // Example
}

func (h *Handler) handleTextDocumentDidClose(ctx context.Context, params *lsp.DidCloseTextDocumentParams) {
	h.logger.Printf("textDocument/didClose: URI=%s", params.TextDocument.URI)
	h.docManager.DidClose(string(params.TextDocument.URI))
	// Clear any diagnostics for the closed file if they are managed by URI
	// h.clearDiagnostics(params.TextDocument.URI) // Example
}

func (h *Handler) handleTextDocumentDidSave(ctx context.Context, params *lsp.DidSaveTextDocumentParams) {
	h.logger.Printf("textDocument/didSave: URI=%s", params.TextDocument.URI)
	// Client has saved the document. Some servers re-trigger diagnostics on save.
	// If IncludeText was true in save options, params.Text would have the content.
	// doc, ok := h.docManager.Get(string(params.TextDocument.URI))
	// if ok {
	// 	h.triggerDiagnostics(doc.URI) // Example
	// }
}

// TODO: Implement triggerDiagnostics, clearDiagnostics and other handlers (completion, hover, etc.)
