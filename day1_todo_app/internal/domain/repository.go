package domain

type TodoRepository interface {
	// Todo
	CreateTodo(todo *Todo) error
	GetTodoByID(id int64) (*Todo, error)
	GetTodosByUserID(userID int64, limit int, cursor string, isArchived bool) ([]*Todo, string, error)
	UpdateTodo(todo *Todo) error
	DeleteTodo(id int64) error
	UpdateTodoSortOrders(todos []*Todo) error
}

type UserRepository interface {
	// User
	CreateUser(user *User) error
	GetUserByID(id int64) (*User, error)
	GetUsers() ([]*User, error)
	UpdateUser(user *User) error
}