// internal/domain/model/todo.go
package model

import "time"

// TodoStatus は ToDo の状態を表す型です。
type TodoStatus string

const (
	TodoStatusNotStarted TodoStatus = "not started"
	TodoStatusInProgress TodoStatus = "in progress"
	TodoStatusDone       TodoStatus = "done"
	TodoStatusPending    TodoStatus = "pending"
	TodoStatusCancel     TodoStatus = "cancel"
)

// IsValid はステータスが有効な値か検証します。
func (s TodoStatus) IsValid() bool {
	switch s {
	case TodoStatusNotStarted, TodoStatusInProgress, TodoStatusDone, TodoStatusPending, TodoStatusCancel:
		return true
	default:
		return false
	}
}

// Todo はドメイン層の ToDo モデルを表します。
type Todo struct {
	ID          int64
	UserID      int64
	Title       string
	Description string     // ポインタ型にするか検討 (NULL許容のため)。今回は string の空文字で表現。
	Status      TodoStatus // Status フィールドを復活
	SortOrder   float64
	CreatedAt   time.Time
	ArchivedAt  *time.Time // アーカイブされていない場合は nil
}

// IsArchived は ToDo がアーカイブされているか判定します。
func (t *Todo) IsArchived() bool {
	return t.ArchivedAt != nil
}
