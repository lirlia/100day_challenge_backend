package httpclient

import (
	"net/http"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

// NewTraceableClient creates a new http.Client that is instrumented with OpenTelemetry.
func NewTraceableClient() *http.Client {
	return &http.Client{
		Transport: otelhttp.NewTransport(http.DefaultTransport),
	}
}

// NewTraceableClientWithTransport creates a new http.Client with a custom underlying transport,
// instrumented with OpenTelemetry.
func NewTraceableClientWithTransport(transport http.RoundTripper) *http.Client {
	if transport == nil {
		transport = http.DefaultTransport
	}
	return &http.Client{
		Transport: otelhttp.NewTransport(transport),
	}
}
