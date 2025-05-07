package lsp

import (
	"context"
	"testing"

	"github.com/getkin/kin-openapi/openapi3"
	protocol "go.lsp.dev/protocol"
	"gopkg.in/yaml.v3"
)

// Helper to create a dummy logger for testing
type testLogger struct{}

func (t *testLogger) Printf(format string, v ...interface{}) {}
func (t *testLogger) Println(v ...interface{})               {}

var logger = &testLogger{} // Use dummy logger

// TestValidateObjectProperties_RequiredFields tests the 'required' field validation logic.
func TestValidateObjectProperties_RequiredFields(t *testing.T) {
	// Define a simple schema with required fields "name" and "image"
	testSchema := &openapi3.Schema{
		Type:     &openapi3.Types{"object"},
		Required: []string{"name", "image"},
		Properties: openapi3.Schemas{
			"name": &openapi3.SchemaRef{
				Value: &openapi3.Schema{Type: &openapi3.Types{"string"}},
			},
			"image": &openapi3.SchemaRef{
				Value: &openapi3.Schema{Type: &openapi3.Types{"string"}},
			},
			"ports": &openapi3.SchemaRef{ // Optional field
				Value: &openapi3.Schema{Type: &openapi3.Types{"array"}},
			},
		},
	}

	// Dummy yaml.Node for error range reporting (position doesn't matter for this test)
	dummyNode := &yaml.Node{Kind: yaml.MappingNode, Line: 1, Column: 1}

	testCases := []struct {
		name              string
		data              map[string]interface{}
		expectedDiagCount int
		expectedMessages  map[string]bool // Use map for easy lookup
	}{
		{
			name: "All required fields present",
			data: map[string]interface{}{
				"name":  "my-container",
				"image": "nginx:latest",
				"ports": []interface{}{}, // Include optional field
			},
			expectedDiagCount: 0,
			expectedMessages:  map[string]bool{},
		},
		{
			name: "Missing 'image' field",
			data: map[string]interface{}{
				"name": "my-container",
			},
			expectedDiagCount: 1,
			expectedMessages: map[string]bool{
				"Missing required property: 'image' in object 'test.path'": true,
			},
		},
		{
			name: "Missing 'name' field",
			data: map[string]interface{}{
				"image": "nginx:latest",
			},
			expectedDiagCount: 1,
			expectedMessages: map[string]bool{
				"Missing required property: 'name' in object 'test.path'": true,
			},
		},
		{
			name:              "Missing both 'name' and 'image'",
			data:              map[string]interface{}{},
			expectedDiagCount: 2,
			expectedMessages: map[string]bool{
				"Missing required property: 'name' in object 'test.path'":  true,
				"Missing required property: 'image' in object 'test.path'": true,
			},
		},
		{
			name:              "Empty data map",
			data:              map[string]interface{}{}, // Same as missing both
			expectedDiagCount: 2,
			expectedMessages: map[string]bool{
				"Missing required property: 'name' in object 'test.path'":  true,
				"Missing required property: 'image' in object 'test.path'": true,
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Use dummy context and base path
			// ここで ValidateObjectProperties を呼び出す
			diagnostics := ValidateObjectProperties(context.Background(), testSchema, tc.data, dummyNode, "test.path")

			if len(diagnostics) != tc.expectedDiagCount {
				t.Errorf("Expected %d diagnostics, but got %d. Diagnostics: %v", tc.expectedDiagCount, len(diagnostics), diagnostics)
			}

			foundMessages := make(map[string]bool)
			for _, diag := range diagnostics {
				if _, expected := tc.expectedMessages[diag.Message]; expected {
					foundMessages[diag.Message] = true
				} else {
					t.Errorf("Unexpected diagnostic message found: %s", diag.Message)
				}
			}

			if len(foundMessages) != len(tc.expectedMessages) {
				t.Errorf("Expected messages not found. Expected: %v, Found: %v", tc.expectedMessages, foundMessages)
			}

			for _, diag := range diagnostics {
				if diag.Severity != protocol.DiagnosticSeverityError {
					t.Errorf("Expected diagnostic severity Error, but got %v for message: %s", diag.Severity, diag.Message)
				}
			}
		})
	}
}

// TODO: Add tests for validateDataType, especially for object and array recursion.

