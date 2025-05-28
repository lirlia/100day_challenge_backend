package renderer

import (
	"fmt"
	"image/color"
	"strconv"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
	"golang.org/x/net/html"

	"github.com/lirlia/100day_challenge_backend/day49_go_simple_browser/parser"
)

// RenderHTML は DOMツリーを受け取り、Fyneウィジェットのスライスに変換します。
func RenderHTML(root *html.Node) []fyne.CanvasObject {
	var widgets []fyne.CanvasObject

	// <body> タグを探す（Frameset構造の場合は適宜調整）
	bodyNode := parser.FindElement(root, "body")
	if bodyNode == nil {
		// <frameset> 構造の場合や <body> が見つからない場合は、全体から要素を抽出
		bodyNode = root
	}

	// body要素内をレンダリング
	renderNodeImproved(bodyNode, &widgets)

	return widgets
}

// renderNodeImproved は改良されたレンダリング関数です。
func renderNodeImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	if node == nil {
		return
	}

	switch node.Type {
	case html.ElementNode:
		renderElementImproved(node, widgets)
	case html.TextNode:
		// テキストノードは個別に処理せず、親要素でまとめて処理
	}

	// ブロックレベル要素以外の場合のみ子要素を再帰処理
	if !isBlockElement(node.Data) {
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			renderNodeImproved(child, widgets)
		}
	}
}

// isBlockElement はブロックレベル要素かどうかを判定します。
func isBlockElement(tagName string) bool {
	blockElements := map[string]bool{
		"div": true, "p": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
		"table": true, "tr": true, "td": true, "th": true, "center": true, "br": true,
		"frameset": true, "frame": true,
	}
	return blockElements[strings.ToLower(tagName)]
}

// renderElementImproved は改良されたHTML要素レンダリング関数です。
func renderElementImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	switch strings.ToLower(node.Data) {
	case "h1", "h2", "h3", "h4", "h5", "h6":
		renderHeadingImproved(node, widgets)
	case "p":
		renderParagraphImproved(node, widgets)
	case "br":
		*widgets = append(*widgets, widget.NewLabel(""))
	case "a":
		renderLinkImproved(node, widgets)
	case "font":
		renderFontImproved(node, widgets)
	case "center":
		renderCenterImproved(node, widgets)
	case "table":
		renderTableImproved(node, widgets)
	case "img":
		renderImageImproved(node, widgets)
	case "frameset":
		renderFramesetImproved(node, widgets)
	case "frame":
		renderFrameImproved(node, widgets)
	case "ul", "ol":
		renderListImproved(node, widgets)
	case "li":
		renderListItemImproved(node, widgets)
	default:
		// その他の要素（div, span等）はテキスト内容を抽出
		text := extractTextContent(node)
		if strings.TrimSpace(text) != "" {
			*widgets = append(*widgets, widget.NewLabel(text))
		}
	}
}

// extractTextContent はノードからテキスト内容を抽出し、適切にフォーマットします。
func extractTextContent(node *html.Node) string {
	if node.Type == html.TextNode {
		return node.Data
	}

	var textBuilder strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.TextNode {
			textBuilder.WriteString(child.Data)
		} else if child.Type == html.ElementNode {
			// インライン要素の場合はテキストを続ける
			if !isBlockElement(child.Data) {
				textBuilder.WriteString(extractTextContent(child))
			}
		}
	}

	// 余分な空白を正規化
	text := textBuilder.String()
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.ReplaceAll(text, "\t", " ")
	// 連続する空白を1つにまとめる
	for strings.Contains(text, "  ") {
		text = strings.ReplaceAll(text, "  ", " ")
	}
	return strings.TrimSpace(text)
}

