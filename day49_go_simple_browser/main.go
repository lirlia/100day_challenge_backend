package main

import (
	"fmt"
	"log"

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"
	"golang.org/x/net/html"

	"github.com/lirlia/100day_challenge_backend/day49_go_simple_browser/network"
	"github.com/lirlia/100day_challenge_backend/day49_go_simple_browser/parser"
	"github.com/lirlia/100day_challenge_backend/day49_go_simple_browser/renderer"
)

type Browser struct {
	window           fyne.Window
	urlEntry         *widget.Entry
	statusLabel      *widget.Label
	contentContainer *fyne.Container
	scrollContainer  *container.Scroll
}

func main() {
	// Fyneアプリケーション作成
	myApp := app.New()
	myWindow := myApp.NewWindow("Day49 - Go Mini Browser")
	myWindow.Resize(fyne.NewSize(1200, 800))

	// ブラウザ構造体初期化
	browser := &Browser{
		window: myWindow,
	}

	// UI作成
	browser.createUI()

	// ウィンドウ表示・実行
	myWindow.ShowAndRun()
}

func (b *Browser) createUI() {
	// URL入力欄
	b.urlEntry = widget.NewEntry()
	b.urlEntry.SetText("https://www.york.ac.uk/teaching/cws/wws/webpage1.html")
	b.urlEntry.SetPlaceHolder("URLを入力してください")

	// 読み込みボタン
	loadButton := widget.NewButton("📖 読み込み", b.loadURL)

	// ステータスラベル
	b.statusLabel = widget.NewLabel("準備完了")

	// トップバー作成
	topBar := container.NewBorder(nil, nil, nil, loadButton, b.urlEntry)

	// コンテンツエリア
	b.contentContainer = container.NewVBox()
	b.scrollContainer = container.NewScroll(b.contentContainer)
	b.scrollContainer.SetMinSize(fyne.NewSize(1150, 700))

	// // ステータスバー
	// statusBar := container.NewHBox(
	// 	widget.NewLabel("ステータス:"),
	// 	b.statusLabel,
	// )

	// 全体レイアウト
	mainLayout := container.NewBorder(
		topBar,            // 上部
		nil,               // 下部
		nil,               // 左
		nil,               // 右
		b.scrollContainer, // 中央
	)

	b.window.SetContent(mainLayout)

	// Enterキーでも読み込みを実行
	b.urlEntry.OnSubmitted = func(string) {
		b.loadURL()
	}
}

func (b *Browser) loadURL() {
	url := b.urlEntry.Text
	if url == "" {
		b.setStatus("❌ URLが入力されていません")
		return
	}

	b.setStatus("🔄 読み込み中...")
	b.clearContent()

	// HTTPリクエスト実行
	htmlContent, err := network.FetchURL(url)
	if err != nil {
		b.setStatus(fmt.Sprintf("❌ エラー: %v", err))
		b.showError(fmt.Sprintf("URL読み込みエラー:\n%v", err))
		return
	}

	// HTMLパース
	doc, err := parser.ParseHTML(htmlContent)
	if err != nil {
		b.setStatus(fmt.Sprintf("❌ HTMLパースエラー: %v", err))
		b.showError(fmt.Sprintf("HTMLパースエラー:\n%v", err))
		return
	}

	// タイトル取得と表示
	title := parser.GetTextContent(parser.FindElement(doc, "title"))
	if title != "" {
		b.window.SetTitle(fmt.Sprintf("Go Mini Browser - %s", title))
		// b.addContent(widget.NewCard("🌐 ページタイトル", "", widget.NewLabel(title)))
	}

	// フレームセット構造をチェック
	framesetNode := parser.FindElement(doc, "frameset")
	if framesetNode != nil {
		b.setStatus("🖼️ フレームセット構造を処理中...")
		b.processFrameset(doc, url)
	} else {
		// 通常のHTMLページとしてレンダリング
		b.setStatus("📄 コンテンツをレンダリング中...")
		b.renderMainContent(doc, url)
	}

	b.setStatus("✅ 読み込み完了")
}

func (b *Browser) processFrameset(doc *html.Node, baseURL string) {
	// フレームセット情報を表示
	framesetNode := parser.FindElement(doc, "frameset")
	if framesetNode == nil {
		b.addContent(widget.NewLabel("⚠️ フレームセットが見つかりませんでした"))
		return
	}

	// フレームセット情報のヘッダー
	// b.addContent(widget.NewLabel("🌐 === フレームセット構造検出 ==="))

	cols := parser.GetAttribute(framesetNode, "cols")
	if cols != "" {
		// b.addContent(widget.NewLabel("📐 カラム比率: " + cols))
	}

	// すべてのフレームを取得
	frames := parser.FindAllFrames(doc)
	if len(frames) == 0 {
		b.addContent(widget.NewLabel("⚠️ フレームが見つかりませんでした"))
		return
	}

	// 2つのフレーム（左と右）を想定
	if len(frames) >= 2 {
		leftFrame := frames[0]
		rightFrame := frames[1]

		// 左フレーム（メニュー）と右フレーム（メイン）のコンテンツを取得
		leftContent := b.getFrameContent(baseURL, leftFrame)
		rightContent := b.getFrameContent(baseURL, rightFrame)

		// 左右分割レイアウトを作成
		b.createFrameLayout(leftContent, rightContent)
	} else {
		// フレームが1つまたは3つ以上の場合は従来の処理
		for _, frame := range frames {
			frameSrc := parser.GetAttribute(frame, "src")
			frameName := parser.GetAttribute(frame, "name")

			if frameSrc == "" {
				continue
			}

			frameURL, err := network.ResolveURL(baseURL, frameSrc)
			if err != nil {
				b.addContent(widget.NewLabel(fmt.Sprintf("❌ URL変換エラー: %v", err)))
				continue
			}

			frameHeader := fmt.Sprintf("📋 === フレームコンテンツ: %s ===", frameName)
			if frameName == "" {
				frameHeader = fmt.Sprintf("📋 === フレームコンテンツ: %s ===", frameSrc)
			}
			b.addContent(widget.NewLabel(frameHeader))

			b.loadFrameContent(frameURL)
			b.addContent(widget.NewSeparator())
		}
	}
}

