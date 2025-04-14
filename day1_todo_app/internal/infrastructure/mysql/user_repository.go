package mysql

import (
	"database/sql"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain"
)

type UserRepository struct {
	db *sql.DB
}

func NewUserRepository(db *sql.DB) *UserRepository {
	return &UserRepository{db: db}
}

func (r *UserRepository) CreateUser(user *domain.User) error {
	result, err := r.db.Exec(
		"INSERT INTO users (name, created_at, updated_at) VALUES (?, ?, ?)",
		user.Name, user.CreatedAt, user.UpdatedAt,
	)
	if err != nil {
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	user.ID = id
	return nil
}

func (r *UserRepository) GetUserByID(id int64) (*domain.User, error) {
	row := r.db.QueryRow("SELECT id, name, created_at, updated_at FROM users WHERE id = ?", id)
	var user domain.User
	err := row.Scan(&user.ID, &user.Name, &user.CreatedAt, &user.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &user, nil
}

func (r *UserRepository) GetUsers() ([]*domain.User, error) {
	rows, err := r.db.Query("SELECT id, name, created_at, updated_at FROM users ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*domain.User
	for rows.Next() {
		var user domain.User
		err := rows.Scan(&user.ID, &user.Name, &user.CreatedAt, &user.UpdatedAt)
		if err != nil {
			return nil, err
		}
		users = append(users, &user)
	}
	return users, nil
}

func (r *UserRepository) UpdateUser(user *domain.User) error {
	_, err := r.db.Exec(
		"UPDATE users SET name = ?, updated_at = ? WHERE id = ?",
		user.Name, user.UpdatedAt, user.ID,
	)
	return err
}