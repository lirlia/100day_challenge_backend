package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/database"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/handlers"
	"github.com/lirlia/100day_challenge_backend/day59_oauth_provider/internal/services"
)

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

	// HTTPサーバー設定
	mux := http.NewServeMux()

	// 基本的なヘルスチェック
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","service":"oauth2-provider"}`))
	})

	// OpenID Connect エンドポイント
	mux.HandleFunc("/.well-known/openid_configuration", handlers.DiscoveryHandler)
	mux.HandleFunc("/.well-known/jwks.json", handlers.JWKSHandler)
	mux.HandleFunc("/userinfo", handlers.UserInfoHandler)

	// OAuth2 エンドポイント
	mux.HandleFunc("/authorize", handlers.AuthorizeHandler)
	mux.HandleFunc("/token", handlers.TokenHandler)

	// 管理API
	mux.HandleFunc("/api/clients", handlers.ClientsHandler)
	mux.HandleFunc("/api/clients/", handlers.ClientHandler)
	mux.HandleFunc("/api/users", handlers.UsersHandler)
	mux.HandleFunc("/api/users/", handlers.UserHandler)

	// サーバー起動
	server := &http.Server{
		Addr:    ":8081",
		Handler: mux,
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

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server failed to start: %v", err)
	}

	log.Println("Server stopped")
}