// getFrameContent はフレームのコンテンツを取得してウィジェットのスライスとして返します
func (b *Browser) getFrameContent(baseURL string, frame *html.Node) []fyne.CanvasObject {
	frameSrc := parser.GetAttribute(frame, "src")
	// frameName := parser.GetAttribute(frame, "name") // nameはデバッグ用に残しても良い

	if frameSrc == "" {
		return []fyne.CanvasObject{widget.NewLabel("❌ フレームソースが見つかりません")}
	}

	frameURL, err := network.ResolveURL(baseURL, frameSrc)
	if err != nil {
		return []fyne.CanvasObject{widget.NewLabel(fmt.Sprintf("❌ URL変換エラー: %v", err))}
	}

	// フレームHTMLを取得
	frameHTML, err := network.FetchURL(frameURL)
	if err != nil {
		return []fyne.CanvasObject{widget.NewLabel(fmt.Sprintf("❌ フレーム読み込みエラー: %v", err))}
	}

	// フレームHTMLをパース
	frameDoc, err := parser.ParseHTML(frameHTML)
	if err != nil {
		return []fyne.CanvasObject{widget.NewLabel(fmt.Sprintf("❌ フレームHTMLパースエラー: %v", err))}
	}

	var widgets []fyne.CanvasObject
	// HTMLをウィジェットに変換 (baseURLとしてframeURLを渡す)
	frameWidgets := renderer.RenderHTML(frameDoc, frameURL)
	widgets = append(widgets, frameWidgets...)

	return widgets
}

// createFrameLayout は左右分割レイアウトを作成します
func (b *Browser) createFrameLayout(leftContent, rightContent []fyne.CanvasObject) {
	// 左側コンテナ（メニュー）
	leftContainer := container.NewVBox(leftContent...)
	leftScroll := container.NewScroll(leftContainer)
	leftScroll.SetMinSize(fyne.NewSize(250, 600)) // 左側は固定幅

	// 右側コンテナ（メインコンテンツ）
	rightContainer := container.NewVBox(rightContent...)
	rightScroll := container.NewScroll(rightContainer)
	rightScroll.SetMinSize(fyne.NewSize(850, 600)) // 右側はより広く

	// 左右分割レイアウト作成
	splitContainer := container.NewHSplit(leftScroll, rightScroll)
	splitContainer.Offset = 0.2 // 左側を20%、右側を80%の比率に設定

	// フレームレイアウトの説明を追加
	// b.addContent(widget.NewLabel(""))
	// b.addContent(widget.NewCard("🖼️ フレームレイアウト", "左：メニュー | 右：メインコンテンツ", widget.NewLabel("")))

	// 分割レイアウトを追加
	b.addContent(splitContainer)
}

func (b *Browser) loadFrameContent(frameURL string) {
	// フレームHTMLを取得
	frameHTML, err := network.FetchURL(frameURL)
	if err != nil {
		b.addContent(widget.NewLabel(fmt.Sprintf("❌ フレーム読み込みエラー: %v", err)))
		return
	}

	// フレームHTMLをパース
	frameDoc, err := parser.ParseHTML(frameHTML)
	if err != nil {
		b.addContent(widget.NewLabel(fmt.Sprintf("❌ フレームHTMLパースエラー: %v", err)))
		return
	}

	// フレームコンテンツをレンダリング
	b.renderMainContent(frameDoc, frameURL)
}

func (b *Browser) renderMainContent(doc *html.Node, baseURL string) {
	// HTMLをFyneウィジェットに変換
	widgets := renderer.RenderHTML(doc, baseURL)

	if len(widgets) == 0 {
		b.addContent(widget.NewLabel("⚠️ 表示可能なコンテンツが見つかりませんでした"))
		return
	}

	// ウィジェットをコンテンツエリアに追加
	for _, w := range widgets {
		if w != nil {
			b.addContent(w)
		}
	}
}

func (b *Browser) setStatus(status string) {
	b.statusLabel.SetText(status)
	log.Printf("Status: %s", status)
}

func (b *Browser) clearContent() {
	b.contentContainer.RemoveAll()
	b.contentContainer.Refresh()
}

func (b *Browser) addContent(obj fyne.CanvasObject) {
	if obj != nil {
		b.contentContainer.Add(obj)
	}
}

func (b *Browser) showError(message string) {
	errorCard := widget.NewCard("❌ エラー", "", widget.NewLabel(message))
	b.addContent(errorCard)
}
