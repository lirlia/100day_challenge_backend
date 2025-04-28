package session

import (
	"encoding/gob"
	"errors"
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/google/uuid"
	"day19_oidc_provider/backend_go/internal/config"
	"day19_oidc_provider/backend_go/internal/store"

	"github.com/gorilla/securecookie" // Using securecookie for cookie encoding/decoding
)

const SessionCookieName = "oidc_session"

// SessionData holds the data stored in the session.
// Make sure all fields are registered with gob.
type SessionData struct {
	SessionID string
	UserID    string
	CreatedAt time.Time
	ExpiresAt time.Time
}

func init() {
	// Register SessionData type with gob for encoding/decoding
	gob.Register(SessionData{})
}

// Manager handles session creation, retrieval, and deletion.
type Manager struct {
	store store.Storer
	cfg   *config.Config
	sc    *securecookie.SecureCookie
}

// NewManager creates a new session manager.
func NewManager(cfg *config.Config, store store.Storer) *Manager {
	// Use two keys for securecookie: hash key and block key (encryption)
	// Ensure these are strong, random keys in production and kept secret.
	hashKey := []byte(cfg.SessionSecret) // Use configured secret
	blockKey := []byte(nil)              // Optional: Set block key for encryption if needed
	if len(hashKey) < 32 {
		log.Println("Warning: SessionSecret should be at least 32 bytes long for securecookie")
	}
	if len(hashKey) > 64 {
		hashKey = hashKey[:64]
	}
	// If block key needed and SessionSecret is long enough, derive one
	// For simplicity, we'll skip block key for now (authentication only)

	return &Manager{
		store: store,
		cfg:   cfg,
		sc:    securecookie.New(hashKey, blockKey),
	}
}

// CreateSession creates a new session for the user and returns the session ID.
func (m *Manager) CreateSession(userID string) (string, error) {
	sessionID := uuid.NewString()
	expiresAt := time.Now().Add(m.cfg.SessionMaxAge)

	// Store session details in the database (using store.Storer interface)
	dbSession := &store.Session{
		ID:        sessionID,
		UserID:    userID,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now(),
		LastAccessedAt: time.Now(),
		// IPAddress and UserAgent could be added here if needed
	}

	if err := m.store.CreateSession(dbSession); err != nil {
		return "", fmt.Errorf("failed to save session to db: %w", err)
	}

	return sessionID, nil
}

// GetSessionFromRequest retrieves the session data from the request cookie.
// It returns the SessionData or nil if no valid session is found.
func (m *Manager) GetSessionFromRequest(r *http.Request) (*SessionData, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		if errors.Is(err, http.ErrNoCookie) {
			return nil, nil // No session cookie found
		}
		return nil, fmt.Errorf("failed to get session cookie: %w", err)
	}

	var sessionData SessionData
	if err := m.sc.Decode(SessionCookieName, cookie.Value, &sessionData); err != nil {
		// Invalid cookie (tampered, expired encoding, wrong key), treat as no session
		log.Printf("Failed to decode session cookie: %v. Cookie value: %s", err, cookie.Value)
		return nil, nil
	}

	// Check expiration within the data
	if time.Now().After(sessionData.ExpiresAt) {
		log.Printf("Session data expired for session ID: %s", sessionData.SessionID)
		// Optionally delete expired session from DB here or via background job
		return nil, nil // Session expired
	}

	// Optional: Validate against DB session store for extra security (e.g., check if revoked)
	// _, err = m.store.GetSession(sessionData.SessionID)
	// if err != nil {
	// 	 log.Printf("Session ID %s not found or invalid in DB: %v", sessionData.SessionID, err)
	// 	 return nil, nil
	// }
	// TODO: Update LastAccessedAt in DB (consider performance implications)

	return &sessionData, nil
}

// SetSessionCookie sets the session cookie in the response.
func (m *Manager) SetSessionCookie(w http.ResponseWriter, sessionID, userID string) error {
	expiresAt := time.Now().Add(m.cfg.SessionMaxAge)
	sessionData := SessionData{
		SessionID: sessionID,
		UserID:    userID,
		CreatedAt: time.Now(),
		ExpiresAt: expiresAt,
	}

	encoded, err := m.sc.Encode(SessionCookieName, sessionData)
	if err != nil {
		return fmt.Errorf("failed to encode session cookie: %w", err)
	}

	cookie := &http.Cookie{
		Name:     SessionCookieName,
		Value:    encoded,
		Path:     "/",
		Expires:  expiresAt,
		HttpOnly: true,
		Secure:   true, // Set Secure=true for HTTPS. Adjust based on deployment.
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
	return nil
}

// DeleteSessionCookie removes the session cookie.
func (m *Manager) DeleteSessionCookie(w http.ResponseWriter) {
	cookie := &http.Cookie{
		Name:     SessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0), // Set to past to delete
		MaxAge:   -1,             // Explicitly tell browser to delete
		HttpOnly: true,
		Secure:   true,
		SameSite: http.SameSiteLaxMode,
	}
	http.SetCookie(w, cookie)
}

// Middleware returns a middleware that injects the session manager and user ID into the request context.
// It also handles session retrieval.
// func (m *Manager) Middleware(next http.Handler) http.Handler {
// 	 return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
// 		 sessionData, err := m.GetSessionFromRequest(r)
// 		 if err != nil {
// 			 // Log error, but proceed without session data
// 			 log.Printf("Error retrieving session: %v", err)
// 		 }

// 		 ctx := context.WithValue(r.Context(), "sessionManager", m)
// 		 if sessionData != nil {
// 			 ctx = context.WithValue(ctx, "userID", sessionData.UserID)
// 		 }

// 		 next.ServeHTTP(w, r.WithContext(ctx))
// 	 })
// }
