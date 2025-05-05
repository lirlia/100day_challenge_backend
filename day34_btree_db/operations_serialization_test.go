package rdbms

import (
	// "bytes" // Removed unused import
	// "reflect" // No longer needed for direct comparison
	"testing"
)

func TestSerialization(t *testing.T) {
	// Test serialization and deserialization of various types
	testCases := []struct {
		name     string
		input    map[string]interface{}
		expected map[string]interface{}
	}{
		{
			name: "Simple Types",
			input: map[string]interface{}{
				"id":    int64(123),
				"name":  "hello",
				"value": float64(3.14),
			},
			expected: map[string]interface{}{
				"id":    int64(123),
				"name":  "hello",
				"value": float64(3.14),
			},
		},
		{
			name: "Null Values (represented by presence/absence in map)",
			input: map[string]interface{}{
				"id":    int64(1),
				"value": float64(2.71),
			},
			expected: map[string]interface{}{
				"id":    int64(1),
				"value": float64(2.71),
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			// Serialize
			serializedData, err := serializePayload(tc.input)
			if err != nil {
				t.Fatalf("Serialization failed: %v", err)
			}

			// Deserialize
			deserializedPayload, err := deserializePayload(serializedData)
			if err != nil {
				t.Fatalf("Deserialization failed: %v", err)
			}

			// Compare using helper function from test_helper.go
			if !compareRows(tc.expected, deserializedPayload) {
				t.Errorf("Deserialized payload does not match expected. Expected: %v, Got: %v", tc.expected, deserializedPayload)
			}
		})
	}
}
