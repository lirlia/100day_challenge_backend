package schema

import (
	"strings"
	"testing"
)

// setupAccessorTests は、アクセサーテストの前にスキーマをロードします。
// loader.go の embed の問題が解決するまでは失敗する可能性があります。
func setupAccessorTests(t *testing.T) {
	t.Helper()
	// Load schemas first if not already loaded by another test in the same package run.
	// This relies on globalSchemas being populated by LoadAndParseSchemas.
	if len(globalSchemas.schemas) == 0 {
		err := LoadAndParseSchemas()
		if err != nil {
			t.Fatalf("setupAccessorTests: LoadAndParseSchemas() failed: %v. This might be due to the embed issue in loader.go.", err)
		}
	}
}

func TestGVKToString(t *testing.T) {
	testCases := []struct {
		name        string
		group       string
		version     string
		kind        string
		expectedKey string
	}{
		{"Deployment", "apps", "v1", "Deployment", "io.k8s.api.apps.v1.Deployment"},
		{"Service", "", "v1", "Service", "io.k8s.api.core.v1.Service"},
		{"CoreService", "core", "v1", "Service", "io.k8s.api.core.v1.Service"},
		{"Ingress", "networking.k8s.io", "v1", "Ingress", "io.k8s.api.networking.v1.Ingress"},
		{"CustomResource", "custom.example.com", "v1alpha1", "MyCRD", "io.k8s.api.custom.example.com.v1alpha1.MyCRD"},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			actualKey := GVKToString(tc.group, tc.version, tc.kind)
			if actualKey != tc.expectedKey {
				t.Errorf("GVKToString(%q, %q, %q) = %q; want %q", tc.group, tc.version, tc.kind, actualKey, tc.expectedKey)
			}
		})
	}
}

func TestGetSchemaRefByGVK(t *testing.T) {
	setupAccessorTests(t) // スキーマをロード

	testCases := []struct {
		name         string
		apiVersion   string
		kind         string
		expectError  bool
		descContains string // 期待される説明文の一部
		expectedType string // 期待されるスキーマの型 (objectなど)
	}{
		{
			name:         "Deployment",
			apiVersion:   "apps/v1",
			kind:         "Deployment",
			descContains: "Deployment enables declarative updates for Pods and ReplicaSets.",
			expectedType: "object",
		},
		{
			name:         "Service",
			apiVersion:   "v1", // core group
			kind:         "Service",
			descContains: "Service is a named abstraction of software service (for example, mysql) consisting of local port (for example 3306) that the proxy listens on",
			expectedType: "object",
		},
		{
			name:         "Ingress",
			apiVersion:   "networking.k8s.io/v1",
			kind:         "Ingress",
			descContains: "Ingress is a collection of rules that allow inbound connections to reach the endpoints defined by a backend.",
			expectedType: "object",
		},
		{
			name:        "NonExistentResource",
			apiVersion:  "example.com/v1",
			kind:        "NoSuchKind",
			expectError: true,
		},
		{
			name:         "PodSpec (indirectly referenced)", // PodSpec is not a top-level GVK but defined in core spec
			apiVersion:   "v1",                              // apiVersion here is more for context, key will be specific
			kind:         "PodSpec",                         // This will form io.k8s.api.core.v1.PodSpec
			descContains: "PodSpec is a description of a pod.",
			expectedType: "object",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			schemaRef, err := GetSchemaRefByGVK(tc.apiVersion, tc.kind)

			if tc.expectError {
				if err == nil {
					t.Errorf("GetSchemaRefByGVK(%q, %q) expected error, got nil", tc.apiVersion, tc.kind)
				}
				return // エラーを期待する場合はここで終了
			}

			if err != nil {
				t.Fatalf("GetSchemaRefByGVK(%q, %q) failed: %v", tc.apiVersion, tc.kind, err)
			}

			if schemaRef == nil || schemaRef.Value == nil {
				t.Fatalf("GetSchemaRefByGVK(%q, %q) returned nil schemaRef or schemaRef.Value", tc.apiVersion, tc.kind)
			}

			desc := GetSchemaDescription(schemaRef)
			if !strings.Contains(desc, tc.descContains) {
				t.Errorf("Description for %s %s: expected to contain %q, got %q", tc.apiVersion, tc.kind, tc.descContains, desc)
			}

			objType := GetSchemaType(schemaRef)
			if objType != tc.expectedType {
				t.Errorf("Type for %s %s: expected %q, got %q", tc.apiVersion, tc.kind, tc.expectedType, objType)
			}
		})
	}
}

func TestSplitAPIVersion(t *testing.T) {
	testCases := []struct {
		name            string
		apiVersion      string
		expectedGroup   string
		expectedVersion string
	}{
		{"CoreV1", "v1", "", "v1"},
		{"AppsV1", "apps/v1", "apps", "v1"},
		{"NetworkingV1", "networking.k8s.io/v1", "networking.k8s.io", "v1"},
		{"CustomGroup", "custom.example.com/v1alpha1", "custom.example.com", "v1alpha1"},
		{"Empty", "", "", ""}, // Potentially invalid, but test behavior
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			group, version := splitAPIVersion(tc.apiVersion)
			if group != tc.expectedGroup || version != tc.expectedVersion {
				t.Errorf("splitAPIVersion(%q) = (%q, %q); want (%q, %q)", tc.apiVersion, group, version, tc.expectedGroup, tc.expectedVersion)
			}
		})
	}
}
