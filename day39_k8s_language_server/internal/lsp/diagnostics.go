package lsp

import (
	"context"
	"fmt"

	"github.com/getkin/kin-openapi/openapi3"
	"github.com/lirlia/100day_challenge_backend/day39_k8s_language_server/internal/k8s/schema"
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
	fields := map[string]struct {
		found   bool
		value   string
		keyNode *yaml.Node // キーノード自体の位置情報を使うため
		valNode *yaml.Node // 値ノード自体の位置情報を使うため
	}{
		"apiVersion": {found: false},
		"kind":       {found: false},
	}

	for i := 0; i < len(docMappingNode.Content); i += 2 {
		keyNode := docMappingNode.Content[i]
		valNode := docMappingNode.Content[i+1]

		if keyNode.Kind == yaml.ScalarNode {
			if fieldData, ok := fields[keyNode.Value]; ok {
				fieldData.found = true
				if valNode.Kind == yaml.ScalarNode {
					fieldData.value = valNode.Value
				}
				fieldData.keyNode = keyNode
				fieldData.valNode = valNode
				fields[keyNode.Value] = fieldData
			}
		}
	}

	apiVersionPresent := false
	kindPresent := false

	for fieldName, data := range fields {
		if !data.found {
			diagnostics = append(diagnostics, protocol.Diagnostic{
				Range:    getRangeFromNode(docMappingNode), // ドキュメント全体を対象
				Severity: protocol.DiagnosticSeverityError,
				Source:   "kls-structure",
				Message:  fmt.Sprintf("Missing required field: '%s'", fieldName),
			})
		} else {
			if fieldName == "apiVersion" {
				apiVersionPresent = true
				if data.value == "" {
					diagnostics = append(diagnostics, protocol.Diagnostic{
						Range:    getRangeFromNode(data.valNode), // 値ノードを対象
						Severity: protocol.DiagnosticSeverityError,
						Source:   "kls-structure",
						Message:  "Field 'apiVersion' cannot be empty",
					})
				}
			}
			if fieldName == "kind" {
				kindPresent = true
				if data.value == "" {
					diagnostics = append(diagnostics, protocol.Diagnostic{
						Range:    getRangeFromNode(data.valNode), // 値ノードを対象
						Severity: protocol.DiagnosticSeverityError,
						Source:   "kls-structure",
						Message:  "Field 'kind' cannot be empty",
					})
				}
			}
		}
	}

	// apiVersion と kind が両方存在し、空でなければスキーマ検証に進む
	if apiVersionPresent && kindPresent && fields["apiVersion"].value != "" && fields["kind"].value != "" {
		apiVersion := fields["apiVersion"].value
		kind := fields["kind"].value
		h.logger.Printf("Found apiVersion: %s, kind: %s. Proceeding to schema validation.", apiVersion, kind)

		// 1. OpenAPI スキーマを取得
		k8sSchemaRef, err := schema.GetSchemaRefByGVK(apiVersion, kind)
		if err != nil {
			h.logger.Printf("Schema not found for GVK %s, %s: %v", apiVersion, kind, err)
			diagnostics = append(diagnostics, protocol.Diagnostic{
				Range:    getRangeFromNode(fields["kind"].valNode), // kind の値ノードの位置
				Severity: protocol.DiagnosticSeverityWarning,       // 見つからない場合は警告レベル
				Source:   "kls-schema-resolver",
				Message:  fmt.Sprintf("Schema not found for apiVersion: %s, kind: %s. Validation skipped. Error: %v", apiVersion, kind, err),
			})
			return diagnostics // スキーマがなければここで終了
		}
		if k8sSchemaRef == nil || k8sSchemaRef.Value == nil {
			h.logger.Printf("Retrieved nil schema or schema value for GVK %s, %s", apiVersion, kind)
			diagnostics = append(diagnostics, protocol.Diagnostic{
				Range:    getRangeFromNode(fields["kind"].valNode),
				Severity: protocol.DiagnosticSeverityWarning,
				Source:   "kls-schema-resolver",
				Message:  fmt.Sprintf("Could not retrieve a valid schema for apiVersion: %s, kind: %s. Validation skipped.", apiVersion, kind),
			})
			return diagnostics
		}

		// 2. YAML ノードを map[string]interface{} に変換
		dataToValidate, err := yamlNodeToMapInterface(docMappingNode)
		if err != nil {
			h.logger.Printf("Error converting YAML node to map for GVK %s, %s: %v", apiVersion, kind, err)
			diagnostics = append(diagnostics, protocol.Diagnostic{
				Range:    getRangeFromNode(docMappingNode),
				Severity: protocol.DiagnosticSeverityError,
				Source:   "kls-yaml-converter",
				Message:  fmt.Sprintf("Internal error converting YAML for validation: %v", err),
			})
			return diagnostics
		}

		// 3. スキーマバリデーション実行
		// kin-openapi/openapi3.Schema.VisitJSON を使うか、Validate() を直接使う。
		// Validate() は context.Context を要求する。現状、スキーマロード時に context.Background() を使っている。
		// ここでも同様に context.Background() で良いか、LSP のリクエストコンテキストを使うべきか。
		// 診断はリクエスト処理の一部なので、LSP のコンテキスト (ctx) を渡すのが適切。
		// ただし、kin-openapi の Validate メソッドは現在 context を取らない (v0.123.0 時点)。
		// 代わりに loader.Context を渡す必要があるかもしれない、あるいは VisitJSON を使う。
		// スキーマ自体はロード済みなので、SchemaRef.Value.Validate(ctx, dataToValidate) のような形になる。
		// --> 確認したところ、`openapi3.Schema.Validate(context.Context, interface{}) error` は存在しない。
		// --> `openapi3.SchemaRef.Validate(context.Context, interface{}) error` も存在しない。
		// --> `openapi3.T.Validate(context.Context) error` はドキュメント全体のバリデーション。
		// --> 特定のスキーマでデータを検証するには、`kinপূর্বopenapi3filter.ValidateRequestBody` や
		//     `kin-openapi/openapi3utils.Visit()` を利用するか、手動でやる必要がある。
		// --> 恐らく、kin-openapi v0.123.0 では `(s *Schema).Visit()` を使用してバリデータ関数を渡すのが一般的。
		//     もしくは、`jsoninfo.Validate()` (kin-openapi 内部で使われている) のようなものが必要。
		// --> より簡単なのは、`kin-openapi/openapi3checker.ForSchemaRef(k8sSchemaRef).Check(dataToValidate)` だが、
		//     これは `openapi3filter.SchemaValidationOption` を返すもので、直接的なエラーを返さない。

		// 簡単な方法として、kin-openapi が OpenAPI ドキュメント自体をロードする際に内部的に行うバリデーションを
		// 利用することを考える。しかし、ここでは既にロードされたスキーマに対して「データ」を検証したい。

		// `openapi3.SchemaValidationOption` を使ってエラーを取得するアプローチ。
		// `openapi3filter.NewSchemaChecker()` を使う。
		// しかし、`SchemaChecker` は HTTP リクエスト/レスポンスの文脈で使われることが多い。

		// ここでは、最も直接的な `SchemaRef.Value.VisitJSON()` を使うことを試みるが、
		// これはバリデーションエラーを直接返すわけではなく、カスタムビジターが必要になる。

		// 最終手段: `openapi3.NewLoader().Context` を使って、スキーマとデータを関連付けて Validate。これは複雑。

		// kin-openapi の Issues や Example を見ると、個別のデータ片をスキーマに対して検証する
		// 直接的で簡単な方法は提供されていないように見える。
		// 一般的には、データをまずJSONにマーシャルし、それを再度アンマーシャルする際にスキーマ情報を使うなど。

		_ = dataToValidate // Linter の unused variable 警告を回避

		// 簡略化のため、ここでは `k8sSchemaRef.Value.VisitJSON(dataToValidate, ...)` のような
		// カスタムビジターを実装する代わりに、エラー処理のプレースホルダーを置く。
		// 実際のバリデーションエラーをどう取得し、どのフィールドでエラーが起きたかを特定するのが難しい。

		// --- ここからスキーマバリデーションの実装 ---
		validationContext := context.Background() // バリデーション用のコンテキスト (必要に応じてLSPのctxを使う)

		if k8sSchemaRef != nil && k8sSchemaRef.Value != nil {
			schemaToValidate := k8sSchemaRef.Value

			// 1. 必須フィールドのチェック
			for _, requiredFieldName := range schemaToValidate.Required {
				if _, ok := dataToValidate[requiredFieldName]; !ok {
					// エラー位置の特定: このフィールドがdocMappingNodeのどこにあるべきだったか。
					// 現状はdocMappingNodeの戦闘を指す。
					diag := protocol.Diagnostic{
						Range:    getRangeFromNode(docMappingNode), // 親ノードの位置
						Severity: protocol.DiagnosticSeverityError,
						Source:   "kls-schema-validator",
						Message:  fmt.Sprintf("Missing required property: '%s'", requiredFieldName),
					}
					diagnostics = append(diagnostics, diag)
				}
			}

			// 2. プロパティごとの型チェックとスキーマにないプロパティの警告
			for dataKey, dataValue := range dataToValidate {
				propSchemaRef, propExists := schemaToValidate.Properties[dataKey]
				var keyNodeForError *yaml.Node // エラー報告用のキーノード
				// 元のYAMLノードからこのキーに対応するノードを探す
				for i := 0; i < len(docMappingNode.Content); i += 2 {
					kNode := docMappingNode.Content[i]
					if kNode.Kind == yaml.ScalarNode && kNode.Value == dataKey {
						keyNodeForError = kNode
						break
					}
				}

				if !propExists {
					// スキーマに定義されていないプロパティ
					diag := protocol.Diagnostic{
						Range:    getRangeFromNode(keyNodeForError), // 見つかったキーノードの位置
						Severity: protocol.DiagnosticSeverityWarning,
						Source:   "kls-schema-validator",
						Message:  fmt.Sprintf("Property '%s' is not defined in schema for %s/%s", dataKey, apiVersion, kind),
					}
					diagnostics = append(diagnostics, diag)
					continue
				}

				if propSchemaRef != nil && propSchemaRef.Value != nil {
					propSchema := propSchemaRef.Value
					// 型チェック (基本的なもの)
					diags := validateDataType(validationContext, propSchema, dataValue, keyNodeForError, dataKey)
					diagnostics = append(diagnostics, diags...)
					// TODO: ネストされた object や array の再帰的なバリデーション
				}
			}
		}

		// TODO: 実際のスキーマバリデーションとエラー報告ロジックを実装する (これはステップの一部)
		// h.logger.Printf("Schema validation for %s/%s against provided data is not fully implemented yet.", apiVersion, kind)

	}

	return diagnostics
}

