package lsp

import (
	"context"
	"fmt"
	"log"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/k8s/schema"
	"go.lsp.dev/jsonrpc2"
	protocol "go.lsp.dev/protocol"
	"gopkg.in/yaml.v3"
)

// --- LSP Method Handlers ---

func (h *Handler) handleInitialize(ctx context.Context, params *protocol.InitializeParams) (protocol.InitializeResult, *jsonrpc2.Error) {
	// h.logger.Printf("Initialize request received. Client: %s %s, RootPath: %s, RootURI: %s",
	// 	params.ClientInfo.Name, params.ClientInfo.Version)

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
	h.RunDiagnostics(ctx, uri)
}

func (h *Handler) handleTextDocumentDidChange(ctx context.Context, params *protocol.DidChangeTextDocumentParams) {
	uri := params.TextDocument.URI
	h.logger.Printf("textDocument/didChange: URI=%s, Version=%d", uri, params.TextDocument.Version)
	if len(params.ContentChanges) == 0 {
		h.logger.Println("Received DidChange with no content changes.")
		return
	}
	fullText := params.ContentChanges[0].Text

	doc, found := h.docManager.DidChange(string(uri), fullText, int32(params.TextDocument.Version))
	if !found {
		h.logger.Printf("Error: DidChange event for non-existent document URI: %s", uri)
		return
	}
	if doc == nil {
		h.logger.Printf("Error: Document became nil after DidChange for URI: %s", uri)
		return
	}
	h.RunDiagnostics(ctx, uri)
}

func (h *Handler) handleTextDocumentDidClose(ctx context.Context, params *protocol.DidCloseTextDocumentParams) {
	uri := params.TextDocument.URI
	h.logger.Printf("textDocument/didClose: URI=%s", uri)
	h.docManager.DidClose(string(uri))
	h.clearDiagnostics(ctx, uri)
}

func (h *Handler) handleTextDocumentDidSave(ctx context.Context, params *protocol.DidSaveTextDocumentParams) {
	uri := params.TextDocument.URI
	h.logger.Printf("textDocument/didSave: URI=%s", uri)
	// h.triggerDiagnostics(uri) // 古い呼び出しをコメントアウト
	h.RunDiagnostics(ctx, uri) // 保存時にも診断を実行
}

// --- Completion Handler (Stub) ---
func (h *Handler) handleTextDocumentCompletion(ctx context.Context, params *protocol.CompletionParams) (*protocol.CompletionList, *jsonrpc2.Error) {
	h.logger.Printf("textDocument/completion: Position=%+v", params.Position)
	// TODO: Implement completion logic
	return nil, nil // Not implemented yet
}

// --- Hover Handler (Stub) ---

// findSchemaForNode は、与えられたスキーマとキーパスから、
// ネストされたプロパティに対応するスキーマ定義を検索します。
// $ref も解決を試みます。
func findSchemaForNode(
	currentSchema *openapi3.Schema,
	path []string,
	docComponents *openapi3.Components, // ポインタ型に変更
	logger *log.Logger,
) *openapi3.Schema {
	if currentSchema == nil {
		return nil
	}

	if len(path) == 0 {
		return currentSchema
	}

	nextKey := path[0]
	remainingPath := path[1:]
	var nextSchemaToExplore *openapi3.Schema

	if currentSchema.Properties != nil {
		if propSchemaRef, ok := currentSchema.Properties[nextKey]; ok {
			if propSchemaRef != nil {
				if propSchemaRef.Ref != "" {
					if docComponents == nil || docComponents.Schemas == nil { // nilチェック追加
						return nil
					}
					refKey := strings.TrimPrefix(propSchemaRef.Ref, schema.KubeObjectPathPrefix)
					if referencedSchemaRef, found := docComponents.Schemas[refKey]; found {
						if referencedSchemaRef != nil && referencedSchemaRef.Value != nil {
							nextSchemaToExplore = referencedSchemaRef.Value
						} else {
							return nil
						}
					} else {
						return nil
					}
				} else if propSchemaRef.Value != nil {
					nextSchemaToExplore = propSchemaRef.Value
				} else {
					return nil
				}
			} else {
				return nil
			}
		} else {
			return nil
		}
	} else if currentSchema.Items != nil && currentSchema.Items.Value != nil { // 配列のitemsを考慮
		itemSchemaRef := currentSchema.Items
		if itemSchemaRef.Ref != "" {
			if docComponents == nil || docComponents.Schemas == nil {
				return nil
			}
			refKey := strings.TrimPrefix(itemSchemaRef.Ref, schema.KubeObjectPathPrefix)
			if referencedSchemaRef, found := docComponents.Schemas[refKey]; found {
				if referencedSchemaRef != nil && referencedSchemaRef.Value != nil {
					nextSchemaToExplore = referencedSchemaRef.Value
				} else {
					return nil
				}
			} else {
				return nil
			}
		} else if itemSchemaRef.Value != nil {
			nextSchemaToExplore = itemSchemaRef.Value
		} else {
			return nil
		}
	} else {
		return nil
	}

	if nextSchemaToExplore != nil {
		return findSchemaForNode(nextSchemaToExplore, remainingPath, docComponents, logger)
	}
	return nil
}

