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
	serviceName    = "order-service"
	serviceVersion = "0.1.0"
	environment    = "development"
	otelEndpoint   = "localhost:4317"
	serverPort     = ":8083"
)

var tracer oteltrace.Tracer

type Order struct {
	OrderID     string    `json:"orderId"`
	Status      string    `json:"status"`
	TotalAmount float64   `json:"totalAmount"`
	CreatedAt   time.Time `json:"createdAt"`
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

	ordersHandler := http.HandlerFunc(handleCreateOrder)
	mux.Handle("/orders", otelhttp.NewHandler(ordersHandler, "CreateOrder")) // Wrap with Otel

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

func handleCreateOrder(w http.ResponseWriter, r *http.Request) {
	logger := observability.NewLogger("order_service")
	headersMap := make(map[string]string)
	for name, values := range r.Header {
		if len(values) > 0 {
			headersMap[name] = values[0]
		}
	}
	logger.DebugContext(r.Context(), "Received request", "headers", headersMap)

	_, span := tracer.Start(r.Context(), "handleCreateOrderInternal")
	defer span.End()

	scenario := r.URL.Query().Get("scenario")
	logger.InfoContext(r.Context(), "Processing request", "service_name", serviceName, "scenario", scenario)

	// Handle scenarios if needed, e.g., simulate DB delay or error
	if scenario == "long_request" {
		logger.InfoContext(r.Context(), "Simulating long processing", "service_name", serviceName, "duration", "1s")
		time.Sleep(1 * time.Second)
	}

	if r.Context().Err() != nil {
		logger.WarnContext(r.Context(), "Context cancelled", "service_name", serviceName, "error", r.Context().Err())
		return
	}

	order := Order{
		OrderID:     "ord951",
		Status:      "CREATED",
		TotalAmount: 19.99, // Assuming it matches the product price for simplicity
		CreatedAt:   time.Now(),
	}

	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(order); err != nil {
		logger.ErrorContext(r.Context(), "Error encoding order to JSON", "error", err, "service_name", serviceName)
		if r.Context().Err() == nil { // Avoid duplicate error if context was already cancelled
			http.Error(w, "Failed to encode order", http.StatusInternalServerError)
		}
	}
}
