package lsp

import (
	"context"
	"fmt"
	"log"

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
				diags := h.validateK8sStructure(ctx, docNode)
				diagnostics = append(diagnostics, diags...)
			}
		}
	} else if rootNode.Kind == yaml.MappingNode {
		// 単一のYAMLドキュメントの場合
		diags := h.validateK8sStructure(ctx, &rootNode)
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
func (h *Handler) validateK8sStructure(ctx context.Context, docMappingNode *yaml.Node) []protocol.Diagnostic {
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
		// kin-openapi の Issues や Example を見ると、個別のデータ片をスキーマに対して検証する
		// 直接的で簡単な方法は提供されていないように見える。
		// 一般的には、データをまずJSONにマーシャルし、それを再度アンマーシャルする際にスキーマ情報を使うなど。

		// ここで ValidateObjectProperties を呼び出して詳細な検証を開始する
		if k8sSchemaRef != nil && k8sSchemaRef.Value != nil && dataToValidate != nil {
			validationDiagnostics := ValidateObjectProperties(ctx, k8sSchemaRef.Value, dataToValidate, docMappingNode, "", h.logger)
			diagnostics = append(diagnostics, validationDiagnostics...)
			h.logger.Printf("Completed schema validation. Found %d potential issues.", len(validationDiagnostics))
		}

	}
	return diagnostics
}

