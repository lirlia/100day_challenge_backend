package handler

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"day19_oidc_provider/backend_go/internal/config"
	"day19_oidc_provider/backend_go/internal/middleware"
	"day19_oidc_provider/backend_go/pkg/password"
	"day19_oidc_provider/backend_go/internal/service"
	"day19_oidc_provider/backend_go/internal/session"
	"day19_oidc_provider/backend_go/internal/store"
	// Import other necessary packages like service later
)

// OIDCHandler handles OIDC and OAuth2 related requests.
type OIDCHandler struct {
	cfg          *config.Config
	store        store.Storer
	sessionMgr   *session.Manager
	tokenService *service.TokenService // Add token service
	// oidcService *service.OIDCService // Add later
}

// NewOIDCHandler creates a new OIDCHandler.
func NewOIDCHandler(cfg *config.Config, store store.Storer, sessionMgr *session.Manager, tokenService *service.TokenService /*, oidcService *service.OIDCService*/) *OIDCHandler {
	return &OIDCHandler{
		cfg:          cfg,
		store:        store,
		sessionMgr:   sessionMgr,
		tokenService: tokenService, // Store token service
		// oidcService: oidcService,
	}
}

// Discovery serves the OIDC discovery document.
func (h *OIDCHandler) Discovery(w http.ResponseWriter, r *http.Request) {
	// Based on RFC 8414: OAuth 2.0 Authorization Server Metadata
	// and OpenID Connect Discovery 1.0 incorporating errata set 1
	discoveryDoc := map[string]interface{}{
		"issuer":                                h.cfg.IssuerURL,
		"authorization_endpoint":                h.cfg.IssuerURL + "/authorize",
		"token_endpoint":                        h.cfg.IssuerURL + "/token",
		"userinfo_endpoint":                     h.cfg.IssuerURL + "/userinfo",
		"jwks_uri":                              h.cfg.IssuerURL + "/jwks",
		"scopes_supported":                      []string{"openid", "email", "profile"}, // Adjust as needed
		"response_types_supported":              []string{"code"},                        // Only Authorization Code Flow
		"grant_types_supported":                 []string{"authorization_code" /*, "refresh_token" */}, // Add refresh_token later if supported
		"subject_types_supported":               []string{"public"},
		"id_token_signing_alg_values_supported": []string{"RS256"},
		"token_endpoint_auth_methods_supported": []string{"client_secret_basic", "client_secret_post"}, // Add others if needed
		"claims_supported":                      []string{"sub", "iss", "aud", "exp", "iat", "email", "name"}, // Adjust as needed
		// "service_documentation":              "<URL_TO_YOUR_DOCS>", // Optional
		// "ui_locales_supported":               []string{"en-US", "ja-JP"}, // Optional
		// "claims_parameter_supported":         false, // Optional
		// "request_parameter_supported":        false, // Optional
		// "request_uri_parameter_supported":  false, // Optional
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "public, max-age=86400") // Cache for 1 day
	if err := json.NewEncoder(w).Encode(discoveryDoc); err != nil {
		// Log the error internally
		log.Printf("Error encoding discovery document: %v", err) // Use proper logging
		http.Error(w, "Failed to generate discovery document", http.StatusInternalServerError)
	}
}

