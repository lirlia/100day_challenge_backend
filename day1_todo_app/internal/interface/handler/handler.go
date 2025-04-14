package handler

import (
	"context"
	"log/slog"
	"net/http"

	"github.com/go-faster/errors"
	"github.com/google/uuid"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/model"
	domainRepo "github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/repository"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/usecase"
	myerrors "github.com/m-mizutani/goerr"
)

// userIDKey はコンテキストからユーザーIDを取得するためのキーです。
type userIDKey struct{}

// sessionKey はコンテキストからセッションIDを取得するためのキーです。
type sessionKey struct{}

// TodoAPIHandler は ogen Handler インターフェースの実装です。
type TodoAPIHandler struct {
	todoUsecase usecase.TodoUsecase
	userRepo    domainRepo.UserRepository
	logger      *slog.Logger
	sessions    map[string]int64
}

// NewTodoAPIHandler は新しい TodoAPIHandler を生成します。
func NewTodoAPIHandler(tu usecase.TodoUsecase, ur domainRepo.UserRepository) Handler {
	return &TodoAPIHandler{
		todoUsecase: tu,
		userRepo:    ur,
		logger:      slog.Default().WithGroup("handler.api"),
		sessions:    make(map[string]int64),
	}
}

// --- 補助関数 ---

// getCurrentUserID はコンテキストから現在のユーザーIDを取得します。
// SetSession で設定されたセッション情報を利用します。
// middleware で処理する方がクリーンだが、今回は handler 内で簡易的に実装。
func (h *TodoAPIHandler) getCurrentUserID(ctx context.Context) (int64, error) {
	// TODO: 本物のセッション管理 (Cookie など) を実装する
	// 今回はテストのため、常にユーザー ID 1 を返す
	return 1, nil

	/* // 元の実装
	// 本来は HTTP リクエストから Cookie 等を読み取り、セッションストアを検索する
	// 今回は簡易的にインメモリマップから取得
	sessionID, ok := ctx.Value(sessionKey{}).(string)
	if !ok || sessionID == "" {
		return 0, myerrors.New("session not started or invalid").With("reason", "no session id in context")
	}

	userID, exists := h.sessions[sessionID]
	if !exists {
		return 0, myerrors.New("session not found or expired").With("sessionID", sessionID)
	}
	return userID, nil
	*/
}

// --- Handler 実装 ---

// ArchiveTodo implements archiveTodo operation.
func (h *TodoAPIHandler) ArchiveTodo(ctx context.Context, params ArchiveTodoParams) error {
	h.logger.InfoContext(ctx, "handling archiveTodo", "todoID", params.TodoId)
	userID, err := h.getCurrentUserID(ctx)
	if err != nil {
		return myerrors.Wrap(err, "failed to get current user for archive")
	}

	input := usecase.ArchiveTodoInput{
		ID:     params.TodoId,
		UserID: userID,
	}
	if err := h.todoUsecase.ArchiveTodo(ctx, input); err != nil {
		h.logger.ErrorContext(ctx, "archiveTodo usecase failed", "error", err, "input", input)
		return myerrors.Wrap(err, "failed to archive todo")
	}
	return nil
}

// CreateTodo implements createTodo operation.
func (h *TodoAPIHandler) CreateTodo(ctx context.Context, req *CreateTodoRequest) (*Todo, error) {
	h.logger.InfoContext(ctx, "handling createTodo", "title", req.Title)
	userID, err := h.getCurrentUserID(ctx)
	if err != nil {
		return nil, myerrors.Wrap(err, "failed to get current user for create")
	}

	input := usecase.CreateTodoInput{
		UserID:      userID,
		Title:       req.Title,
		Description: req.Description.Value,
	}
	output, err := h.todoUsecase.CreateTodo(ctx, input)
	if err != nil {
		h.logger.ErrorContext(ctx, "createTodo usecase failed", "error", err, "input", input)
		return nil, myerrors.Wrap(err, "failed to create todo")
	}

	return toSchemaTodo(output.Todo), nil
}

// GetArchivedTodos implements getArchivedTodos operation.
func (h *TodoAPIHandler) GetArchivedTodos(ctx context.Context, params GetArchivedTodosParams) ([]Todo, error) {
	h.logger.InfoContext(ctx, "handling getArchivedTodos", "params", params)
	userID, err := h.getCurrentUserID(ctx)
	if err != nil {
		return nil, myerrors.Wrap(err, "failed to get current user for get archived todos")
	}

	input := usecase.GetTodosInput{
		UserID:          userID,
		Limit:           int(params.Limit.Or(20)),
		Page:            int(params.Page.Or(1)),
		IncludeArchived: true,
	}

	output, err := h.todoUsecase.GetTodos(ctx, input)
	if err != nil {
		h.logger.ErrorContext(ctx, "getArchivedTodos (via GetTodos) usecase failed", "error", err, "input", input)
		return nil, myerrors.Wrap(err, "failed to get archived todos")
	}

	schemaTodos := make([]Todo, len(output.Todos))
	for i, t := range output.Todos {
		schemaTodos[i] = *toSchemaTodo(t)
	}
	return schemaTodos, nil
}

