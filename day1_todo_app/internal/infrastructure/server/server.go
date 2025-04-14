package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/interface/handler"
	"github.com/m-mizutani/goerr"
)

type Server struct {
	httpServer *http.Server
}

func NewServer(todoUsecase *usecase.TodoUsecase) (*Server, error) {
	// ハンドラーの初期化
	h := handler.NewHandler(todoUsecase)

	// HTTPサーバーの設定
	srv := &http.Server{
		Addr:         ":8080",
		Handler:      h,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	return &Server{
		httpServer: srv,
	}, nil
}

func (s *Server) Start(ctx context.Context) error {
	// サーバーの起動
	go func() {
		slog.Info("listening on :8080")
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", goerr.Wrap(err, "failed to start server"))
		}
	}()

	// コンテキストのキャンセルを待機
	<-ctx.Done()

	slog.Info("shutting down server...")

	// サーバーのシャットダウン
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.httpServer.Shutdown(shutdownCtx); err != nil {
		return goerr.Wrap(err, "server shutdown failed")
	}

	// 追加: シャットダウン完了を待機
	<-shutdownCtx.Done()

	slog.Info("server gracefully stopped")
	return nil
}