// renderHeadingImproved は改良された見出しレンダリング関数です。
func renderHeadingImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	text := extractTextContent(node)
	if text == "" {
		return
	}

	// 前に空行を追加（見出しの前のスペース）
	*widgets = append(*widgets, widget.NewLabel(""))

	label := widget.NewLabel(text)
	label.TextStyle = fyne.TextStyle{Bold: true}

	// ヘッダーレベルに応じてサイズ調整（Fyneでは制限があるので、大きなフォントサイズはRichTextを使用）
	switch node.Data {
	case "h1":
		richText := widget.NewRichTextFromMarkdown("# " + text)
		*widgets = append(*widgets, richText)
		return
	case "h2":
		richText := widget.NewRichTextFromMarkdown("## " + text)
		*widgets = append(*widgets, richText)
		return
	default:
		*widgets = append(*widgets, label)
	}

	// 見出し後に空行
	*widgets = append(*widgets, widget.NewLabel(""))
}

// renderParagraphImproved は改良された段落レンダリング関数です。
func renderParagraphImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	text := extractTextContent(node)
	if text == "" {
		return
	}

	*widgets = append(*widgets, widget.NewLabel(text))
	*widgets = append(*widgets, widget.NewLabel("")) // 段落後の空行
}

// renderFontImproved は改良された<font>要素レンダリング関数です。
func renderFontImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	text := extractTextContent(node)
	if text == "" {
		return
	}

	// color属性をチェック
	colorAttr := parser.GetAttribute(node, "color")
	if colorAttr != "" {
		if c := parseColor(colorAttr); c != nil {
			richText := canvas.NewText(text, c)
			richText.TextSize = 14 // デフォルトサイズ

			// size属性をチェック
			sizeAttr := parser.GetAttribute(node, "size")
			if sizeAttr != "" {
				if size, err := strconv.Atoi(sizeAttr); err == nil {
					// HTML font size を実際のサイズに変換
					switch {
					case size <= 1:
						richText.TextSize = 10
					case size == 2:
						richText.TextSize = 12
					case size == 3:
						richText.TextSize = 14
					case size == 4:
						richText.TextSize = 16
					case size == 5:
						richText.TextSize = 18
					case size >= 6:
						richText.TextSize = 24
					}
				}
			}

			*widgets = append(*widgets, richText)
			return
		}
	}

	// 色が指定されていない場合は通常のラベル
	label := widget.NewLabel(text)
	*widgets = append(*widgets, label)
}

// renderCenterImproved は改良されたセンター要素レンダリング関数です。
func renderCenterImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	text := extractTextContent(node)
	if text == "" {
		return
	}

	label := widget.NewLabel(text)
	centeredContainer := container.NewCenter(label)
	*widgets = append(*widgets, centeredContainer)
}

// renderTableImproved は改良されたテーブルレンダリング関数です。
func renderTableImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	*widgets = append(*widgets, widget.NewLabel(""))
	*widgets = append(*widgets, widget.NewLabel("┌─ Table ─┐"))

	// テーブル内の各行を処理
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && strings.ToLower(child.Data) == "tr" {
			renderTableRowImproved(child, widgets)
		}
	}

	*widgets = append(*widgets, widget.NewLabel("└─────────┘"))
	*widgets = append(*widgets, widget.NewLabel(""))
}

// renderTableRowImproved は改良されたテーブル行レンダリング関数です。
func renderTableRowImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	var rowCells []string

	// 行内のセルを収集
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && (strings.ToLower(child.Data) == "td" || strings.ToLower(child.Data) == "th") {
			cellText := extractTextContent(child)
			if cellText != "" {
				rowCells = append(rowCells, cellText)
			}
		}
	}

	// セルをパイプ区切りで表示
	if len(rowCells) > 0 {
		rowText := "│ " + strings.Join(rowCells, " │ ") + " │"
		*widgets = append(*widgets, widget.NewLabel(rowText))
	}
}

// renderListImproved はリストレンダリング関数です。
func renderListImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	*widgets = append(*widgets, widget.NewLabel(""))

	// リスト項目を処理
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && strings.ToLower(child.Data) == "li" {
			renderListItemImproved(child, widgets)
		}
	}

	*widgets = append(*widgets, widget.NewLabel(""))
}

// renderListItemImproved はリスト項目レンダリング関数です。
func renderListItemImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	text := extractTextContent(node)
	if text != "" {
		*widgets = append(*widgets, widget.NewLabel("• "+text))
	}
}

