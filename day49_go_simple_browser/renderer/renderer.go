package renderer

import (
	"bytes"
	"fmt"
	"image"
	"image/color"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"log"
	"strconv"
	"strings"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/canvas"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
	"golang.org/x/net/html"

	"github.com/lirlia/100day_challenge_backend/day49_go_simple_browser/network"
	"github.com/lirlia/100day_challenge_backend/day49_go_simple_browser/parser"
)

// RenderHTML は DOMツリーを受け取り、Fyneウィジェットのスライスに変換します。
func RenderHTML(root *html.Node, baseURL string) []fyne.CanvasObject {
	var widgets []fyne.CanvasObject
	bodyNode := parser.FindElement(root, "body")
	if bodyNode == nil {
		bodyNode = root
	}
	renderNodeImproved(bodyNode, &widgets, baseURL)
	return widgets
}

// renderNodeImproved は改良されたレンダリング関数です。
func renderNodeImproved(node *html.Node, widgets *[]fyne.CanvasObject, baseURL string) {
	if node == nil {
		return
	}

	switch node.Type {
	case html.ElementNode:
		// まず要素自体をレンダリングしようと試みる (要素タイプに応じてウィジェットが追加される)
		renderElementImproved(node, widgets, baseURL)
		// その後、すべての子要素に対して再帰的に処理
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			renderNodeImproved(child, widgets, baseURL)
		}
	case html.TextNode:
		// テキストノードは、親要素のレンダリング時に extractTextContent を介して処理されるか、
		// または親がコンテナ的な要素で直接テキストを描画しない場合にここで描画される。
		// ここでは、孤立したテキストノード（例えば、<body>直下など）を処理する。
		if node.Parent != nil && (node.Parent.Type == html.DocumentNode || node.Parent.Data == "body" || node.Parent.Data == "html") {
			trimmedData := strings.TrimSpace(node.Data)
			if trimmedData != "" {
				*widgets = append(*widgets, widget.NewLabel(trimmedData))
			}
		}
	case html.DocumentNode:
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			renderNodeImproved(child, widgets, baseURL)
		}
	}
}

// renderElementImproved は改良されたHTML要素レンダリング関数です。
func renderElementImproved(node *html.Node, widgets *[]fyne.CanvasObject, baseURL string) {
	// 各要素ハンドラは、自身のテキスト表示や特殊なレイアウトを担当。
	// 子要素の一般的な再帰処理は呼び出し元の renderNodeImproved が行う。
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
		renderTableImproved(node, widgets, baseURL) // テーブルは自身の子(tr)の処理を含む
	case "img":
		renderImageImproved(node, widgets, baseURL)
	case "frameset":
		renderFramesetImproved(node, widgets) // フレームセットは自身の子(frame)の処理を含む
	case "frame":
		// frameタグ自体は表示せず、内容はmain.goで読み込まれるのでここでは何もしない
	case "ul", "ol":
		renderListImproved(node, widgets, baseURL) // リストは自身の子(li)の処理を含む
	case "li":
		renderListItemImproved(node, widgets)
	case "body", "html", "head", "div", "span":
		// これらのコンテナ要素は特別なウィジェットを生成しない。
		// 子要素の処理は呼び出し元のrenderNodeImprovedに任せる。
		break
	default:
		// 未対応タグや、上記以外でテキストを持つ可能性があるタグは、直接のテキストを描画
		// ただし、多くの場合、専用ハンドラを持つべき要素（p, h1など）で処理される。
		// text := extractTextContent(node) // この呼び出しは重複の可能性あり、慎重に
		// if strings.TrimSpace(text) != "" {
		// 	*widgets = append(*widgets, widget.NewLabel(text))
		// }
	}
}

// extractTextContent はノード直下の子テキストノードの内容を連結して返します。
func extractTextContent(node *html.Node) string {
	if node == nil {
		return ""
	}
	var textBuilder strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.TextNode {
			textBuilder.WriteString(child.Data)
		}
	}
	// HTMLエンティティのデコードなどはここでは行わず、元テキストに近い形で返す
	// 必要に応じて呼び出し側でさらに処理を行う
	return strings.TrimSpace(textBuilder.String())
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
func renderTableImproved(node *html.Node, widgets *[]fyne.CanvasObject, baseURL string) {
	*widgets = append(*widgets, widget.NewLabel(""))

	// テーブル内の各行を処理
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && strings.ToLower(child.Data) == "tr" {
			renderTableRowImproved(child, widgets, baseURL)
		}
	}

	*widgets = append(*widgets, widget.NewLabel(""))
}

