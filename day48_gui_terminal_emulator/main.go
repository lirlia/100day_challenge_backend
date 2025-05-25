package main

import (
	"log"
	"os" // os.Exit を使うために残します

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"
	"fyne.io/fyne/v2/data/binding"
	"fyne.io/fyne/v2/widget"

	"github.com/lirlia/100day_challenge_backend/day48_gui_terminal_emulator/pty_handler"
	// "golang.org/x/term" // For raw mode, if needed later
)

var ptyMaster *os.File // ptyのマスターファイルをグローバルで保持 (後でpty_handlerに隠蔽検討)

func main() {
	// Fyneアプリケーションを作成
	a := app.New()
	w := a.NewWindow("Day 48: Go Terminal Emulator")

	// ターミナル出力表示用のデータバインディングとラベル
	outputBinding := binding.NewString()
	outputBinding.Set("Terminal output will appear here...")

	outputLabel := widget.NewLabelWithData(outputBinding)
	outputLabel.Wrapping = fyne.TextWrapWord         // テキストが折り返されるように設定
	outputScroll := container.NewScroll(outputLabel) // スクロール可能にする
	outputScroll.SetMinSize(fyne.NewSize(600, 400))  // 表示エリアの最小サイズを設定

	// コマンド入力用のエントリー
	inputEntry := widget.NewEntry()
	inputEntry.SetPlaceHolder("Enter command here...")

	inputEntry.OnSubmitted = func(text string) {
		log.Printf("Command submitted: %s", text)
		if ptyMaster != nil {
			_, err := ptyMaster.Write([]byte(text + "\n"))
			if err != nil {
				log.Printf("Failed to write to pty: %v", err)
				currentVal, _ := outputBinding.Get()
				outputBinding.Set(currentVal + "\nFailed to write to PTY: " + err.Error())
			}
		} else {
			log.Println("PTY not started, cannot send command.")
			currentVal, _ := outputBinding.Get()
			outputBinding.Set(currentVal + "\nPTY not started, cannot send command.")
		}
		inputEntry.SetText("")
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
		outputBinding.Set("Failed to start PTY: " + errPty.Error())
	} else {
		// ptyが正常に開始された場合のみクローズ処理を登録
		defer ptyMaster.Close()
		go func() {
			buffer := make([]byte, 4096)
			for {
				n, err := ptyMaster.Read(buffer)
				if err != nil {
					log.Printf("Error reading from pty: %v", err)
					currentVal, _ := outputBinding.Get()
					outputBinding.Set(currentVal + "\nError reading from PTY: " + err.Error())
					// GUIがクローズされるとptyMaster.Readがエラーを返すことがある
					// アプリケーション終了時のエラーはログ出力後、goroutineを終了
					a.SendNotification(&fyne.Notification{
						Title:   "PTY Error",
						Content: "PTY stream closed or error: " + err.Error(),
					})
					return // goroutineを終了
				}
				if n > 0 {
					processedString := pty_handler.StripAnsiSequences(string(buffer[:n]))
					currentVal, _ := outputBinding.Get()
					if currentVal == "Terminal output will appear here..." {
						outputBinding.Set(processedString)
					} else {
						outputBinding.Set(currentVal + processedString)
					}
					// TODO: 表示テキストが長くなりすぎないように制御する (例: リングバッファや行数制限)
					// outputScroll.ScrollToBottom() // 自動スクロールは別途対応が必要
				}
			}
		}()
	}

	w.ShowAndRun() // ウィンドウを表示し、イベントループを開始
	log.Println("Fyne app stopped.")
}
