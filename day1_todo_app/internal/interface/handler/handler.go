package handler

import (
	"html/template"
	"net/http"
	"log"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
)

type Handler struct {
	mux         *http.ServeMux
	todoUsecase *usecase.TodoUsecase
	templates   *template.Template
}

func NewHandler(todoUsecase *usecase.TodoUsecase) *Handler {
	h := &Handler{
		mux:         http.NewServeMux(),
		todoUsecase: todoUsecase,
	}

	// テンプレートの読み込み
	templates := template.Must(template.ParseGlob("templates/*.html"))
	h.templates = templates

	// ルーティングの設定
	h.mux.HandleFunc("/", h.handleRoot)

	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func (h *Handler) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	// デフォルトのユーザーIDを使用（実際のアプリでは認証から取得）
	userID := int64(1) // デフォルトのユーザーIDをint64に変更

	// Todo一覧を取得
	todos, nextCursor, err := h.todoUsecase.GetTodos(userID, 100, "", false)
	if err != nil {
		log.Printf("Failed to get todos: %v", err)
		http.Error(w, "Failed to get todos", http.StatusInternalServerError)
		return
	}

	// テンプレートをレンダリング
	if err := h.templates.ExecuteTemplate(w, "index.html", map[string]interface{}{
		"Todos":      todos,
		"NextCursor": nextCursor,
	}); err != nil {
		http.Error(w, "Failed to render template", http.StatusInternalServerError)
		return
	}
}