// validateDataType は、指定されたスキーマとデータに対して基本的な型チェックを行います。
func validateDataType(ctx context.Context, schema *openapi3.Schema, dataValue interface{}, yamlKeyNode *yaml.Node, dataKey string) []protocol.Diagnostic {
	var diagnostics []protocol.Diagnostic
	if schema.Type == nil || len(*schema.Type) == 0 {
		return diagnostics // スキーマに型指定がなければチェックしようがない
	}
	schemaType := (*schema.Type)[0] // 最初の型定義を使用 (oneOf, anyOf などは別途考慮)

	valid := false
	actualType := fmt.Sprintf("%T", dataValue)

	switch schemaType {
	case "string":
		if _, ok := dataValue.(string); ok {
			valid = true
			// TODO: pattern, minLength, maxLength, format などの検証
		}
	case "integer":
		// YAMLデコード時に数値は float64 になることが多いので、それを考慮
		if _, okFloat := dataValue.(float64); okFloat {
			valid = true // 整数であるかは別途 isIntegerFloat64 のような関数で判定可能
		} else if _, okInt := dataValue.(int); okInt {
			valid = true
		} else if _, okInt64 := dataValue.(int64); okInt64 {
			valid = true
		}
		// TODO: minimum, maximum, multipleOf などの検証
	case "number":
		if _, ok := dataValue.(float64); ok {
			valid = true
		} else if _, ok := dataValue.(int); ok { // 整数も数値型
			valid = true
		}
		// TODO: minimum, maximum, multipleOf などの検証
	case "boolean":
		if _, ok := dataValue.(bool); ok {
			valid = true
		}
	case "object":
		if _, ok := dataValue.(map[string]interface{}); ok {
			valid = true
			// TODO: object 内部のプロパティを再帰的にバリデーション
		}
	case "array":
		if _, ok := dataValue.([]interface{}); ok {
			valid = true
			// TODO: array の items スキーマに対するバリデーション、minItems, maxItemsなど
		}
	}

	if !valid {
		diag := protocol.Diagnostic{
			Range:    getRangeFromNode(yamlKeyNode), // エラー箇所はキーのノードを指す
			Severity: protocol.DiagnosticSeverityError,
			Source:   "kls-schema-validator",
			Message:  fmt.Sprintf("Invalid type for property '%s'. Expected '%s', got '%s'", dataKey, schemaType, actualType),
		}
		diagnostics = append(diagnostics, diag)
	}
	return diagnostics
}

