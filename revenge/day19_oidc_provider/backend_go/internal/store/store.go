package store

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jmoiron/sqlx"
	_ "github.com/mattn/go-sqlite3" // SQLite driver
)

// Storer defines the interface for database operations.
// We will add methods for User, Client, AuthCode, Session etc. later.
type Storer interface {
	// User methods
	GetUserByID(id string) (*User, error)
	GetUserByEmail(email string) (*User, error)
	CreateUser(user *User) error

	// Client methods
	GetClient(clientID string) (*Client, error)
	CreateClient(client *Client) error

	// Session methods
	CreateSession(session *Session) error
	GetSession(sessionID string) (*Session, error)
	DeleteSession(sessionID string) error
	UpdateSessionLastAccessed(sessionID string) error

	// Interaction methods
	CreateInteraction(interaction *Interaction) error
	GetInteraction(interactionID string) (*Interaction, error)
	UpdateInteractionResult(interactionID string, result map[string]interface{}) error
	DeleteInteraction(interactionID string) error

	// Authorization Code methods
	CreateAuthorizationCode(authCode *AuthorizationCode) error
	GetAuthorizationCode(code string) (*AuthorizationCode, error)
	DeleteAuthorizationCode(code string) error

	// Grant methods
	GetGrant(userID, clientID string) (*Grant, error)
	CreateOrUpdateGrant(grant *Grant) error

	// Refresh Token methods (Add later if needed)
}

// DBStore implements the Storer interface using sqlx.
type DBStore struct {
	DB *sqlx.DB
}

// NewDBStore creates a new DBStore instance.
func NewDBStore(dataSourceName string) (*DBStore, error) {
	db, err := sqlx.Connect("sqlite3", dataSourceName)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Optional: Set connection pool settings
	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(25)
	db.SetConnMaxLifetime(5 * time.Minute)

	return &DBStore{DB: db},
		nil
}

// Close closes the database connection.
func (s *DBStore) Close() error {
	return s.DB.Close()
}

// --- Data Models ---
// These structs correspond to the database tables.

type User struct {
	ID           string    `db:"id"`
	Email        string    `db:"email"`
	PasswordHash string    `db:"password_hash"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`
}

type Client struct {
	ID           string    `db:"id"`
	SecretHash   string    `db:"secret_hash"`
	RedirectURIs string    `db:"redirect_uris"` // Stored as JSON string
	Name         string    `db:"name"`
	CreatedAt    time.Time `db:"created_at"`
	UpdatedAt    time.Time `db:"updated_at"`

	// Parsed redirect URIs for easier use
	ParsedRedirectURIs []string `db:"-"`
}

type Session struct {
	ID             string    `db:"id"`
	UserID         string    `db:"user_id"`
	IPAddress      *string   `db:"ip_address"` // Use pointer for nullable fields
	UserAgent      *string   `db:"user_agent"` // Use pointer for nullable fields
	ExpiresAt      time.Time `db:"expires_at"`
	CreatedAt      time.Time `db:"created_at"`
	LastAccessedAt time.Time `db:"last_accessed_at"`
}

type Interaction struct {
	ID        string    `db:"id"`
	Prompt    string    `db:"prompt"`
	Params    string    `db:"params"` // Store OIDC request params as JSON string
	Result    *string   `db:"result"` // Store result as JSON string (nullable)
	ReturnTo  string    `db:"return_to"`
	SessionID *string   `db:"session_id"` // Nullable
	ExpiresAt time.Time `db:"expires_at"`
	CreatedAt time.Time `db:"created_at"`
}

type AuthorizationCode struct {
	Code                string    `db:"code"`
	ClientID            string    `db:"client_id"`
	UserID              string    `db:"user_id"`
	RedirectURI         string    `db:"redirect_uri"`
	Scopes              string    `db:"scopes"` // Space-separated
	Nonce               *string   `db:"nonce"`
	CodeChallenge       *string   `db:"code_challenge"`
	CodeChallengeMethod *string   `db:"code_challenge_method"`
	ExpiresAt           time.Time `db:"expires_at"`
	CreatedAt           time.Time `db:"created_at"`
}

type Grant struct {
	ID        string     `db:"id"`
	UserID    string     `db:"user_id"`
	ClientID  string     `db:"client_id"`
	Scopes    string     `db:"scopes"` // Store as JSON string or space-separated
	CreatedAt time.Time  `db:"created_at"`
	ExpiresAt *time.Time `db:"expires_at"` // Nullable
}

