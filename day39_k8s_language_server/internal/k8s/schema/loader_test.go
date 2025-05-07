package schema

import (
	"testing"
)

func TestLoadAndParseSchemas(t *testing.T) {
	t.Run("InitialLoad", func(t *testing.T) {
		err := LoadAndParseSchemas()
		if err != nil {
			t.Fatalf("LoadAndParseSchemas() failed: %v", err)
		}

		// Check if core API spec is loaded
		coreSchema, ok := GetLoadedSchema(coreAPISpecName)
		if !ok {
			t.Errorf("Core API spec (%s) not found after loading", coreAPISpecName)
		}
		if coreSchema == nil {
			t.Errorf("Core API spec (%s) is nil after loading", coreAPISpecName)
		}

		// Check if apps API spec is loaded
		appsSchema, ok := GetLoadedSchema(appsAPISpecName)
		if !ok {
			t.Errorf("Apps API spec (%s) not found after loading", appsAPISpecName)
		}
		if appsSchema == nil {
			t.Errorf("Apps API spec (%s) is nil after loading", appsAPISpecName)
		}

		// Check if networking API spec is loaded
		networkingSchema, ok := GetLoadedSchema(networkingAPISpecName)
		if !ok {
			t.Errorf("Networking API spec (%s) not found after loading", networkingAPISpecName)
		}
		if networkingSchema == nil {
			t.Errorf("Networking API spec (%s) is nil after loading", networkingAPISpecName)
		}

		// Attempt to load again, should not error and should not reload (coverage for already loaded path)
		err = LoadAndParseSchemas()
		if err != nil {
			t.Fatalf("LoadAndParseSchemas() second call failed: %v", err)
		}
	})
}
