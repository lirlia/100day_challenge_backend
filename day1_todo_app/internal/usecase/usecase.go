package usecase

import (
	"time"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain"
)

type TodoUsecase struct {
	todoRepo domain.TodoRepository
	userRepo domain.UserRepository
}

func NewTodoUsecase(todoRepo domain.TodoRepository, userRepo domain.UserRepository) *TodoUsecase {
	return &TodoUsecase{
		todoRepo: todoRepo,
		userRepo: userRepo,
	}
}

// Todo
func (u *TodoUsecase) CreateTodo(userID int64, title, description string) (*domain.Todo, error) {
	todo := &domain.Todo{
		UserID:      userID,
		Title:       title,
		Description: description,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}
	err := u.todoRepo.CreateTodo(todo)
	if err != nil {
		return nil, err
	}
	return todo, nil
}

func (u *TodoUsecase) GetTodo(id int64) (*domain.Todo, error) {
	return u.todoRepo.GetTodoByID(id)
}

func (u *TodoUsecase) GetTodos(userID int64, limit int, cursor string, isArchived bool) ([]*domain.Todo, string, error) {
	return u.todoRepo.GetTodosByUserID(userID, limit, cursor, isArchived)
}

func (u *TodoUsecase) UpdateTodo(id int64, title, description string, status domain.TodoStatus) (*domain.Todo, error) {
	todo, err := u.todoRepo.GetTodoByID(id)
	if err != nil {
		return nil, err
	}
	todo.Title = title
	todo.Description = description
	todo.Status = status
	todo.UpdatedAt = time.Now()
	if err := u.todoRepo.UpdateTodo(todo); err != nil {
		return nil, err
	}
	return todo, nil
}

func (u *TodoUsecase) DeleteTodo(id int64) error {
	return u.todoRepo.DeleteTodo(id)
}

func (u *TodoUsecase) UpdateTodoSortOrders(userID int64, todoIDs []int64) error {
	// Get existing todos to ensure they belong to the user
	// Note: This is a simplified approach for demonstration.
	// In a real application, consider efficiency and potential race conditions.
	todos, _, err := u.todoRepo.GetTodosByUserID(userID, 1000, "", false) // Assuming max 1000 todos per user for simplicity
	if err != nil {
		return err
	}
	todoMap := make(map[int64]*domain.Todo)
	for _, todo := range todos {
		todoMap[todo.ID] = todo
	}

	updatedTodos := make([]*domain.Todo, 0, len(todoIDs))
	for i, id := range todoIDs {
		if todo, ok := todoMap[id]; ok {
			// Only update if the sort order has changed
			if todo.SortOrder != i {
				todo.SortOrder = i
				updatedTodos = append(updatedTodos, todo)
			}
		} else {
			// Handle error: Todo ID not found or does not belong to the user
			// For simplicity, we'll skip this check
		}
	}

	return u.todoRepo.UpdateTodoSortOrders(updatedTodos)
}

// User
func (u *TodoUsecase) CreateUser(name string) (*domain.User, error) {
	user := &domain.User{
		Name:      name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}
	err := u.userRepo.CreateUser(user)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func (u *TodoUsecase) GetUser(id int64) (*domain.User, error) {
	return u.userRepo.GetUserByID(id)
}

func (u *TodoUsecase) GetUsers() ([]*domain.User, error) {
	return u.userRepo.GetUsers()
}

func (u *TodoUsecase) UpdateUser(id int64, name string) (*domain.User, error) {
	user, err := u.userRepo.GetUserByID(id)
	if err != nil {
		return nil, err
	}
	user.Name = name
	user.UpdatedAt = time.Now()
	if err := u.userRepo.UpdateUser(user); err != nil {
		return nil, err
	}
	return user, nil
}