// --- User Methods ---

func (s *DBStore) GetUserByID(id string) (*User, error) {
	user := &User{}
	err := s.DB.Get(user, "SELECT * FROM users WHERE id = ?", id)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("user not found")
		}
		return nil, fmt.Errorf("failed to get user by id: %w", err)
	}
	return user, nil
}

func (s *DBStore) GetUserByEmail(email string) (*User, error) {
	user := &User{}
	err := s.DB.Get(user, "SELECT * FROM users WHERE email = ?", email)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Return nil, nil if not found, let caller handle
		}
		return nil, fmt.Errorf("failed to get user by email: %w", err)
	}
	return user, nil
}

func (s *DBStore) CreateUser(user *User) error {
	query := `INSERT INTO users (id, email, password_hash, created_at, updated_at)
              VALUES (:id, :email, :password_hash, :created_at, :updated_at)`
	_, err := s.DB.NamedExec(query, user)
	if err != nil {
		return fmt.Errorf("failed to create user: %w", err)
	}
	return nil
}

// --- Client Methods ---

func (s *DBStore) GetClient(clientID string) (*Client, error) {
	client := &Client{}
	err := s.DB.Get(client, "SELECT * FROM clients WHERE id = ?", clientID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("client not found")
		}
		return nil, fmt.Errorf("failed to get client: %w", err)
	}

	// Parse redirect URIs from JSON string
	if err := json.Unmarshal([]byte(client.RedirectURIs), &client.ParsedRedirectURIs); err != nil {
		return nil, fmt.Errorf("failed to parse client redirect URIs: %w", err)
	}

	return client, nil
}

// CreateClient adds a new client to the database.
func (s *DBStore) CreateClient(client *Client) error {
	// Ensure RedirectURIs is valid JSON before inserting (or handle potential errors)
	var js []string
	if err := json.Unmarshal([]byte(client.RedirectURIs), &js); err != nil {
		return fmt.Errorf("invalid redirect_uris format for client %s: must be a JSON array string", client.ID)
	}

	query := `INSERT INTO clients (id, secret_hash, redirect_uris, name, created_at, updated_at)
              VALUES (:id, :secret_hash, :redirect_uris, :name, :created_at, :updated_at)`
	_, err := s.DB.NamedExec(query, client)
	if err != nil {
		return fmt.Errorf("failed to create client %s: %w", client.ID, err)
	}
	return nil
}

// --- Session Methods ---

func (s *DBStore) CreateSession(session *Session) error {
	query := `INSERT INTO sessions (id, user_id, ip_address, user_agent, expires_at, created_at, last_accessed_at)
              VALUES (:id, :user_id, :ip_address, :user_agent, :expires_at, :created_at, :last_accessed_at)`
	_, err := s.DB.NamedExec(query, session)
	if err != nil {
		return fmt.Errorf("failed to create session: %w", err)
	}
	return nil
}

func (s *DBStore) GetSession(sessionID string) (*Session, error) {
	session := &Session{}
	err := s.DB.Get(session, "SELECT * FROM sessions WHERE id = ?", sessionID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("session not found")
		}
		return nil, fmt.Errorf("failed to get session: %w", err)
	}
	return session, nil
}

func (s *DBStore) DeleteSession(sessionID string) error {
	query := `DELETE FROM sessions WHERE id = ?`
	_, err := s.DB.Exec(query, sessionID)
	if err != nil {
		return fmt.Errorf("failed to delete session: %w", err)
	}
	return nil
}

func (s *DBStore) UpdateSessionLastAccessed(sessionID string) error {
	query := `UPDATE sessions SET last_accessed_at = ? WHERE id = ?`
	_, err := s.DB.Exec(query, time.Now(), sessionID)
	if err != nil {
		return fmt.Errorf("failed to update session last accessed time: %w", err)
	}
	return nil
}

// --- Interaction Methods ---

func (s *DBStore) CreateInteraction(interaction *Interaction) error {
	query := `INSERT INTO interactions (id, prompt, params, result, return_to, session_id, expires_at, created_at)
              VALUES (:id, :prompt, :params, :result, :return_to, :session_id, :expires_at, :created_at)`
	_, err := s.DB.NamedExec(query, interaction)
	if err != nil {
		return fmt.Errorf("failed to create interaction: %w", err)
	}
	return nil
}