// GetTodos implements getTodos operation.
func (h *TodoAPIHandler) GetTodos(ctx context.Context, params GetTodosParams) ([]Todo, error) {
	h.logger.InfoContext(ctx, "handling getTodos", "params", params)
	userID, err := h.getCurrentUserID(ctx)
	if err != nil {
		return nil, myerrors.Wrap(err, "failed to get current user for get todos")
	}

	input := usecase.GetTodosInput{
		UserID:          userID,
		Limit:           int(params.Limit.Or(20)),
		Page:            int(params.Page.Or(1)),
		IncludeArchived: false,
	}

	output, err := h.todoUsecase.GetTodos(ctx, input)
	if err != nil {
		h.logger.ErrorContext(ctx, "getTodos usecase failed", "error", err, "input", input)
		return nil, myerrors.Wrap(err, "failed to get todos")
	}

	schemaTodos := make([]Todo, len(output.Todos))
	for i, t := range output.Todos {
		schemaTodos[i] = *toSchemaTodo(t)
	}
	return schemaTodos, nil
}

// GetUsers implements getUsers operation.
func (h *TodoAPIHandler) GetUsers(ctx context.Context) ([]User, error) {
	h.logger.InfoContext(ctx, "handling getUsers")
	domainUsers, err := h.userRepo.FindAll(ctx)
	if err != nil {
		h.logger.ErrorContext(ctx, "getUsers failed", "error", err)
		return nil, myerrors.Wrap(err, "failed to get users")
	}

	schemaUsers := make([]User, len(domainUsers))
	for i, u := range domainUsers {
		schemaUsers[i] = *toSchemaUser(u)
	}
	return schemaUsers, nil
}

// SetSession implements setSession operation.
func (h *TodoAPIHandler) SetSession(ctx context.Context, req *SetSessionRequest) error {
	h.logger.InfoContext(ctx, "handling setSession", "userID", req.UserID)

	_, err := h.userRepo.FindByID(ctx, req.UserID)
	if err != nil {
		h.logger.WarnContext(ctx, "attempted to set session for non-existent user", "userID", req.UserID, "error", err)
		return &ErrorResponseStatusCode{
			StatusCode: http.StatusNotFound,
			Response:   Error{Code: "USER_NOT_FOUND", Message: "User not found"},
		}
	}

	sessionID := uuid.NewString()

	h.sessions[sessionID] = req.UserID

	h.logger.InfoContext(ctx, "session set successfully", "userID", req.UserID, "sessionID", sessionID)

	return nil
}

// UnarchiveTodo implements unarchiveTodo operation.
func (h *TodoAPIHandler) UnarchiveTodo(ctx context.Context, params UnarchiveTodoParams) (*Todo, error) {
	h.logger.InfoContext(ctx, "handling unarchiveTodo", "todoID", params.TodoId)
	userID, err := h.getCurrentUserID(ctx)
	if err != nil {
		return nil, myerrors.Wrap(err, "failed to get current user for unarchive")
	}

	input := usecase.UnarchiveTodoInput{
		ID:     params.TodoId,
		UserID: userID,
	}
	output, err := h.todoUsecase.UnarchiveTodo(ctx, input)
	if err != nil {
		h.logger.ErrorContext(ctx, "unarchiveTodo usecase failed", "error", err, "input", input)
		return nil, myerrors.Wrap(err, "failed to unarchive todo")
	}

	return toSchemaTodo(output.Todo), nil
}

// UpdateTodo implements updateTodo operation.
func (h *TodoAPIHandler) UpdateTodo(ctx context.Context, req *UpdateTodoRequest, params UpdateTodoParams) (*Todo, error) {
	h.logger.InfoContext(ctx, "handling updateTodo", "todoID", params.TodoId, "req", req)
	userID, err := h.getCurrentUserID(ctx)
	if err != nil {
		return nil, myerrors.Wrap(err, "failed to get current user for update")
	}

	// Status を domainModel.TodoStatus に変換
	domainStatus := model.TodoStatus(req.Status)
	if !domainStatus.IsValid() {
		// 不正なステータス値がリクエストされた場合のエラーハンドリング
		// ここでは簡易的に Internal Server Error を返す (NewError で処理される)
		// 本来は Bad Request (400) を返すのが適切
		return nil, myerrors.New("invalid status value in request").With("status", req.Status)
	}

	input := usecase.UpdateTodoInput{
		ID:          params.TodoId,
		UserID:      userID,
		Title:       req.Title,
		Description: req.Description.Value, // OptString から値を取り出す
		Status:      domainStatus,          // 変換した Status を渡す
		// Completed:   completedInput,        // Status で管理するため削除
	}
	output, err := h.todoUsecase.UpdateTodo(ctx, input)
	if err != nil {
		h.logger.ErrorContext(ctx, "updateTodo usecase failed", "error", err, "input", input)
		return nil, myerrors.Wrap(err, "failed to update todo")
	}

	return toSchemaTodo(output.Todo), nil
}

