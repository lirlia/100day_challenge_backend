package models

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/database"
	"golang.org/x/crypto/bcrypt"
)

// User represents a user in the system
type User struct {
	ID           string                 `json:"id"`
	Email        string                 `json:"email"`
	PasswordHash string                 `json:"-"`
	Name         string                 `json:"name"`
	Profile      map[string]interface{} `json:"profile,omitempty"`
	CreatedAt    time.Time              `json:"created_at"`
	UpdatedAt    time.Time              `json:"updated_at"`
}

// CreateUser creates a new user
func CreateUser(email, password, name string, profile map[string]interface{}) (*User, error) {
	// パスワードをハッシュ化
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return nil, err
	}

	user := &User{
		ID:           uuid.New().String(),
		Email:        email,
		PasswordHash: string(passwordHash),
		Name:         name,
		Profile:      profile,
	}

	var profileJSON []byte
	if profile != nil {
		profileJSON, _ = json.Marshal(profile)
	}

	query := `INSERT INTO users (id, email, password_hash, name, profile) VALUES (?, ?, ?, ?, ?)`
	_, err = database.DB.Exec(query, user.ID, user.Email, user.PasswordHash, user.Name, string(profileJSON))
	if err != nil {
		return nil, err
	}

	return user, nil
}

// GetUserByID retrieves a user by ID
func GetUserByID(userID string) (*User, error) {
	query := `SELECT id, email, password_hash, name, profile, created_at, updated_at FROM users WHERE id = ?`

	var user User
	var profileJSON sql.NullString

	err := database.DB.QueryRow(query, userID).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.Name, &profileJSON,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if profileJSON.Valid && profileJSON.String != "" {
		_ = json.Unmarshal([]byte(profileJSON.String), &user.Profile)
	}

	return &user, nil
}

// GetUserByEmail retrieves a user by email
func GetUserByEmail(email string) (*User, error) {
	query := `SELECT id, email, password_hash, name, profile, created_at, updated_at FROM users WHERE email = ?`

	var user User
	var profileJSON sql.NullString

	err := database.DB.QueryRow(query, email).Scan(
		&user.ID, &user.Email, &user.PasswordHash, &user.Name, &profileJSON,
		&user.CreatedAt, &user.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	if profileJSON.Valid && profileJSON.String != "" {
		_ = json.Unmarshal([]byte(profileJSON.String), &user.Profile)
	}

	return &user, nil
}

// GetAllUsers retrieves all users
func GetAllUsers() ([]*User, error) {
	query := `SELECT id, email, password_hash, name, profile, created_at, updated_at FROM users ORDER BY created_at DESC`

	rows, err := database.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var users []*User
	for rows.Next() {
		var user User
		var profileJSON sql.NullString

		err := rows.Scan(
			&user.ID, &user.Email, &user.PasswordHash, &user.Name, &profileJSON,
			&user.CreatedAt, &user.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		if profileJSON.Valid && profileJSON.String != "" {
			_ = json.Unmarshal([]byte(profileJSON.String), &user.Profile)
		}

		users = append(users, &user)
	}

	return users, nil
}

// AuthenticateUser authenticates a user with email and password
func AuthenticateUser(email, password string) (*User, error) {
	user, err := GetUserByEmail(email)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // ユーザーが見つからない
		}
		return nil, err
	}

	// パスワード検証
	err = bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password))
	if err != nil {
		return nil, nil // パスワードが一致しない
	}

	return user, nil
}

// UpdateUser updates an existing user
func (u *User) Update() error {
	var profileJSON []byte
	if u.Profile != nil {
		profileJSON, _ = json.Marshal(u.Profile)
	}

	query := `UPDATE users SET name = ?, profile = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
	_, err := database.DB.Exec(query, u.Name, string(profileJSON), u.ID)
	return err
}

// DeleteUser deletes a user
func DeleteUser(userID string) error {
	query := `DELETE FROM users WHERE id = ?`
	_, err := database.DB.Exec(query, userID)
	return err
}

// GetUserInfoClaims returns user info claims for JWT/userinfo endpoint
func (u *User) GetUserInfoClaims(scopes []string) map[string]interface{} {
	claims := make(map[string]interface{})

	// sub は常に含める
	claims["sub"] = u.ID

	// scope に応じて情報を追加
	for _, scope := range scopes {
		switch scope {
		case "profile":
			claims["name"] = u.Name
			if u.Profile != nil {
				for key, value := range u.Profile {
					claims[key] = value
				}
			}
		case "email":
			claims["email"] = u.Email
		}
	}

	return claims
}