// validateDataType は、指定されたスキーマとデータに対して基本的な型チェックを行います。
func validateDataType(ctx context.Context, schema *openapi3.Schema, dataValue interface{}, yamlKeyNode *yaml.Node, dataKey string, logger *log.Logger) []protocol.Diagnostic {
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
		if typedDataValue, ok := dataValue.(map[string]interface{}); ok {
			valid = true
			// object 内部のプロパティを再帰的にバリデーション
			// yamlKeyNode はこの object を指すキー。実際の object の yaml.Node を見つける必要がある。
			// var objectYamlNode *yaml.Node // Linterエラーのためコメントアウト (将来的に使用する可能性あり)
			// yamlKeyNode の兄弟ノード (値ノード) が目的の MappingNode のはず
			// ただし、yamlKeyNode を直接の親として再帰的に探す方が堅牢かもしれない。
			// ここでは、docMappingNode (ルートレベルのオブジェクト) から dataKey で子を探し、それが object であるとするアプローチは不十分。
			// validateK8sStructure はドキュメントルートの構造を検証するため、再利用は難しい。
			// 新しいヘルパーが必要。
			// dataValue (map[string]interface{}) と schema.Properties を使って検証する。
			// エラー位置特定のために、この dataValue に対応する yaml.Node (MappingNode) が必要。
			// yamlKeyNode は親オブジェクトのフィールドキーを指す。その「値」がこのオブジェクト。
			// 簡単のため、ここではネストされたオブジェクトの yaml.Node の特定は一旦保留し、
			// エラーメッセージは親キーを示す。

			nestedDiagnostics := ValidateObjectProperties(ctx, schema, typedDataValue, yamlKeyNode /* placeholder */, dataKey, logger)
			diagnostics = append(diagnostics, nestedDiagnostics...)
		}
	case "array":
		if typedDataValue, ok := dataValue.([]interface{}); ok {
			valid = true
			// array の items スキーマに対するバリデーション、minItems, maxItemsなど
			if schema.Items != nil && schema.Items.Value != nil {
				itemSchema := schema.Items.Value
				for i, itemData := range typedDataValue {
					// 各アイテムに対応する YAML ノードを見つけるのは難しい。
					// エラーは配列全体か、インデックスを示す形になる。
					// 簡単のため、エラー位置は親配列のキーノードとする。
					itemDiagnostics := validateDataType(ctx, itemSchema, itemData, yamlKeyNode, fmt.Sprintf("%s[%d]", dataKey, i), logger)
					diagnostics = append(diagnostics, itemDiagnostics...)
				}
			}
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

// ValidateObjectProperties は、オブジェクトのプロパティをスキーマに基づいて検証します。
// baseDataPath はエラーメッセージ用です (例: "metadata.labels")
// parentYamlNode は、このオブジェクトが含まれる親の構造の中での、このオブジェクト自体を指す yaml.Node であるべきだが、
// 現在の実装では、オブジェクトの「キー」を指す yamlNode を渡しているため、位置特定が不正確になる可能性がある。
func ValidateObjectProperties(ctx context.Context, objectSchema *openapi3.Schema, data map[string]interface{}, parentYamlNode *yaml.Node, baseDataPath string, logger *log.Logger) []protocol.Diagnostic {
	var diagnostics []protocol.Diagnostic

	// 1. 必須フィールドのチェック
	for _, requiredFieldName := range objectSchema.Required {
		if _, ok := data[requiredFieldName]; !ok {
			// 必須フィールドが見つからない場合のエラー位置は、そのフィールドが含まれるべき親オブジェクトを示すのが妥当
			// parentYamlNode は現在その親オブジェクトのキーまたは親オブジェクト自体を指しているはず
			diag := protocol.Diagnostic{
				Range:    getRangeFromNode(parentYamlNode),
				Severity: protocol.DiagnosticSeverityError,
				Source:   "kls-schema-validator",
				Message:  fmt.Sprintf("Missing required property: '%s' in object '%s'", requiredFieldName, baseDataPath),
			}
			diagnostics = append(diagnostics, diag)
		}
	}

	// 2. プロパティごとの型チェックとスキーマにないプロパティの警告、および再帰的な検証
	for dataKey, dataValue := range data {
		propSchemaRef, propExists := objectSchema.Properties[dataKey]
		currentDataPath := baseDataPath
		if baseDataPath == "" {
			currentDataPath = dataKey
		} else {
			currentDataPath = baseDataPath + "." + dataKey
		}

		// dataKey に対応するキーノードを親の YAML ノードから探す
		// これにより、エラーメッセージの Range をより正確に設定できる
		var keyNodeForError *yaml.Node = findKeyNodeInMapping(parentYamlNode, dataKey)

		if !propExists {
			diag := protocol.Diagnostic{
				Range:    getRangeFromNode(keyNodeForError), // 未定義プロパティのキーを指す
				Severity: protocol.DiagnosticSeverityWarning,
				Source:   "kls-schema-validator",
				Message:  fmt.Sprintf("Property '%s' is not defined in schema for object '%s'", dataKey, baseDataPath),
			}
			diagnostics = append(diagnostics, diag)
			continue
		}

		if propSchemaRef != nil && propSchemaRef.Value != nil {
			propSchema := propSchemaRef.Value

			// 型チェック (基本的な型に対して)
			typeDiags := validateDataType(ctx, propSchema, dataValue, keyNodeForError, currentDataPath, logger)
			diagnostics = append(diagnostics, typeDiags...)

			// --- 再帰処理 ---
			actualSchemaType := "" // Use a more robust way to get schema type
			if propSchema.Type != nil && len(*propSchema.Type) > 0 {
				actualSchemaType = (*propSchema.Type)[0]
			}

			// プロパティがオブジェクトの場合
			if actualSchemaType == "object" {
				if subObjectData, ok := dataValue.(map[string]interface{}); ok {
					// subObjectNode は dataValue (オブジェクト) に対応する YAML マッピングノード
					subObjectNode := findValueNodeForKey(parentYamlNode, dataKey)
					if subObjectNode != nil && subObjectNode.Kind == yaml.MappingNode {
						subDiagnostics := ValidateObjectProperties(ctx, propSchema, subObjectData, subObjectNode, currentDataPath, logger) // logger を渡す
						diagnostics = append(diagnostics, subDiagnostics...)
					} else if subObjectNode == nil {
						logger.Printf("Debug (ValidateObjectProperties): Could not find YAML MappingNode for sub-object key '%s' at path '%s'", dataKey, currentDataPath)
					} else {
						logger.Printf("Debug (ValidateObjectProperties): Expected YAML MappingNode for sub-object key '%s' at path '%s', got kind %v", dataKey, currentDataPath, subObjectNode.Kind)
					}
				} else {
					// dataValue が期待した map[string]interface{} 型でない場合 (型の不一致)
					// validateDataType で既にエラーが出ているはずだが、念のためログ
					logger.Printf("Debug (ValidateObjectProperties): Expected map[string]interface{} for object type at path '%s', got %T", currentDataPath, dataValue)
				}
			} else if actualSchemaType == "array" && propSchema.Items != nil && propSchema.Items.Value != nil {
				// プロパティが配列の場合
				itemsSchema := propSchema.Items.Value // 配列の各要素のスキーマ
				itemsActualSchemaType := ""
				if itemsSchema.Type != nil && len(*itemsSchema.Type) > 0 {
					itemsActualSchemaType = (*itemsSchema.Type)[0]
				}

				if itemsActualSchemaType == "object" { // 配列の要素がオブジェクトの場合のみ再帰
					if subArrayData, ok := dataValue.([]interface{}); ok {
						// subArrayNode は dataValue (配列) に対応する YAML シーケンスノード
						subArrayNode := findValueNodeForKey(parentYamlNode, dataKey)
						if subArrayNode != nil && subArrayNode.Kind == yaml.SequenceNode {
							for i, itemInterface := range subArrayData {
								if itemMap, ok := itemInterface.(map[string]interface{}); ok {
									itemPath := fmt.Sprintf("%s[%d]", currentDataPath, i)
									// itemNode は配列の i 番目の要素に対応する YAML ノード (マッピングノードのはず)
									var itemNode *yaml.Node
									if i < len(subArrayNode.Content) {
										itemNode = subArrayNode.Content[i]
									}

									if itemNode != nil && itemNode.Kind == yaml.MappingNode {
										itemDiagnostics := ValidateObjectProperties(ctx, itemsSchema, itemMap, itemNode, itemPath, logger) // logger を渡す
										diagnostics = append(diagnostics, itemDiagnostics...)
									} else if itemNode == nil {
										logger.Printf("Debug (ValidateObjectProperties): Could not find YAML Node for array item at path '%s'", itemPath)
									} else {
										logger.Printf("Debug (ValidateObjectProperties): Expected YAML MappingNode for array item at path '%s', got kind %v", itemPath, itemNode.Kind)
									}
								} else {
									// 配列要素が期待した map[string]interface{} 型でない場合
									logger.Printf("Debug (ValidateObjectProperties): Expected map[string]interface{} for array item at path '%s[%d]', got %T", currentDataPath, i, itemInterface)
								}
							}
						} else if subArrayNode == nil {
							logger.Printf("Debug (ValidateObjectProperties): Could not find YAML SequenceNode for array key '%s' at path '%s'", dataKey, currentDataPath)
						} else {
							logger.Printf("Debug (ValidateObjectProperties): Expected YAML SequenceNode for array key '%s' at path '%s', got kind %v", dataKey, currentDataPath, subArrayNode.Kind)
						}
					} else {
						// dataValue が期待した []interface{} 型でない場合
						logger.Printf("Debug (ValidateObjectProperties): Expected []interface{} for array type at path '%s', got %T", currentDataPath, dataValue)
					}
				}
			}
			// --- 再帰処理ここまで ---
		}
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
