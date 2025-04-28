package service

import (
	"encoding/base64"
	"fmt"
	"log"
	"net/http"
	"strings"

	"day19_oidc_provider/backend_go/pkg/password"
	"day19_oidc_provider/backend_go/internal/store"
)

// AuthenticateClient attempts to authenticate the client using Basic Auth or POST body parameters.
// It returns the authenticated client or an error if authentication fails.
func AuthenticateClient(r *http.Request, s store.Storer) (*store.Client, error) {
	clientID, clientSecret, ok := r.BasicAuth()

	if ok {
		// --- Basic Authentication ---
		log.Printf("Authenticating client '%s' using Basic Auth", clientID)
		client, err := s.GetClient(clientID)
		if err != nil {
			log.Printf("Client Auth Error (Basic): Client '%s' not found or DB error: %v", clientID, err)
			return nil, fmt.Errorf("invalid_client: client authentication failed")
		}

		if !password.CheckPasswordHash(clientSecret, client.SecretHash) {
			log.Printf("Client Auth Error (Basic): Invalid secret for client '%s'", clientID)
			return nil, fmt.Errorf("invalid_client: client authentication failed")
		}
		log.Printf("Client Auth Success (Basic): Client '%s' authenticated", clientID)
		return client, nil
	} else {
		// --- Form Post Authentication ---
		if err := r.ParseForm(); err != nil {
			return nil, fmt.Errorf("invalid_request: failed to parse form body")
		}
		clientID = r.PostFormValue("client_id")
		clientSecret = r.PostFormValue("client_secret")

		if clientID == "" {
			// Neither Basic Auth nor form parameters provided
			return nil, fmt.Errorf("invalid_client: client credentials not provided")
		}

		log.Printf("Authenticating client '%s' using Form POST", clientID)
		client, err := s.GetClient(clientID)
		if err != nil {
			log.Printf("Client Auth Error (POST): Client '%s' not found or DB error: %v", clientID, err)
			return nil, fmt.Errorf("invalid_client: client authentication failed")
		}

		if clientSecret == "" {
			// Public clients might not use a secret, but require other auth methods (e.g., PKCE)
			// For now, we require a secret for form post auth as well.
			log.Printf("Client Auth Error (POST): Missing client_secret for client '%s'", clientID)
			return nil, fmt.Errorf("invalid_client: client secret not provided")
		}

		if !password.CheckPasswordHash(clientSecret, client.SecretHash) {
			log.Printf("Client Auth Error (POST): Invalid secret for client '%s'", clientID)
			return nil, fmt.Errorf("invalid_client: client authentication failed")
		}
		log.Printf("Client Auth Success (POST): Client '%s' authenticated", clientID)
		return client, nil
	}
}

// Helper function to decode basic auth header manually if needed
func decodeBasicAuth(authHeader string) (username, password string, ok bool) {
	if !strings.HasPrefix(authHeader, "Basic ") {
		return "", "", false
	}
	payload, err := base64.StdEncoding.DecodeString(authHeader[6:])
	if err != nil {
		return "", "", false
	}
	pair := strings.SplitN(string(payload), ":", 2)
	if len(pair) != 2 {
		return "", "", false
	}
	return pair[0], pair[1], true
}
