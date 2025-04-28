package main

import (
	"fmt"
	"log"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"day19_oidc_provider/backend_go/internal/config"
	"day19_oidc_provider/backend_go/internal/handler"
	"day19_oidc_provider/backend_go/internal/jwks"
	authMiddleware "day19_oidc_provider/backend_go/internal/middleware" // Renamed import
	"day19_oidc_provider/backend_go/pkg/password"
	"day19_oidc_provider/backend_go/internal/service"
	"day19_oidc_provider/backend_go/internal/session"
	"day19_oidc_provider/backend_go/internal/store"
	"github.com/google/uuid"
)

func main() {
	// Load configuration
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("Failed to load configuration: %v", err)
	}

	// Load JWKS keys
	if err := jwks.LoadKeys(cfg.PrivateKeyPath);
	err != nil {
		log.Fatalf("Failed to load JWKS keys: %v", err)
	}
	log.Println("JWKS keys loaded successfully.")

	// Initialize database store
	dbStore, err := store.NewDBStore(cfg.DatabasePath)
	if err != nil {
		log.Fatalf("Failed to initialize database store: %v", err)
	}
	defer dbStore.Close()
	log.Println("Database connection established.")

	// --- Seed initial data (for testing) ---
	seedData(dbStore)
	// ----------------------------------------

	// Initialize Session Manager
	sessionMgr := session.NewManager(cfg, dbStore)

	// Initialize Token Service
	tokenService := service.NewTokenService(cfg, dbStore)

	// Initialize handlers (passing dependencies)
	oidcHandler := handler.NewOIDCHandler(cfg, dbStore, sessionMgr, tokenService) // Pass tokenService

	// Initialize router
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger) // Log requests
	r.Use(middleware.Recoverer) // Recover from panics
	r.Use(middleware.Timeout(60 * time.Second))

	// CORS configuration (Allow frontend origin)
	// TODO: Make origins configurable
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3002", "http://localhost:3003"}, // Allow test clients
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-CSRF-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300, // Maximum value not ignored by any of major browsers
	}))

	// Public routes
	r.Get("/.well-known/openid-configuration", oidcHandler.Discovery) // OIDC Discovery endpoint
	r.Get("/jwks", jwks.Handler) // Serve JWKS

	// OIDC/OAuth2 endpoints
	r.Get("/authorize", oidcHandler.Authorize) // Authorization endpoint (GET)
	r.Post("/authorize", oidcHandler.AuthorizeDecision) // Handle user decision (login/consent) from Next.js forms
	r.Post("/token", oidcHandler.Token) // Token endpoint

	// Protected UserInfo endpoint
	r.Route("/userinfo", func(r chi.Router) {
		r.Use(authMiddleware.AuthenticateAccessToken(cfg)) // Apply auth middleware using the alias
		r.Get("/", oidcHandler.UserInfo)
		// Can add POST/PUT etc. here if needed, they will also be protected
	})

	// Interaction endpoints (called by Next.js frontend via proxy)
	r.Get("/interaction/{interactionID}/details", oidcHandler.GetInteractionDetails) // Get details for frontend
	r.Post("/interaction/login", oidcHandler.HandleLogin)    // Handle login form submission
	r.Post("/interaction/consent", oidcHandler.HandleConsent) // Handle consent form submission

	// Start server
	serverAddr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Starting OIDC Provider server on http://localhost%s (Issuer: %s)", serverAddr, cfg.IssuerURL)
	if err := http.ListenAndServe(serverAddr, r); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

// seedData inserts initial users and clients if they don't exist.
func seedData(s store.Storer) {
	log.Println("Seeding initial data if necessary...")

	// Seed User
	testEmail := "test@example.com"
	existingUser, _ := s.GetUserByEmail(testEmail)
	if existingUser == nil {
		testPassword := "password" // Use a simple password for testing
		hash, err := password.HashPassword(testPassword)
		if err != nil {
			log.Fatalf("Failed to hash seed password: %v", err)
		}
		user := &store.User{
			ID:           uuid.NewString(),
			Email:        testEmail,
			PasswordHash: hash,
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		if err := s.CreateUser(user); err != nil {
			log.Fatalf("Failed to seed user: %v", err)
		}
		log.Printf("Seeded user: %s (password: %s)", testEmail, testPassword)
	} else {
		log.Printf("User %s already exists, skipping seed.", testEmail)
	}

	// Seed Client A
	clientAID := "client-a"
	existingClientA, _ := s.GetClient(clientAID)
	if existingClientA == nil {
		clientASecret := "client-a-secret"
		secretAHash, err := password.HashPassword(clientASecret)
		if err != nil {
			log.Fatalf("Failed to hash client A secret: %v", err)
		}
		redirectURIsA := `["http://localhost:3002/callback"]`
		clientA := &store.Client{
			ID:           clientAID,
			SecretHash:   secretAHash,
			RedirectURIs: redirectURIsA,
			Name:         "Test Client A",
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		if err := s.CreateClient(clientA); err != nil {
			log.Fatalf("Failed to seed client A: %v", err)
		}
		log.Printf("Seeded client: %s (secret: %s)", clientAID, clientASecret)
	} else {
		log.Printf("Client %s already exists, skipping seed.", clientAID)
	}

	// Seed Client B
	clientBID := "client-b"
	existingClientB, _ := s.GetClient(clientBID)
	if existingClientB == nil {
		clientBSecret := "client-b-secret"
		secretBHash, err := password.HashPassword(clientBSecret)
		if err != nil {
			log.Fatalf("Failed to hash client B secret: %v", err)
		}
		redirectURIsB := `["http://localhost:3003/callback"]`
		clientB := &store.Client{
			ID:           clientBID,
			SecretHash:   secretBHash,
			RedirectURIs: redirectURIsB,
			Name:         "Test Client B",
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}
		if err := s.CreateClient(clientB); err != nil {
			log.Fatalf("Failed to seed client B: %v", err)
		}
		log.Printf("Seeded client: %s (secret: %s)", clientBID, clientBSecret)
	} else {
		log.Printf("Client %s already exists, skipping seed.", clientBID)
	}
	log.Println("Seeding complete.")
}
