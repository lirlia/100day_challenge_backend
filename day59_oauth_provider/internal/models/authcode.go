package models

import (
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/database"
)

// AuthorizationCode represents an authorization code
type AuthorizationCode struct {
	Code                string    `json:"code"`
	ClientID            string    `json:"client_id"`
	UserID              string    `json:"user_id"`
	RedirectURI         string    `json:"redirect_uri"`
	Scopes              []string  `json:"scopes"`
	State               string    `json:"state,omitempty"`
	Nonce               string    `json:"nonce,omitempty"`
	CodeChallenge       string    `json:"code_challenge,omitempty"`
	CodeChallengeMethod string    `json:"code_challenge_method,omitempty"`
	ExpiresAt           time.Time `json:"expires_at"`
	CreatedAt           time.Time `json:"created_at"`
}

// CreateAuthorizationCode creates a new authorization code
func CreateAuthorizationCode(clientID, userID, redirectURI string, scopes []string, state, nonce, codeChallenge, codeChallengeMethod string) (*AuthorizationCode, error) {
	code := &AuthorizationCode{
		Code:                uuid.New().String(),
		ClientID:            clientID,
		UserID:              userID,
		RedirectURI:         redirectURI,
		Scopes:              scopes,
		State:               state,
		Nonce:               nonce,
		CodeChallenge:       codeChallenge,
		CodeChallengeMethod: codeChallengeMethod,
		ExpiresAt:           time.Now().Add(10 * time.Minute), // 10分で有効期限
	}

	scopesJSON, _ := json.Marshal(scopes)

	query := `INSERT INTO authorization_codes
			  (code, client_id, user_id, redirect_uri, scopes, state, nonce, code_challenge, code_challenge_method, expires_at)
			  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

	_, err := database.DB.Exec(query, code.Code, code.ClientID, code.UserID, code.RedirectURI,
		string(scopesJSON), code.State, code.Nonce, code.CodeChallenge, code.CodeChallengeMethod, code.ExpiresAt)
	if err != nil {
		return nil, err
	}

	return code, nil
}

// GetAuthorizationCode retrieves an authorization code
func GetAuthorizationCode(codeValue string) (*AuthorizationCode, error) {
	query := `SELECT code, client_id, user_id, redirect_uri, scopes, state, nonce, code_challenge, code_challenge_method, expires_at, created_at
			  FROM authorization_codes WHERE code = ?`

	var code AuthorizationCode
	var scopesJSON string
	var state, nonce, codeChallenge, codeChallengeMethod sql.NullString

	err := database.DB.QueryRow(query, codeValue).Scan(
		&code.Code, &code.ClientID, &code.UserID, &code.RedirectURI,
		&scopesJSON, &state, &nonce, &codeChallenge, &codeChallengeMethod,
		&code.ExpiresAt, &code.CreatedAt,
	)
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal([]byte(scopesJSON), &code.Scopes)

	if state.Valid {
		code.State = state.String
	}
	if nonce.Valid {
		code.Nonce = nonce.String
	}
	if codeChallenge.Valid {
		code.CodeChallenge = codeChallenge.String
	}
	if codeChallengeMethod.Valid {
		code.CodeChallengeMethod = codeChallengeMethod.String
	}

	return &code, nil
}

// DeleteAuthorizationCode deletes an authorization code (consumed)
func DeleteAuthorizationCode(codeValue string) error {
	query := `DELETE FROM authorization_codes WHERE code = ?`
	_, err := database.DB.Exec(query, codeValue)
	return err
}

// IsExpired checks if the authorization code is expired
func (ac *AuthorizationCode) IsExpired() bool {
	return time.Now().After(ac.ExpiresAt)
}

// HasPKCE checks if this authorization code was created with PKCE
func (ac *AuthorizationCode) HasPKCE() bool {
	return ac.CodeChallenge != ""
}

// ValidatePKCE validates the code verifier against the code challenge
func (ac *AuthorizationCode) ValidatePKCE(codeVerifier string) bool {
	if !ac.HasPKCE() {
		return true // PKCEを使用していない場合は検証をスキップ
	}

	if ac.CodeChallengeMethod != "S256" {
		return false // S256のみサポート
	}

	// SHA256でハッシュ化
	hash := sha256.Sum256([]byte(codeVerifier))
	encodedHash := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(hash[:])

	return encodedHash == ac.CodeChallenge
}

// CleanupExpiredCodes deletes expired authorization codes
func CleanupExpiredCodes() error {
	query := `DELETE FROM authorization_codes WHERE expires_at < ?`
	_, err := database.DB.Exec(query, time.Now())
	return err
}
