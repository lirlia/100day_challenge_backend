// internal/domain/model/user.go
package model

import "time"

// User はドメイン層のユーザーモデルを表します。
type User struct {
	ID        int64
	Name      string
	CreatedAt time.Time
}
