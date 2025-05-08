package otel

import (
	"context"
	"fmt"

	// "time"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc"
	"go.opentelemetry.io/otel/exporters/prometheus"
	"go.opentelemetry.io/otel/metric"
	"go.opentelemetry.io/otel/propagation"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.21.0"
	"go.opentelemetry.io/otel/trace"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

var (
	globalTracerProvider *sdktrace.TracerProvider
)

// InitTracerProvider initializes an OTLP exporter, and configures the corresponding trace provider.
func InitTracerProvider(ctx context.Context, serviceName, serviceVersion, environment, otlpEndpoint string) (func(context.Context) error, error) {
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
			semconv.ServiceVersionKey.String(serviceVersion),
			semconv.DeploymentEnvironmentKey.String(environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	conn, err := grpc.NewClient(otlpEndpoint,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create gRPC connection to OTLP collector: %w", err)
	}

	traceExporter, err := otlptrace.New(ctx, otlptracegrpc.NewClient(otlptracegrpc.WithGRPCConn(conn)))
	if err != nil {
		return nil, fmt.Errorf("failed to create OTLP trace exporter: %w", err)
	}

	bsp := sdktrace.NewBatchSpanProcessor(traceExporter)
	tp := sdktrace.NewTracerProvider(
		sdktrace.WithSampler(sdktrace.AlwaysSample()),
		sdktrace.WithResource(res),
		sdktrace.WithSpanProcessor(bsp),
	)
	otel.SetTracerProvider(tp)
	globalTracerProvider = tp

	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(propagation.TraceContext{}, propagation.Baggage{}))

	return func(ctx context.Context) error {
		if globalTracerProvider != nil {
			if err := globalTracerProvider.Shutdown(ctx); err != nil {
				return fmt.Errorf("failed to shutdown TracerProvider: %w", err)
			}
		}
		if conn != nil {
			if err := conn.Close(); err != nil {
				return fmt.Errorf("failed to close gRPC connection: %w", err)
			}
		}
		return nil
	}, nil
}

// InitMeterProvider initializes a Prometheus exporter and configures the corresponding meter provider.
func InitMeterProvider(ctx context.Context, serviceName, serviceVersion, environment string) (*prometheus.Exporter, error) {
	res, err := resource.New(ctx,
		resource.WithAttributes(
			semconv.ServiceNameKey.String(serviceName),
			semconv.ServiceVersionKey.String(serviceVersion),
			semconv.DeploymentEnvironmentKey.String(environment),
		),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to create resource: %w", err)
	}

	exporter, err := prometheus.New()
	if err != nil {
		return nil, fmt.Errorf("failed to create Prometheus exporter: %w", err)
	}

	mp := sdkmetric.NewMeterProvider(
		sdkmetric.WithResource(res),
		sdkmetric.WithReader(exporter),
	)
	otel.SetMeterProvider(mp)

	return exporter, nil
}

// GetTracer returns a tracer from the global tracer provider set via otel.SetTracerProvider.
func GetTracer(instrumentationName string, opts ...trace.TracerOption) trace.Tracer {
	return otel.Tracer(instrumentationName, opts...)
}

// GetMeter returns a meter from the global meter provider set via otel.SetMeterProvider.
func GetMeter(instrumentationName string, opts ...metric.MeterOption) metric.Meter {
	return otel.Meter(instrumentationName, opts...)
}
