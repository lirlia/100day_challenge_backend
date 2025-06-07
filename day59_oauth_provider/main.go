package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/database"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/handlers"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/services"
)

// カスタムハンドラー
func customHandler(w http.ResponseWriter, r *http.Request) {
	log.Printf("Request: %s %s", r.Method, r.URL.Path)

	// CORSヘッダーを追加
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3001")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
	w.Header().Set("Access-Control-Allow-Credentials", "true")

	// プリフライトリクエストの処理
	if r.Method == http.MethodOptions {
		log.Printf("Handling OPTIONS request for %s", r.URL.Path)
		w.WriteHeader(http.StatusOK)
		return
	}

	// パスに基づいてルーティング
	switch r.URL.Path {
	case "/":
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"oauth2-provider"}`))
	case "/health":
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"oauth2-provider"}`))
	case "/.well-known/openid_configuration":
		handlers.DiscoveryHandler(w, r)
	case "/.well-known/jwks.json":
		handlers.JWKSHandler(w, r)
	case "/userinfo":
		handlers.UserInfoHandler(w, r)
	case "/authorize":
		handlers.AuthorizeHandler(w, r)
	case "/token":
		handlers.TokenHandler(w, r)
	default:
		if strings.HasPrefix(r.URL.Path, "/api/clients/") {
			handlers.ClientHandler(w, r)
		} else if r.URL.Path == "/api/clients" {
			handlers.ClientsHandler(w, r)
		} else if strings.HasPrefix(r.URL.Path, "/api/users/") {
			handlers.UserHandler(w, r)
		} else if r.URL.Path == "/api/users" {
			handlers.UsersHandler(w, r)
		} else {
			http.NotFound(w, r)
		}
	}
}

func main() {
	log.Println("Starting OAuth2/OpenID Connect Provider...")

	// データベース初期化
	if err := database.Init(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	// RSA鍵ペア初期化
	if err := services.InitializeKeys(); err != nil {
		log.Fatalf("Failed to initialize keys: %v", err)
	}

	// サーバー起動
	server := &http.Server{
		Addr:    ":8081",
		Handler: http.HandlerFunc(customHandler),
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down server...")
		server.Close()
	}()

	log.Println("Server starting on :8081")
	log.Println("OAuth2 Provider: http://localhost:8081")
	log.Println("Discovery: http://localhost:8081/.well-known/openid_configuration")
	log.Println("CORS enabled for: http://localhost:3001")

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed to start: %v", err)
	}

	log.Println("Server stopped")
}
