package domain

import (
	"time"

	"github.com/m-mizutani/goerr"
)

type User struct {
	ID        int64
	Name      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

func NewUser(name string) (*User, error) {
	if name == "" {
		return nil, goerr.New("name is required")
	}

	return &User{
		Name:      name,
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}, nil
}

func (u *User) UpdateName(name string) error {
	if name == "" {
		return goerr.New("name is required")
	}

	u.Name = name
	u.UpdatedAt = time.Now()
	return nil
}