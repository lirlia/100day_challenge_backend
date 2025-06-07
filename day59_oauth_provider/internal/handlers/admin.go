package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/models"
)

// CreateClientRequest represents a request to create an OAuth2 client
type CreateClientRequest struct {
	Name         string   `json:"name"`
	RedirectURIs []string `json:"redirect_uris"`
	Scopes       []string `json:"scopes"`
	GrantTypes   []string `json:"grant_types"`
}

// CreateUserRequest represents a request to create a user
type CreateUserRequest struct {
	Email    string                 `json:"email"`
	Password string                 `json:"password"`
	Name     string                 `json:"name"`
	Profile  map[string]interface{} `json:"profile,omitempty"`
}

// ClientsHandler handles CRUD operations for OAuth2 clients
func ClientsHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleGetClients(w, r)
	case http.MethodPost:
		handleCreateClient(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// ClientHandler handles operations for a specific OAuth2 client
func ClientHandler(w http.ResponseWriter, r *http.Request) {
	// URLからclient_idを抽出（簡易実装）
	path := strings.TrimPrefix(r.URL.Path, "/api/clients/")
	clientID := strings.Split(path, "/")[0]

	if clientID == "" {
		http.Error(w, "Client ID required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handleGetClient(w, r, clientID)
	case http.MethodPut:
		handleUpdateClient(w, r, clientID)
	case http.MethodDelete:
		handleDeleteClient(w, r, clientID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// UsersHandler handles CRUD operations for users
func UsersHandler(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		handleGetUsers(w, r)
	case http.MethodPost:
		handleCreateUser(w, r)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// UserHandler handles operations for a specific user
func UserHandler(w http.ResponseWriter, r *http.Request) {
	// URLからuser_idを抽出（簡易実装）
	path := strings.TrimPrefix(r.URL.Path, "/api/users/")
	userID := strings.Split(path, "/")[0]

	if userID == "" {
		http.Error(w, "User ID required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		handleGetUser(w, r, userID)
	case http.MethodPut:
		handleUpdateUser(w, r, userID)
	case http.MethodDelete:
		handleDeleteUser(w, r, userID)
	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

// handleGetClients retrieves all OAuth2 clients
func handleGetClients(w http.ResponseWriter, r *http.Request) {
	clients, err := models.GetAllClients()
	if err != nil {
		log.Printf("Failed to get clients: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	// client_secretを隠す
	for _, client := range clients {
		client.ClientSecret = "***"
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(clients)
}

// handleCreateClient creates a new OAuth2 client
func handleCreateClient(w http.ResponseWriter, r *http.Request) {
	var req CreateClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// バリデーション
	if req.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}
	if len(req.RedirectURIs) == 0 {
		http.Error(w, "At least one redirect URI is required", http.StatusBadRequest)
		return
	}

	// デフォルト値設定
	if len(req.Scopes) == 0 {
		req.Scopes = []string{"openid", "profile", "email"}
	}
	if len(req.GrantTypes) == 0 {
		req.GrantTypes = []string{"authorization_code", "refresh_token"}
	}

	client, err := models.CreateClient(req.Name, req.RedirectURIs, req.Scopes, req.GrantTypes)
	if err != nil {
		log.Printf("Failed to create client: %v", err)
		http.Error(w, "Failed to create client", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(client)
}

// handleGetClient retrieves a specific OAuth2 client
func handleGetClient(w http.ResponseWriter, r *http.Request, clientID string) {
	client, err := models.GetClientByID(clientID)
	if err != nil {
		http.Error(w, "Client not found", http.StatusNotFound)
		return
	}

	// client_secretを隠す
	client.ClientSecret = "***"

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(client)
}

// handleUpdateClient updates a specific OAuth2 client
func handleUpdateClient(w http.ResponseWriter, r *http.Request, clientID string) {
	client, err := models.GetClientByID(clientID)
	if err != nil {
		http.Error(w, "Client not found", http.StatusNotFound)
		return
	}

	var req CreateClientRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// 更新
	if req.Name != "" {
		client.Name = req.Name
	}
	if len(req.RedirectURIs) > 0 {
		client.RedirectURIs = req.RedirectURIs
	}
	if len(req.Scopes) > 0 {
		client.Scopes = req.Scopes
	}
	if len(req.GrantTypes) > 0 {
		client.GrantTypes = req.GrantTypes
	}

	if err := client.Update(); err != nil {
		log.Printf("Failed to update client: %v", err)
		http.Error(w, "Failed to update client", http.StatusInternalServerError)
		return
	}

	// client_secretを隠す
	client.ClientSecret = "***"

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(client)
}

// handleDeleteClient deletes a specific OAuth2 client
func handleDeleteClient(w http.ResponseWriter, r *http.Request, clientID string) {
	if err := models.DeleteClient(clientID); err != nil {
		log.Printf("Failed to delete client: %v", err)
		http.Error(w, "Failed to delete client", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// handleGetUsers retrieves all users
func handleGetUsers(w http.ResponseWriter, r *http.Request) {
	users, err := models.GetAllUsers()
	if err != nil {
		log.Printf("Failed to get users: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

// handleCreateUser creates a new user
func handleCreateUser(w http.ResponseWriter, r *http.Request) {
	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// バリデーション
	if req.Email == "" {
		http.Error(w, "Email is required", http.StatusBadRequest)
		return
	}
	if req.Password == "" {
		http.Error(w, "Password is required", http.StatusBadRequest)
		return
	}
	if req.Name == "" {
		http.Error(w, "Name is required", http.StatusBadRequest)
		return
	}

	user, err := models.CreateUser(req.Email, req.Password, req.Name, req.Profile)
	if err != nil {
		log.Printf("Failed to create user: %v", err)
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(user)
}

// handleGetUser retrieves a specific user
func handleGetUser(w http.ResponseWriter, r *http.Request, userID string) {
	user, err := models.GetUserByID(userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// handleUpdateUser updates a specific user
func handleUpdateUser(w http.ResponseWriter, r *http.Request, userID string) {
	user, err := models.GetUserByID(userID)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	var req CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// 更新（パスワードは除く）
	if req.Name != "" {
		user.Name = req.Name
	}
	if req.Profile != nil {
		user.Profile = req.Profile
	}

	if err := user.Update(); err != nil {
		log.Printf("Failed to update user: %v", err)
		http.Error(w, "Failed to update user", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// handleDeleteUser deletes a specific user
func handleDeleteUser(w http.ResponseWriter, r *http.Request, userID string) {
	if err := models.DeleteUser(userID); err != nil {
		log.Printf("Failed to delete user: %v", err)
		http.Error(w, "Failed to delete user", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
