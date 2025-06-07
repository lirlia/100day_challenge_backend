package models

import (
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/database"
)

// RefreshToken represents a refresh token
type RefreshToken struct {
	ID        string    `json:"id"`
	Token     string    `json:"token"`
	ClientID  string    `json:"client_id"`
	UserID    string    `json:"user_id"`
	Scopes    []string  `json:"scopes"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// AccessToken represents an access token record
type AccessToken struct {
	ID        string    `json:"id"`
	TokenHash string    `json:"token_hash"`
	ClientID  string    `json:"client_id"`
	UserID    *string   `json:"user_id,omitempty"` // Client Credentialsの場合はnull
	Scopes    []string  `json:"scopes"`
	ExpiresAt time.Time `json:"expires_at"`
	CreatedAt time.Time `json:"created_at"`
}

// CreateRefreshToken creates a new refresh token
func CreateRefreshToken(clientID, userID string, scopes []string) (*RefreshToken, error) {
	token := &RefreshToken{
		ID:        uuid.New().String(),
		Token:     uuid.New().String(),
		ClientID:  clientID,
		UserID:    userID,
		Scopes:    scopes,
		ExpiresAt: time.Now().Add(30 * 24 * time.Hour), // 30日間有効
	}

	scopesJSON, _ := json.Marshal(scopes)

	query := `INSERT INTO refresh_tokens (id, token, client_id, user_id, scopes, expires_at)
			  VALUES (?, ?, ?, ?, ?, ?)`

	_, err := database.DB.Exec(query, token.ID, token.Token, token.ClientID, token.UserID,
		string(scopesJSON), token.ExpiresAt)
	if err != nil {
		return nil, err
	}

	return token, nil
}

// GetRefreshToken retrieves a refresh token
func GetRefreshToken(tokenValue string) (*RefreshToken, error) {
	query := `SELECT id, token, client_id, user_id, scopes, expires_at, created_at
			  FROM refresh_tokens WHERE token = ?`

	var token RefreshToken
	var scopesJSON string

	err := database.DB.QueryRow(query, tokenValue).Scan(
		&token.ID, &token.Token, &token.ClientID, &token.UserID,
		&scopesJSON, &token.ExpiresAt, &token.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal([]byte(scopesJSON), &token.Scopes)

	return &token, nil
}

// DeleteRefreshToken deletes a refresh token
func DeleteRefreshToken(tokenValue string) error {
	query := `DELETE FROM refresh_tokens WHERE token = ?`
	_, err := database.DB.Exec(query, tokenValue)
	return err
}

// IsExpired checks if the refresh token is expired
func (rt *RefreshToken) IsExpired() bool {
	return time.Now().After(rt.ExpiresAt)
}

// CreateAccessTokenRecord creates a record of an access token (for tracking)
func CreateAccessTokenRecord(token, clientID string, userID *string, scopes []string) (*AccessToken, error) {
	// トークンをハッシュ化して保存
	hash := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(hash[:])

	accessToken := &AccessToken{
		ID:        uuid.New().String(),
		TokenHash: tokenHash,
		ClientID:  clientID,
		UserID:    userID,
		Scopes:    scopes,
		ExpiresAt: time.Now().Add(1 * time.Hour), // 1時間有効
	}

	scopesJSON, _ := json.Marshal(scopes)

	query := `INSERT INTO access_tokens (id, token_hash, client_id, user_id, scopes, expires_at)
			  VALUES (?, ?, ?, ?, ?, ?)`

	_, err := database.DB.Exec(query, accessToken.ID, accessToken.TokenHash, accessToken.ClientID,
		accessToken.UserID, string(scopesJSON), accessToken.ExpiresAt)
	if err != nil {
		return nil, err
	}

	return accessToken, nil
}

// GetAccessTokenRecord retrieves an access token record by token hash
func GetAccessTokenRecord(token string) (*AccessToken, error) {
	hash := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(hash[:])

	query := `SELECT id, token_hash, client_id, user_id, scopes, expires_at, created_at
			  FROM access_tokens WHERE token_hash = ?`

	var accessToken AccessToken
	var scopesJSON string
	var userID sql.NullString

	err := database.DB.QueryRow(query, tokenHash).Scan(
		&accessToken.ID, &accessToken.TokenHash, &accessToken.ClientID, &userID,
		&scopesJSON, &accessToken.ExpiresAt, &accessToken.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	if userID.Valid {
		accessToken.UserID = &userID.String
	}

	_ = json.Unmarshal([]byte(scopesJSON), &accessToken.Scopes)

	return &accessToken, nil
}

// IsExpired checks if the access token is expired
func (at *AccessToken) IsExpired() bool {
	return time.Now().After(at.ExpiresAt)
}

// RevokeAccessToken revokes an access token
func RevokeAccessToken(token string) error {
	hash := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(hash[:])

	query := `DELETE FROM access_tokens WHERE token_hash = ?`
	_, err := database.DB.Exec(query, tokenHash)
	return err
}

// GetAllTokens retrieves all tokens for a user (for admin purposes)
func GetAllTokens(userID string) ([]*RefreshToken, error) {
	query := `SELECT id, token, client_id, user_id, scopes, expires_at, created_at
			  FROM refresh_tokens WHERE user_id = ? ORDER BY created_at DESC`

	rows, err := database.DB.Query(query, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tokens []*RefreshToken
	for rows.Next() {
		var token RefreshToken
		var scopesJSON string

		err := rows.Scan(
			&token.ID, &token.Token, &token.ClientID, &token.UserID,
			&scopesJSON, &token.ExpiresAt, &token.CreatedAt,
		)
		if err != nil {
			return nil, err
		}

		_ = json.Unmarshal([]byte(scopesJSON), &token.Scopes)
		tokens = append(tokens, &token)
	}

	return tokens, nil
}

// CleanupExpiredTokens deletes expired tokens
func CleanupExpiredTokens() error {
	queries := []string{
		`DELETE FROM refresh_tokens WHERE expires_at < ?`,
		`DELETE FROM access_tokens WHERE expires_at < ?`,
	}

	for _, query := range queries {
		if _, err := database.DB.Exec(query, time.Now()); err != nil {
			return err
		}
	}

	return nil
}
