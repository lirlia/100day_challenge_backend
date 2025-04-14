package domain

import (
	"time"

	"github.com/m-mizutani/goerr"
)

type TodoStatus int

const (
	TodoStatusUnarchived TodoStatus = iota // 未アーカイブ
	TodoStatusArchived                   // アーカイブ済み
)

type Todo struct {
	ID          int64      `json:"id"`
	UserID      int64      `json:"user_id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      TodoStatus `json:"status"`
	SortOrder   int        `json:"sort_order"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

func NewTodo(userID int64, title string, description string, status TodoStatus) (*Todo, error) {
	if title == "" {
		return nil, goerr.New("title is required")
	}

	if !isValidStatus(status) {
		return nil, goerr.New("invalid status")
	}

	return &Todo{
		UserID:      userID,
		Title:       title,
		Description: description,
		Status:      status,
		SortOrder:   0, // 新規作成時は先頭に配置
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}, nil
}

func (t *Todo) UpdateStatus(status TodoStatus) error {
	if !isValidStatus(status) {
		return goerr.New("invalid status")
	}

	t.Status = status
	t.UpdatedAt = time.Now()
	return nil
}

func (t *Todo) UpdateTitle(title string) error {
	if title == "" {
		return goerr.New("title is required")
	}

	t.Title = title
	t.UpdatedAt = time.Now()
	return nil
}

func (t *Todo) UpdateDescription(description string) error {
	t.Description = description
	t.UpdatedAt = time.Now()
	return nil
}

func (t *Todo) Archive() {
	t.Status = TodoStatusArchived
	t.UpdatedAt = time.Now()
}

func (t *Todo) Restore() {
	t.Status = TodoStatusUnarchived
	t.UpdatedAt = time.Now()
}

func (t *Todo) UpdateSortOrder(order int) {
	t.SortOrder = order
	t.UpdatedAt = time.Now()
}

func isValidStatus(status TodoStatus) bool {
	switch status {
	case TodoStatusUnarchived, TodoStatusArchived:
		return true
	default:
		return false
	}
}