func (h *Handler) handleTextDocumentHover(ctx context.Context, params *protocol.HoverParams) (*protocol.Hover, *jsonrpc2.Error) {
	uri := params.TextDocument.URI
	pos := params.Position
	h.logger.Printf("textDocument/hover: URI=%s, Position=%+v", uri, pos)

	docManager, okManager := h.docManager.Get(string(uri)) // 変数名変更: doc -> docManager, ok -> okManager
	if !okManager {
		h.logger.Printf("Hover: Document not found for URI: %s", uri)
		return nil, nil
	}
	content := docManager.Content

	hoverNode, keyPath, err := findNodeAtPosition(content, pos, h.logger)
	if err != nil {
		h.logger.Printf("Hover: Error finding node at position: %v", err)
		return nil, nil
	}
	if hoverNode == nil {
		h.logger.Printf("Hover: No YAML node found at position.")
		return nil, nil
	}
	h.logger.Printf("Hover: YAML Node: Kind=%v, Value='%s', Path=%v", hoverNode.Kind, hoverNode.Value, keyPath)

	var apiVersion, kind string
	var mappingNode *yaml.Node
	var rootYamlNode yaml.Node
	if yamlErr := yaml.Unmarshal([]byte(content), &rootYamlNode); yamlErr != nil {
		h.logger.Printf("Hover: Failed to parse YAML for GVK: %v", yamlErr)
		return nil, nil
	}
	if rootYamlNode.Kind == yaml.DocumentNode && len(rootYamlNode.Content) > 0 {
		mappingNode = rootYamlNode.Content[0]
	} else if rootYamlNode.Kind == yaml.MappingNode {
		mappingNode = &rootYamlNode
	}

	if mappingNode != nil && mappingNode.Kind == yaml.MappingNode {
		for i := 0; i < len(mappingNode.Content); i += 2 {
			keyNode := mappingNode.Content[i]
			valNode := mappingNode.Content[i+1]
			if keyNode.Kind == yaml.ScalarNode {
				if keyNode.Value == "apiVersion" && valNode.Kind == yaml.ScalarNode {
					apiVersion = valNode.Value
				}
				if keyNode.Value == "kind" && valNode.Kind == yaml.ScalarNode {
					kind = valNode.Value
				}
			}
		}
	}
	if apiVersion == "" || kind == "" {
		h.logger.Printf("Hover: Could not determine GVK for document URI: %s", uri)
		return nil, nil
	}

	gvkSchemaRef, schemaErr := schema.GetSchemaRefByGVK(apiVersion, kind)
	if schemaErr != nil {
		h.logger.Printf("Hover: SchemaRef not found for GVK %s, %s: %v", apiVersion, kind, schemaErr)
		return nil, nil
	}
	if gvkSchemaRef == nil || gvkSchemaRef.Value == nil {
		h.logger.Printf("Hover: Retrieved nil SchemaRef or .Value for GVK %s, %s", apiVersion, kind)
		return nil, nil
	}
	rootSchema := gvkSchemaRef.Value

	docGroup, _ := schema.SplitAPIVersion(apiVersion)
	var specToUse string
	switch docGroup {
	case "", "core":
		specToUse = schema.CoreAPISpecName
	case "apps":
		specToUse = schema.AppsAPISpecName
	case "networking.k8s.io":
		specToUse = schema.NetworkingAPISpecName
	default:
		h.logger.Printf("Hover: Unknown group '%s' for $ref resolution, attempting with core spec components. This might be incorrect.", docGroup)
		specToUse = schema.CoreAPISpecName
	}

	docForRefs, okSchema := schema.GetLoadedSchema(specToUse)
	if !okSchema || docForRefs == nil || docForRefs.Components == nil {
		h.logger.Printf("Hover: Could not load components for $ref resolution (spec: %s).", specToUse)
		return nil, &jsonrpc2.Error{Code: jsonrpc2.InternalError, Message: fmt.Sprintf("Failed to load schema components for $ref resolution from spec %s", specToUse)}
	}
	docComponents := docForRefs.Components

	var targetSchema *openapi3.Schema
	if len(keyPath) == 0 && hoverNode.Kind == yaml.MappingNode {
		targetSchema = rootSchema
	} else if len(keyPath) > 0 {
		targetSchema = findSchemaForNode(rootSchema, keyPath, docComponents, h.logger)
	}

	if targetSchema == nil {
		h.logger.Printf("Hover: Could not find schema definition for key path: %v", keyPath)
		return nil, nil
	}

	description := targetSchema.Description
	if description == "" {
		return nil, nil
	}
	h.logger.Printf("Hover: Description for path %v: %s", keyPath, description)

	nodeStartLine := uint32(hoverNode.Line - 1)
	nodeStartChar := uint32(hoverNode.Column - 1)
	var nodeEndChar uint32
	if hoverNode.Kind == yaml.ScalarNode || (hoverNode.Kind == yaml.MappingNode && len(hoverNode.Content) == 0) || (hoverNode.Kind == yaml.SequenceNode && len(hoverNode.Content) == 0) {
		nodeEndChar = nodeStartChar + uint32(len(hoverNode.Value))
	} else if hoverNode.Kind == yaml.MappingNode || hoverNode.Kind == yaml.SequenceNode {
		if len(hoverNode.Value) > 0 {
			nodeEndChar = nodeStartChar + uint32(len(hoverNode.Value))
		} else {
			nodeEndChar = nodeStartChar + 1
		}
	} else {
		nodeEndChar = nodeStartChar + uint32(len(hoverNode.Value))
	}
	hoverRange := protocol.Range{
		Start: protocol.Position{Line: nodeStartLine, Character: nodeStartChar},
		End:   protocol.Position{Line: nodeStartLine, Character: nodeEndChar},
	}
	hoverContent := protocol.MarkupContent{
		Kind:  "markdown",
		Value: description,
	}
	return &protocol.Hover{
		Contents: hoverContent,
		Range:    &hoverRange,
	}, nil
}
