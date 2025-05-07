package lsp

import (
	"fmt"
	"log"

	protocol "go.lsp.dev/protocol"
	"gopkg.in/yaml.v3"
)

// findNodeAtPosition は、YAMLコンテンツとカーソル位置から、該当するyaml.Nodeとキーパスを見つけます。
// 実装はまだ不完全で、基本的な構造のみです。
func findNodeAtPosition(content string, pos protocol.Position, logger *log.Logger) (*yaml.Node, []string, error) {
	var root yaml.Node
	err := yaml.Unmarshal([]byte(content), &root)
	if err != nil {
		return nil, nil, fmt.Errorf("failed to unmarshal yaml: %w", err)
	}

	// yaml.NodeのLine/Columnは1-indexed, protocol.Positionは0-indexed
	// targetLine := pos.Line + 1
	// targetChar := pos.Character + 1 // CharacterはUTF-16オフセットの場合もあるので注意が必要だが、ここではバイトオフセットとして扱う

	// DocumentNodeがルートの場合、その最初のコンテンツノードから探索を開始
	if root.Kind == yaml.DocumentNode && len(root.Content) > 0 {
		return findNodeRecursive(root.Content[0], pos, []string{}, logger)
	}
	return findNodeRecursive(&root, pos, []string{}, logger)
}

// findNodeRecursive はyaml.Nodeを再帰的に探索し、指定位置に合致するノードとキーパスを返します。
// キーパスは、ルートからそのノードに至るまでのマップキーのリストです。
// シーケンスのインデックスは現在の実装ではキーパスに含めません。
func findNodeRecursive(node *yaml.Node, pos protocol.Position, currentPath []string, logger *log.Logger) (*yaml.Node, []string, error) {
	if node == nil {
		return nil, nil, nil
	}

	// まず、現在のノードの範囲内にカーソルがない場合は、この分岐を探索しない
	// (ただし、yaml_utils.go の isPositionInsideNode の初期実装は非常に雑な点に注意)
	if !isPositionInsideNode(node, pos, logger) {
		// logger.Printf("Pruning branch, cursor not inside node: Kind=%v, Path=%v", node.Kind, currentPath)
		return nil, nil, nil
	}
	// logger.Printf("Continuing search, cursor potentially inside node: Kind=%v, Value='%s', Path=%v", node.Kind, node.Value, currentPath)

	// カーソル位置 (0-indexed)
	cursorLine := int(pos.Line)
	cursorChar := int(pos.Character)

	// ノードの開始位置 (yaml.v3 は 1-indexed)
	// nodeStartLine := node.Line - 1 // isPositionInsideNode にロジックを集約するためコメントアウト
	// nodeStartChar := node.Column - 1 // isPositionInsideNode にロジックを集約するためコメントアウト

	// TODO: ノードの終了位置を正確に把握するロジックが必要
	// 現状では、ノードの開始位置のみで判定を試みるが、不正確。
	// 特にScalarNodeの場合、内容の長さを考慮する必要がある。
	// MappingNodeやSequenceNodeの場合、その子要素全体の範囲となる。

	// logger.Printf("Checking node: Kind=%v, Tag=%s, Value='%s', Line=%d, Col=%d (0-indexed: L%d, C%d) against Cursor: L%d, C%d, Path: %v",
	// 	node.Kind, node.Tag, node.Value, node.Line, node.Column, nodeStartLine, nodeStartChar, cursorLine, cursorChar, currentPath)

	// 最も単純なチェック: カーソルが行範囲内にあり、かつ開始行の場合はカラムも範囲内か
	// これはノードの「開始点」のみを見ているため、非常に不正確。
	// ノードが複数行にまたがる場合や、1行内でもノードの「幅」を考慮する必要がある。
	// if cursorLine == nodeStartLine && cursorChar >= nodeStartChar {
	// 	// このノードがターゲットである可能性が高い (より深いノードがなければ)
	// } else if cursorLine > nodeStartLine {
	// 	// カーソルがノードの開始行より後だが、ノードが複数行にまたがる場合がある
	// } else {
	// 	return nil, nil, nil // カーソルはこのノードより前なので、この分岐は対象外
	// }

	switch node.Kind {
	case yaml.DocumentNode:
		if len(node.Content) > 0 {
			// DocumentNode の最初の子供は必ず探索 (isPositionInsideNode は上でチェック済み)
			return findNodeRecursive(node.Content[0], pos, currentPath, logger)
		}
	case yaml.MappingNode:
		// var bestMatchNode *yaml.Node
		// var bestMatchPath []string

		for i := 0; i < len(node.Content); i += 2 {
			keyNode := node.Content[i]
			valNode := node.Content[i+1]

			// キーノード自体にホバーしているかチェック
			// keyNodeStartLine := keyNode.Line - 1
			// keyNodeStartCol := keyNode.Column - 1
			// keyNodeEndCol := keyNodeStartCol + len(keyNode.Value) // 単純な長さ

			if cursorLine == keyNode.Line && cursorChar >= keyNode.Column {
				newPath := append(currentPath, keyNode.Value)
				// logger.Printf("Cursor directly on Key node: '%s', Path: %v", keyNode.Value, newPath)
				return keyNode, newPath, nil
			}

			// 値ノードを再帰的に探索 (値ノードの範囲内かチェックしてから)
			if isPositionInsideNode(valNode, pos, logger) { // valNode の範囲内かチェック
				// logger.Printf("Recursively checking value node for key '%s'", keyNode.Value)
				if resNode, resPath, _ := findNodeRecursive(valNode, pos, append(currentPath, keyNode.Value), logger); resNode != nil {
					// より具体的な子ノードが見つかった
					// logger.Printf("Found deeper node for key '%s': Kind=%v, Path=%v", keyNode.Value, resNode.Kind, resPath)
					return resNode, resPath, nil
				}
			}
		}
		// ループで見つからなかったが、カーソルがMappingNode自体の中にある場合は、このMappingNodeを返す
		// (isPositionInsideNode(node, pos, logger) は既に true であることが保証されている)
		// logger.Printf("No deeper child in MappingNode, returning MappingNode itself. Path: %v", currentPath)
		return node, currentPath, nil

	case yaml.SequenceNode:
		for _, itemNode := range node.Content {
			if isPositionInsideNode(itemNode, pos, logger) { // itemNode の範囲内かチェック
				// logger.Printf("Recursively checking sequence item")
				if resNode, resPath, _ := findNodeRecursive(itemNode, pos, currentPath, logger); resNode != nil {
					// logger.Printf("Found deeper node in sequence: Kind=%v, Path=%v", resNode.Kind, resPath)
					return resNode, resPath, nil
				}
			}
		}
		// ループで見つからなかったが、カーソルがSequenceNode自体の中にある場合は、このSequenceNodeを返す
		// logger.Printf("No deeper child in SequenceNode, returning SequenceNode itself. Path: %v", currentPath)
		return node, currentPath, nil

	case yaml.ScalarNode:
		// ScalarNode の場合、isPositionInsideNode(node, pos, logger) が true ならば、
		// そしてこれ以上深掘りできないので、このノードが最終候補。
		// より正確な範囲チェックは isPositionInsideNode に委ねる。
		// logger.Printf("Cursor is on Scalar node (determined by isPositionInsideNode): '%s', Path: %v", node.Value, currentPath)
		return node, currentPath, nil

	case yaml.AliasNode:
		logger.Printf("Alias node encountered, not handled yet. Path: %v", currentPath)
		// AliasNodeもScalarNodeと同様に扱えるかもしれないが、まずはログのみ
		return node, currentPath, nil // AliasNode自体を返す
	}

	// logger.Printf("Fell through switch, returning current node as fallback (should ideally be covered by switch cases for valid nodes if isPositionInsideNode is true): Kind=%v, Path=%v", node.Kind, currentPath)
	// isPositionInsideNode が true であれば、上記の switch で何かしら node が返されるはず
	// ただし、空の DocumentNode などエッジケースがあるかもしれないので、念のため
	if node.Kind == yaml.MappingNode || node.Kind == yaml.SequenceNode || node.Kind == yaml.ScalarNode || node.Kind == yaml.AliasNode {
		return node, currentPath, nil
	}

	return nil, nil, nil // 基本的にはここに到達しないはず
}

