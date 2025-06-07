package handlers

import (
	"encoding/json"
	"net/http"

	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/models"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/services"
)

// OpenIDConfiguration represents the OpenID Connect discovery document
type OpenIDConfiguration struct {
	Issuer                            string   `json:"issuer"`
	AuthorizationEndpoint             string   `json:"authorization_endpoint"`
	TokenEndpoint                     string   `json:"token_endpoint"`
	UserinfoEndpoint                  string   `json:"userinfo_endpoint"`
	JwksURI                           string   `json:"jwks_uri"`
	ScopesSupported                   []string `json:"scopes_supported"`
	ResponseTypesSupported            []string `json:"response_types_supported"`
	GrantTypesSupported               []string `json:"grant_types_supported"`
	SubjectTypesSupported             []string `json:"subject_types_supported"`
	IDTokenSigningAlgValuesSupported  []string `json:"id_token_signing_alg_values_supported"`
	TokenEndpointAuthMethodsSupported []string `json:"token_endpoint_auth_methods_supported"`
	CodeChallengeMethodsSupported     []string `json:"code_challenge_methods_supported"`
}

// UserInfoResponse represents the userinfo endpoint response
type UserInfoResponse struct {
	Sub   string `json:"sub"`
	Email string `json:"email,omitempty"`
	Name  string `json:"name,omitempty"`
}

// DiscoveryHandler handles the OpenID Connect discovery endpoint
func DiscoveryHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	baseURL := "http://localhost:8081"

	config := OpenIDConfiguration{
		Issuer:                baseURL,
		AuthorizationEndpoint: baseURL + "/authorize",
		TokenEndpoint:         baseURL + "/token",
		UserinfoEndpoint:      baseURL + "/userinfo",
		JwksURI:               baseURL + "/.well-known/jwks.json",
		ScopesSupported: []string{
			"openid",
			"profile",
			"email",
			"read",
			"write",
		},
		ResponseTypesSupported: []string{
			"code",
		},
		GrantTypesSupported: []string{
			"authorization_code",
			"refresh_token",
			"client_credentials",
		},
		SubjectTypesSupported: []string{
			"public",
		},
		IDTokenSigningAlgValuesSupported: []string{
			"RS256",
		},
		TokenEndpointAuthMethodsSupported: []string{
			"client_secret_post",
			"client_secret_basic",
		},
		CodeChallengeMethodsSupported: []string{
			"S256",
		},
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600") // 1時間キャッシュ

	if err := json.NewEncoder(w).Encode(config); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

// JWKSHandler handles the JSON Web Key Set endpoint
func JWKSHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	jwks, err := services.GetJWKS()
	if err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	if jwks == nil {
		http.Error(w, "No keys available", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=3600") // 1時間キャッシュ

	if err := json.NewEncoder(w).Encode(jwks); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

// UserInfoHandler handles the userinfo endpoint
func UserInfoHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Authorization ヘッダーからトークンを取得
	authHeader := r.Header.Get("Authorization")
	token := services.ExtractBearerToken(authHeader)
	if token == "" {
		w.Header().Set("WWW-Authenticate", "Bearer")
		http.Error(w, "Unauthorized", http.StatusUnauthorized)
		return
	}

	// トークン検証
	claims, err := services.ValidateAccessToken(token)
	if err != nil {
		w.Header().Set("WWW-Authenticate", "Bearer")
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// スコープ確認（openidスコープが必要）
	scopes, err := services.GetScopesFromToken(token)
	if err != nil {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	if !containsScope(scopes, "openid") {
		http.Error(w, "Insufficient scope", http.StatusForbidden)
		return
	}

	// ユーザー情報取得
	user, err := getUserFromSubject(claims.Subject)
	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	// レスポンス構築
	userInfo := UserInfoResponse{
		Sub: user.ID,
	}

	// スコープに応じて情報を追加
	if containsScope(scopes, "email") {
		userInfo.Email = user.Email
	}
	if containsScope(scopes, "profile") {
		userInfo.Name = user.Name
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")

	if err := json.NewEncoder(w).Encode(userInfo); err != nil {
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}
}

// containsScope checks if a scope is in the scope list
func containsScope(scopes []string, scope string) bool {
	for _, s := range scopes {
		if s == scope {
			return true
		}
	}
	return false
}

// getUserFromSubject retrieves user by subject (user ID)
func getUserFromSubject(subject string) (*models.User, error) {
	return models.GetUserByID(subject)
}
