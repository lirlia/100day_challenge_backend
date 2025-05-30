package utils

import (
	"log"
	"os"
)

var (
	InfoLogger    *log.Logger
	WarningLogger *log.Logger
	ErrorLogger   *log.Logger
	DebugLogger   *log.Logger // デバッグログ用。本番では無効化することも検討
)

func init() {
	// TODO: ログレベルを設定ファイルから読み込めるようにする
	// TODO: ログ出力をファイルに切り替えられるようにする
	InfoLogger = log.New(os.Stdout, "INFO: ", log.Ldate|log.Ltime|log.Lshortfile)
	WarningLogger = log.New(os.Stdout, "WARN: ", log.Ldate|log.Ltime|log.Lshortfile)
	ErrorLogger = log.New(os.Stderr, "ERROR: ", log.Ldate|log.Ltime|log.Lshortfile)
	DebugLogger = log.New(os.Stdout, "DEBUG: ", log.Ldate|log.Ltime|log.Lshortfile)

	// デバッグロガーは環境変数などで制御する例
	if os.Getenv("VPN_DEBUG") != "1" {
		// DebugLogger.SetOutput(io.Discard) // Go 1.16以降
		// Go 1.15以前の場合は、以下のようにするか、何もしない（出力される）
		// devNull, _ := os.OpenFile(os.DevNull, os.O_WRONLY, 0666)
		// DebugLogger.SetOutput(devNull)
		// 今回はシンプルにコメントアウトし、常に出力されるようにしておく
		// 本番運用時には io.Discard を使うのが良い
	}
}

// 以下は便利なラッパー関数 (オプション)
func Info(format string, v ...interface{}) {
	InfoLogger.Printf(format, v...)
}

func Warning(format string, v ...interface{}) {
	WarningLogger.Printf(format, v...)
}

func Error(format string, v ...interface{}) {
	ErrorLogger.Printf(format, v...)
}

func Debug(format string, v ...interface{}) {
	// if os.Getenv("VPN_DEBUG") == "1" { // ログローテーションなどを考慮するとここで判定するのが良い
	DebugLogger.Printf(format, v...)
	// }
}
