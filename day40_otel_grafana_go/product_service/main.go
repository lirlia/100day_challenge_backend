package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/lirlia/100day_challenge_backend/day40_otel_grafana_go/internal/pkg/observability"
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
	logger := observability.NewLogger("product_service")
	headersMap := make(map[string]string)
	for name, values := range r.Header {
		if len(values) > 0 {
			headersMap[name] = values[0]
		}
	}
	logger.DebugContext(r.Context(), "Received request", "headers", headersMap)

	_, span := tracer.Start(r.Context(), "handleGetProductInternal")
	defer span.End()

	scenario := r.URL.Query().Get("scenario")
	logger.InfoContext(r.Context(), "Processing request", "service_name", serviceName, "scenario", scenario)

	if scenario == "product_error" {
		logger.WarnContext(r.Context(), "Simulating product error scenario", "service_name", serviceName)
		http.Error(w, "Simulated product service error", http.StatusInternalServerError)
		return
	}

	if scenario == "long_request" {
		logger.InfoContext(r.Context(), "Simulating long processing", "service_name", serviceName, "duration", "5s")
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
		logger.ErrorContext(r.Context(), "Error encoding product to JSON", "error", err, "service_name", serviceName)
		http.Error(w, "Failed to encode product", http.StatusInternalServerError)
	}
}
