package main

import (
	"context"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/lirlia/100day_challenge_backend/day40_otel_grafana_go/internal/pkg/httpclient"
	"github.com/lirlia/100day_challenge_backend/day40_otel_grafana_go/internal/pkg/otel"

	"github.com/prometheus/client_golang/prometheus/promhttp"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel/attribute"
	oteltrace "go.opentelemetry.io/otel/trace"
)

const (
	serviceName    = "gateway-service"
	serviceVersion = "0.1.0"
	environment    = "development"
	otelEndpoint   = "localhost:4317"
	serverPort     = ":8080"

	productServiceURL   = "http://localhost:8081/products"
	inventoryServiceURL = "http://localhost:8082/inventory"
	orderServiceURL     = "http://localhost:8083/orders"
)

var (
	httpClient *http.Client
	tracer     oteltrace.Tracer
)

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

	httpClient = httpclient.NewTraceableClient()

	mux := http.NewServeMux()
	mux.Handle("/metrics", promhttp.Handler())

	uiTmpl := template.Must(template.New("ui").Parse(uiHTML))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		if err := uiTmpl.Execute(w, nil); err != nil {
			log.Printf("Error executing UI template: %v", err)
			http.Error(w, "Failed to render UI", http.StatusInternalServerError)
		}
	})

	executeOrderHandler := http.HandlerFunc(handleExecuteOrder)
	mux.Handle("/execute-order", otelhttp.NewHandler(executeOrderHandler, "ExecuteOrder"))

	otelHandler := otelhttp.NewHandler(mux, serviceName+"-server")

	srv := &http.Server{
		Addr:    serverPort,
		Handler: otelHandler,
	}

	go func() {
		log.Printf("Gateway service starting on port %s", serverPort)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			log.Fatalf("ListenAndServe(): %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("Gateway service shutting down...")

	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelShutdown()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("Server Shutdown Failed:%+v", err)
	}
	log.Println("Gateway service shutdown complete.")
}

func handleExecuteOrder(w http.ResponseWriter, r *http.Request) {
	ctx, span := tracer.Start(r.Context(), "handleExecuteOrderInternal")
	defer span.End()

	scenario := r.URL.Query().Get("scenario")
	span.SetAttributes(attribute.String("order.scenario", scenario))
	log.Printf("Executing order with scenario: %s\n", scenario)

	var results strings.Builder
	results.WriteString(fmt.Sprintf("<h2>Order Execution (Scenario: %s)</h2>", scenario))

	productResp, err := callService(ctx, "product-service-call", productServiceURL+"?scenario="+scenario)
	if err != nil {
		results.WriteString(fmt.Sprintf("<p>Error calling Product Service: %v</p>", err))
		http.Error(w, results.String(), http.StatusInternalServerError)
		return
	}
	results.WriteString(fmt.Sprintf("<p>Product Service: %s</p>", productResp))

	inventoryResp, err := callService(ctx, "inventory-service-call", inventoryServiceURL+"?scenario="+scenario)
	if err != nil {
		results.WriteString(fmt.Sprintf("<p>Error calling Inventory Service: %v</p>", err))
		http.Error(w, results.String(), http.StatusInternalServerError)
		return
	}
	results.WriteString(fmt.Sprintf("<p>Inventory Service: %s</p>", inventoryResp))

	orderResp, err := callService(ctx, "order-service-call", orderServiceURL+"?scenario="+scenario)
	if err != nil {
		results.WriteString(fmt.Sprintf("<p>Error calling Order Service: %v</p>", err))
		http.Error(w, results.String(), http.StatusInternalServerError)
		return
	}
	results.WriteString(fmt.Sprintf("<p>Order Service: %s</p>", orderResp))

	results.WriteString("<p>Order processed successfully!</p>")
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	fmt.Fprint(w, results.String())
}

func callService(ctx context.Context, spanName, url string) (string, error) {
	// Use the context directly passed from the parent handler
	ctxCall := ctx

	// The transport will use this context
	req, err := http.NewRequestWithContext(ctxCall, "GET", url, nil)
	if err != nil {
		// Error handling for request creation itself
		return "", fmt.Errorf("failed to create request to %s: %w", url, err)
	}

	// Client-side timeout for the request
	requestCtx, cancel := context.WithTimeout(ctxCall, 3*time.Second)
	defer cancel()
	req = req.WithContext(requestCtx)

	// otelhttp.Transport automatically creates a client span here
	resp, err := httpClient.Do(req)
	if err != nil {
		// Error is captured by the automatic span
		return "", fmt.Errorf("failed to call %s: %w", url, err)
	}
	defer resp.Body.Close()

	// Status code check
	if resp.StatusCode >= 400 {
		bodyBytes, _ := io.ReadAll(resp.Body)
		errMsg := fmt.Sprintf("service %s returned status %d: %s", url, resp.StatusCode, string(bodyBytes))
		// The automatic span should record this as an error based on status code
		return "", fmt.Errorf(errMsg)
	}

	// Read response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		// Error reading body
		return "", fmt.Errorf("failed to read response body from %s: %w", url, err)
	}

	// Success
	return string(body), nil
}

const uiHTML = `
<!DOCTYPE html>
<html>
<head>
    <title>Day40 - Gateway UI</title>
    <style>
        body { font-family: sans-serif; margin: 20px; background-color: #f4f4f4; color: #333; }
        h1, h2 { color: #2c3e50; }
        .container { background-color: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        .button-group { margin-bottom: 20px; }
        button {
            padding: 10px 15px; margin: 5px; font-size: 16px; cursor: pointer;
            border: none; border-radius: 5px; color: white;
        }
        .btn-normal { background-color: #3498db; }
        .btn-error { background-color: #e74c3c; }
        .btn-timeout { background-color: #f39c12; }
        #response { margin-top: 20px; padding: 15px; border: 1px solid #ddd; border-radius: 5px; background-color: #ecf0f1; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Gateway Service UI</h1>
        <div class="button-group">
            <h2>Test Scenarios:</h2>
            <button class="btn-normal" onclick="executeOrder('normal')">Execute Normal Order</button>
            <button class="btn-error" onclick="executeOrder('product_error')">Simulate Product Service Error</button>
            <button class="btn-timeout" onclick="executeOrder('inventory_timeout')">Simulate Inventory Timeout</button>
            <button class="btn-normal" onclick="executeOrder('long_request')">Simulate Long Processing</button>
        </div>
        <div id="response">
            <p>Click a button to execute an order scenario.</p>
        </div>
    </div>
    <script>
        async function executeOrder(scenario) {
            const responseDiv = document.getElementById('response');
            responseDiv.innerHTML = '<p>Processing...</p>';
            try {
                const response = await fetch('/execute-order?scenario=' + scenario);
                const data = await response.text();
                if (!response.ok) {
                  responseDiv.innerHTML = '<h2>Error:</h2>' + data;
                } else {
                  responseDiv.innerHTML = data;
                }
            } catch (error) {
                responseDiv.innerHTML = '<p>Fetch error: ' + error + '</p>';
            }
        }
    </script>
</body>
</html>
`
