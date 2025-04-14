// internal/domain/repository/todo.go
package repository

import (
	"context"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/model"
)

// FindTodosParams は ToDo 検索のパラメータです。
type FindTodosParams struct {
	UserID          int64
	Limit           int
	Page            int  // ページ番号 (1-indexed)
	IncludeArchived bool // アーカイブ済みを含めるか
}

// UpdateTodoOrderParams は ToDo の並び替えパラメータです。
type UpdateTodoOrderParams struct {
	ID        int64
	SortOrder float64
}

// TodoRepository は ToDo データへのアクセスを抽象化するインターフェースです。
type TodoRepository interface {
	// FindByUserID は指定されたユーザーの ToDo を検索します。
	// ページネーションとアーカイブ済みを含めるかのオプションがあります。
	// デフォルトソートは CreatedAt 降順、ユーザー定義ソートがあればそれを優先します。
	Find(ctx context.Context, params FindTodosParams) ([]*model.Todo, error)

	// FindByID は指定されたIDの ToDo を取得します。
	FindByID(ctx context.Context, id int64) (*model.Todo, error)

	// Create は新しい ToDo を作成します。
	Create(ctx context.Context, todo *model.Todo) error

	// Update は指定された ID と UserID の ToDo を更新します。
	// updates map に更新するフィールドと値を指定します。
	Update(ctx context.Context, id int64, userID int64, updates map[string]interface{}) error

	// UpdateStatus は ToDo のステータスのみを更新します。(Update に統合されたためコメントアウト)
	// UpdateStatus(ctx context.Context, id int64, status model.TodoStatus) error

	// UpdateSortOrders は複数の ToDo の sort_order を一括で更新します。
	UpdateSortOrders(ctx context.Context, userID int64, orders []UpdateTodoOrderParams) error

	// Archive は ToDo をアーカイブします (論理削除)。
	Archive(ctx context.Context, id int64) error

	// Unarchive はアーカイブされた ToDo を元に戻します。
	Unarchive(ctx context.Context, id int64) error
}
