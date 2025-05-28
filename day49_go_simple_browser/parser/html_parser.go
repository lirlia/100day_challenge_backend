package parser

import (
	"fmt"
	"strings"

	"golang.org/x/net/html"
)

// ParseHTML は HTML文字列をパースし、DOMツリーのルートノードを返します。
func ParseHTML(htmlContent string) (*html.Node, error) {
	reader := strings.NewReader(htmlContent)
	doc, err := html.Parse(reader)
	if err != nil {
		return nil, fmt.Errorf("failed to parse HTML: %w", err)
	}
	return doc, nil
}

// FindElement は指定されたタグ名の最初の要素を再帰的に検索します。
func FindElement(node *html.Node, tagName string) *html.Node {
	if node.Type == html.ElementNode && node.Data == tagName {
		return node
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if result := FindElement(child, tagName); result != nil {
			return result
		}
	}
	return nil
}

// GetTextContent はノードとその子ノードからテキストコンテンツを抽出します。
func GetTextContent(node *html.Node) string {
	if node.Type == html.TextNode {
		return node.Data
	}
	var text strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		text.WriteString(GetTextContent(child))
	}
	return text.String()
}

// GetAttribute は指定された属性の値を返します。
func GetAttribute(node *html.Node, attrName string) string {
	for _, attr := range node.Attr {
		if attr.Key == attrName {
			return attr.Val
		}
	}
	return ""
}

// DebugPrintNode はノードツリーをデバッグ用に出力します（開発用）。
func DebugPrintNode(node *html.Node, depth int) {
	indent := strings.Repeat("  ", depth)
	switch node.Type {
	case html.ElementNode:
		fmt.Printf("%s<%s", indent, node.Data)
		for _, attr := range node.Attr {
			fmt.Printf(" %s=\"%s\"", attr.Key, attr.Val)
		}
		fmt.Printf(">\n")
	case html.TextNode:
		if trimmed := strings.TrimSpace(node.Data); trimmed != "" {
			fmt.Printf("%s\"%s\"\n", indent, trimmed)
		}
	case html.DocumentNode:
		fmt.Printf("%s[Document]\n", indent)
	case html.CommentNode:
		fmt.Printf("%s<!-- %s -->\n", indent, node.Data)
	}

	for child := node.FirstChild; child != nil; child = child.NextSibling {
		DebugPrintNode(child, depth+1)
	}
}

// FindAllFrames は指定されたノードから全ての <frame> 要素を検索します。
func FindAllFrames(node *html.Node) []*html.Node {
	var frames []*html.Node
	findFramesRecursive(node, &frames)
	return frames
}

// findFramesRecursive は再帰的に <frame> 要素を検索します。
func findFramesRecursive(node *html.Node, frames *[]*html.Node) {
	if node.Type == html.ElementNode && node.Data == "frame" {
		*frames = append(*frames, node)
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		findFramesRecursive(child, frames)
	}
}
