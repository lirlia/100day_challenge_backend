package lsp

import (
	"context"
	"fmt"

	protocol "go.lsp.dev/protocol"
	"gopkg.in/yaml.v3" // YAML パーサーを追加
)

// RunDiagnostics performs parsing, validation, and publishes diagnostics for a given document URI.
func (h *Handler) RunDiagnostics(ctx context.Context, uri protocol.DocumentURI) {
	h.logger.Printf("Running diagnostics for: %s", uri)
	doc, ok := h.docManager.Get(string(uri))
	if !ok {
		h.logger.Printf("Error: Document not found for diagnostics: %s", uri)
		// Optionally clear diagnostics if document is gone
		h.clearDiagnostics(ctx, uri)
		return
	}

	content := doc.Content // フィールドにアクセス (仮定)
	diagnostics, err := h.validateKubernetesManifest(ctx, content)
	if err != nil {
		h.logger.Printf("Error during validation for %s: %v", uri, err)
		// Optionally, you could add a diagnostic for the validation error itself
	}

	h.publishDiagnostics(ctx, uri, diagnostics)
}

// validateKubernetesManifest parses the YAML content and validates it against Kubernetes schemas.
// Returns a list of diagnostics.
func (h *Handler) validateKubernetesManifest(ctx context.Context, content string) ([]protocol.Diagnostic, error) {
	var diagnostics []protocol.Diagnostic

	// 1. Parse YAML
	var rootNode yaml.Node // ドキュメント全体のルートノード
	if err := yaml.Unmarshal([]byte(content), &rootNode); err != nil {
		startLine, startChar := 0, 0
		endLine, endChar := 0, 1 // デフォルトのエラー範囲 (ファイルの先頭)

		// yaml.TypeError から行情報を取得しようと試みる
		if typeErr, ok := err.(*yaml.TypeError); ok && len(typeErr.Errors) > 0 {
			// 最初の yaml.TypeError のメッセージから行を推測 (簡易的)
			// 例: "line 10: cannot unmarshal !!str `abc` into int"
			// 非常に単純なパースなので、より堅牢な方法が必要な場合がある
			// TODO: より正確なエラー位置特定 (yaml.Node の Line/Column を使うなど)
			// この時点では yaml.Node が完全に構築されていない可能性があるため、
			// エラーメッセージからの推測が主になるかもしれない。
			// yaml.v3 では、エラー自体に行情報が含まれない場合が多い。
			// ここでは、エラーが発生したであろうおおよその位置を示すのが限界かもしれない。
			// Unmarshal全体が失敗した場合、具体的なNodeの位置特定は難しい。
			// とりあえずはドキュメント先頭を示す。
		}

		diag := protocol.Diagnostic{
			Range: protocol.Range{
				Start: protocol.Position{Line: uint32(startLine), Character: uint32(startChar)},
				End:   protocol.Position{Line: uint32(endLine), Character: uint32(endChar)},
			},
			Severity: protocol.DiagnosticSeverityError,
			Source:   "kls-yaml-parser",
			Message:  fmt.Sprintf("YAML parsing error: %v", err),
		}
		diagnostics = append(diagnostics, diag)
		return diagnostics, fmt.Errorf("yaml unmarshal error: %w", err)
	}

	h.logger.Printf("YAML parsed successfully. Root node kind: %v, Line: %d, Col: %d", rootNode.Kind, rootNode.Line, rootNode.Column)

	// 2. Basic Structure Validation (e.g., check for apiVersion, kind)
	// ドキュメントが複数のYAMLドキュメントを含む場合 (--- で区切られている場合)
	if rootNode.Kind == yaml.DocumentNode {
		for _, docNode := range rootNode.Content {
			if docNode.Kind == yaml.MappingNode { // 各ドキュメントはマッピングであるべき
				diags := h.validateK8sStructure(docNode)
				diagnostics = append(diagnostics, diags...)
			}
		}
	} else if rootNode.Kind == yaml.MappingNode {
		// 単一のYAMLドキュメントの場合
		diags := h.validateK8sStructure(&rootNode)
		diagnostics = append(diagnostics, diags...)
	}

	// 3. Kubernetes Schema Validation (More advanced)
	// TODO: (上記でGVK取得後) スキーマバリデーション実行

	// --- Placeholder diagnostic ---
	/*
		if len(content) > 10 { // 仮の診断ルール
			diagnostics = append(diagnostics, protocol.Diagnostic{
				Range: protocol.Range{
					Start: protocol.Position{Line: 0, Character: 0},
					End:   protocol.Position{Line: 0, Character: 5},
				},
				Severity: protocol.DiagnosticSeverityWarning,
				Source:   "kls-placeholder",
				Message:  "This is a placeholder diagnostic.",
			})
		}
	*/

	return diagnostics, nil
}

// validateK8sStructure は、単一のKubernetesマニフェストの基本的な構造を検証します。
// (apiVersion と kind が存在するかどうかなど)
func (h *Handler) validateK8sStructure(docMappingNode *yaml.Node) []protocol.Diagnostic {
	var diagnostics []protocol.Diagnostic
	requiredFields := map[string]bool{"apiVersion": false, "kind": false}

	for i := 0; i < len(docMappingNode.Content); i += 2 {
		keyNode := docMappingNode.Content[i]
		// valueNode := docMappingNode.Content[i+1] // 必要に応じてvalueもチェック

		if keyNode.Kind == yaml.ScalarNode {
			if _, ok := requiredFields[keyNode.Value]; ok {
				requiredFields[keyNode.Value] = true
			}
		}
	}

	for field, found := range requiredFields {
		if !found {
			// フィールドが見つからない場合、ドキュメントの開始位置にエラーを出す
			// (より正確には、MappingNode の開始位置)
			diagnostic := protocol.Diagnostic{
				Range: protocol.Range{
					Start: protocol.Position{Line: uint32(docMappingNode.Line - 1), Character: uint32(docMappingNode.Column - 1)},
					End:   protocol.Position{Line: uint32(docMappingNode.Line - 1), Character: uint32(docMappingNode.Column - 1 + 5)}, // 適当な長さ
				},
				Severity: protocol.DiagnosticSeverityError,
				Source:   "kls-structure-validator",
				Message:  fmt.Sprintf("Missing required field: '%s'", field),
			}
			diagnostics = append(diagnostics, diagnostic)
		}
	}
	return diagnostics
}

// publishDiagnostics sends the computed diagnostics to the LSP client.
func (h *Handler) publishDiagnostics(ctx context.Context, uri protocol.DocumentURI, diagnostics []protocol.Diagnostic) {
	if h.conn == nil {
		h.logger.Println("Error: Cannot publish diagnostics, connection is nil.")
		return
	}

	h.logger.Printf("Publishing %d diagnostics for %s", len(diagnostics), uri)

	err := h.conn.Notify(ctx, protocol.MethodTextDocumentPublishDiagnostics, &protocol.PublishDiagnosticsParams{
		URI:         uri,
		Diagnostics: diagnostics,
	})
	if err != nil {
		h.logger.Printf("Error publishing diagnostics for %s: %v", uri, err)
	}
}

// clearDiagnostics sends an empty list of diagnostics to clear previous ones.
func (h *Handler) clearDiagnostics(ctx context.Context, uri protocol.DocumentURI) {
	h.logger.Printf("Clearing diagnostics for %s", uri)
	h.publishDiagnostics(ctx, uri, []protocol.Diagnostic{}) // 空のリストを送る
}
