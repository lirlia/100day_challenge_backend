package handlers

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/models"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/services"
)

// AuthorizeHandler handles the OAuth2 authorization endpoint
func AuthorizeHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// パラメータ解析
	req := &services.AuthorizeRequest{
		ClientID:            r.URL.Query().Get("client_id"),
		RedirectURI:         r.URL.Query().Get("redirect_uri"),
		ResponseType:        r.URL.Query().Get("response_type"),
		Scope:               r.URL.Query().Get("scope"),
		State:               r.URL.Query().Get("state"),
		Nonce:               r.URL.Query().Get("nonce"),
		CodeChallenge:       r.URL.Query().Get("code_challenge"),
		CodeChallengeMethod: r.URL.Query().Get("code_challenge_method"),
	}

	// リクエスト検証
	client, err := services.ValidateAuthorizeRequest(req)
	if err != nil {
		log.Printf("Authorization request validation failed: %v", err)

		// エラーレスポンス
		if req.RedirectURI != "" {
			redirectURL, _ := services.BuildErrorRedirectURL(req.RedirectURI, "invalid_request", err.Error(), req.State)
			http.Redirect(w, r, redirectURL, http.StatusFound)
			return
		}

		http.Error(w, fmt.Sprintf("Invalid request: %s", err.Error()), http.StatusBadRequest)
		return
	}

	// 簡易的なユーザー認証（実際の実装では適切な認証フローが必要）
	// ここでは、クエリパラメータでuser_idを受け取る簡易実装
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		// 認証が必要な場合のレスポンス（実際にはログイン画面にリダイレクト）
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `
<!DOCTYPE html>
<html>
<head>
    <title>OAuth2 Authorization</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
        .auth-form { background: #f5f5f5; padding: 20px; border-radius: 8px; }
        .client-info { background: #e3f2fd; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
        .scopes { margin: 15px 0; }
        .scope-item { margin: 5px 0; }
        button { background: #1976d2; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        button:hover { background: #1565c0; }
        .cancel { background: #757575; margin-left: 10px; }
        .cancel:hover { background: #616161; }
    </style>
</head>
<body>
    <div class="auth-form">
        <h2>OAuth2 Authorization Request</h2>
        <div class="client-info">
            <h3>Application: %s</h3>
            <p><strong>Client ID:</strong> %s</p>
            <p><strong>Redirect URI:</strong> %s</p>
        </div>

        <div class="scopes">
            <h4>Requested Permissions:</h4>
            %s
        </div>

        <p>Do you authorize this application to access your account?</p>

        <form method="get" action="/authorize">
            <input type="hidden" name="client_id" value="%s">
            <input type="hidden" name="redirect_uri" value="%s">
            <input type="hidden" name="response_type" value="%s">
            <input type="hidden" name="scope" value="%s">
            <input type="hidden" name="state" value="%s">
            <input type="hidden" name="nonce" value="%s">
            <input type="hidden" name="code_challenge" value="%s">
            <input type="hidden" name="code_challenge_method" value="%s">

            <label for="user_id">User ID (for demo):</label>
            <input type="text" name="user_id" id="user_id" placeholder="Enter user ID" required>

            <br><br>
            <button type="submit">Authorize</button>
            <button type="button" class="cancel" onclick="window.history.back()">Cancel</button>
        </form>
    </div>
</body>
</html>`,
			client.Name, client.ID, req.RedirectURI,
			formatScopes(req.Scopes),
			req.ClientID, req.RedirectURI, req.ResponseType, req.Scope, req.State, req.Nonce, req.CodeChallenge, req.CodeChallengeMethod)
		return
	}

	// ユーザー存在確認
	user, err := models.GetUserByID(userID)
	if err != nil {
		log.Printf("User not found: %v", err)
		redirectURL, _ := services.BuildErrorRedirectURL(req.RedirectURI, "access_denied", "User not found", req.State)
		http.Redirect(w, r, redirectURL, http.StatusFound)
		return
	}

	// 認可コード生成
	authCode, err := services.CreateAuthorizationCode(req, user.ID)
	if err != nil {
		log.Printf("Failed to create authorization code: %v", err)
		redirectURL, _ := services.BuildErrorRedirectURL(req.RedirectURI, "server_error", "Failed to create authorization code", req.State)
		http.Redirect(w, r, redirectURL, http.StatusFound)
		return
	}

	// 成功レスポンス
	redirectURL, err := services.BuildAuthorizeRedirectURL(req.RedirectURI, authCode.Code, req.State)
	if err != nil {
		log.Printf("Failed to build redirect URL: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("Authorization successful for user %s, client %s", user.ID, client.ID)
	http.Redirect(w, r, redirectURL, http.StatusFound)
}

// TokenHandler handles the OAuth2 token endpoint
func TokenHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("TokenHandler called: Method=%s, URL=%s", r.Method, r.URL.Path)

	if r.Method != http.MethodPost {
		log.Printf("Method not allowed: %s", r.Method)
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Content-Type確認
	contentType := r.Header.Get("Content-Type")
	if !strings.Contains(contentType, "application/x-www-form-urlencoded") {
		writeErrorResponse(w, "invalid_request", "Content-Type must be application/x-www-form-urlencoded", http.StatusBadRequest)
		return
	}

	// フォームデータ解析
	if err := r.ParseForm(); err != nil {
		writeErrorResponse(w, "invalid_request", "Failed to parse form data", http.StatusBadRequest)
		return
	}

	// Basic認証またはフォームからクライアント認証情報を取得
	clientID, clientSecret := getClientCredentials(r)

	req := &services.TokenRequest{
		GrantType:    r.FormValue("grant_type"),
		Code:         r.FormValue("code"),
		RedirectURI:  r.FormValue("redirect_uri"),
		ClientID:     clientID,
		ClientSecret: clientSecret,
		CodeVerifier: r.FormValue("code_verifier"),
		RefreshToken: r.FormValue("refresh_token"),
		Scope:        r.FormValue("scope"),
	}

	// リクエスト検証
	client, err := services.ValidateTokenRequest(req)
	if err != nil {
		log.Printf("Token request validation failed: %v", err)
		writeErrorResponse(w, "invalid_request", err.Error(), http.StatusBadRequest)
		return
	}

	// grant_typeに応じた処理
	var response *services.TokenResponse
	switch req.GrantType {
	case "authorization_code":
		response, err = services.ProcessAuthorizationCodeGrant(req, client)
	case "refresh_token":
		response, err = services.ProcessRefreshTokenGrant(req, client)
	case "client_credentials":
		response, err = services.ProcessClientCredentialsGrant(req, client)
	default:
		writeErrorResponse(w, "unsupported_grant_type", "Unsupported grant type", http.StatusBadRequest)
		return
	}

	if err != nil {
		log.Printf("Token grant processing failed: %v", err)
		writeErrorResponse(w, "invalid_grant", err.Error(), http.StatusBadRequest)
		return
	}

	// 成功レスポンス
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")

	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("Failed to encode token response: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	log.Printf("Token issued successfully for client %s, grant_type %s", client.ID, req.GrantType)
}

// getClientCredentials extracts client credentials from Basic auth or form data
func getClientCredentials(r *http.Request) (clientID, clientSecret string) {
	// Basic認証を試行
	if username, password, ok := r.BasicAuth(); ok {
		return username, password
	}

	// フォームデータから取得
	return r.FormValue("client_id"), r.FormValue("client_secret")
}

// writeErrorResponse writes an OAuth2 error response
func writeErrorResponse(w http.ResponseWriter, errorCode, description string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)

	errorResp := services.ErrorResponse{
		Error:            errorCode,
		ErrorDescription: description,
	}

	json.NewEncoder(w).Encode(errorResp)
}

// formatScopes formats scopes for HTML display
func formatScopes(scopes []string) string {
	if len(scopes) == 0 {
		return "<div class='scope-item'>No specific permissions requested</div>"
	}

	var result strings.Builder
	for _, scope := range scopes {
		description := getScopeDescription(scope)
		result.WriteString(fmt.Sprintf("<div class='scope-item'>• %s: %s</div>", scope, description))
	}
	return result.String()
}

// getScopeDescription returns a human-readable description for a scope
func getScopeDescription(scope string) string {
	descriptions := map[string]string{
		"openid":  "Verify your identity",
		"profile": "Access your basic profile information",
		"email":   "Access your email address",
		"read":    "Read access to your data",
		"write":   "Write access to your data",
	}

	if desc, exists := descriptions[scope]; exists {
		return desc
	}
	return "Access to " + scope
}
