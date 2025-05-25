package pty_handler

import (
	"os"
	"os/exec"
	"regexp"

	"github.com/creack/pty"
)

// StartPty は新しいptyを開始し、デフォルトシェルをそのptyに接続します。
// 成功した場合はptyのマスターファイルとエラーを返します。
func StartPty() (*os.File, error) {
	// デフォルトシェルを /bin/sh に固定
	shell := "/bin/sh"

	// // デフォルトシェルを取得 (例: /bin/bash, /bin/zsh)
	// shell := os.Getenv("SHELL")
	// if shell == "" {
	// 	shell = "/bin/sh" // フォールバック
	// }

	cmd := exec.Command(shell)

	// ptyを開始
	ptmx, err := pty.Start(cmd)
	if err != nil {
		return nil, err
	}

	return ptmx, nil
}

var ansiRegex = regexp.MustCompile(`\x1b\[[0-9;]*[a-zA-Z]`)

// StripAnsiSequences は文字列からANSIエスケープシーケンスを除去します。
func StripAnsiSequences(str string) string {
	return ansiRegex.ReplaceAllString(str, "")
}

// 今後の実装のためにコメントアウト
/*
func HandlePty(ptmx *os.File, inputCh <-chan []byte, outputCh chan<- []byte, errorCh chan<- error, doneCh <-chan struct{}) {
	// Read from pty and send to outputCh
	go func() {
		buffer := make([]byte, 4096)
		for {
			select {
			case <-doneCh:
				return
			default:
				n, err := ptmx.Read(buffer)
				if err != nil {
					if err != io.EOF {
						errorCh <- fmt.Errorf("failed to read from pty: %w", err)
					}
					return
				}
				if n > 0 {
					// Make a copy as buffer will be reused
					data := make([]byte, n)
					copy(data, buffer[:n])
					outputCh <- data
				}
			}
		}
	}()

	// Write to pty from inputCh
	go func() {
		for {
			select {
			case <-doneCh:
				return
			case data := <-inputCh:
				_, err := ptmx.Write(data)
				if err != nil {
					errorCh <- fmt.Errorf("failed to write to pty: %w", err)
					return
				}
			}
		}
	}()
}
*/
