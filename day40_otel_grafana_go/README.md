# Day40 - OpenTelemetry with Go Microservices and Grafana Stack

This project demonstrates how to instrument Go microservices with OpenTelemetry and visualize traces, metrics, and logs using the Grafana Stack (Loki, Tempo, Prometheus, Grafana).

## Architecture

(Details to be added later)

## Setup

(Details to be added later)

### Managing Services with Makefile

This project includes a `Makefile` in the `day40_otel_grafana_go` directory to simplify the management of Go microservices and the Grafana monitoring stack.

**Prerequisites:**
*   Ensure `go` is installed and configured in your PATH.
*   Ensure `docker` and `docker-compose` are installed.

**Common Makefile Targets:**

*   **Build and Run All Go Services:**
    ```bash
    make all
    # or
    make run
    ```
    This command will first stop any running Go services (managed by this Makefile), then build all services (`gateway_service`, `product_service`, `inventory_service`, `order_service`), and finally start them in the background.
    - Gateway UI: `http://localhost:8080/`
    - Grafana UI (if stack is up): `http://localhost:3000/`

*   **Stop All Go Services:**
    ```bash
    make kill
    ```
    This stops all Go services that were started using the `make run` or `make all` command.

*   **Build All Go Services (without running):**
    ```bash
    make build
    ```

*   **Clean Build Artifacts:**
    ```bash
    make clean
    ```
    This will stop all Go services and remove their compiled executables.

*   **Start Grafana Stack (Docker Compose):**
    ```bash
    make up
    ```
    This starts the Grafana, Loki, Tempo, and Prometheus containers in detached mode.

*   **Stop Grafana Stack:**
    ```bash
    make down
    ```

*   **View Grafana Stack Logs:**
    ```bash
    make logs
    ```
    This tails the logs from all containers in the Grafana stack.

**Service Logs:**
The Go services currently log to standard output/error. When run via `make run`, they are backgrounded. To view logs:
1.  Modify the `Makefile`'s `run` target to redirect output to files (e.g., `(cd $$service_dir && ./$$service_dir > /tmp/$$service_dir.log 2>&1 &)`).
2.  Or, run services individually in separate terminals if you need to actively monitor logs (e.g., `cd gateway_service && go build -o gateway_service && ./gateway_service`).
The `logs-service` target in the Makefile is a placeholder and needs actual log file paths if redirection is implemented.

(Further details specific to each service can be added here)
