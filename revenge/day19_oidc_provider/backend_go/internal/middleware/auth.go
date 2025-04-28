package middleware

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
	"day19_oidc_provider/backend_go/internal/config"
	"day19_oidc_provider/backend_go/internal/jwks"
	"day19_oidc_provider/backend_go/internal/service" // Assuming AccessTokenClaims is defined here or a shared place
)

// ContextKey type for context values
type ContextKey string

const UserIDContextKey ContextKey = "userID"

// AuthenticateAccessToken validates the Bearer token in the Authorization header.
func AuthenticateAccessToken(cfg *config.Config) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authHeader := r.Header.Get("Authorization")
			if authHeader == "" {
				w.Header().Set("WWW-Authenticate", "Bearer realm=\"Restricted\"")
				http.Error(w, "Authorization header required", http.StatusUnauthorized)
				return
			}

			parts := strings.SplitN(authHeader, " ", 2)
			if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
				w.Header().Set("WWW-Authenticate", "Bearer error=\"invalid_request\" error_description=\"Invalid Authorization header format\"")
				http.Error(w, "Invalid Authorization header format", http.StatusUnauthorized)
				return
			}
			tokenString := parts[1]

			// Parse and validate the JWT
			token, err := jwt.ParseWithClaims(tokenString, &service.AccessTokenClaims{}, func(token *jwt.Token) (interface{}, error) {
				// Validate the alg is RS256
				if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
					return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
				}
				// Use the public key from JWKS
				return jwks.GetPublicKey(), nil
			})

			if err != nil {
				log.Printf("Access Token Error: %v", err)
				errMsg := "invalid_token"
				desc := "Access token is invalid"
				if errors.Is(err, jwt.ErrTokenExpired) {
					desc = "Access token is expired"
				}
				w.Header().Set("WWW-Authenticate", fmt.Sprintf("Bearer error=\"%s\" error_description=\"%s\"", errMsg, desc))
				http.Error(w, desc, http.StatusUnauthorized)
				return
			}

			if claims, ok := token.Claims.(*service.AccessTokenClaims); ok && token.Valid {
				// Check issuer and audience (optional but recommended)
				if claims.Issuer != cfg.IssuerURL {
					log.Printf("Access Token Error: Invalid issuer. Expected %s, got %s", cfg.IssuerURL, claims.Issuer)
					w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token" error_description="Invalid issuer"`)
					http.Error(w, "Invalid token issuer", http.StatusUnauthorized)
					return
				}
				// You might want to check audience more carefully depending on your setup
				// if !claims.Audience.Contains(cfg.IssuerURL) { ... }

				// Store user ID in context
				ctx := context.WithValue(r.Context(), UserIDContextKey, claims.Subject)
				log.Printf("Access Token Valid: User %s authenticated via token", claims.Subject)
				next.ServeHTTP(w, r.WithContext(ctx))
			} else {
				log.Printf("Access Token Error: Invalid token or claims (valid: %v)", token.Valid)
				w.Header().Set("WWW-Authenticate", `Bearer error="invalid_token" error_description="Invalid token claims"`)
				http.Error(w, "Invalid token claims", http.StatusUnauthorized)
			}
		})
	}
}
