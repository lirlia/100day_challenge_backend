// internal/usecase/todo.go
package usecase

import (
	"context"
	"log/slog"
	"time"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/model"
	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/repository"
	"github.com/m-mizutani/goerr" // エラーラップ用
)

// TodoUsecaseInput は ToDo ユースケースの入力パラメータを表すインターフェースです。(メソッドごとに定義)
// TodoUsecaseOutput は ToDo ユースケースの出力パラメータを表すインターフェースです。(メソッドごとに定義)

// GetTodosInput は ToDo 一覧取得の入力です。
type GetTodosInput struct {
	UserID          int64
	Limit           int
	Page            int
	IncludeArchived bool
}

// GetTodosOutput は ToDo 一覧取得の出力です。
type GetTodosOutput struct {
	Todos []*model.Todo
}

// CreateTodoInput は ToDo 作成の入力です。
type CreateTodoInput struct {
	UserID      int64
	Title       string
	Description string
}

// CreateTodoOutput は ToDo 作成の出力です。
type CreateTodoOutput struct {
	Todo *model.Todo
}

// UpdateTodoInput は ToDo 更新の入力です。
type UpdateTodoInput struct {
	ID          int64
	UserID      int64 // 権限チェック用
	Title       string
	Description string
	Status      model.TodoStatus // Status を追加
}

// UpdateTodoOutput は ToDo 更新の出力です。
type UpdateTodoOutput struct {
	Todo *model.Todo
}

// UpdateTodoStatusInput は ToDo ステータス更新の入力です。
type UpdateTodoStatusInput struct {
	ID     int64
	UserID int64            // 権限チェック用
	Status model.TodoStatus // Status を追加
}

// UpdateTodoStatusOutput は ToDo ステータス更新の出力です。
type UpdateTodoStatusOutput struct {
	Todo *model.Todo
}

// UpdateTodoOrderInput は ToDo 並び順更新の入力です。
type UpdateTodoOrderInput struct {
	UserID int64
	Orders []struct { // OpenAPI の UpdateTodoOrderRequest.Orders と似た構造
		ID        int64
		SortOrder float64
	}
}

// ArchiveTodoInput は ToDo アーカイブの入力です。
type ArchiveTodoInput struct {
	ID     int64
	UserID int64 // 権限チェック用
}

// UnarchiveTodoInput は ToDo アーカイブ解除の入力です。
type UnarchiveTodoInput struct {
	ID     int64
	UserID int64 // 権限チェック用
}

// UnarchiveTodoOutput は ToDo アーカイブ解除の出力です。
type UnarchiveTodoOutput struct {
	Todo *model.Todo
}

// TodoUsecase は ToDo に関連するユースケースを定義するインターフェースです。
type TodoUsecase interface {
	GetTodos(ctx context.Context, input GetTodosInput) (*GetTodosOutput, error)
	CreateTodo(ctx context.Context, input CreateTodoInput) (*CreateTodoOutput, error)
	UpdateTodo(ctx context.Context, input UpdateTodoInput) (*UpdateTodoOutput, error)
	UpdateTodoStatus(ctx context.Context, input UpdateTodoStatusInput) (*UpdateTodoStatusOutput, error)
	UpdateTodoOrder(ctx context.Context, input UpdateTodoOrderInput) error
	ArchiveTodo(ctx context.Context, input ArchiveTodoInput) error
	UnarchiveTodo(ctx context.Context, input UnarchiveTodoInput) (*UnarchiveTodoOutput, error)
	// GetArchivedTodos ユースケース (GetTodos で includeArchived=true を使うので不要かも？)
}

// todoUsecase は TodoUsecase の実装です。
type todoUsecase struct {
	todoRepo repository.TodoRepository
	userRepo repository.UserRepository // 必要であればユーザー存在チェックなどに使う
	logger   *slog.Logger
}

// NewTodoUsecase は新しい todoUsecase を生成します。
func NewTodoUsecase(todoRepo repository.TodoRepository, userRepo repository.UserRepository) TodoUsecase {
	return &todoUsecase{
		todoRepo: todoRepo,
		userRepo: userRepo,
		logger:   slog.Default().WithGroup("usecase.todo"),
	}
}

