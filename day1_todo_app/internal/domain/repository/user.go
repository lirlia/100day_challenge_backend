// internal/domain/repository/user.go
package repository

import (
	"context"

	"github.com/lirlia/100day_challenge_backend/day1_todo_app/internal/domain/model"
)

// UserRepository はユーザーデータへのアクセスを抽象化するインターフェースです。
type UserRepository interface {
	// FindAll はすべてのユーザーを取得します。
	FindAll(ctx context.Context) ([]*model.User, error)
	// FindByID は指定されたIDのユーザーを取得します。
	FindByID(ctx context.Context, id int64) (*model.User, error)
	// FindByName は指定された名前のユーザーを取得します。
	FindByName(ctx context.Context, name string) (*model.User, error)
}
