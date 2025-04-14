package web

import (
	"html/template"
	"net/http"
	"strconv"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
)

type WebHandler struct {
	todoUseCase *usecase.TodoUseCase
	userUseCase *usecase.UserUseCase
	templates   *template.Template
}

func NewWebHandler(todoUseCase *usecase.TodoUseCase, userUseCase *usecase.UserUseCase) (*WebHandler, error) {
	templates, err := template.ParseGlob("internal/handler/web/templates/*.html")
	if err != nil {
		return nil, err
	}

	return &WebHandler{
		todoUseCase: todoUseCase,
		userUseCase: userUseCase,
		templates:   templates,
	}, nil
}

func (h *WebHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/", h.handleIndex)
	mux.HandleFunc("/todos", h.handleTodos)
	mux.HandleFunc("/todos/new", h.handleNewTodo)
	mux.HandleFunc("/todos/", h.handleTodo)
	mux.HandleFunc("/switch-user/", h.handleSwitchUser)
}

func (h *WebHandler) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}
	http.Redirect(w, r, "/todos", http.StatusFound)
}

func (h *WebHandler) handleTodos(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	userID := h.getCurrentUserID(r)

	switch r.Method {
	case http.MethodGet:
		todos, err := h.todoUseCase.GetTodosByUserID(ctx, userID, 0, 100)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		users, err := h.userUseCase.GetUsers(ctx)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		data := struct {
			Todos         []*domain.Todo
			Users         []*domain.User
			CurrentUserID int64
		}{
			Todos:         todos,
			Users:         users,
			CurrentUserID: userID,
		}

		if err := h.templates.ExecuteTemplate(w, "todos.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}

	case http.MethodPost:
		title := r.FormValue("title")
		description := r.FormValue("description")

		todo := &domain.Todo{
			UserID:      userID,
			Title:       title,
			Description: description,
		}

		if err := h.todoUseCase.CreateTodo(ctx, todo); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		http.Redirect(w, r, "/todos", http.StatusFound)
	}
}

func (h *WebHandler) handleNewTodo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	users, err := h.userUseCase.GetUsers(r.Context())
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	data := struct {
		Todo          *domain.Todo
		Users         []*domain.User
		CurrentUserID int64
	}{
		Users:         users,
		CurrentUserID: h.getCurrentUserID(r),
	}

	if err := h.templates.ExecuteTemplate(w, "todo_form.html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func (h *WebHandler) handleTodo(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	idStr := r.URL.Path[len("/todos/"):]
	id, err := strconv.ParseInt(idStr, 10, 64)
	if err != nil {
		http.NotFound(w, r)
		return
	}

	switch r.Method {
	case http.MethodGet:
		todo, err := h.todoUseCase.GetTodoByID(ctx, id)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		users, err := h.userUseCase.GetUsers(ctx)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		data := struct {
			Todo          *domain.Todo
			Users         []*domain.User
			CurrentUserID int64
		}{
			Todo:          todo,
			Users:         users,
			CurrentUserID: h.getCurrentUserID(r),
		}

		if err := h.templates.ExecuteTemplate(w, "todo_form.html", data); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}

	case http.MethodPost:
		title := r.FormValue("title")
		description := r.FormValue("description")

		todo := &domain.Todo{
			ID:          id,
			Title:       title,
			Description: description,
		}

		if err := h.todoUseCase.UpdateTodo(ctx, todo); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		http.Redirect(w, r, "/todos", http.StatusFound)

	case http.MethodDelete:
		if err := h.todoUseCase.DeleteTodo(ctx, id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}
}

func (h *WebHandler) handleSwitchUser(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	userIDStr := r.URL.Path[len("/switch-user/"):]
	_, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		http.Error(w, "Invalid user ID", http.StatusBadRequest)
		return
	}

	http.SetCookie(w, &http.Cookie{
		Name:  "user_id",
		Value: userIDStr,
		Path:  "/",
	})

	http.Redirect(w, r, "/todos", http.StatusFound)
}

func (h *WebHandler) getCurrentUserID(r *http.Request) int64 {
	cookie, err := r.Cookie("user_id")
	if err != nil {
		return 1 // デフォルトのユーザーID
	}

	userID, err := strconv.ParseInt(cookie.Value, 10, 64)
	if err != nil {
		return 1
	}

	return userID
}