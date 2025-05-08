package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/lirlia/100day_challenge_backend/day40_otel_grafana_go/internal/pkg/otel"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	oteltrace "go.opentelemetry.io/otel/trace"
)

const (
	serviceName    = "product-service"
	serviceVersion = "0.1.0"
	environment    = "development"
	otelEndpoint   = "localhost:4317"
	serverPort     = ":8081"
)

var tracer oteltrace.Tracer

type Product struct {
	ID          string  `json:"id"`
	Name        string  `json:"name"`
	Description string  `json:"description"`
	Price       float64 `json:"price"`
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	shutdownTracer, err := otel.InitTracerProvider(ctx, serviceName, serviceVersion, environment, otelEndpoint)
	if err != nil {
		log.Fatalf("failed to initialize tracer provider: %v", err)
	}
	defer func() {
		if err := shutdownTracer(ctx); err != nil {
			log.Printf("failed to shutdown tracer provider: %v", err)
		}
	}()
	tracer = otel.GetTracer(serviceName)

	_, err = otel.InitMeterProvider(ctx, serviceName, serviceVersion, environment)
	if err != nil {
		log.Fatalf("failed to initialize meter provider: %v", err)
	}

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())

	productsHandler := http.HandlerFunc(handleGetProduct)
	mux.Handle("/products", otelhttp.NewHandler(productsHandler, "GetProduct"))

	otelHandler := otelhttp.NewHandler(mux, serviceName+"-server")

	srv := &http.Server{
		Addr:    serverPort,
		Handler: otelHandler,
	}

	go func() {
		log.Printf("%s starting on port %s", serviceName, serverPort)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe(): %v", err)
		}
	}()

	<-ctx.Done()
	log.Printf("%s shutting down...", serviceName)

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server Shutdown Failed:%+v", err)
	}
	log.Printf("%s shutdown complete.", serviceName)
}

func handleGetProduct(w http.ResponseWriter, r *http.Request) {
	log.Printf("Product Service: Received request with headers:")
	for name, headers := range r.Header {
		for _, h := range headers {
			log.Printf("  %s: %s", name, h)
		}
	}
	_, span := tracer.Start(r.Context(), "handleGetProductInternal")
	defer span.End()

	scenario := r.URL.Query().Get("scenario")
	log.Printf("%s received request with scenario: %s", serviceName, scenario)

	if scenario == "product_error" {
		log.Printf("%s simulating product error scenario", serviceName)
		http.Error(w, "Simulated product service error", http.StatusInternalServerError)
		return
	}

	if scenario == "long_request" {
		log.Printf("%s simulating long processing for 5 seconds", serviceName)
		time.Sleep(5 * time.Second)
	}

	product := Product{
		ID:          "prod123",
		Name:        "Awesome Widget",
		Description: "The best widget in the world.",
		Price:       19.99,
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(product); err != nil {
		log.Printf("Error encoding product to JSON: %v", err)
		http.Error(w, "Failed to encode product", http.StatusInternalServerError)
	}
}
