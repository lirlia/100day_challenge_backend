package main

import (
	"fmt"
	"io"
	"log"
	"os"

	"github.com/lirlia/100day_challenge_backend/day48_gui_terminal_emulator/pty_handler"
	// "golang.org/x/term" // For raw mode, if needed later
)

func main() {
	ptmx, err := pty_handler.StartPty()
	if err != nil {
		log.Fatalf("Failed to start pty: %v", err)
	}
	defer ptmx.Close()

	fmt.Println("PTY started. Type 'exit' or Ctrl+D to quit.")

	// // 標準入力の端末モードをRAWモードに設定（オプション、よりインタラクティブにするため）
	// // Fyneを使う場合は不要になる可能性が高い
	// oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	// if err != nil {
	// 	log.Printf("Failed to set stdin to raw mode: %v. Proceeding without raw mode.", err)
	// } else {
	// 	defer term.Restore(int(os.Stdin.Fd()), oldState)
	// }

	// ptyからの出力を標準出力へ
	go func() {
		_, err := io.Copy(os.Stdout, ptmx)
		if err != nil {
			// EOFは正常終了なのでログレベルを調整
			if err == io.EOF {
				log.Println("PTY output stream closed (EOF).")
			} else {
				log.Printf("Error copying from pty to stdout: %v", err)
			}
		}
	}()

	// 標準入力からの入力をptyへ
	go func() {
		_, err := io.Copy(ptmx, os.Stdin)
		if err != nil {
			// EOFは正常終了なのでログレベルを調整
			if err == io.EOF {
				log.Println("Stdin stream closed (EOF), stopping copy to pty.")
			} else {
				log.Printf("Error copying from stdin to pty: %v", err)
			}
		}
	}()

	// プログラムが終了しないように待機 (実際のGUIアプリではイベントループがこれを担当)
	// このCUIテストでは、シェルが終了すると上記のio.CopyがEOFを返してgoroutineが終了し、
	// main関数も終了する。
	// シェルが終了するまで待つために、どちらかのio.Copyが完了するのを待つか、
	// もしくは子プロセスの終了を待つのがより堅牢だが、ここではシンプルにする。
	select {}
}
