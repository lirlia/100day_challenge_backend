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
	serviceName    = "inventory-service"
	serviceVersion = "0.1.0"
	environment    = "development"
	otelEndpoint   = "localhost:4317"
	serverPort     = ":8082"
)

var tracer oteltrace.Tracer

type Inventory struct {
	ProductID string `json:"productId"`
	Stock     int    `json:"stock"`
	Location  string `json:"location"`
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

	inventoryHandler := http.HandlerFunc(handleGetInventory)
	mux.Handle("/inventory", otelhttp.NewHandler(inventoryHandler, "GetInventory"))

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

func handleGetInventory(w http.ResponseWriter, r *http.Request) {
	logger := observability.NewLogger("inventory_service")
	headersMap := make(map[string]string)
	for name, values := range r.Header {
		if len(values) > 0 {
			headersMap[name] = values[0]
		}
	}
	logger.DebugContext(r.Context(), "Received request", "headers", headersMap)

	_, span := tracer.Start(r.Context(), "handleGetInventoryInternal")
	defer span.End()

	scenario := r.URL.Query().Get("scenario")
	logger.InfoContext(r.Context(), "Processing request", "service_name", serviceName, "scenario", scenario)

	if scenario == "inventory_timeout" {
		logger.InfoContext(r.Context(), "Simulating inventory timeout", "service_name", serviceName, "duration", "4s")
		time.Sleep(4 * time.Second)
	} else if scenario == "long_request" {
		logger.InfoContext(r.Context(), "Simulating long processing", "service_name", serviceName, "duration", "5s")
		time.Sleep(5 * time.Second)
	}

	if r.Context().Err() != nil {
		logger.WarnContext(r.Context(), "Context cancelled", "service_name", serviceName, "error", r.Context().Err())
		return
	}

	inventory := Inventory{
		ProductID: "prod123",
		Stock:     88,
		Location:  "Warehouse A",
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(inventory); err != nil {
		logger.ErrorContext(r.Context(), "Error encoding inventory to JSON", "error", err, "service_name", serviceName)
		if r.Context().Err() == nil { // Avoid duplicate error if context was already cancelled
			http.Error(w, "Failed to encode inventory", http.StatusInternalServerError)
		}
	}
}