// GetTodos は ToDo リストを取得します。
func (uc *todoUsecase) GetTodos(ctx context.Context, input GetTodosInput) (*GetTodosOutput, error) {
	uc.logger.InfoContext(ctx, "getting todos", "userID", input.UserID, "page", input.Page, "limit", input.Limit, "includeArchived", input.IncludeArchived)

	params := repository.FindTodosParams{
		UserID:          input.UserID,
		Limit:           input.Limit,
		Page:            input.Page,
		IncludeArchived: input.IncludeArchived,
	}

	todos, err := uc.todoRepo.Find(ctx, params)
	if err != nil {
		uc.logger.ErrorContext(ctx, "failed to find todos", "error", err, "params", params)
		return nil, goerr.Wrap(err, "failed to get todos from repository")
	}

	uc.logger.InfoContext(ctx, "found todos", "count", len(todos))
	return &GetTodosOutput{Todos: todos}, nil
}

// CreateTodo は新しい ToDo を作成します。
func (uc *todoUsecase) CreateTodo(ctx context.Context, input CreateTodoInput) (*CreateTodoOutput, error) {
	uc.logger.InfoContext(ctx, "creating todo", "userID", input.UserID, "title", input.Title)

	now := time.Now()
	todo := &model.Todo{
		UserID:      input.UserID,
		Title:       input.Title,
		Description: input.Description,
		Status:      model.TodoStatusNotStarted, // デフォルトステータス
		SortOrder:   float64(now.UnixNano()),
		CreatedAt:   now,
	}

	if err := uc.todoRepo.Create(ctx, todo); err != nil {
		uc.logger.ErrorContext(ctx, "failed to create todo", "error", err, "input", input)
		return nil, goerr.Wrap(err, "failed to create todo in repository")
	}

	uc.logger.InfoContext(ctx, "todo created successfully", "todoID", todo.ID)
	return &CreateTodoOutput{Todo: todo}, nil
}

// UpdateTodo は既存の ToDo を更新します。
func (uc *todoUsecase) UpdateTodo(ctx context.Context, input UpdateTodoInput) (*UpdateTodoOutput, error) {
	uc.logger.InfoContext(ctx, "updating todo", "todoID", input.ID, "userID", input.UserID)

	existingTodo, err := uc.todoRepo.FindByID(ctx, input.ID)
	if err != nil {
		uc.logger.ErrorContext(ctx, "failed to find todo for update", "error", err, "todoID", input.ID)
		return nil, goerr.Wrap(err, "failed to find todo by id")
	}
	if existingTodo == nil {
		return nil, goerr.New("todo not found for update").With("id", input.ID)
	}
	if existingTodo.UserID != input.UserID {
		uc.logger.WarnContext(ctx, "permission denied to update todo", "todoID", input.ID, "ownerUserID", existingTodo.UserID, "requestUserID", input.UserID)
		return nil, goerr.New("permission denied").With("todoID", input.ID)
	}
	if existingTodo.IsArchived() {
		uc.logger.WarnContext(ctx, "cannot update archived todo", "todoID", input.ID)
		return nil, goerr.New("cannot update archived todo").With("todoID", input.ID)
	}

	if !input.Status.IsValid() {
		uc.logger.WarnContext(ctx, "invalid todo status provided", "status", input.Status)
		return nil, goerr.New("invalid status").With("status", input.Status)
	}

	updates := map[string]interface{}{
		"title":       input.Title,
		"description": input.Description,
		"status":      string(input.Status),
	}

	if err := uc.todoRepo.Update(ctx, input.ID, input.UserID, updates); err != nil {
		uc.logger.ErrorContext(ctx, "failed to update todo", "error", err, "todoID", input.ID, "updates", updates)
		return nil, goerr.Wrap(err, "failed to update todo in repository")
	}

	updatedTodo, err := uc.todoRepo.FindByID(ctx, input.ID)
	if err != nil {
		uc.logger.ErrorContext(ctx, "failed to find todo after update", "error", err, "todoID", input.ID)
		return nil, goerr.Wrap(err, "failed to fetch todo after update")
	}

	uc.logger.InfoContext(ctx, "todo updated successfully", "todoID", updatedTodo.ID)
	return &UpdateTodoOutput{Todo: updatedTodo}, nil
}

