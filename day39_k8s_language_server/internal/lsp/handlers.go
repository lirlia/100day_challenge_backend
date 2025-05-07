package lsp

import (
	"context"
	"encoding/json"

	"go.lsp.dev/jsonrpc2"
	protocol "go.lsp.dev/protocol"
)

// Helper to unmarshal parameters
func unmarshalParams(raw json.RawMessage, v interface{}) error {
	if raw == nil {
		return nil // No params, nothing to do, not an error for some methods
	}
	return json.Unmarshal(raw, v)
}

// --- LSP Method Handlers ---

func (h *Handler) handleInitialize(ctx context.Context, params *protocol.InitializeParams) (protocol.InitializeResult, *jsonrpc2.Error) {
	h.logger.Printf("Initialize request received. Client: %s %s, RootPath: %s, RootURI: %s",
		params.ClientInfo.Name, params.ClientInfo.Version, params.RootPath, params.RootURI)

	// TODO: Store client capabilities, workspace folders, etc.

	return protocol.InitializeResult{
		Capabilities: protocol.ServerCapabilities{
			TextDocumentSync: protocol.TextDocumentSyncOptions{
				OpenClose: true,
				Change:    protocol.TextDocumentSyncKindFull,
				Save:      &protocol.SaveOptions{IncludeText: false},
			},
			CompletionProvider: &protocol.CompletionOptions{
				TriggerCharacters: []string{":", " ", "-", "/"},
			},
			HoverProvider:              true,
			DocumentFormattingProvider: true,
		},
	}, nil
}

func (h *Handler) handleInitialized(ctx context.Context, params *protocol.InitializedParams) {
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
	h.logger.Println("Exit notification received. Server should terminate gracefully.")
	// Perform any final cleanup if necessary before the connection is closed by the main loop.
}

// --- Document Synchronization Handlers ---

func (h *Handler) handleTextDocumentDidOpen(ctx context.Context, params *protocol.DidOpenTextDocumentParams) {
	uri := params.TextDocument.URI
	h.logger.Printf("textDocument/didOpen: URI=%s, LangID=%s, Version=%d", uri, params.TextDocument.LanguageID, params.TextDocument.Version)
	doc := h.docManager.DidOpen(string(uri), params.TextDocument.Text, int32(params.TextDocument.Version))
	if doc == nil {
		h.logger.Printf("Error: Could not open or create document for URI: %s", uri)
		return
	}
	h.triggerDiagnostics(uri)
}

func (h *Handler) handleTextDocumentDidChange(ctx context.Context, params *protocol.DidChangeTextDocumentParams) {
	uri := params.TextDocument.URI
	h.logger.Printf("textDocument/didChange: URI=%s, Version=%d", uri, params.TextDocument.Version)
	if len(params.ContentChanges) == 0 {
		h.logger.Println("Received DidChange with no content changes.")
		return
	}
	// Assuming full text sync (Options.Change = protocol.TextDocumentSyncKindFull)
	// The LSP spec says for full sync, ContentChanges will have one item with the full new text.
	fullText := params.ContentChanges[0].Text

	doc, found := h.docManager.DidChange(string(uri), fullText, int32(params.TextDocument.Version))
	if !found {
		h.logger.Printf("Error: DidChange event for non-existent document URI: %s", uri)
		return
	}
	if doc == nil { // Should not happen if found is true, but defensive check
		h.logger.Printf("Error: Document became nil after DidChange for URI: %s", uri)
		return
	}
	h.triggerDiagnostics(uri)
}

func (h *Handler) handleTextDocumentDidClose(ctx context.Context, params *protocol.DidCloseTextDocumentParams) {
	uri := params.TextDocument.URI
	h.logger.Printf("textDocument/didClose: URI=%s", uri)
	h.docManager.DidClose(string(uri))
	h.clearDiagnostics(uri)
}

func (h *Handler) handleTextDocumentDidSave(ctx context.Context, params *protocol.DidSaveTextDocumentParams) {
	uri := params.TextDocument.URI
	h.logger.Printf("textDocument/didSave: URI=%s", uri)
	h.triggerDiagnostics(uri)
}

// --- Placeholder for Diagnostics ---

func (h *Handler) triggerDiagnostics(uri protocol.DocumentURI) {
	h.logger.Printf("Placeholder: Triggering diagnostics for %s", uri)
	// Example notification send:
	// diagsParams := &protocol.PublishDiagnosticsParams{
	// 	URI:         uri,
	// 	Diagnostics: []protocol.Diagnostic{...},
	// }
	// ctx := context.Background()
	// if h.conn != nil {
	// 	if err := h.conn.Notify(ctx, protocol.MethodTextDocumentPublishDiagnostics, diagsParams); err != nil {
	// 		 h.logger.Printf("Error publishing diagnostics for %s: %v", uri, err)
	// 	}
	// } else {
	// 	 h.logger.Printf("Cannot publish diagnostics for %s: connection is not set.", uri)
	// }
}

func (h *Handler) clearDiagnostics(uri protocol.DocumentURI) {
	h.logger.Printf("Placeholder: Clearing diagnostics for %s", uri)
	diagsParams := &protocol.PublishDiagnosticsParams{
		URI:         uri,
		Diagnostics: []protocol.Diagnostic{},
	}
	ctx := context.Background()
	if h.conn != nil {
		if err := h.conn.Notify(ctx, protocol.MethodTextDocumentPublishDiagnostics, diagsParams); err != nil {
			h.logger.Printf("Error clearing diagnostics for %s: %v", uri, err)
		}
	} else {
		h.logger.Printf("Cannot clear diagnostics for %s: connection is not set.", uri)
	}
}
