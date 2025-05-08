.PHONY: all build run kill clean up down logs logs-service

SERVICES = gateway_service product_service inventory_service order_service
SERVICE_DIRS = $(SERVICES)

# Default target
all: run

# Build all service executables
build:
	@echo "Building all services..."
	@for service_dir in $(SERVICE_DIRS); do \\
		echo "Building $$service_dir..."; \\
		(cd $$service_dir && go build -o $$service_dir) || exit 1; \\
	done
	@echo "All services built successfully."

# Start all services in the background (kills existing ones first)
run: kill build
	@echo "Starting all services in background..."
	@for service_dir in $(SERVICE_DIRS); do \\
		echo "Starting $$service_dir..."; \\
		(cd $$service_dir && ./$$service_dir &) \\
		echo "$$service_dir started with PID $$!"; \\
	done
	@echo "All services started. Check individual service logs for status."
	@echo "-----------------------------------------------------"
	@echo "Gateway UI available at: http://localhost:8080/"
	@echo "Grafana UI available at: http://localhost:3000/"
	@echo "-----------------------------------------------------"

# Stop all running services (uses pkill)
# This pattern targets processes started like "./service_name/service_name"
kill:
	@echo "Stopping all Go services..."
	@for service in $(SERVICES); do pkill -x "$$service" 2>/dev/null || true; done
	@echo "Attempted to stop all Go services. Verify manually if needed."

# Clean up build artifacts (stops services first)
clean: kill
	@echo "Cleaning up build artifacts..."
	@for service_dir in $(SERVICE_DIRS); do \\
		echo "Cleaning $$service_dir..."; \\
		rm -f $$service_dir/$$service_dir; \\
	done
	@echo "Cleanup complete."

# Docker Compose (Grafana Stack)
up:
	@echo "Starting Grafana Stack (Loki, Tempo, Prometheus, Grafana)..."
	docker-compose up -d
	@echo "Grafana Stack started."

down:
	@echo "Stopping Grafana Stack..."
	docker-compose down
	@echo "Grafana Stack stopped."

logs:
	@echo "Tailing logs for Grafana Stack..."
	docker-compose logs -f

# Log a specific service by tailing its output (example, assumes stdout/stderr logging)
# Usage: make logs-service SERVICE_NAME=gateway_service
logs-service:
	@[ -z "$(SERVICE_NAME)" ] && { echo "SERVICE_NAME is not set. Usage: make logs-service SERVICE_NAME=<service_name>"; exit 1; } || true
	@echo "Tailing logs for $(SERVICE_NAME)... (Press Ctrl+C to stop)"
	@tail -f /tmp/$(SERVICE_NAME).log # This is a placeholder, actual log output needs to be configured per service or use docker logs if containerized

# Example for individual service management (can be expanded)
build-%:
	@echo "Building $*..."
	@(cd $* && go build -o $*)

run-%: build-%
	@echo "Starting $*..."
	@(cd $* && ./$* &)
	@echo "$* started with PID $$!"

kill-%:
	@echo "Stopping $*..."
	@pkill -f "^./$*/$*$$" 2>/dev/null || true