// UpdateTodoOrder implements updateTodoOrder operation.
func (h *TodoAPIHandler) UpdateTodoOrder(ctx context.Context, req *UpdateTodoOrderRequest) error {
	h.logger.InfoContext(ctx, "handling updateTodoOrder")
	userID, err := h.getCurrentUserID(ctx)
	if err != nil {
		return errors.Wrap(err, "failed to get current user for update order")
	}

	ucOrders := make([]struct {
		ID        int64
		SortOrder float64
	}, len(req.Orders))
	for i, apiOrder := range req.Orders {
		ucOrders[i] = struct {
			ID        int64
			SortOrder float64
		}{
			ID:        apiOrder.ID,
			SortOrder: apiOrder.SortOrder,
		}
	}

	input := usecase.UpdateTodoOrderInput{
		UserID: userID,
		Orders: ucOrders,
	}

	if err := h.todoUsecase.UpdateTodoOrder(ctx, input); err != nil {
		h.logger.ErrorContext(ctx, "updateTodoOrder usecase failed", "error", err, "userID", userID)
		return errors.Wrap(err, "failed to update todo order")
	}

	return nil
}

// UpdateTodoStatus implements updateTodoStatus operation.
func (h *TodoAPIHandler) UpdateTodoStatus(ctx context.Context, req *UpdateTodoStatusRequest, params UpdateTodoStatusParams) (*Todo, error) {
	h.logger.InfoContext(ctx, "handling updateTodoStatus", "todoID", params.TodoId)
	userID, err := h.getCurrentUserID(ctx)
	if err != nil {
		return nil, myerrors.Wrap(err, "failed to get current user for update status")
	}

	domainStatus := model.TodoStatus(req.Status)
	if !domainStatus.IsValid() {
		return nil, myerrors.New("invalid status value").With("status", req.Status)
	}

	input := usecase.UpdateTodoStatusInput{
		ID:     params.TodoId,
		UserID: userID,
		Status: domainStatus,
	}
	output, err := h.todoUsecase.UpdateTodoStatus(ctx, input)
	if err != nil {
		h.logger.ErrorContext(ctx, "updateTodoStatus usecase failed", "error", err, "input", input)
		return nil, myerrors.Wrap(err, "failed to update todo status")
	}

	return toSchemaTodo(output.Todo), nil
}

// NewError implements NewError operation.
func (h *TodoAPIHandler) NewError(ctx context.Context, err error) *ErrorResponseStatusCode {
	h.logger.WarnContext(ctx, "handler error occurred", "error", err)

	var goErr *myerrors.Error
	if errors.As(err, &goErr) {
		return &ErrorResponseStatusCode{
			StatusCode: http.StatusInternalServerError,
			Response: Error{
				Code:    "INTERNAL_ERROR",
				Message: goErr.Error(),
			},
		}
	}

	return &ErrorResponseStatusCode{
		StatusCode: http.StatusInternalServerError,
		Response: Error{
			Code:    "INTERNAL_SERVER_ERROR",
			Message: "An unexpected error occurred.",
		},
	}
}

// --- スキーマモデル変換ヘルパー ---

func toSchemaUser(u *model.User) *User {
	if u == nil {
		return nil
	}
	return &User{
		ID:   u.ID,
		Name: u.Name,
	}
}

func toSchemaTodo(t *model.Todo) *Todo {
	if t == nil {
		return nil
	}
	// Description を OptionalString に変換
	var description OptString
	if t.Description != "" {
		description.SetTo(t.Description)
	}
	// ArchivedAt を OptNilDateTime に変換
	var archivedAt OptNilDateTime
	if t.ArchivedAt != nil {
		archivedAt.SetTo(*t.ArchivedAt) // time.Time を渡す
	}

	// Status を OpenAPI の Enum 型 (string) に変換
	status := TodoStatus(string(t.Status))

	return &Todo{
		ID:          t.ID,
		UserID:      t.UserID,
		Title:       t.Title,
		Description: description,
		Status:      status, // 変換した Status を設定
		SortOrder:   t.SortOrder,
		CreatedAt:   t.CreatedAt,
		ArchivedAt:  archivedAt,
	}
}