// renderLinkImproved は改良されたリンクレンダリング関数です。
func renderLinkImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	href := parser.GetAttribute(node, "href")
	text := extractTextContent(node)
	if text == "" {
		text = href
	}

	if href != "" {
		link := widget.NewHyperlink(text, nil)
		*widgets = append(*widgets, link)
	} else {
		*widgets = append(*widgets, widget.NewLabel(text))
	}
}

// renderImageImproved は改良された画像レンダリング関数です。
func renderImageImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	src := parser.GetAttribute(node, "src")
	alt := parser.GetAttribute(node, "alt")

	if alt == "" {
		alt = "Image"
	}

	placeholder := fmt.Sprintf("🖼️ [%s]", alt)
	if src != "" {
		placeholder += fmt.Sprintf(" (%s)", src)
	}

	*widgets = append(*widgets, widget.NewLabel(placeholder))
}

// renderFramesetImproved は改良されたフレームセットレンダリング関数です。
func renderFramesetImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	*widgets = append(*widgets, widget.NewLabel(""))
	*widgets = append(*widgets, widget.NewLabel("🌐 === フレームセット構造検出 ==="))

	cols := parser.GetAttribute(node, "cols")
	rows := parser.GetAttribute(node, "rows")
	if cols != "" {
		*widgets = append(*widgets, widget.NewLabel("📐 カラム: "+cols))
	}
	if rows != "" {
		*widgets = append(*widgets, widget.NewLabel("📐 行: "+rows))
	}
	*widgets = append(*widgets, widget.NewLabel(""))
}

// renderFrameImproved は改良されたフレームレンダリング関数です。
func renderFrameImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	src := parser.GetAttribute(node, "src")
	name := parser.GetAttribute(node, "name")

	frameInfo := "📄 フレーム: "
	if name != "" {
		frameInfo += name + " "
	}
	if src != "" {
		frameInfo += "(" + src + ")"
	}

	*widgets = append(*widgets, widget.NewLabel(frameInfo))
}

// parseColor は色文字列をcolor.Colorに変換します。
func parseColor(colorStr string) color.Color {
	colorStr = strings.ToLower(strings.TrimSpace(colorStr))

	// 名前付きカラー
	switch colorStr {
	case "red":
		return color.RGBA{R: 255, G: 0, B: 0, A: 255}
	case "green":
		return color.RGBA{R: 0, G: 128, B: 0, A: 255}
	case "blue":
		return color.RGBA{R: 0, G: 0, B: 255, A: 255}
	case "black":
		return color.RGBA{R: 0, G: 0, B: 0, A: 255}
	case "white":
		return color.RGBA{R: 255, G: 255, B: 255, A: 255}
	case "yellow":
		return color.RGBA{R: 255, G: 255, B: 0, A: 255}
	case "purple", "magenta":
		return color.RGBA{R: 128, G: 0, B: 128, A: 255}
	case "cyan":
		return color.RGBA{R: 0, G: 255, B: 255, A: 255}
	case "orange":
		return color.RGBA{R: 255, G: 165, B: 0, A: 255}
	case "gray", "grey":
		return color.RGBA{R: 128, G: 128, B: 128, A: 255}
	case "navy":
		return color.RGBA{R: 0, G: 0, B: 128, A: 255}
	case "lime":
		return color.RGBA{R: 0, G: 255, B: 0, A: 255}
	}

	// #RGB や #RRGGBB 形式の16進数カラー
	if strings.HasPrefix(colorStr, "#") && len(colorStr) >= 4 {
		hex := colorStr[1:]
		if len(hex) == 3 {
			// #RGB -> #RRGGBB に展開
			hex = string([]byte{hex[0], hex[0], hex[1], hex[1], hex[2], hex[2]})
		}
		if len(hex) == 6 {
			if r, err := strconv.ParseUint(hex[0:2], 16, 8); err == nil {
				if g, err := strconv.ParseUint(hex[2:4], 16, 8); err == nil {
					if b, err := strconv.ParseUint(hex[4:6], 16, 8); err == nil {
						return color.RGBA{R: uint8(r), G: uint8(g), B: uint8(b), A: 255}
					}
				}
			}
		}
	}

	return nil // パース失敗
}
