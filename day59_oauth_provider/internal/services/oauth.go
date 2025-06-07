package services

import (
	"fmt"
	"net/url"
	"strings"

	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/models"
)

// AuthorizeRequest represents an OAuth2 authorization request
type AuthorizeRequest struct {
	ClientID            string   `json:"client_id"`
	RedirectURI         string   `json:"redirect_uri"`
	ResponseType        string   `json:"response_type"`
	Scope               string   `json:"scope"`
	State               string   `json:"state,omitempty"`
	Nonce               string   `json:"nonce,omitempty"`
	CodeChallenge       string   `json:"code_challenge,omitempty"`
	CodeChallengeMethod string   `json:"code_challenge_method,omitempty"`
	Scopes              []string `json:"-"` // パースされたスコープ
}

// TokenRequest represents an OAuth2 token request
type TokenRequest struct {
	GrantType    string `json:"grant_type"`
	Code         string `json:"code,omitempty"`
	RedirectURI  string `json:"redirect_uri,omitempty"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret,omitempty"`
	CodeVerifier string `json:"code_verifier,omitempty"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
}

// TokenResponse represents an OAuth2 token response
type TokenResponse struct {
	AccessToken  string `json:"access_token"`
	TokenType    string `json:"token_type"`
	ExpiresIn    int    `json:"expires_in"`
	RefreshToken string `json:"refresh_token,omitempty"`
	Scope        string `json:"scope,omitempty"`
	IDToken      string `json:"id_token,omitempty"` // OpenID Connect
}

// ErrorResponse represents an OAuth2 error response
type ErrorResponse struct {
	Error            string `json:"error"`
	ErrorDescription string `json:"error_description,omitempty"`
	ErrorURI         string `json:"error_uri,omitempty"`
}

// ValidateAuthorizeRequest validates an OAuth2 authorization request
func ValidateAuthorizeRequest(req *AuthorizeRequest) (*models.OAuthClient, error) {
	// 必須パラメータチェック
	if req.ClientID == "" {
		return nil, fmt.Errorf("client_id is required")
	}
	if req.RedirectURI == "" {
		return nil, fmt.Errorf("redirect_uri is required")
	}
	if req.ResponseType == "" {
		return nil, fmt.Errorf("response_type is required")
	}

	// クライアント検証
	client, err := models.GetClientByID(req.ClientID)
	if err != nil {
		return nil, fmt.Errorf("invalid client")
	}

	// redirect_uri検証
	if !client.ValidateRedirectURI(req.RedirectURI) {
		return nil, fmt.Errorf("invalid redirect_uri")
	}

	// response_type検証
	if req.ResponseType != "code" {
		return nil, fmt.Errorf("unsupported response_type")
	}

	// スコープ解析
	if req.Scope != "" {
		req.Scopes = strings.Split(req.Scope, " ")
		// クライアントが要求されたスコープを持っているか確認
		for _, scope := range req.Scopes {
			if !client.HasScope(scope) {
				return nil, fmt.Errorf("invalid scope: %s", scope)
			}
		}
	}

	// PKCE検証（オプション）
	if req.CodeChallenge != "" {
		if req.CodeChallengeMethod != "S256" {
			return nil, fmt.Errorf("unsupported code_challenge_method")
		}
	}

	return client, nil
}

// CreateAuthorizationCode creates an authorization code for the given request
func CreateAuthorizationCode(req *AuthorizeRequest, userID string) (*models.AuthorizationCode, error) {
	return models.CreateAuthorizationCode(
		req.ClientID,
		userID,
		req.RedirectURI,
		req.Scopes,
		req.State,
		req.Nonce,
		req.CodeChallenge,
		req.CodeChallengeMethod,
	)
}

// ValidateTokenRequest validates an OAuth2 token request
func ValidateTokenRequest(req *TokenRequest) (*models.OAuthClient, error) {
	// 必須パラメータチェック
	if req.GrantType == "" {
		return nil, fmt.Errorf("grant_type is required")
	}
	if req.ClientID == "" {
		return nil, fmt.Errorf("client_id is required")
	}

	// クライアント認証
	client, err := models.AuthenticateClient(req.ClientID, req.ClientSecret)
	if err != nil {
		return nil, fmt.Errorf("client authentication failed")
	}
	if client == nil {
		return nil, fmt.Errorf("invalid client credentials")
	}

	// grant_type検証
	if !client.HasGrantType(req.GrantType) {
		return nil, fmt.Errorf("unsupported grant_type")
	}

	switch req.GrantType {
	case "authorization_code":
		if req.Code == "" {
			return nil, fmt.Errorf("code is required")
		}
		if req.RedirectURI == "" {
			return nil, fmt.Errorf("redirect_uri is required")
		}
	case "refresh_token":
		if req.RefreshToken == "" {
			return nil, fmt.Errorf("refresh_token is required")
		}
	case "client_credentials":
		// client_credentialsは追加パラメータ不要
	default:
		return nil, fmt.Errorf("unsupported grant_type")
	}

	return client, nil
}

// ProcessAuthorizationCodeGrant processes authorization code grant
func ProcessAuthorizationCodeGrant(req *TokenRequest, client *models.OAuthClient) (*TokenResponse, error) {
	// 認可コード取得
	authCode, err := models.GetAuthorizationCode(req.Code)
	if err != nil {
		return nil, fmt.Errorf("invalid authorization code")
	}

	// 認可コード検証
	if authCode.IsExpired() {
		models.DeleteAuthorizationCode(req.Code) // 期限切れコードを削除
		return nil, fmt.Errorf("authorization code expired")
	}

	if authCode.ClientID != req.ClientID {
		return nil, fmt.Errorf("client_id mismatch")
	}

	if authCode.RedirectURI != req.RedirectURI {
		return nil, fmt.Errorf("redirect_uri mismatch")
	}

	// PKCE検証
	if authCode.HasPKCE() {
		if req.CodeVerifier == "" {
			return nil, fmt.Errorf("code_verifier is required")
		}
		if !authCode.ValidatePKCE(req.CodeVerifier) {
			return nil, fmt.Errorf("invalid code_verifier")
		}
	}

	// ユーザー情報取得
	user, err := models.GetUserByID(authCode.UserID)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	// 認可コード削除（一度だけ使用可能）
	models.DeleteAuthorizationCode(req.Code)

	// トークン生成
	accessToken, err := GenerateAccessToken(client.ID, user.ID, authCode.Scopes)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token")
	}

	// リフレッシュトークン生成
	refreshToken, err := models.CreateRefreshToken(client.ID, user.ID, authCode.Scopes)
	if err != nil {
		return nil, fmt.Errorf("failed to generate refresh token")
	}

	// アクセストークン記録
	models.CreateAccessTokenRecord(accessToken, client.ID, &user.ID, authCode.Scopes)

	response := &TokenResponse{
		AccessToken:  accessToken,
		TokenType:    "Bearer",
		ExpiresIn:    3600, // 1時間
		RefreshToken: refreshToken.Token,
		Scope:        strings.Join(authCode.Scopes, " "),
	}

	// OpenID Connect: IDトークン生成
	if containsScope(authCode.Scopes, "openid") {
		idToken, err := GenerateIDToken(client.ID, user.ID, user.Email, user.Name, authCode.Nonce)
		if err != nil {
			return nil, fmt.Errorf("failed to generate ID token")
		}
		response.IDToken = idToken
	}

	return response, nil
}

// ProcessRefreshTokenGrant processes refresh token grant
func ProcessRefreshTokenGrant(req *TokenRequest, client *models.OAuthClient) (*TokenResponse, error) {
	// リフレッシュトークン取得
	refreshToken, err := models.GetRefreshToken(req.RefreshToken)
	if err != nil {
		return nil, fmt.Errorf("invalid refresh token")
	}

	// リフレッシュトークン検証
	if refreshToken.IsExpired() {
		models.DeleteRefreshToken(req.RefreshToken) // 期限切れトークンを削除
		return nil, fmt.Errorf("refresh token expired")
	}

	if refreshToken.ClientID != req.ClientID {
		return nil, fmt.Errorf("client_id mismatch")
	}

	// ユーザー情報取得
	user, err := models.GetUserByID(refreshToken.UserID)
	if err != nil {
		return nil, fmt.Errorf("user not found")
	}

	// スコープ処理（要求されたスコープが元のスコープ以下であることを確認）
	scopes := refreshToken.Scopes
	if req.Scope != "" {
		requestedScopes := strings.Split(req.Scope, " ")
		for _, scope := range requestedScopes {
			if !containsScope(refreshToken.Scopes, scope) {
				return nil, fmt.Errorf("invalid scope: %s", scope)
			}
		}
		scopes = requestedScopes
	}

	// 新しいアクセストークン生成
	accessToken, err := GenerateAccessToken(client.ID, user.ID, scopes)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token")
	}

	// アクセストークン記録
	models.CreateAccessTokenRecord(accessToken, client.ID, &user.ID, scopes)

	response := &TokenResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   3600, // 1時間
		Scope:       strings.Join(scopes, " "),
	}

	return response, nil
}

// ProcessClientCredentialsGrant processes client credentials grant
func ProcessClientCredentialsGrant(req *TokenRequest, client *models.OAuthClient) (*TokenResponse, error) {
	// スコープ処理
	scopes := []string{}
	if req.Scope != "" {
		requestedScopes := strings.Split(req.Scope, " ")
		for _, scope := range requestedScopes {
			if !client.HasScope(scope) {
				return nil, fmt.Errorf("invalid scope: %s", scope)
			}
		}
		scopes = requestedScopes
	}

	// クライアント認証情報でトークン生成
	accessToken, err := GenerateClientCredentialsToken(client.ID, scopes)
	if err != nil {
		return nil, fmt.Errorf("failed to generate access token")
	}

	// アクセストークン記録（userIDはnull）
	models.CreateAccessTokenRecord(accessToken, client.ID, nil, scopes)

	response := &TokenResponse{
		AccessToken: accessToken,
		TokenType:   "Bearer",
		ExpiresIn:   3600, // 1時間
		Scope:       strings.Join(scopes, " "),
	}

	return response, nil
}

// BuildAuthorizeRedirectURL builds the redirect URL for authorization response
func BuildAuthorizeRedirectURL(redirectURI, code, state string) (string, error) {
	u, err := url.Parse(redirectURI)
	if err != nil {
		return "", err
	}

	q := u.Query()
	q.Set("code", code)
	if state != "" {
		q.Set("state", state)
	}
	u.RawQuery = q.Encode()

	return u.String(), nil
}

// BuildErrorRedirectURL builds the redirect URL for error response
func BuildErrorRedirectURL(redirectURI, errorCode, errorDescription, state string) (string, error) {
	u, err := url.Parse(redirectURI)
	if err != nil {
		return "", err
	}

	q := u.Query()
	q.Set("error", errorCode)
	if errorDescription != "" {
		q.Set("error_description", errorDescription)
	}
	if state != "" {
		q.Set("state", state)
	}
	u.RawQuery = q.Encode()

	return u.String(), nil
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