// UpdateTodoStatus は ToDo のステータスのみを更新します。
func (uc *todoUsecase) UpdateTodoStatus(ctx context.Context, input UpdateTodoStatusInput) (*UpdateTodoStatusOutput, error) {
	uc.logger.InfoContext(ctx, "updating todo status", "todoID", input.ID, "userID", input.UserID, "newStatus", input.Status)

	existingTodo, err := uc.todoRepo.FindByID(ctx, input.ID)
	if err != nil {
		uc.logger.ErrorContext(ctx, "failed to find todo for status update", "error", err, "todoID", input.ID)
		return nil, goerr.Wrap(err, "failed to find todo by id")
	}
	if existingTodo == nil {
		return nil, goerr.New("todo not found").With("id", input.ID)
	}
	if existingTodo.UserID != input.UserID {
		uc.logger.WarnContext(ctx, "permission denied to update todo status", "todoID", input.ID, "ownerUserID", existingTodo.UserID, "requestUserID", input.UserID)
		return nil, goerr.New("permission denied").With("todoID", input.ID)
	}
	if existingTodo.IsArchived() {
		uc.logger.WarnContext(ctx, "cannot update status of archived todo", "todoID", input.ID)
		return nil, goerr.New("cannot update status of archived todo").With("todoID", input.ID)
	}

	if !input.Status.IsValid() {
		uc.logger.WarnContext(ctx, "invalid todo status provided", "status", input.Status)
		return nil, goerr.New("invalid status").With("status", input.Status)
	}

	updates := map[string]interface{}{
		"status": string(input.Status),
	}

	if err := uc.todoRepo.Update(ctx, input.ID, input.UserID, updates); err != nil {
		uc.logger.ErrorContext(ctx, "failed to update todo status", "error", err, "input", input)
		return nil, goerr.Wrap(err, "failed to update todo status in repository")
	}

	uc.logger.InfoContext(ctx, "todo status updated successfully", "todoID", input.ID)

	updatedTodo, err := uc.todoRepo.FindByID(ctx, input.ID)
	if err != nil {
		uc.logger.ErrorContext(ctx, "failed to find updated todo after status update", "error", err, "todoID", input.ID)
		existingTodo.Status = input.Status // 仮データに反映
		return &UpdateTodoStatusOutput{Todo: existingTodo}, nil
	}

	return &UpdateTodoStatusOutput{Todo: updatedTodo}, nil
}

// UpdateTodoOrder は ToDo の並び順を更新します。
func (uc *todoUsecase) UpdateTodoOrder(ctx context.Context, input UpdateTodoOrderInput) error {
	uc.logger.InfoContext(ctx, "updating todo order", "userID", input.UserID, "orderCount", len(input.Orders))

	// TODO: ユーザー存在チェック

	if len(input.Orders) == 0 {
		uc.logger.InfoContext(ctx, "no orders to update")
		return nil // 更新対象がない場合は何もしない
	}

	// リポジトリに渡す形式に変換
	repoOrders := make([]repository.UpdateTodoOrderParams, len(input.Orders))
	for i, order := range input.Orders {
		repoOrders[i] = repository.UpdateTodoOrderParams{
			ID:        order.ID,
			SortOrder: order.SortOrder,
		}
		// TODO: ここで更新対象のToDoの所有権チェックを行うべきか？ リポジトリ層に任せるか？
		// 今回はリポジトリ層でUserIDも使って一括更新することを期待する
	}

	if err := uc.todoRepo.UpdateSortOrders(ctx, input.UserID, repoOrders); err != nil {
		uc.logger.ErrorContext(ctx, "failed to update todo orders", "error", err, "userID", input.UserID)
		return goerr.Wrap(err, "failed to update todo orders in repository")
	}

	uc.logger.InfoContext(ctx, "todo orders updated successfully", "userID", input.UserID)
	return nil
}