// TestValidateDataType_ArrayOfObjects tests array validation, specifically when items are objects with required fields.
func TestValidateDataType_ArrayOfObjects(t *testing.T) {
	// Define the schema for the items (container)
	containerSchema := &openapi3.Schema{
		Type:     &openapi3.Types{"object"},
		Required: []string{"name", "image"},
		Properties: openapi3.Schemas{
			"name": &openapi3.SchemaRef{
				Value: &openapi3.Schema{Type: &openapi3.Types{"string"}},
			},
			"image": &openapi3.SchemaRef{
				Value: &openapi3.Schema{Type: &openapi3.Types{"string"}},
			},
		},
	}

	// Define the schema for the array itself
	arraySchema := &openapi3.Schema{
		Type: &openapi3.Types{"array"},
		Items: &openapi3.SchemaRef{
			Value: containerSchema, // Items are of containerSchema type
		},
	}

	// Dummy yaml.Node for error range reporting
	dummyNode := &yaml.Node{Kind: yaml.SequenceNode, Line: 1, Column: 1}

	testCases := []struct {
		name              string
		data              []interface{} // Array data
		expectedDiagCount int
		expectedMessages  map[string]bool
	}{
		{
			name: "Valid array of objects",
			data: []interface{}{
				map[string]interface{}{"name": "c1", "image": "img1"},
				map[string]interface{}{"name": "c2", "image": "img2"},
			},
			expectedDiagCount: 0,
			expectedMessages:  map[string]bool{},
		},
		{
			name: "Second object missing 'image'",
			data: []interface{}{
				map[string]interface{}{"name": "c1", "image": "img1"},
				map[string]interface{}{"name": "c2"}, // Missing image
			},
			expectedDiagCount: 1,
			expectedMessages: map[string]bool{
				"Missing required property: 'image' in object 'containers[1]'": true,
			},
		},
		{
			name: "First object missing 'name'",
			data: []interface{}{
				map[string]interface{}{"image": "img1"}, // Missing name
				map[string]interface{}{"name": "c2", "image": "img2"},
			},
			expectedDiagCount: 1,
			expectedMessages: map[string]bool{
				"Missing required property: 'name' in object 'containers[0]'": true,
			},
		},
		{
			name: "Both objects missing different fields",
			data: []interface{}{
				map[string]interface{}{"name": "c1"},    // Missing image
				map[string]interface{}{"image": "img2"}, // Missing name
			},
			expectedDiagCount: 2,
			expectedMessages: map[string]bool{
				"Missing required property: 'image' in object 'containers[0]'": true,
				"Missing required property: 'name' in object 'containers[1]'":  true,
			},
		},
		{
			name: "Empty object in array",
			data: []interface{}{
				map[string]interface{}{"name": "c1", "image": "img1"},
				map[string]interface{}{}, // Empty object
			},
			expectedDiagCount: 2,
			expectedMessages: map[string]bool{
				"Missing required property: 'name' in object 'containers[1]'":  true,
				"Missing required property: 'image' in object 'containers[1]'": true,
			},
		},
		{
			name: "Array with non-object item (should trigger type error first)",
			data: []interface{}{
				map[string]interface{}{"name": "c1", "image": "img1"},
				"not-an-object",
			},
			// Expects an object, got string. validateDataType should report this type error.
			// The required field check within the object won't happen for the second item.
			expectedDiagCount: 1,
			expectedMessages: map[string]bool{
				"Invalid type for property 'containers[1]'. Expected 'object', got 'string'": true,
			},
		},
		{
			name:              "Empty array",
			data:              []interface{}{},
			expectedDiagCount: 0, // No items to validate
			expectedMessages:  map[string]bool{},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Call validateDataType with the array schema and data
			diagnostics := validateDataType(context.Background(), arraySchema, tc.data, dummyNode, "containers")

			if len(diagnostics) != tc.expectedDiagCount {
				// Print diagnostics for debugging failures
				for i, diag := range diagnostics {
					t.Logf("Diag %d: %s (Range: %+v)", i, diag.Message, diag.Range)
				}
				t.Errorf("Expected %d diagnostics, but got %d.", tc.expectedDiagCount, len(diagnostics))
			}

			foundMessages := make(map[string]bool)
			for _, diag := range diagnostics {
				if _, expected := tc.expectedMessages[diag.Message]; expected {
					foundMessages[diag.Message] = true
				} else {
					// Log unexpected messages instead of failing immediately to see all errors
					t.Logf("Unexpected diagnostic message found: %s", diag.Message)
				}
			}

			if len(foundMessages) != len(tc.expectedMessages) {
				t.Errorf("Mismatch in expected messages. Expected: %v, Found: %v", tc.expectedMessages, foundMessages)
			}

			// Check severity for expected error messages
			for _, diag := range diagnostics {
				if _, expected := tc.expectedMessages[diag.Message]; expected {
					// Missing required fields should be Error severity
					// Type mismatches should also be Error severity
					if diag.Severity != protocol.DiagnosticSeverityError {
						t.Errorf("Expected severity Error for message '%s', but got %v", diag.Message, diag.Severity)
					}
				}
			}
		})
	}
}
