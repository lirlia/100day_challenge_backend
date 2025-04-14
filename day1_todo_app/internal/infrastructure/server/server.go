package server

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/infra/datastore"
	apiHandler "github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/interface/handler"
	webHandler "github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/interface/handler"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
	"github.com/m-mizutani/goerr"
	"gorm.io/gorm"
)

type Server struct {
	httpServer *http.Server
	db         *gorm.DB
}

type Config struct {
	Addr   string
	DBConf datastore.DBConfig
}

func NewServer(cfg Config) (*Server, error) {
	db, err := datastore.NewDB(cfg.DBConf)
	if err != nil {
		return nil, goerr.Wrap(err, "failed to initialize database connection")
	}

	userRepo := datastore.NewUserRepository(db)
	todoRepo := datastore.NewTodoRepository(db)

	todoUsecase := usecase.NewTodoUsecase(todoRepo, userRepo)

	apiH := apiHandler.NewTodoAPIHandler(todoUsecase, userRepo)
	ogenServer, err := apiHandler.NewServer(apiH)
	if err != nil {
		return nil, goerr.Wrap(err, "failed to create ogen server")
	}

	webH, err := webHandler.NewWebHandler(todoUsecase, userRepo)
	if err != nil {
		return nil, goerr.Wrap(err, "failed to create web handler")
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", webH.Index)
	mux.Handle("/todos", ogenServer)
	mux.Handle("/session", ogenServer)
	mux.Handle("/users", ogenServer)
	mux.Handle("/todos/", ogenServer)

	srv := &http.Server{
		Addr:         cfg.Addr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	return &Server{
		httpServer: srv,
		db:         db,
	}, nil
}

func (s *Server) Start(ctx context.Context) error {
	go func() {
		slog.Info("HTTP server listening", "addr", s.httpServer.Addr)
		if err := s.httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("HTTP server error", "error", goerr.Wrap(err, "ListenAndServe failed"))
		}
	}()

	<-ctx.Done()

	slog.Info("shutting down server...")

	sqlDB, err := s.db.DB()
	if err == nil {
		if err := sqlDB.Close(); err != nil {
			slog.Error("failed to close database connection", "error", err)
		} else {
			slog.Info("database connection closed")
		}
	} else {
		slog.Error("failed to get underlying sql.DB for closing", "error", err)
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := s.httpServer.Shutdown(shutdownCtx); err != nil {
		slog.Error("server shutdown failed", "error", err)
		return goerr.Wrap(err, "server shutdown failed")
	}

	slog.Info("server gracefully stopped")
	return nil
}
