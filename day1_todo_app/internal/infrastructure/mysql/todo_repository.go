package mysql

import (
	"database/sql"
	"strconv"
	"strings"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain"
)

type TodoRepository struct {
	db *sql.DB
}

func NewTodoRepository(db *sql.DB) *TodoRepository {
	return &TodoRepository{
		db: db,
	}
}

func (r *TodoRepository) CreateTodo(todo *domain.Todo) error {
	result, err := r.db.Exec(
		"INSERT INTO todos (user_id, title, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
		todo.UserID, todo.Title, todo.Description, todo.CreatedAt, todo.UpdatedAt,
	)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	todo.ID = id
	return nil
}

func (r *TodoRepository) GetTodoByID(id int64) (*domain.Todo, error) {
	row := r.db.QueryRow("SELECT id, user_id, title, description, status, sort_order, created_at, updated_at FROM todos WHERE id = ?", id)
	var todo domain.Todo
	err := row.Scan(&todo.ID, &todo.UserID, &todo.Title, &todo.Description, &todo.Status, &todo.SortOrder, &todo.CreatedAt, &todo.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &todo, nil
}

func (r *TodoRepository) GetTodosByUserID(userID int64, limit int, cursor string, isArchived bool) ([]*domain.Todo, string, error) {
	query := "SELECT id, user_id, title, description, status, sort_order, created_at, updated_at FROM todos WHERE user_id = ? AND status = ?"
	args := []interface{}{userID}
	if isArchived {
		args = append(args, domain.TodoStatusArchived)
	} else {
		args = append(args, domain.TodoStatusUnarchived)
	}

	if cursor != "" {
		cursorID, err := strconv.ParseInt(cursor, 10, 64)
		if err != nil {
			return nil, "", err
		}
		query += " AND id < ?"
		args = append(args, cursorID)
	}
	query += " ORDER BY sort_order DESC LIMIT ?"
	args = append(args, limit+1)

	rows, err := r.db.Query(query, args...)
	if err != nil {
		return nil, "", err
	}
	defer rows.Close()

	var todos []*domain.Todo
	for rows.Next() {
		var todo domain.Todo
		err := rows.Scan(&todo.ID, &todo.UserID, &todo.Title, &todo.Description, &todo.Status, &todo.SortOrder, &todo.CreatedAt, &todo.UpdatedAt)
		if err != nil {
			return nil, "", err
		}
		todos = append(todos, &todo)
	}

	nextCursor := ""
	if len(todos) > limit {
		nextCursor = strconv.FormatInt(todos[limit-1].ID, 10)
		todos = todos[:limit]
	}

	return todos, nextCursor, nil
}

func (r *TodoRepository) UpdateTodo(todo *domain.Todo) error {
	_, err := r.db.Exec(
		"UPDATE todos SET title = ?, description = ?, status = ?, updated_at = ? WHERE id = ?",
		todo.Title, todo.Description, todo.Status, todo.UpdatedAt, todo.ID,
	)
	return err
}

func (r *TodoRepository) DeleteTodo(id int64) error {
	_, err := r.db.Exec("DELETE FROM todos WHERE id = ?", id)
	return err
}

func (r *TodoRepository) UpdateTodoSortOrders(todos []*domain.Todo) error {
	if len(todos) == 0 {
		return nil
	}

	tx, err := r.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() // エラー発生時はロールバック

	query := "UPDATE todos SET sort_order = CASE id "
	ids := []interface{}{}
	for _, todo := range todos {
		query += " WHEN ? THEN ?"
		ids = append(ids, todo.ID, todo.SortOrder)
	}
	query += " END WHERE id IN (?" + strings.Repeat(",?", len(todos)-1) + ")"
	idArgs := make([]interface{}, len(todos))
	for i, todo := range todos {
		idArgs[i] = todo.ID
	}
	args := append(ids, idArgs...)

	_, err = tx.Exec(query, args...)
	if err != nil {
		return err
	}

	return tx.Commit()
}