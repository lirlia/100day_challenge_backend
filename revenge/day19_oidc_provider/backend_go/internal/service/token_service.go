package service

import (
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"day19_oidc_provider/backend_go/internal/config"
	"day19_oidc_provider/backend_go/internal/jwks"
	"day19_oidc_provider/backend_go/internal/store"
)

// TokenService handles token generation and related logic.
type TokenService struct {
	cfg   *config.Config
	store store.Storer
}

// NewTokenService creates a new TokenService.
func NewTokenService(cfg *config.Config, store store.Storer) *TokenService {
	return &TokenService{
		cfg:   cfg,
		store: store,
	}
}

// IDTokenClaims defines the claims for the OIDC ID Token.
type IDTokenClaims struct {
	Email string `json:"email,omitempty"`
	Name  string `json:"name,omitempty"` // Example profile claim
	Nonce string `json:"nonce,omitempty"` // Add Nonce field
	jwt.RegisteredClaims
}

// AccessTokenClaims defines the claims for the Access Token (if using JWT).
type AccessTokenClaims struct {
	Scopes string `json:"scp,omitempty"` // Space-separated scopes
	jwt.RegisteredClaims
}

// GenerateIDToken creates a signed ID Token JWT.
func (s *TokenService) GenerateIDToken(userID, clientID, nonce string, scopes []string) (string, error) {
	user, err := s.store.GetUserByID(userID)
	if err != nil {
		return "", fmt.Errorf("failed to get user for ID token: %w", err)
	}

	issuedAt := time.Now()
	expiresAt := issuedAt.Add(s.cfg.TokenTTL)

	claims := IDTokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.IssuerURL,
			Subject:   userID,
			Audience:  jwt.ClaimStrings{clientID},
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			ID:        uuid.NewString(), // jti
		},
	}

	if nonce != "" {
		claims.Nonce = nonce
	}

	// Add claims based on scopes
	for _, scope := range scopes {
		switch scope {
		case "email":
			claims.Email = user.Email
		case "profile":
			// Example: Fetch profile data if needed
			claims.Name = "User " + userID[:4] // Placeholder name
		}
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = jwks.GetKeyID() // Set the key ID in the header

	signedToken, err := token.SignedString(jwks.GetPrivateKey())
	if err != nil {
		return "", fmt.Errorf("failed to sign ID token: %w", err)
	}

	return signedToken, nil
}

// GenerateAccessToken creates a signed Access Token JWT.
// Alternatively, this could generate an opaque token stored in the DB.
func (s *TokenService) GenerateAccessToken(userID, clientID string, scopes []string) (string, error) {
	issuedAt := time.Now()
	expiresAt := issuedAt.Add(s.cfg.TokenTTL)

	claims := AccessTokenClaims{
		Scopes: strings.Join(scopes, " "),
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    s.cfg.IssuerURL,
			Subject:   userID,
			Audience:  jwt.ClaimStrings{s.cfg.IssuerURL}, // Audience for access token is often the issuer or resource server
			ExpiresAt: jwt.NewNumericDate(expiresAt),
			IssuedAt:  jwt.NewNumericDate(issuedAt),
			ID:        uuid.NewString(), // jti
			// ClientID could also be added as a claim: "client_id": clientID
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	token.Header["kid"] = jwks.GetKeyID()

	signedToken, err := token.SignedString(jwks.GetPrivateKey())
	if err != nil {
		return "", fmt.Errorf("failed to sign access token: %w", err)
	}

	return signedToken, nil
}

// ValidatePKCE validates the code_verifier against the stored code_challenge.
func ValidatePKCE(verifier, challenge, method string) bool {
	if challenge == "" || verifier == "" {
		// If no challenge was stored, PKCE was not used for this code
		return true
	}
	if method != "S256" {
		log.Printf("PKCE Error: Unsupported method '%s' encountered during validation", method)
		return false // Only S256 is supported
	}

	// Calculate SHA256 hash of the verifier
	hasher := sha256.New()
	hasher.Write([]byte(verifier))
	calculatedChallengeBytes := hasher.Sum(nil)

	// Base64 URL encode the calculated challenge (no padding)
	calculatedChallenge := base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(calculatedChallengeBytes)

	// Compare with the stored challenge
	return calculatedChallenge == challenge
}
