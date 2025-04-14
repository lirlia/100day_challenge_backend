package handler

import (
	"encoding/json"
	"html/template"
	"log/slog"
	"net/http"
	"path/filepath"

	domainModel "github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/model"
	domainRepo "github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/repository"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
	"github.com/m-mizutani/goerr"
)

// WebHandler は Web ページ表示用のハンドラーです。
type WebHandler struct {
	tmpl        *template.Template
	todoUsecase usecase.TodoUsecase
	userRepo    domainRepo.UserRepository
	logger      *slog.Logger
}

// NewWebHandler は新しい WebHandler を生成します。
func NewWebHandler(tu usecase.TodoUsecase, ur domainRepo.UserRepository) (*WebHandler, error) {
	layoutPath := filepath.Join("web", "templates", "layout.html")
	indexPath := filepath.Join("web", "templates", "index.html")
	itemPath := filepath.Join("web", "templates", "_todo_item.html")

	slog.Info("Parsing specific template files...", "layout", layoutPath, "index", indexPath, "item", itemPath)

	// layout.html, index.html, _todo_item.html を明示的に ParseFiles で読み込む
	tmpl, err := template.ParseFiles(layoutPath, indexPath, itemPath)
	if err != nil {
		return nil, goerr.Wrap(err, "failed to parse template files").With("layout", layoutPath).With("index", indexPath).With("item", itemPath)
	}

	// 読み込まれたテンプレート名をログに出力して確認
	if tmpl != nil {
		slog.Info("Parsed templates (ParseFiles):")
		for _, t := range tmpl.Templates() {
			slog.Info("- " + t.Name())
		}
	} else {
		slog.Warn("Template object is nil after ParseFiles, but no error reported!")
	}

	return &WebHandler{
		tmpl:        tmpl,
		todoUsecase: tu,
		userRepo:    ur,
		logger:      slog.Default().WithGroup("handler.web"),
	}, nil
}

// Index は ToDo リストページを表示します。
func (h *WebHandler) Index(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	h.logger.InfoContext(ctx, "serving index page")

	// TODO: ユーザー選択機能から現在のユーザーIDを取得する
	currentUserID := int64(1) // 仮で ID 1 のユーザーとする

	// ユーザーリストを取得 (ユーザー選択用)
	users, err := h.userRepo.FindAll(ctx)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to get users for index page", "error", err)
		users = []*domainModel.User{}
	}

	// 現在のユーザーの ToDo リストを取得 (アーカイブ済みは除く)
	getTodosInput := usecase.GetTodosInput{
		UserID:          currentUserID,
		Limit:           100, // とりあえず100件
		Page:            1,
		IncludeArchived: false,
	}
	output, err := h.todoUsecase.GetTodos(ctx, getTodosInput)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to get todos for index page", "error", err, "input", getTodosInput)
		http.Error(w, "Failed to retrieve ToDos", http.StatusInternalServerError)
		return
	}

	// Todos と Users を JSON 文字列にマーシャリング
	todosJSON, err := json.Marshal(output.Todos)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to marshal todos to JSON", "error", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}
	usersJSON, err := json.Marshal(users)
	if err != nil {
		h.logger.ErrorContext(ctx, "failed to marshal users to JSON", "error", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		return
	}

	// テンプレートに渡すデータ
	data := map[string]interface{}{
		"TodosJSON":     string(todosJSON), // JSON 文字列として渡す
		"UsersJSON":     string(usersJSON), // JSON 文字列として渡す
		"CurrentUserID": currentUserID,
		// "Todos": output.Todos, // 元のデータも必要なら渡す (今回は JSON のみ)
		// "Users": users,
	}

	// base テンプレートを起点として実行
	if err := h.tmpl.ExecuteTemplate(w, "base", data); err != nil {
		h.logger.ErrorContext(ctx, "failed to execute template", "error", err)
		http.Error(w, "Failed to render page", http.StatusInternalServerError)
	}
}
