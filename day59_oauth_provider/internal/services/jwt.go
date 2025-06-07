package services

import (
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const (
	// JWT issuer
	Issuer = "http://localhost:8081"
)

// AccessTokenClaims represents the claims for an access token
type AccessTokenClaims struct {
	jwt.RegisteredClaims
	Scope string `json:"scope"`
}

// IDTokenClaims represents the claims for an ID token (OpenID Connect)
type IDTokenClaims struct {
	jwt.RegisteredClaims
	Email string `json:"email,omitempty"`
	Name  string `json:"name,omitempty"`
	Nonce string `json:"nonce,omitempty"`
}

// GenerateAccessToken generates a JWT access token
func GenerateAccessToken(clientID, userID string, scopes []string) (string, error) {
	if GetPrivateKey() == nil {
		return "", fmt.Errorf("private key not initialized")
	}

	now := time.Now()
	claims := AccessTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    Issuer,
			Subject:   userID,
			Audience:  []string{clientID},
			ExpiresAt: jwt.NewNumericDate(now.Add(1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
		Scope: strings.Join(scopes, " "),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)

	// Key IDを設定
	if keyPair := GetCurrentKeyPair(); keyPair != nil {
		token.Header["kid"] = keyPair.Kid
	}

	return token.SignedString(GetPrivateKey())
}

// GenerateIDToken generates a JWT ID token for OpenID Connect
func GenerateIDToken(clientID, userID, email, name, nonce string) (string, error) {
	if GetPrivateKey() == nil {
		return "", fmt.Errorf("private key not initialized")
	}

	now := time.Now()
	claims := IDTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    Issuer,
			Subject:   userID,
			Audience:  []string{clientID},
			ExpiresAt: jwt.NewNumericDate(now.Add(1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
		Email: email,
		Name:  name,
		Nonce: nonce,
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)

	// Key IDを設定
	if keyPair := GetCurrentKeyPair(); keyPair != nil {
		token.Header["kid"] = keyPair.Kid
	}

	return token.SignedString(GetPrivateKey())
}

// GenerateClientCredentialsToken generates a JWT token for client credentials flow
func GenerateClientCredentialsToken(clientID string, scopes []string) (string, error) {
	if GetPrivateKey() == nil {
		return "", fmt.Errorf("private key not initialized")
	}

	now := time.Now()
	claims := AccessTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    Issuer,
			Subject:   clientID, // Client Credentialsの場合はclient_idがsubject
			Audience:  []string{clientID},
			ExpiresAt: jwt.NewNumericDate(now.Add(1 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
			NotBefore: jwt.NewNumericDate(now),
		},
		Scope: strings.Join(scopes, " "),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)

	// Key IDを設定
	if keyPair := GetCurrentKeyPair(); keyPair != nil {
		token.Header["kid"] = keyPair.Kid
	}

	return token.SignedString(GetPrivateKey())
}

// ValidateAccessToken validates and parses an access token
func ValidateAccessToken(tokenString string) (*AccessTokenClaims, error) {
	if GetPublicKey() == nil {
		return nil, fmt.Errorf("public key not initialized")
	}

	token, err := jwt.ParseWithClaims(tokenString, &AccessTokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		// 署名方法の確認
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return GetPublicKey(), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*AccessTokenClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// ValidateIDToken validates and parses an ID token
func ValidateIDToken(tokenString string) (*IDTokenClaims, error) {
	if GetPublicKey() == nil {
		return nil, fmt.Errorf("public key not initialized")
	}

	token, err := jwt.ParseWithClaims(tokenString, &IDTokenClaims{}, func(token *jwt.Token) (interface{}, error) {
		// 署名方法の確認
		if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return GetPublicKey(), nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*IDTokenClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// ExtractBearerToken extracts the bearer token from Authorization header
func ExtractBearerToken(authHeader string) string {
	if authHeader == "" {
		return ""
	}

	parts := strings.Split(authHeader, " ")
	if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
		return ""
	}

	return parts[1]
}

// GetScopesFromToken extracts scopes from an access token
func GetScopesFromToken(tokenString string) ([]string, error) {
	claims, err := ValidateAccessToken(tokenString)
	if err != nil {
		return nil, err
	}

	if claims.Scope == "" {
		return []string{}, nil
	}

	return strings.Split(claims.Scope, " "), nil
}