// Authorize handles the initial authorization request (GET).
func (h *OIDCHandler) Authorize(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()

	// --- 1. Parse and Validate Parameters ---
	clientID := q.Get("client_id")
	redirectURI := q.Get("redirect_uri")
	responseType := q.Get("response_type")
	scope := q.Get("scope")
	state := q.Get("state")
	nonce := q.Get("nonce")
	// PKCE (Optional but recommended)
	codeChallenge := q.Get("code_challenge")
	codeChallengeMethod := q.Get("code_challenge_method")

	// Basic validation
	if clientID == "" || redirectURI == "" || responseType == "" || scope == "" {
		http.Error(w, "Missing required parameters (client_id, redirect_uri, response_type, scope)", http.StatusBadRequest)
		return
	}

	// Validate response_type (only support 'code')
	if responseType != "code" {
		// Redirect back with error (if state is present)
		redirectWithError(w, r, redirectURI, "unsupported_response_type", "response_type must be 'code'", state)
		return
	}

	// Validate scope (must include 'openid')
	scopes := strings.Fields(scope)
	hasOpenID := false
	for _, s := range scopes {
		if s == "openid" {
			hasOpenID = true
			break
		}
	}
	if !hasOpenID {
		redirectWithError(w, r, redirectURI, "invalid_scope", "scope must include 'openid'", state)
		return
	}

	// Validate PKCE parameters if present
	if codeChallenge != "" && codeChallengeMethod != "S256" {
		// Only support S256 for PKCE
		redirectWithError(w, r, redirectURI, "invalid_request", "unsupported code_challenge_method, only S256 is supported", state)
		return
	}
	if codeChallenge == "" && codeChallengeMethod != "" {
		redirectWithError(w, r, redirectURI, "invalid_request", "code_challenge_method provided without code_challenge", state)
		return
	}

	// --- 2. Validate Client and Redirect URI ---
	client, err := h.store.GetClient(clientID)
	if err != nil {
		log.Printf("Authorize Error: Invalid client_id %s: %v", clientID, err)
		// Do not redirect back for invalid client_id, show generic error
		http.Error(w, "Invalid client_id", http.StatusBadRequest)
		return
	}

	// Validate redirect_uri against registered URIs
	isRedirectValid := false
	for _, registeredURI := range client.ParsedRedirectURIs {
		if redirectURI == registeredURI {
			isRedirectValid = true
			break
		}
	}
	if !isRedirectValid {
		log.Printf("Authorize Error: Invalid redirect_uri '%s' for client %s", redirectURI, clientID)
		// Do not redirect back for invalid redirect_uri, show generic error
		http.Error(w, "Invalid redirect_uri", http.StatusBadRequest)
		return
	}

	// --- 3. Check User Session ---
	sessionData, err := h.sessionMgr.GetSessionFromRequest(r)
	if err != nil {
		log.Printf("Authorize Error: Failed to get session: %v", err)
		http.Error(w, "Session error", http.StatusInternalServerError)
		return
	}

	// Store original request parameters for later use (after login/consent)
	interactionParams := map[string]interface{}{ // Use interface{} for mixed types
		"client_id":             clientID,
		"client_name":         client.Name, // Add client name
		"redirect_uri":        redirectURI,
		"response_type":       responseType,
		"scope":               scope, // Keep original scope string
		"scopes_requested":    scopes, // Add parsed scopes array
		"state":               state,
		"nonce":               nonce,
		"code_challenge":        codeChallenge,
		"code_challenge_method": codeChallengeMethod,
	}
	paramsJSON, err := json.Marshal(interactionParams)
	if err != nil {
		log.Printf("Authorize Error: Failed to marshal interaction params: %v", err)
		http.Error(w, "Internal server error", http.StatusInternalServerError)
		return
	}

	interactionID := uuid.NewString()
	interaction := &store.Interaction{
		ID:        interactionID,
		Prompt:    "", // Will be set based on next step
		Params:    string(paramsJSON), // Store marshalled JSON
		ReturnTo:  h.cfg.IssuerURL + "/authorize", // The URL to resume flow after interaction
		ExpiresAt: time.Now().Add(10 * time.Minute), // Interaction expiry
		CreatedAt: time.Now(),
	}

	// --- 4. Determine Next Step (Login, Consent, or Issue Code) ---
	if sessionData == nil {
		// --- 4a. User Not Logged In -> Redirect to Login Page ---
		log.Printf("Authorize: No active session, redirecting to login for interaction %s", interactionID)
		interaction.Prompt = "login"
		if err := h.store.CreateInteraction(interaction); err != nil {
			log.Printf("Authorize Error: Failed to create login interaction: %v", err)
			http.Error(w, "Failed to start login flow", http.StatusInternalServerError)
			return
		}

		// Redirect to Next.js login page with interaction ID
		loginURL := fmt.Sprintf("%s/login?interaction_id=%s", "http://localhost:3001", interactionID) // TODO: Make frontend URL configurable
		http.Redirect(w, r, loginURL, http.StatusFound)
		return
	}

	// --- 4b. User Logged In -> Check Consent ---
	userID := sessionData.UserID
	log.Printf("Authorize: User %s is logged in. Checking consent for client %s", userID, clientID)
	interaction.SessionID = &sessionData.SessionID // Link interaction to session

	// Check if user has already granted consent for these scopes to this client
	grant, err := h.store.GetGrant(userID, clientID)
	if err != nil {
		log.Printf("Authorize Error: Failed to check grant for user %s, client %s: %v", userID, clientID, err)
		http.Error(w, "Failed to check consent", http.StatusInternalServerError)
		return
	}

	hasConsent := false
	if grant != nil {
		// Simple check: does the stored grant cover all requested scopes?
		// TODO: Implement more robust scope comparison if necessary
		grantedScopes := strings.Fields(grant.Scopes)
		grantedMap := make(map[string]bool)
		for _, s := range grantedScopes { grantedMap[s] = true }

		requiredScopes := strings.Fields(scope)
		allScopesGranted := true
		for _, reqScope := range requiredScopes {
			if !grantedMap[reqScope] {
				allScopesGranted = false
				break
			}
		}
		hasConsent = allScopesGranted
	}

	if !hasConsent {
		// --- 4c. Consent Needed -> Redirect to Consent Page ---
		log.Printf("Authorize: Consent needed for user %s, client %s. Redirecting to consent for interaction %s", userID, clientID, interactionID)
		interaction.Prompt = "consent"
		if err := h.store.CreateInteraction(interaction); err != nil {
			log.Printf("Authorize Error: Failed to create consent interaction: %v", err)
			http.Error(w, "Failed to start consent flow", http.StatusInternalServerError)
			return
		}

		// Redirect to Next.js consent page with interaction ID
		consentURL := fmt.Sprintf("%s/consent?interaction_id=%s", "http://localhost:3001", interactionID) // TODO: Make frontend URL configurable
		http.Redirect(w, r, consentURL, http.StatusFound)
		return
	}

	// --- 4d. User Logged In and Consent Granted -> Issue Authorization Code ---
	log.Printf("Authorize: User %s already consented to client %s. Proceeding to issue code.", userID, clientID)

	// 1. Generate Authorization Code
	code := generateSecureRandomString(32) // Generate a 32-byte random code

	// 2. Store Authorization Code Details
	authCode := &store.AuthorizationCode{
		Code:                code,
		ClientID:            clientID,
		UserID:              userID,
		RedirectURI:         redirectURI,
		Scopes:              scope, // Granted scope string
		Nonce:               nil,   // Store nonce if present
		CodeChallenge:       nil,   // Store PKCE if present
		CodeChallengeMethod: nil,
		ExpiresAt:           time.Now().Add(10 * time.Minute), // Code expiry (e.g., 10 minutes)
		CreatedAt:           time.Now(),
	}
	if nonce != "" { authCode.Nonce = &nonce }
	if codeChallenge != "" { authCode.CodeChallenge = &codeChallenge }
	if codeChallengeMethod != "" { authCode.CodeChallengeMethod = &codeChallengeMethod }

	if err := h.store.CreateAuthorizationCode(authCode); err != nil {
		log.Printf("Authorize Error: Failed to store authorization code for user %s, client %s: %v", userID, clientID, err)
		// Redirect back with server_error
		redirectWithError(w, r, redirectURI, "server_error", "Failed to generate authorization code", state)
		return
	}

	// Clean up the interaction record as it's no longer needed
	_ = h.store.DeleteInteraction(interaction.ID)

	// 3. Build Redirect URL
	redirectURL, err := url.Parse(redirectURI)
	if err != nil {
		log.Printf("Authorize Error: Failed to parse redirect_uri %s before adding code: %v", redirectURI, err)
		// Don't redirect if the base URI is invalid, show error page
		http.Error(w, "Invalid redirect_uri configuration", http.StatusInternalServerError)
		return
	}

	respParams := url.Values{}
	respParams.Set("code", code)
	if state != "" {
		respParams.Set("state", state)
	}
	redirectURL.RawQuery = respParams.Encode()

	// 4. Redirect User Agent
	log.Printf("Authorize: Issuing code %s for user %s, client %s. Redirecting to %s", code, userID, clientID, redirectURL.String())
	http.Redirect(w, r, redirectURL.String(), http.StatusFound)
}