// renderTableRowImproved は改良されたテーブル行レンダリング関数です。
func renderTableRowImproved(node *html.Node, widgets *[]fyne.CanvasObject, baseURL string) {
	var rowWidgets []fyne.CanvasObject

	// 行内のセルを処理
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && (strings.ToLower(child.Data) == "td" || strings.ToLower(child.Data) == "th") {
			cellWidget := renderTableCellImproved(child, baseURL)
			if cellWidget != nil {
				rowWidgets = append(rowWidgets, cellWidget)
			}
		}
	}

	// セルを横並びで配置
	if len(rowWidgets) > 0 {
		rowContainer := container.NewHBox(rowWidgets...)
		*widgets = append(*widgets, rowContainer)
	}
}

// renderTableCellImproved は改良されたテーブルセルレンダリング関数です。
func renderTableCellImproved(node *html.Node, baseURL string) fyne.CanvasObject {
	// セル内のコンテンツを詳細に処理
	return renderCellContent(node, baseURL)
}

// renderCellContent はセル内容を詳細にレンダリングします
func renderCellContent(node *html.Node, baseURL string) fyne.CanvasObject {
	// セル内にfontタグがある場合の特別処理
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && strings.ToLower(child.Data) == "font" {
			text := extractTextContent(child)
			if text != "" {
				colorAttr := parser.GetAttribute(child, "color")
				sizeAttr := parser.GetAttribute(child, "size")

				if colorAttr != "" {
					if c := parseColor(colorAttr); c != nil {
						richText := canvas.NewText(text, c)
						richText.TextSize = 14

						// サイズ属性の処理
						if sizeAttr != "" {
							if size, err := strconv.Atoi(sizeAttr); err == nil {
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

						// セルに適切なパディングを追加
						return container.NewHBox(
							widget.NewLabel("  "), // 左パディング
							richText,
							widget.NewLabel("  "), // 右パディング
						)
					}
				}
			}
		}
	}

	// 通常のテキスト処理
	text := extractTextContent(node)
	if text != "" {
		return container.NewHBox(
			widget.NewLabel("  "), // 左パディング
			widget.NewLabel(text),
			widget.NewLabel("  "), // 右パディング
		)
	}

	return widget.NewLabel("")
}

// renderListImproved はリストレンダリング関数です。
func renderListImproved(node *html.Node, widgets *[]fyne.CanvasObject, baseURL string) {
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
	// li要素内の子要素を直接レンダリング
	var itemWidgets []fyne.CanvasObject
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		renderNodeImproved(child, &itemWidgets, "") // baseURLはここでは不要
	}

	if len(itemWidgets) > 0 {
		// 先頭に "● " を追加 (スペースで間隔調整)
		// 実際の●の色付けはFyneの標準機能では難しいため、ここでは黒点とする
		bullet := widget.NewLabel("● ")

		// itemWidgets の最初のウィジェットがテキスト系かチェックし、可能ならHBoxで横に並べる
		if len(itemWidgets) == 1 {
			singleItem := itemWidgets[0]
			// fyne.CanvasObject を widget.Label や canvas.Text にキャスト可能か確認
			// 残念ながら、Fyneの型システムでは直接キャストや型判別が難しい場合がある
			// ここではシンプルにHBoxで並べてみる
			*widgets = append(*widgets, container.NewHBox(bullet, singleItem))
		} else {
			// 複数のウィジェットがある場合は、●の後に縦に並べる
			*widgets = append(*widgets, bullet)
			*widgets = append(*widgets, itemWidgets...)
		}
	} else {
		text := extractTextContent(node)
		if text != "" {
			*widgets = append(*widgets, widget.NewLabel("● "+text))
		}
	}
}

// findFirstLink はノード内の最初のリンク要素を探します
func findFirstLink(node *html.Node) *html.Node {
	if node == nil {
		return nil
	}

	// 現在のノードがリンクの場合
	if node.Type == html.ElementNode && strings.ToLower(node.Data) == "a" {
		return node
	}

	// 子ノードを再帰的に検索
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if link := findFirstLink(child); link != nil {
			return link
		}
	}

	return nil
}

