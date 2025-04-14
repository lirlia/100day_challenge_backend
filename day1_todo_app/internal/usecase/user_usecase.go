package usecase

import (
	"context"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain"
)

type UserRepository interface {
	CreateUser(ctx context.Context, user *domain.User) error
	GetUserByID(ctx context.Context, id int64) (*domain.User, error)
	GetUsers(ctx context.Context) ([]*domain.User, error)
	UpdateUser(ctx context.Context, user *domain.User) error
}

type UserUseCase struct {
	userRepo UserRepository
}

func NewUserUseCase(userRepo UserRepository) *UserUseCase {
	return &UserUseCase{
		userRepo: userRepo,
	}
}

func (u *UserUseCase) CreateUser(ctx context.Context, user *domain.User) error {
	return u.userRepo.CreateUser(ctx, user)
}

func (u *UserUseCase) GetUserByID(ctx context.Context, id int64) (*domain.User, error) {
	return u.userRepo.GetUserByID(ctx, id)
}

func (u *UserUseCase) GetUsers(ctx context.Context) ([]*domain.User, error) {
	return u.userRepo.GetUsers(ctx)
}

func (u *UserUseCase) UpdateUser(ctx context.Context, user *domain.User) error {
	return u.userRepo.UpdateUser(ctx, user)
}