// isPositionInsideNode は、カーソル位置がノードの範囲内にあるかを判定します。
func isPositionInsideNode(node *yaml.Node, pos protocol.Position, logger *log.Logger) bool {
	if node == nil {
		return false
	}
	cursorLine := int(pos.Line)
	cursorChar := int(pos.Character)

	nodeStartLine := node.Line - 1   // 0-indexed
	nodeStartChar := node.Column - 1 // 0-indexed

	switch node.Kind {
	case yaml.ScalarNode:
		// 単一行スカラーを想定 (複数行スカラーは別途対応が必要)
		// TODO: 複数行スカラーノードの正確な範囲判定 (Value内の改行と最終行の長さを考慮)
		if cursorLine == nodeStartLine {
			// スカラーノードの終了文字位置 (その行内での終端、Valueの長さに基づく)
			nodeEndCharInLine := nodeStartChar + len(node.Value)
			return cursorChar >= nodeStartChar && cursorChar < nodeEndCharInLine
		}
		// カーソル行がノードの開始行と異なる場合は範囲外 (単一行スカラーの前提)
		return false

	case yaml.MappingNode, yaml.SequenceNode:
		var estimatedEndLine int
		if len(node.Content) > 0 {
			// 子要素が存在する場合、親ノードの範囲は最後の子要素が「始まる」行までと近似する。
			// つまり、親ノードは最後の子要素の行を含んで表示されるという考え方。
			lastChild := node.Content[len(node.Content)-1]
			estimatedEndLine = lastChild.Line - 1 // 0-indexed
		} else {
			// 子要素がない場合 (例: `key: {}`, `key: []`, または単に `key:`)
			// 親ノードはそれ自体が開始行で完結すると見なす。
			estimatedEndLine = nodeStartLine
		}

		// 1. カーソル行が、ノードの開始行より前か、推定終了行より後なら範囲外。
		if cursorLine < nodeStartLine || cursorLine > estimatedEndLine {
			return false
		}
		// 2. カーソル行がノードの開始行と同じ場合、カーソル文字がノードの開始文字より前なら範囲外。
		if cursorLine == nodeStartLine && cursorChar < nodeStartChar {
			return false
		}
		// 3. カーソル行がノードの推定終了行と同じ場合、
		//    より正確にはその行のどの文字までが範囲内かを判定する必要がある。
		//    現状の近似では、ここまでのチェックを通過すれば範囲内と見なす。
		//    (例: `key:\n  child:` の場合、`key:` の行の最後までが範囲)
		// TODO: estimatedEndLine における正確な終了文字位置の判定。
		//       特に、最後の子がインデントされている場合や、FlowStyleの場合の考慮。

		return true // 上記チェックを通過すれば、大まかには範囲内

	default: // yaml.DocumentNode, yaml.AliasNode およびその他の未知のKind
		// 元の単純なロジック: カーソル行がノードの開始行以降であれば範囲内と見なす。
		// AliasNodeは解決された先のノードで判定すべきだが、ここではAlias自体を指す場合。
		return cursorLine >= nodeStartLine
	}
}