// AuthorizeDecision handles the POST request after user interaction (login/consent).
func (h *OIDCHandler) AuthorizeDecision(w http.ResponseWriter, r *http.Request) {
	// TODO: This might not be a separate endpoint; logic handled within HandleLogin/HandleConsent flows
	w.WriteHeader(http.StatusNotImplemented)
	w.Write([]byte("Not Implemented: Authorize POST (Decision)"))
}

// Token handles the token request.
func (h *OIDCHandler) Token(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeJSONError(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// --- 1. Client Authentication ---
	client, err := service.AuthenticateClient(r, h.store)
	if err != nil {
		log.Printf("Token Error: Client authentication failed: %v", err)
		// Error format based on RFC 6749 Section 5.2
		w.Header().Set("WWW-Authenticate", "Basic realm=\"Restricted\"") // Optional challenge
		writeJSONError(w, err.Error(), http.StatusUnauthorized)
		return
	}

	// --- 2. Parse and Validate Parameters ---
	if err := r.ParseForm(); err != nil {
		writeJSONError(w, "invalid_request: Failed to parse form body", http.StatusBadRequest)
		return
	}
	grantType := r.PostFormValue("grant_type")
	code := r.PostFormValue("code")
	redirectURI := r.PostFormValue("redirect_uri")
	codeVerifier := r.PostFormValue("code_verifier") // For PKCE

	if grantType != "authorization_code" {
		writeJSONError(w, "unsupported_grant_type: Only authorization_code is supported", http.StatusBadRequest)
		return
	}
	if code == "" {
		writeJSONError(w, "invalid_request: Missing code parameter", http.StatusBadRequest)
		return
	}
	if redirectURI == "" {
		writeJSONError(w, "invalid_request: Missing redirect_uri parameter", http.StatusBadRequest)
		return
	}

	// --- 3. Validate Authorization Code ---
	authCode, err := h.store.GetAuthorizationCode(code)
	if err != nil {
		log.Printf("Token Error: Invalid or expired code '%s': %v", code, err)
		writeJSONError(w, "invalid_grant: Authorization code invalid or expired", http.StatusBadRequest)
		return
	}

	// Verify client ID matches the one associated with the code
	if authCode.ClientID != client.ID {
		log.Printf("Token Error: Client ID mismatch for code '%s' (expected %s, got %s)", code, authCode.ClientID, client.ID)
		writeJSONError(w, "invalid_grant: Client ID mismatch", http.StatusBadRequest)
		// Also delete the code as it might be compromised or misused
		_ = h.store.DeleteAuthorizationCode(code)
		return
	}

	// Verify redirect URI matches the one used in the authorization request
	if authCode.RedirectURI != redirectURI {
		log.Printf("Token Error: Redirect URI mismatch for code '%s' (expected %s, got %s)", code, authCode.RedirectURI, redirectURI)
		writeJSONError(w, "invalid_grant: Redirect URI mismatch", http.StatusBadRequest)
		_ = h.store.DeleteAuthorizationCode(code)
		return
	}

	// --- 4. Validate PKCE ---
	challenge := ""
	method := ""
	if authCode.CodeChallenge != nil { challenge = *authCode.CodeChallenge }
	if authCode.CodeChallengeMethod != nil { method = *authCode.CodeChallengeMethod }

	if challenge != "" { // PKCE was used for this code
		if codeVerifier == "" {
			log.Printf("Token Error: Missing code_verifier for code '%s' which used PKCE", code)
			writeJSONError(w, "invalid_grant: Missing code_verifier", http.StatusBadRequest)
			_ = h.store.DeleteAuthorizationCode(code)
			return
		}
		if !service.ValidatePKCE(codeVerifier, challenge, method) {
			log.Printf("Token Error: Invalid code_verifier for code '%s'", code)
			writeJSONError(w, "invalid_grant: Invalid code_verifier", http.StatusBadRequest)
			_ = h.store.DeleteAuthorizationCode(code)
			return
		}
		log.Printf("Token Info: PKCE validation successful for code '%s'", code)
	}

	// --- 5. Consume Authorization Code ---
	if err := h.store.DeleteAuthorizationCode(code); err != nil {
		// Log error, but might proceed if DB deletion fails (consider implications)
		log.Printf("Token Warning: Failed to delete consumed authorization code '%s': %v", code, err)
	}

	// --- 6. Generate Tokens ---
	userID := authCode.UserID
	scopes := strings.Fields(authCode.Scopes)
	nonce := ""
	if authCode.Nonce != nil { nonce = *authCode.Nonce }

	idToken, err := h.tokenService.GenerateIDToken(userID, client.ID, nonce, scopes)
	if err != nil {
		log.Printf("Token Error: Failed to generate ID token: %v", err)
		writeJSONError(w, "server_error: Failed to generate tokens", http.StatusInternalServerError)
		return
	}

	accessToken, err := h.tokenService.GenerateAccessToken(userID, client.ID, scopes)
	if err != nil {
		log.Printf("Token Error: Failed to generate access token: %v", err)
		writeJSONError(w, "server_error: Failed to generate tokens", http.StatusInternalServerError)
		return
	}

	// --- 7. Return Token Response ---
	tokenResponse := map[string]interface{}{
		"access_token": accessToken,
		"token_type":   "Bearer",
		"expires_in":   int(h.cfg.TokenTTL.Seconds()),
		"id_token":     idToken,
		// "refresh_token": refreshToken, // Add later if implemented
	}

	log.Printf("Token Success: Issued tokens for user %s, client %s", userID, client.ID)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(tokenResponse); err != nil {
		log.Printf("Token Error: Failed to encode token response: %v", err)
	}
}

// UserInfo serves user information based on the validated access token.
func (h *OIDCHandler) UserInfo(w http.ResponseWriter, r *http.Request) {
	// User ID should be populated in the context by the authentication middleware
	userID, ok := r.Context().Value(middleware.UserIDContextKey).(string)
	if !ok || userID == "" {
		log.Printf("UserInfo Error: User ID not found in context after auth middleware")
		// This case should technically not be reached if middleware is applied correctly
		// and rejects unauthenticated requests.
		writeJSONError(w, "Unauthorized: Invalid token or user context", http.StatusUnauthorized)
		return
	}

	// Retrieve user details from the store
	user, err := h.store.GetUserByID(userID)
	if err != nil {
		log.Printf("UserInfo Error: Failed to retrieve user %s: %v", userID, err)
		writeJSONError(w, "Failed to retrieve user information", http.StatusInternalServerError)
		return
	}

	// Construct UserInfo response based on scopes originally granted for the token
	// For simplicity, we'll rely on the scopes stored in the Access Token claims
	// (Ideally, we'd validate the token again here or get scopes from context)
	// We need to parse the access token again to get scopes, or pass claims through context.
	// Let's assume for now we just return based on stored user data.
	// A more robust implementation would check the token's scopes.

	userInfo := map[string]interface{}{
		"sub": user.ID, // Subject - REQUIRED
		// Add claims based on user data and granted scopes
		"email": user.Email,             // Assuming email scope was granted
		"name":  "User " + userID[:4], // Placeholder, assuming profile scope
		// Add other claims like profile, picture, etc., if requested and available
	}

	log.Printf("UserInfo Success: Returning info for user %s", userID)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(userInfo); err != nil {
		log.Printf("UserInfo Error: Failed to encode response: %v", err)
	}
}

// HandleLogin processes the login form submission from the Next.js frontend.
func (h *OIDCHandler) HandleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// --- 1. Parse Request Body ---
	var reqBody struct {
		InteractionID string `json:"interaction_id"`
		Email         string `json:"email"`
		Password      string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		log.Printf("HandleLogin Error: Failed to decode request body: %v", err)
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if reqBody.InteractionID == "" || reqBody.Email == "" || reqBody.Password == "" {
		writeJSONError(w, "Missing required fields (interaction_id, email, password)", http.StatusBadRequest)
		return
	}

	// --- 2. Get and Validate Interaction ---
	interaction, err := h.store.GetInteraction(reqBody.InteractionID)
	if err != nil {
		log.Printf("HandleLogin Error: Failed to get interaction %s: %v", reqBody.InteractionID, err)
		// Don't reveal if interaction ID is invalid vs expired vs not found
		writeJSONError(w, "Invalid or expired interaction", http.StatusBadRequest)
		return
	}

	// Ensure this interaction is indeed for login
	if interaction.Prompt != "login" {
		log.Printf("HandleLogin Error: Interaction %s is not a login prompt (prompt: %s)", reqBody.InteractionID, interaction.Prompt)
		writeJSONError(w, "Invalid interaction type", http.StatusBadRequest)
		return
	}

	// --- 3. Authenticate User ---
	user, err := h.store.GetUserByEmail(reqBody.Email)
	if err != nil {
		log.Printf("HandleLogin Error: Failed to get user by email %s: %v", reqBody.Email, err)
		// Generic error for DB issues
		writeJSONError(w, "Login failed (internal error)", http.StatusInternalServerError)
		return
	}
	if user == nil || !password.CheckPasswordHash(reqBody.Password, user.PasswordHash) {
		log.Printf("HandleLogin Failed: Invalid credentials for email %s", reqBody.Email)
		writeJSONError(w, "Invalid email or password", http.StatusUnauthorized)
		return
	}

	log.Printf("HandleLogin Success: User %s authenticated successfully", user.ID)

	// --- 4. Create Session ---
	sessionID, err := h.sessionMgr.CreateSession(user.ID)
	if err != nil {
		log.Printf("HandleLogin Error: Failed to create session for user %s: %v", user.ID, err)
		writeJSONError(w, "Login failed (session error)", http.StatusInternalServerError)
		return
	}

	// --- 5. Set Session Cookie ---
	if err := h.sessionMgr.SetSessionCookie(w, sessionID, user.ID); err != nil {
		log.Printf("HandleLogin Error: Failed to set session cookie for user %s: %v", user.ID, err)
		// Don't necessarily fail the whole login, but log it. Cookie might be set partially.
		// Consider how critical the cookie setting is for the flow.
		writeJSONError(w, "Login partially failed (cookie error)", http.StatusInternalServerError)
		return
	}

	// --- 6. Update Interaction (Link Session, Mark Login Complete) ---
	loginResult := map[string]interface{}{
		"login": map[string]string{
			"account": user.ID,
		},
	}
	// Link the interaction to the session ID
	interaction.SessionID = &sessionID
	if err := h.store.UpdateInteractionResult(interaction.ID, loginResult); err != nil {
		// Also update session ID linkage if UpdateInteractionResult doesn't handle it
		log.Printf("HandleLogin Warning: Failed to update interaction result for %s: %v", interaction.ID, err)
		// Continue the flow, but this might cause issues if the interaction state is critical later
	}

	// --- 7. Redirect Back to OIDC Flow (/authorize) ---
	// The user is now logged in. Redirect back to the interaction's return_to URL (/authorize)
	// /authorize will then re-evaluate the state (now logged in) and proceed to consent check or code issuance.
	log.Printf("HandleLogin: Login complete for interaction %s. Redirecting back to OIDC flow at %s", interaction.ID, interaction.ReturnTo)
	responsePayload := map[string]string{
		"redirect_to": interaction.ReturnTo, // Tell frontend to redirect here
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(responsePayload); err != nil {
		log.Printf("HandleLogin Error: Failed to encode redirect response: %v", err)
		// Client already received 200 OK, difficult to signal error now.
	}
}

// HandleConsent processes the consent form submission from the Next.js frontend.
func (h *OIDCHandler) HandleConsent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// --- 1. Parse Request Body ---
	var reqBody struct {
		InteractionID string `json:"interaction_id"`
		Decision      string `json:"decision"` // "allow" or "deny"
	}
	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		log.Printf("HandleConsent Error: Failed to decode request body: %v", err)
		writeJSONError(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if reqBody.InteractionID == "" || (reqBody.Decision != "allow" && reqBody.Decision != "deny") {
		writeJSONError(w, "Missing required fields (interaction_id, decision [allow/deny])", http.StatusBadRequest)
		return
	}

	// --- 2. Get and Validate Interaction ---
	interaction, err := h.store.GetInteraction(reqBody.InteractionID)
	if err != nil {
		log.Printf("HandleConsent Error: Failed to get interaction %s: %v", reqBody.InteractionID, err)
		writeJSONError(w, "Invalid or expired interaction", http.StatusBadRequest)
		return
	}

	// Ensure this interaction is for consent and linked to a session
	if interaction.Prompt != "consent" || interaction.SessionID == nil {
		log.Printf("HandleConsent Error: Interaction %s is not a consent prompt or has no session ID (prompt: %s, session: %v)", reqBody.InteractionID, interaction.Prompt, interaction.SessionID)
		writeJSONError(w, "Invalid interaction state", http.StatusBadRequest)
		return
	}

	// --- 3. Parse Original Parameters ---
	var params map[string]interface{}
	if err := json.Unmarshal([]byte(interaction.Params), &params); err != nil {
		log.Printf("HandleConsent Error: Failed to parse interaction params for %s: %v", interaction.ID, err)
		writeJSONError(w, "Internal server error parsing interaction data", http.StatusInternalServerError)
		return
	}
	// Helper to safely get string values from parsed params
	getStringParam := func(key string) string {
		if val, ok := params[key].(string); ok {
			return val
		}
		return ""
	}
	clientID := getStringParam("client_id")
	redirectURI := getStringParam("redirect_uri")
	state := getStringParam("state")
	scope := getStringParam("scope") // Original requested scope string

	// --- 4. Process Decision ---
	consentResult := map[string]interface{}{
		"consent": map[string]interface{}{},
	}

	if reqBody.Decision == "deny" {
		log.Printf("HandleConsent: User denied consent for interaction %s", interaction.ID)
		consentResult["consent"].(map[string]interface{})["error"] = "access_denied"
		// Update interaction result
		if err := h.store.UpdateInteractionResult(interaction.ID, consentResult); err != nil {
			log.Printf("HandleConsent Warning: Failed to update interaction result for denial %s: %v", interaction.ID, err)
		}
		// Redirect back to client with error
		redirectWithError(w, r, redirectURI, "access_denied", "The resource owner denied the request", state)
		// Need to return redirect JSON for proxy
		// redirectWithError currently does http.Redirect, needs modification or separate handling
		// For now, let's manually construct the error redirect URL and return it
		errorParams := url.Values{}
		errorParams.Set("error", "access_denied")
		errorParams.Set("error_description", "The resource owner denied the request")
		if state != "" { errorParams.Set("state", state) }

		redirectURL, _ := url.Parse(redirectURI)
		redirectURL.RawQuery = errorParams.Encode()

		responsePayload := map[string]string{"redirect_to": redirectURL.String()}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK) // Return 200 OK to proxy
		json.NewEncoder(w).Encode(responsePayload)
		return
	}

	// --- Decision is "allow" ---
	log.Printf("HandleConsent: User allowed consent for interaction %s", interaction.ID)

	// Get User ID from session
	session, err := h.store.GetSession(*interaction.SessionID)
	if err != nil {
		log.Printf("HandleConsent Error: Could not retrieve session %s linked to interaction %s: %v", *interaction.SessionID, interaction.ID, err)
		writeJSONError(w, "Session error after consent", http.StatusInternalServerError)
		return
	}
	userID := session.UserID

	// --- 5. Store Grant ---
	grant := &store.Grant{
		UserID:   userID,
		ClientID: clientID,
		Scopes:   scope, // Store the originally requested & now granted scopes
		// ExpiresAt: nil, // Or set an expiry for the grant
	}
	if err := h.store.CreateOrUpdateGrant(grant); err != nil {
		log.Printf("HandleConsent Error: Failed to store grant for user %s, client %s: %v", userID, clientID, err)
		writeJSONError(w, "Failed to save consent", http.StatusInternalServerError)
		return
	}

	// Mark interaction as complete
	consentResult["consent"].(map[string]interface{})["grantScope"] = scope
	if err := h.store.UpdateInteractionResult(interaction.ID, consentResult); err != nil {
		log.Printf("HandleConsent Warning: Failed to update interaction result for approval %s: %v", interaction.ID, err)
	}

	// --- 6. Redirect Back to OIDC Flow (/authorize) ---
	// Consent is complete. Redirect back to /authorize to issue the code.
	log.Printf("HandleConsent: Consent complete for interaction %s. Redirecting back to OIDC flow at %s", interaction.ID, interaction.ReturnTo)
	responsePayload := map[string]string{
		"redirect_to": interaction.ReturnTo,
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(responsePayload); err != nil {
		log.Printf("HandleConsent Error: Failed to encode redirect response: %v", err)
	}
}

// GetInteractionDetails provides details needed for frontend interaction pages (login/consent).
func (h *OIDCHandler) GetInteractionDetails(w http.ResponseWriter, r *http.Request) {
	interactionID := chi.URLParam(r, "interactionID")
	if interactionID == "" {
		writeJSONError(w, "Missing interaction ID", http.StatusBadRequest)
		return
	}

	interaction, err := h.store.GetInteraction(interactionID)
	if err != nil {
		log.Printf("GetInteractionDetails Error: Failed to get interaction %s: %v", interactionID, err)
		writeJSONError(w, "Invalid or expired interaction", http.StatusNotFound) // Not found is appropriate here
		return
	}

	// Parse the stored parameters
	var params map[string]interface{}
	if err := json.Unmarshal([]byte(interaction.Params), &params); err != nil {
		log.Printf("GetInteractionDetails Error: Failed to parse interaction params for %s: %v", interactionID, err)
		writeJSONError(w, "Internal server error parsing interaction data", http.StatusInternalServerError)
		return
	}

	// Extract details needed by the frontend
	details := map[string]interface{}{
		"prompt":           interaction.Prompt,
		"client_name":      params["client_name"],
		"scopes_requested": params["scopes_requested"],
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	if err := json.NewEncoder(w).Encode(details); err != nil {
		log.Printf("GetInteractionDetails Error: Failed to encode details response: %v", err)
	}
}

// redirectWithError redirects the user agent to the client's redirect_uri with error parameters.
func redirectWithError(w http.ResponseWriter, r *http.Request, redirectURI, errorCode, errorDescription, state string) {
	params := url.Values{}
	params.Set("error", errorCode)
	if errorDescription != "" {
		params.Set("error_description", errorDescription)
	}
	if state != "" {
		params.Set("state", state)
	}

	// Parse the base redirect URI to avoid tampering
	baseRedirectURI, err := url.Parse(redirectURI)
	if err != nil {
		log.Printf("Error parsing redirect_uri for error: %v", err)
		// Fallback to showing an error page if redirect URI is invalid
		http.Error(w, fmt.Sprintf("Invalid redirect_uri provided and an error occurred: %s", errorCode), http.StatusBadRequest)
		return
	}

	// Add error parameters to the query
	// Be careful about modifying existing query params vs. setting new ones.
	// For simplicity, we just set them here.
	baseRedirectURI.RawQuery = params.Encode()

	http.Redirect(w, r, baseRedirectURI.String(), http.StatusFound)
}

// writeJSONError is a helper to write JSON error responses.
func writeJSONError(w http.ResponseWriter, message string, statusCode int) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(map[string]string{"error": message})
}

// generateSecureRandomString generates a URL-safe, base64 encoded random string.
func generateSecureRandomString(length int) string {
	b := make([]byte, length)
	_, err := rand.Read(b)
	if err != nil {
		// Fallback or panic in case of CSPRNG failure
		log.Printf("Error generating random string: %v. Falling back to UUID.", err)
		return uuid.NewString() // Less ideal, but better than predictable
	}
	return base64.URLEncoding.WithPadding(base64.NoPadding).EncodeToString(b)
}