// yamlNodeToMapInterface は、yaml.Node (MappingNodeであると期待される) を
// map[string]interface{} に変換します。これはスキーマバリデーションライブラリでよく使われます。
// 再帰的に呼び出され、ネストされた構造も変換します。
func yamlNodeToMapInterface(node *yaml.Node) (map[string]interface{}, error) {
	if node.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("expected a mapping node, got %v (Line: %d, Col: %d)", node.Kind, node.Line, node.Column)
	}

	resultMap := make(map[string]interface{})

	for i := 0; i < len(node.Content); i += 2 {
		keyNode := node.Content[i]
		valNode := node.Content[i+1]

		if keyNode.Kind != yaml.ScalarNode {
			// キーは常にスカラーであるべき
			return nil, fmt.Errorf("mapping key is not a scalar node (Line: %d, Col: %d)", keyNode.Line, keyNode.Column)
		}
		key := keyNode.Value

		val, err := convertYamlNodeToInterface(valNode)
		if err != nil {
			return nil, fmt.Errorf("error converting value for key '%s': %w", key, err)
		}
		resultMap[key] = val
	}

	return resultMap, nil
}

// convertYamlNodeToInterface は、任意の yaml.Node を対応する Go の interface{} 値に変換します。
func convertYamlNodeToInterface(node *yaml.Node) (interface{}, error) {
	switch node.Kind {
	case yaml.ScalarNode:
		// スカラーノードの場合、タグに基づいて型を変換しようと試みる
		// (例: !!int, !!bool, !!float, !!str)
		// yaml.Node.Value は常に文字列なので、必要に応じてパースする
		// 簡単のため、ここでは文字列としてそのまま返すか、
		// タグに応じた基本的な変換のみを行う。
		// TODO: より厳密な型変換 (node.Tag を見る)
		var v interface{}
		err := node.Decode(&v) // yaml.Node の Decode を使うと型推論してくれる
		if err != nil {
			// Decode が失敗した場合でも、文字列としての値は node.Value にある。
			// フォールバックとして node.Value を使うことを検討できるが、
			// 型情報が重要な場合はエラーとして扱うべき。
			// ここではエラーとして扱う。
			return nil, fmt.Errorf("failed to decode scalar node (Tag: %s, Line: %d, Col: %d): %w", node.Tag, node.Line, node.Column, err)
		}
		return v, nil
	case yaml.MappingNode:
		// マッピングノードの場合は再帰的に yamlNodeToMapInterface を呼び出す
		return yamlNodeToMapInterface(node)
	case yaml.SequenceNode:
		// シーケンスノードの場合はスライスに変換
		var slice []interface{}
		for _, itemNode := range node.Content {
			itemVal, err := convertYamlNodeToInterface(itemNode)
			if err != nil {
				return nil, fmt.Errorf("error converting sequence item: %w", err)
			}
			slice = append(slice, itemVal)
		}
		return slice, nil
	case yaml.AliasNode:
		// エイリアスノードの場合は、参照先のノード (Anchor) を解決して変換
		// yaml.Node は直接 Anchor を解決する機能を持たないため、
		// yaml.Unmarshal を使ってドキュメント全体を一度 interface{} にパースするなど、
		// より高度な処理が必要になる場合がある。
		// ここでは単純化のため、エイリアスは未サポートとしてエラーにするか、
		// Alias 自体の Value (通常はアンカー名) を返すことを検討。
		// 実際には、kin-openapi のバリデーションは map[string]interface{} で行われ、
		// yaml.Unmarshal で一度汎用 interface{} に変換すればエイリアスは解決される。
		// しかし、ここでは yaml.Node から直接変換しようとしているため、この問題に直面する。
		// 簡単のため、Alias はエラーとする。
		return nil, fmt.Errorf("alias nodes are not directly supported in this conversion (Line: %d, Col: %d)", node.Line, node.Column)
	default:
		return nil, fmt.Errorf("unsupported yaml node kind: %v (Line: %d, Col: %d)", node.Kind, node.Line, node.Column)
	}
}

