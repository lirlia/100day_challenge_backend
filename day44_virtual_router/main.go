package main

import (
	"context"
	"log"
	"net/http"
	_ "net/http/pprof" // For profiling
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/web"
	// "github.com/lirlia/100day_challenge_backend/day44_virtual_router/router" // InMemoryStoreがルータ管理
)

func main() {
	log.Println("Starting Day44 Virtual Router application with Echo...")

	// Setup profiling endpoint
	go func() {
		log.Println("Profiling server listening on localhost:6060/debug/pprof/")
		if err := http.ListenAndServe("localhost:6060", nil); err != nil {
			log.Printf("Error starting profiling server: %v", err)
		}
	}()

	// Initialize the Datastore for API handlers (InMemoryStore in this case)
	store := web.NewInMemoryStore() // InMemoryStoreがルータのインスタンスも管理する想定

	// Create a new Echo instance
	e := echo.New()

	// Setup global middlewares (Logger, CORS) from web/middleware.go
	web.SetupCommonMiddlewares(e) // web.Logger() と web.CORS() を適用

	// Register all API handlers
	web.RegisterHandlers(e, store)

	// Start server
	go func() {
		log.Println("HTTP server listening on :8080 (Using Echo)")
		if err := e.Start(":8080"); err != nil && err != http.ErrServerClosed {
			log.Fatalf("shutting down the server: %v", err)
		}
	}()

	// Graceful shutdown setup
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	// Block until a signal is received.
	sig := <-quit
	log.Printf("Received signal %s, shutting down server...", sig)

	// Create a context with a timeout for the shutdown.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Attempt to gracefully shut down the Echo server.
	if err := e.Shutdown(ctx); err != nil {
		log.Fatalf("Echo server shutdown failed: %+v", err)
	}

	// InMemoryStore がルータのライフサイクル (OSPF停止など) を管理する場合、
	// ここで store に対するクリーンアップ処理を呼び出すことを検討。
	// 例: if a, ok := store.(interface{ StopAllRouters() }); ok { a.StopAllRouters() }
	// 現状の Datastore インターフェースにはそのようなメソッドはないため、
	// 必要であれば InMemoryStore 側に実装し、ここで呼び出す。
	// 今回はシンプルに、プロセスの終了と共にリソースが解放されることを期待。

	log.Println("Application shut down gracefully.")
}