// ArchiveTodo は ToDo をアーカイブします。
func (uc *todoUsecase) ArchiveTodo(ctx context.Context, input ArchiveTodoInput) error {
	uc.logger.InfoContext(ctx, "archiving todo", "todoID", input.ID, "userID", input.UserID)

	// ToDo の存在と所有権を確認
	existingTodo, err := uc.todoRepo.FindByID(ctx, input.ID)
	if err != nil {
		uc.logger.ErrorContext(ctx, "failed to find todo for archive", "error", err, "todoID", input.ID)
		return goerr.Wrap(err, "failed to find todo by id")
	}
	if existingTodo.UserID != input.UserID {
		uc.logger.WarnContext(ctx, "permission denied to archive todo", "todoID", input.ID, "ownerUserID", existingTodo.UserID, "requestUserID", input.UserID)
		return goerr.New("permission denied").With("todoID", input.ID)
	}
	if existingTodo.IsArchived() {
		uc.logger.WarnContext(ctx, "todo is already archived", "todoID", input.ID)
		// すでにアーカイブ済みの場合も正常終了とするか？ ->冪等性を考えるとOKとするのが良さそう
		// return goerr.New("todo already archived").With("todoID", input.ID)
		return nil
	}

	if err := uc.todoRepo.Archive(ctx, input.ID); err != nil {
		uc.logger.ErrorContext(ctx, "failed to archive todo", "error", err, "input", input)
		return goerr.Wrap(err, "failed to archive todo in repository")
	}

	uc.logger.InfoContext(ctx, "todo archived successfully", "todoID", input.ID)
	return nil
}

// UnarchiveTodo はアーカイブされた ToDo を元に戻します。
func (uc *todoUsecase) UnarchiveTodo(ctx context.Context, input UnarchiveTodoInput) (*UnarchiveTodoOutput, error) {
	uc.logger.InfoContext(ctx, "unarchiving todo", "todoID", input.ID, "userID", input.UserID)

	// ToDo の存在と所有権を確認
	existingTodo, err := uc.todoRepo.FindByID(ctx, input.ID)
	if err != nil {
		uc.logger.ErrorContext(ctx, "failed to find todo for unarchive", "error", err, "todoID", input.ID)
		return nil, goerr.Wrap(err, "failed to find todo by id")
	}
	if existingTodo.UserID != input.UserID {
		uc.logger.WarnContext(ctx, "permission denied to unarchive todo", "todoID", input.ID, "ownerUserID", existingTodo.UserID, "requestUserID", input.UserID)
		return nil, goerr.New("permission denied").With("todoID", input.ID)
	}
	if !existingTodo.IsArchived() {
		uc.logger.WarnContext(ctx, "todo is not archived", "todoID", input.ID)
		// アーカイブされていない場合も冪等性を考慮して成功とし、現在の状態を返す
		// return nil, goerr.New("todo not archived").With("todoID", input.ID)
		return &UnarchiveTodoOutput{Todo: existingTodo}, nil
	}

	if err := uc.todoRepo.Unarchive(ctx, input.ID); err != nil {
		uc.logger.ErrorContext(ctx, "failed to unarchive todo", "error", err, "input", input)
		return nil, goerr.Wrap(err, "failed to unarchive todo in repository")
	}

	uc.logger.InfoContext(ctx, "todo unarchived successfully", "todoID", input.ID)

	// 更新後のデータを取得して返す
	unarchivedTodo, err := uc.todoRepo.FindByID(ctx, input.ID)
	if err != nil {
		uc.logger.ErrorContext(ctx, "failed to find unarchived todo", "error", err, "todoID", input.ID)
		// エラーはログに残すが、処理自体は成功しているので nil を返さない
		// ArchivedAt が nil になったはずの仮データを返す
		existingTodo.ArchivedAt = nil                        // ArchivedAtをクリア
		return &UnarchiveTodoOutput{Todo: existingTodo}, nil // 仮データを返す
	}

	return &UnarchiveTodoOutput{Todo: unarchivedTodo}, nil
}
