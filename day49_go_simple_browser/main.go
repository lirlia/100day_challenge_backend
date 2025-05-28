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
	myWindow := myApp.NewWindow("Go Mini Browser - 阿部寛サイト対応版")
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
	b.urlEntry.SetText("http://abehiroshi.la.coocan.jp/")
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

	// ステータスバー
	statusBar := container.NewHBox(
		widget.NewLabel("ステータス:"),
		b.statusLabel,
	)

	// 全体レイアウト
	mainLayout := container.NewBorder(
		topBar,            // 上部
		statusBar,         // 下部
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
		b.addContent(widget.NewCard("🌐 ページタイトル", "", widget.NewLabel(title)))
	}

	// フレームセット構造をチェック
	framesetNode := parser.FindElement(doc, "frameset")
	if framesetNode != nil {
		b.setStatus("🖼️ フレームセット構造を処理中...")
		b.processFrameset(doc, url)
	} else {
		// 通常のHTMLページとしてレンダリング
		b.setStatus("📄 コンテンツをレンダリング中...")
		b.renderMainContent(doc)
	}

	b.setStatus("✅ 読み込み完了")
}

func (b *Browser) processFrameset(doc *html.Node, baseURL string) {
	// フレームセット情報を表示
	framesetNode := parser.FindElement(doc, "frameset")
	if framesetNode != nil {
		widgets := renderer.RenderHTML(framesetNode)
		for _, widget := range widgets {
			b.addContent(widget)
		}
	}

	// すべてのフレームを取得
	frames := parser.FindAllFrames(doc)
	if len(frames) == 0 {
		b.addContent(widget.NewLabel("⚠️ フレームが見つかりませんでした"))
		return
	}

	// 各フレームのコンテンツを順次読み込み
	for _, frame := range frames {
		frameSrc := parser.GetAttribute(frame, "src")
		frameName := parser.GetAttribute(frame, "name")

		if frameSrc == "" {
			continue
		}

		// 相対URLを絶対URLに変換
		frameURL, err := network.ResolveURL(baseURL, frameSrc)
		if err != nil {
			b.addContent(widget.NewLabel(fmt.Sprintf("❌ URL変換エラー: %v", err)))
			continue
		}

		// フレーム情報のヘッダー表示
		frameHeader := fmt.Sprintf("📋 === フレームコンテンツ: %s ===", frameName)
		if frameName == "" {
			frameHeader = fmt.Sprintf("📋 === フレームコンテンツ: %s ===", frameSrc)
		}
		b.addContent(widget.NewLabel(frameHeader))

		// フレームコンテンツを取得・表示
		b.loadFrameContent(frameURL)

		// フレーム間の区切り線
		b.addContent(widget.NewSeparator())
	}
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
	b.renderMainContent(frameDoc)
}

func (b *Browser) renderMainContent(doc *html.Node) {
	// HTMLをFyneウィジェットに変換
	widgets := renderer.RenderHTML(doc)

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
