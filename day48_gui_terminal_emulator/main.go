package main

import (
	"log"
	"os" // os.Exit を使うために残します
	"strings"

	// "sync" // Mutex用だが今回はまだ使わない
	// "time" // Ticker用だが今回はまだ使わない

	"fyne.io/fyne/v2"
	"fyne.io/fyne/v2/app"
	"fyne.io/fyne/v2/container"

	// "fyne.io/fyne/v2/data/binding" // TextGridでは直接使わない
	"fyne.io/fyne/v2/widget"

	"github.com/lirlia/100day_challenge_backend/day48_gui_terminal_emulator/pty_handler"
	// "golang.org/x/term" // For raw mode, if needed later
)

var ptyMaster *os.File // ptyのマスターファイルをグローバルで保持 (後でpty_handlerに隠蔽検討)

const maxLines = 500       // 表示する最大行数
var terminalLines []string // ターミナル出力を保持する行バッファ
// var linesMutex sync.Mutex // terminalLinesを保護するためのMutex

func main() {
	// Fyneアプリケーションを作成
	a := app.New()
	w := a.NewWindow("Day 48: Go Terminal Emulator")

	// ターミナル出力表示用のTextGrid
	outputGrid := widget.NewTextGrid() // 初期は空
	// outputGrid.SetText("Terminal output will appear here...") // TextGridはSetTextで初期化
	terminalLines = append(terminalLines, "Terminal output will appear here...")
	outputGrid.SetText(strings.Join(terminalLines, "\n"))

	outputScroll := container.NewScroll(outputGrid)
	outputScroll.SetMinSize(fyne.NewSize(600, 400))

	// コマンド入力用のエントリー
	inputEntry := widget.NewEntry()
	inputEntry.SetPlaceHolder("Enter command here...")

	// UI更新用のチャネル（App.Invokeが利用できるなら不要になる可能性も）
	// uiUpdateChan := make(chan struct{}, 1) // バッファ付きチャネルで連続更新をまとめる

	inputEntry.OnSubmitted = func(text string) {
		log.Printf("Command submitted: %s", text)
		if ptyMaster != nil {
			_, err := ptyMaster.Write([]byte(text + "\n"))
			if err != nil {
				log.Printf("Failed to write to pty: %v", err)
				newText := "\nFailed to write to PTY: " + err.Error()
				updateTerminalUI(outputGrid, outputScroll, newText)
			}
		} else {
			log.Println("PTY not started, cannot send command.")
			newText := "\nPTY not started, cannot send command."
			updateTerminalUI(outputGrid, outputScroll, newText)
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
		newText := "Failed to start PTY: " + errPty.Error()
		updateTerminalUI(outputGrid, outputScroll, newText)
	} else {
		// ptyが正常に開始された場合のみクローズ処理を登録
		defer ptyMaster.Close()
		go func() {
			buffer := make([]byte, 4096)
			for {
				n, err := ptyMaster.Read(buffer)
				if err != nil {
					log.Printf("Error reading from pty: %v", err)
					newText := "\nError reading from PTY: " + err.Error()
					updateTerminalUI(outputGrid, outputScroll, newText)
					a.SendNotification(&fyne.Notification{
						Title:   "PTY Error",
						Content: "PTY stream closed or error: " + err.Error(),
					})
					return // goroutineを終了
				}
				if n > 0 {
					processedString := pty_handler.StripAnsiSequences(string(buffer[:n]))
					updateTerminalUI(outputGrid, outputScroll, processedString)
				}
			}
		}()
	}

	w.ShowAndRun() // ウィンドウを表示し、イベントループを開始
	log.Println("Fyne app stopped.")
}

// updateTerminalUI はターミナル行バッファを更新し、TextGridに反映します。
// この関数はUIを更新するため、メインスレッドから呼び出されるか、
// Fyneがスレッドセーフ性を保証するコンテキスト (例: goroutineからのWidgetメソッド直接呼び出しが安全な場合) で呼び出す必要があります。
// 現状、goroutineから直接呼んでいますが、クラッシュする場合はMutex保護やチャネル経由の更新が必要です。
func updateTerminalUI(grid *widget.TextGrid, scroll *container.Scroll, newText string) {
	// TODO: Mutex保護を検討 (linesMutex.Lock() / Unlock())
	addNewLines := strings.Split(newText, "\n")

	if len(terminalLines) == 1 && terminalLines[0] == "Terminal output will appear here..." && newText[0] != '\n' && newText[0] != '\r' {
		// 初期メッセージの場合、最初の行で置き換え（改行で始まらない場合のみ）
		terminalLines[0] = addNewLines[0]
		addNewLines = addNewLines[1:]
	} else if len(terminalLines) > 0 && len(addNewLines) > 0 &&
		!strings.HasSuffix(terminalLines[len(terminalLines)-1], "\n") &&
		(len(newText) > 0 && newText[0] != '\n' && newText[0] != '\r') {
		// 前の行の末尾に最初の新しい行を追記
		terminalLines[len(terminalLines)-1] += addNewLines[0]
		addNewLines = addNewLines[1:]
	}
	terminalLines = append(terminalLines, addNewLines...)

	if len(terminalLines) > maxLines {
		terminalLines = terminalLines[len(terminalLines)-maxLines:]
	}

	grid.SetText(strings.Join(terminalLines, "\n"))
	scroll.ScrollToBottom()
}