// getRangeFromNode は yaml.Node から protocol.Range を生成します。
// Node が nil の場合や Line/Column が 0 の場合はデフォルトの範囲を返します。
func getRangeFromNode(node *yaml.Node) protocol.Range {
	if node == nil || node.Line == 0 {
		return protocol.Range{
			Start: protocol.Position{Line: 0, Character: 0},
			End:   protocol.Position{Line: 0, Character: 1},
		}
	}
	// yaml.Node の Line/Column は1ベースなので、LSP の0ベースに変換
	startLine := uint32(node.Line - 1)
	startChar := uint32(node.Column - 1)

	//終了位置は、スカラーノードであれば値の長さを考慮できるが、
	//より複雑なノードやキーノードの場合は単純ではない。
	//ここではキーノードの値の長さを仮に終了位置とする (単純なケース)
	endChar := startChar + uint32(len(node.Value)) // ScalarNode の場合
	if node.Kind != yaml.ScalarNode || node.Value == "" {
		endChar = startChar + 1 // スカラーでない、または値が空なら1文字分
	}
	// 同じ行の終わりとする
	endLine := startLine

	return protocol.Range{
		Start: protocol.Position{Line: startLine, Character: startChar},
		End:   protocol.Position{Line: endLine, Character: endChar},
	}
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
