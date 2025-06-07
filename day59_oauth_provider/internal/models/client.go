package models

import (
	"database/sql"
	"encoding/json"
	"time"

	"github.com/google/uuid"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/database"
)

// OAuthClient represents an OAuth2 client
type OAuthClient struct {
	ID           string    `json:"id"`
	ClientSecret string    `json:"client_secret,omitempty"`
	Name         string    `json:"name"`
	RedirectURIs []string  `json:"redirect_uris"`
	Scopes       []string  `json:"scopes"`
	GrantTypes   []string  `json:"grant_types"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// CreateClient creates a new OAuth2 client
func CreateClient(name string, redirectURIs, scopes, grantTypes []string) (*OAuthClient, error) {
	client := &OAuthClient{
		ID:           uuid.New().String(),
		ClientSecret: uuid.New().String(),
		Name:         name,
		RedirectURIs: redirectURIs,
		Scopes:       scopes,
		GrantTypes:   grantTypes,
	}

	redirectURIsJSON, _ := json.Marshal(redirectURIs)
	scopesJSON, _ := json.Marshal(scopes)
	grantTypesJSON, _ := json.Marshal(grantTypes)

	query := `INSERT INTO oauth_clients (id, client_secret, name, redirect_uris, scopes, grant_types)
			  VALUES (?, ?, ?, ?, ?, ?)`

	_, err := database.DB.Exec(query, client.ID, client.ClientSecret, client.Name,
		string(redirectURIsJSON), string(scopesJSON), string(grantTypesJSON))
	if err != nil {
		return nil, err
	}

	return client, nil
}

// GetClientByID retrieves a client by ID
func GetClientByID(clientID string) (*OAuthClient, error) {
	query := `SELECT id, client_secret, name, redirect_uris, scopes, grant_types, created_at, updated_at
			  FROM oauth_clients WHERE id = ?`

	var client OAuthClient
	var redirectURIsJSON, scopesJSON, grantTypesJSON string

	err := database.DB.QueryRow(query, clientID).Scan(
		&client.ID, &client.ClientSecret, &client.Name,
		&redirectURIsJSON, &scopesJSON, &grantTypesJSON,
		&client.CreatedAt, &client.UpdatedAt,
	)
	if err != nil {
		return nil, err
	}

	_ = json.Unmarshal([]byte(redirectURIsJSON), &client.RedirectURIs)
	_ = json.Unmarshal([]byte(scopesJSON), &client.Scopes)
	_ = json.Unmarshal([]byte(grantTypesJSON), &client.GrantTypes)

	return &client, nil
}

// GetAllClients retrieves all clients
func GetAllClients() ([]*OAuthClient, error) {
	query := `SELECT id, client_secret, name, redirect_uris, scopes, grant_types, created_at, updated_at
			  FROM oauth_clients ORDER BY created_at DESC`

	rows, err := database.DB.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var clients []*OAuthClient
	for rows.Next() {
		var client OAuthClient
		var redirectURIsJSON, scopesJSON, grantTypesJSON string

		err := rows.Scan(
			&client.ID, &client.ClientSecret, &client.Name,
			&redirectURIsJSON, &scopesJSON, &grantTypesJSON,
			&client.CreatedAt, &client.UpdatedAt,
		)
		if err != nil {
			return nil, err
		}

		_ = json.Unmarshal([]byte(redirectURIsJSON), &client.RedirectURIs)
		_ = json.Unmarshal([]byte(scopesJSON), &client.Scopes)
		_ = json.Unmarshal([]byte(grantTypesJSON), &client.GrantTypes)

		clients = append(clients, &client)
	}

	return clients, nil
}

// UpdateClient updates an existing client
func (c *OAuthClient) Update() error {
	redirectURIsJSON, _ := json.Marshal(c.RedirectURIs)
	scopesJSON, _ := json.Marshal(c.Scopes)
	grantTypesJSON, _ := json.Marshal(c.GrantTypes)

	query := `UPDATE oauth_clients SET name = ?, redirect_uris = ?, scopes = ?, grant_types = ?, updated_at = CURRENT_TIMESTAMP
			  WHERE id = ?`

	_, err := database.DB.Exec(query, c.Name, string(redirectURIsJSON), string(scopesJSON), string(grantTypesJSON), c.ID)
	return err
}

// DeleteClient deletes a client
func DeleteClient(clientID string) error {
	query := `DELETE FROM oauth_clients WHERE id = ?`
	_, err := database.DB.Exec(query, clientID)
	return err
}

// ValidateRedirectURI checks if the redirect URI is valid for this client
func (c *OAuthClient) ValidateRedirectURI(redirectURI string) bool {
	for _, uri := range c.RedirectURIs {
		if uri == redirectURI {
			return true
		}
	}
	return false
}

// HasScope checks if the client has the specified scope
func (c *OAuthClient) HasScope(scope string) bool {
	for _, s := range c.Scopes {
		if s == scope {
			return true
		}
	}
	return false
}

// HasGrantType checks if the client supports the specified grant type
func (c *OAuthClient) HasGrantType(grantType string) bool {
	for _, gt := range c.GrantTypes {
		if gt == grantType {
			return true
		}
	}
	return false
}

// AuthenticateClient authenticates a client using client_id and client_secret
func AuthenticateClient(clientID, clientSecret string) (*OAuthClient, error) {
	client, err := GetClientByID(clientID)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // クライアントが見つからない
		}
		return nil, err
	}

	if client.ClientSecret != clientSecret {
		return nil, nil // 認証失敗
	}

	return client, nil
}