// renderLinkImproved は改良されたリンクレンダリング関数です。
func renderLinkImproved(node *html.Node, widgets *[]fyne.CanvasObject) {
	href := parser.GetAttribute(node, "href")
	text := extractTextContent(node)
	if text == "" {
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if child.Type == html.ElementNode {
				tempText := extractTextContent(child)
				if tempText != "" {
					text = tempText
					break
				}
			}
		}
		if text == "" {
			text = href
		}
	}

	// 色属性の取得を試みる
	var textColor color.Color
	// まず<a>タグ自身のcolor属性をチェック
	colorAttrA := parser.GetAttribute(node, "color")
	if colorAttrA != "" {
		if c := parseColor(colorAttrA); c != nil {
			textColor = c
		}
	}

	// 次に、子要素の<font>タグのcolor属性をチェック (より内側の指定を優先)
	fontNode := parser.FindElement(node, "font")
	if fontNode != nil {
		colorAttrFont := parser.GetAttribute(fontNode, "color")
		if colorAttrFont != "" {
			if c := parseColor(colorAttrFont); c != nil {
				textColor = c // fontタグの色で上書き
			}
		}
	}

	if href != "" { // リンクありの場合
		if textColor != nil {
			// 色付き、太字のテキスト (リンク機能なし)
			coloredBoldLabel := canvas.NewText(text, textColor)
			coloredBoldLabel.TextStyle = fyne.TextStyle{Bold: true}
			coloredBoldLabel.TextSize = 14
			*widgets = append(*widgets, coloredBoldLabel)
		} else {
			// 色なし、太字のハイパーリンク (FyneのHyperlinkはスタイル変更不可)
			// 表示テキストの太字化もHyperlinkではできないため、通常のLabelで代用も検討したが、リンク機能がなくなる。
			// ここではFyne標準のHyperlinkとし、スタイルは諦める。
			link := widget.NewHyperlink(text, nil)
			// link.TextStyle = fyne.TextStyle{Bold: true} // これは効果がない
			*widgets = append(*widgets, link)
		}
	} else { // リンクなしの場合 (<a>タグだがhrefがない、または単なるテキスト)
		if textColor != nil {
			// 色付き、太字のテキスト
			coloredBoldLabel := canvas.NewText(text, textColor)
			coloredBoldLabel.TextStyle = fyne.TextStyle{Bold: true}
			coloredBoldLabel.TextSize = 14
			*widgets = append(*widgets, coloredBoldLabel)
		} else {
			// 色なし、太字のラベル
			boldLabel := widget.NewLabel(text)
			boldLabel.TextStyle = fyne.TextStyle{Bold: true}
			*widgets = append(*widgets, boldLabel)
		}
	}
}

// renderImageImproved は改良された画像レンダリング関数です。
func renderImageImproved(node *html.Node, widgets *[]fyne.CanvasObject, baseURL string) {
	src := parser.GetAttribute(node, "src")
	alt := parser.GetAttribute(node, "alt")

	if src == "" {
		*widgets = append(*widgets, widget.NewLabel(fmt.Sprintf("🖼️ [画像: ソースなし, alt: %s]", alt)))
		return
	}

	// 相対URLを絶対URLに解決
	imageAbsURL, err := network.ResolveURL(baseURL, src)
	if err != nil {
		log.Printf("画像URL解決エラー (%s, %s): %v", baseURL, src, err)
		*widgets = append(*widgets, widget.NewLabel(fmt.Sprintf("🖼️ [画像URL解決エラー: %s, alt: %s]", src, alt)))
		return
	}

	imageData, err := network.FetchImage(imageAbsURL)
	if err != nil {
		log.Printf("画像取得エラー (%s): %v", imageAbsURL, err)
		*widgets = append(*widgets, widget.NewLabel(fmt.Sprintf("🖼️ [画像取得エラー: %s, alt: %s]", src, alt)))
		return
	}

	img, _, err := image.Decode(bytes.NewReader(imageData))
	if err != nil {
		log.Printf("画像デコードエラー (%s): %v", imageAbsURL, err)
		*widgets = append(*widgets, widget.NewLabel(fmt.Sprintf("🖼️ [画像デコードエラー: %s, alt: %s]", src, alt)))
		return
	}

	fyneImg := canvas.NewImageFromImage(img)
	fyneImg.FillMode = canvas.ImageFillContain
	// 画像サイズを適切に設定 (例: 横幅300px、縦はアスペクト比維持)
	// TODO: HTMLのwidth/height属性を考慮する
	originalWidth := float32(img.Bounds().Dx())
	originalHeight := float32(img.Bounds().Dy())
	maxWidth := float32(300)
	if originalWidth > maxWidth {
		scale := maxWidth / originalWidth
		fyneImg.SetMinSize(fyne.NewSize(maxWidth, originalHeight*scale))
	} else {
		fyneImg.SetMinSize(fyne.NewSize(originalWidth, originalHeight))
	}

	*widgets = append(*widgets, fyneImg)
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

// renderFrameImproved は改良されたフレームレンダリング関数です。
// この関数は main.go 側でフレーム内容を直接処理するため、レンダラ側では不要になりました。
/*
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
*/

// isBlockElement はブロックレベル要素かどうかを判定します。
// この関数は renderNodeImproved の新しいロジックでは直接使用されません。
/*
func isBlockElement(tagName string) bool {
	blockElements := map[string]bool{
		"div": true, "p": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true,
		"table": true, "tr": true, "td": true, "th": true, "center": true, "br": true,
		"frameset": true, "frame": true,
	}
	return blockElements[strings.ToLower(tagName)]
}
*/
