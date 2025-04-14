package usecase

import (
	"context"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain"
)

type TodoRepository interface {
	CreateTodo(ctx context.Context, todo *domain.Todo) error
	GetTodoByID(ctx context.Context, id int64) (*domain.Todo, error)
	GetTodosByUserID(ctx context.Context, userID int64, cursor int64, limit int) ([]*domain.Todo, error)
	UpdateTodo(ctx context.Context, todo *domain.Todo) error
	DeleteTodo(ctx context.Context, id int64) error
	UpdateTodoSortOrders(ctx context.Context, todoIDs []int64) error
}

type TodoUseCase struct {
	todoRepo TodoRepository
}

func NewTodoUseCase(todoRepo TodoRepository) *TodoUseCase {
	return &TodoUseCase{
		todoRepo: todoRepo,
	}
}

func (u *TodoUseCase) CreateTodo(ctx context.Context, todo *domain.Todo) error {
	return u.todoRepo.CreateTodo(ctx, todo)
}

func (u *TodoUseCase) GetTodoByID(ctx context.Context, id int64) (*domain.Todo, error) {
	return u.todoRepo.GetTodoByID(ctx, id)
}

func (u *TodoUseCase) GetTodosByUserID(ctx context.Context, userID int64, cursor int64, limit int) ([]*domain.Todo, error) {
	return u.todoRepo.GetTodosByUserID(ctx, userID, cursor, limit)
}

func (u *TodoUseCase) UpdateTodo(ctx context.Context, todo *domain.Todo) error {
	return u.todoRepo.UpdateTodo(ctx, todo)
}

func (u *TodoUseCase) DeleteTodo(ctx context.Context, id int64) error {
	return u.todoRepo.DeleteTodo(ctx, id)
}

func (u *TodoUseCase) UpdateTodoSortOrders(ctx context.Context, todoIDs []int64) error {
	return u.todoRepo.UpdateTodoSortOrders(ctx, todoIDs)
}
