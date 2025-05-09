package observability

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"go.opentelemetry.io/otel/trace"
)

type OtelSlogHandler struct {
	slog.Handler
	serviceName string // サービス名を保持
}

// NewOtelSlogHandler のシグネチャを変更
func NewOtelSlogHandler(handler slog.Handler, serviceName string) *OtelSlogHandler {
	return &OtelSlogHandler{Handler: handler, serviceName: serviceName}
}

func (h *OtelSlogHandler) Handle(ctx context.Context, r slog.Record) error {
	r.AddAttrs(slog.String("service_name", h.serviceName)) // 常にサービス名を追加

	if span := trace.SpanFromContext(ctx); span.SpanContext().IsValid() {
		r.AddAttrs(
			slog.String("trace_id", span.SpanContext().TraceID().String()),
			slog.String("span_id", span.SpanContext().SpanID().String()),
		)
	}
	return h.Handler.Handle(ctx, r)
}

// NewLogger は、OtelSlogHandler を含む新しい slog.Logger を返します。
// サービス名を元にファイルにログをJSON形式で書き出します。
// ファイルオープンに失敗した場合は標準出力にフォールバックします。
func NewLogger(serviceName string) *slog.Logger {
	logFilePath := fmt.Sprintf("/tmp/go_app_%s.log", serviceName)
	logFile, err := os.OpenFile(logFilePath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0666)
	if err != nil {
		// 標準エラー出力にフォールバック情報をログとして記録
		slog.Error("Failed to open log file, falling back to stdout", "error", err, "path", logFilePath, "service_name", serviceName)
		logFile = os.Stdout // 標準出力にフォールバック
	}

	jsonHandler := slog.NewJSONHandler(logFile, &slog.HandlerOptions{
		AddSource: true,            // ソースコードのファイル名と行番号をログに追加
		Level:     slog.LevelDebug, // デフォルトのログレベル (必要に応じて変更または設定可能にする)
	})
	// NewOtelSlogHandler に serviceName を渡す
	otelHandler := NewOtelSlogHandler(jsonHandler, serviceName)
	return slog.New(otelHandler)
}
