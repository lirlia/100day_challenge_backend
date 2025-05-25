package main

import (
	"log"
	"os" // os.Exit を使うために残します

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/widget"

	"github.com/lirlia/100day_challenge_backend/day48_gui_terminal_emulator/pty_handler"
	// "golang.org/x/term" // For raw mode, if needed later
)

var ptyMaster *os.File // ptyのマスターファイルをグローバルで保持 (後でpty_handlerに隠蔽検討)

func main() {
	// Fyneアプリケーションを作成
	a := app.New()
	w := a.NewWindow("Day 48: Go Terminal Emulator")

	// ターミナル出力表示用のラベル (初期はTextGridが望ましいが、まずはLabelで)
	outputLabel := widget.NewLabel("Terminal output will appear here...")
	outputLabel.Wrapping = fyne.TextWrapWord         // テキストが折り返されるように設定
	outputScroll := container.NewScroll(outputLabel) // スクロール可能にする
	outputScroll.SetMinSize(fyne.NewSize(600, 400))  // 表示エリアの最小サイズを設定

	// コマンド入力用のエントリー
	inputEntry := widget.NewEntry()
	inputEntry.SetPlaceHolder("Enter command here...")

	inputEntry.OnSubmitted = func(text string) {
		log.Printf("Command submitted: %s", text)
		if ptyMaster != nil {
			_, err := ptyMaster.Write([]byte(text + "\n")) // コマンドの後に改行を追加
			if err != nil {
				log.Printf("Failed to write to pty: %v", err)
				// ここでユーザーにエラーを通知するUI処理を追加することもできる
			}
		} else {
			log.Println("PTY not started, cannot send command.")
		}
		inputEntry.SetText("") // 入力フィールドをクリア
	}

	// レイアウトコンテナ
	content := container.NewBorder(nil, inputEntry, nil, nil, outputScroll)

	w.SetContent(content)
	w.Resize(fyne.NewSize(800, 600)) // ウィンドウの初期サイズ

	// PTYの初期化と出力の読み取り (goroutineで)
	var errPty error
	ptyMaster, errPty = pty_handler.StartPty()
	if errPty != nil {
		log.Fatalf("Failed to start pty: %v", errPty)
		// GUIにエラー表示するならここ
		outputLabel.SetText("Failed to start PTY: " + errPty.Error())
	} else {
		// ptyが正常に開始された場合のみクローズ処理を登録
		defer ptyMaster.Close()
		go func() {
			buffer := make([]byte, 4096)
			for {
				n, err := ptyMaster.Read(buffer)
				if err != nil {
					// GUIがクローズされるとptyMaster.Readがエラーを返すことがある
					// (例: file already closed). アプリケーション終了時のエラーは無視するか、
					// より丁寧にハンドリングする。
					log.Printf("Error reading from pty: %v", err) // EOFもエラーとしてログ
					// GUIスレッドでUIを更新する必要がある
					a.SendNotification(&fyne.Notification{
						Title:   "PTY Error",
						Content: "Error reading from PTY: " + err.Error(),
					})
					// outputLabel.SetText(outputLabel.Text + "\nError reading from PTY: " + err.Error()) // 直接更新はスレッドセーフではない
					// ランタイムパニックを避けるため、読み取りを停止
					return
				}
				if n > 0 {
					// currentText := outputLabel.Text
					// if currentText == "Terminal output will appear here..." {
					// 	currentText = ""
					// }
					// FyneのUI更新はメインスレッドで行う必要がある
					// ただし、Labelに大量のテキストを追記し続けるのはパフォーマンスに問題がある可能性がある
					// TextGridや他のより効率的なウィジェットを検討すべき
					// newText := currentText + string(buffer[:n])

					// あまりにも長くなりすぎないように、ある程度の行数/文字数で切り捨てる処理も検討
					// if len(newText) > 20000 { // 例: 20000文字で制限
					// 	newText = newText[len(newText)-20000:]
					// }

					// メインスレッドでUIを更新するためにapp.RunOnMainを使用する
					// ただし、SendNotificationやWindowのメソッドはスレッドセーフなものもある。
					// LabelのSetTextはメインスレッドから呼ぶ必要がある

					// outputLabel.SetText(newText) // これは goroutine から直接呼ぶとクラッシュの可能性
					// outputLabel.Refresh() // Refreshも同様

					// より安全な方法としてチャネル経由でメインスレッドにデータを渡すか、
					// またはFyneのデータバインディング機能を利用する。
					// ここでは暫定的に表示は行うが、クラッシュリスクあり。
					// TODO: スレッドセーフなUI更新方法に修正する

					//  a.RunLater(func() { // Fyne v2.4以前の古いAPI or 存在しないAPI
					//  	outputLabel.SetText(newText)
					//  })
					log.Printf("[PTY Output]: %s", string(buffer[:n])) // GUI更新の代わりにログ出力
				}
			}
		}()
	}

	w.ShowAndRun() // ウィンドウを表示し、イベントループを開始
	log.Println("Fyne app stopped.")
}