func (s *DBStore) GetInteraction(interactionID string) (*Interaction, error) {
	interaction := &Interaction{}
	err := s.DB.Get(interaction, "SELECT * FROM interactions WHERE id = ?", interactionID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("interaction not found")
		}
		return nil, fmt.Errorf("failed to get interaction: %w", err)
	}
	// Check expiration
	if time.Now().After(interaction.ExpiresAt) {
		// Optionally delete expired interaction
		_ = s.DeleteInteraction(interactionID)
		return nil, fmt.Errorf("interaction expired")
	}
	return interaction, nil
}

func (s *DBStore) UpdateInteractionResult(interactionID string, result map[string]interface{}) error {
	resultJSON, err := json.Marshal(result)
	if err != nil {
		return fmt.Errorf("failed to marshal interaction result: %w", err)
	}
	resultStr := string(resultJSON)
	query := `UPDATE interactions SET result = ? WHERE id = ?`
	_, err = s.DB.Exec(query, resultStr, interactionID)
	if err != nil {
		return fmt.Errorf("failed to update interaction result: %w", err)
	}
	return nil
}

func (s *DBStore) DeleteInteraction(interactionID string) error {
	query := `DELETE FROM interactions WHERE id = ?`
	_, err := s.DB.Exec(query, interactionID)
	if err != nil {
		// Log error but don't necessarily fail the flow if deletion fails
		fmt.Printf("Warning: failed to delete interaction %s: %v\n", interactionID, err)
	}
	return nil // Return nil even if deletion failed, as it's cleanup
}

// --- Authorization Code Methods ---

func (s *DBStore) CreateAuthorizationCode(authCode *AuthorizationCode) error {
	query := `INSERT INTO authorization_codes (code, client_id, user_id, redirect_uri, scopes, nonce, code_challenge, code_challenge_method, expires_at, created_at)
	          VALUES (:code, :client_id, :user_id, :redirect_uri, :scopes, :nonce, :code_challenge, :code_challenge_method, :expires_at, :created_at)`
	_, err := s.DB.NamedExec(query, authCode)
	if err != nil {
		return fmt.Errorf("failed to create authorization code: %w", err)
	}
	return nil
}

func (s *DBStore) GetAuthorizationCode(code string) (*AuthorizationCode, error) {
	authCode := &AuthorizationCode{}
	err := s.DB.Get(authCode, "SELECT * FROM authorization_codes WHERE code = ?", code)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("authorization code not found")
		}
		return nil, fmt.Errorf("failed to get authorization code: %w", err)
	}
	// Check expiration
	if time.Now().After(authCode.ExpiresAt) {
		_ = s.DeleteAuthorizationCode(code) // Delete expired code
		return nil, fmt.Errorf("authorization code expired")
	}
	return authCode, nil
}

func (s *DBStore) DeleteAuthorizationCode(code string) error {
	query := `DELETE FROM authorization_codes WHERE code = ?`
	_, err := s.DB.Exec(query, code)
	if err != nil {
		return fmt.Errorf("failed to delete authorization code: %w", err)
	}
	return nil
}

// --- Grant Methods ---

func (s *DBStore) GetGrant(userID, clientID string) (*Grant, error) {
	grant := &Grant{}
	err := s.DB.Get(grant, "SELECT * FROM grants WHERE user_id = ? AND client_id = ?", userID, clientID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Not found is not an error here
		}
		return nil, fmt.Errorf("failed to get grant: %w", err)
	}
	// Check expiration if set
	if grant.ExpiresAt != nil && time.Now().After(*grant.ExpiresAt) {
		// Optionally delete expired grant
		return nil, nil // Treat expired grant as not found
	}
	return grant, nil
}

// CreateOrUpdateGrant creates a new grant or updates an existing one.
func (s *DBStore) CreateOrUpdateGrant(grant *Grant) error {
	// Use REPLACE INTO (SQLite specific) or implement UPSERT logic
	// For simplicity, using REPLACE INTO
	grant.ID = uuid.NewString() // Ensure ID is set for potential insertion
	query := `REPLACE INTO grants (id, user_id, client_id, scopes, created_at, expires_at)
              VALUES (:id, :user_id, :client_id, :scopes, :created_at, :expires_at)`
	_, err := s.DB.NamedExec(query, grant)
	if err != nil {
		return fmt.Errorf("failed to create or update grant: %w", err)
	}
	return nil
}
