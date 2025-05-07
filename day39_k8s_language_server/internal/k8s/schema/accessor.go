package schema

import (
	"fmt"
	"strings"

	"github.com/getkin/kin-openapi/openapi3"
)

// KubeObjectPathPrefix はKubernetesオブジェクトのスキーマ定義の共通プレフィックスです。
const KubeObjectPathPrefix = "#/components/schemas/"

// GVKToString converts Group, Version, Kind to the string representation used in OpenAPI schema keys.
// Example: apps/v1, Deployment -> io.k8s.api.apps.v1.Deployment
// Example: v1, Service -> io.k8s.api.core.v1.Service (core group is often implicit or "core")
func GVKToString(group, version, kind string) string {
	var parts []string
	parts = append(parts, "io.k8s.api")
	if group == "" || group == "core" {
		parts = append(parts, "core")
	} else {
		parts = append(parts, strings.Split(group, ".")...)
	}
	parts = append(parts, version)
	parts = append(parts, kind)
	return strings.Join(parts, ".")
}

// GetSchemaRefByGVK は、指定された group, version, kind に基づいて OpenAPI スキーマ定義への参照を取得します。
// スキーマはロード済みのものから検索されます。
func GetSchemaRefByGVK(apiVersion, kind string) (*openapi3.SchemaRef, error) {
	group, version := splitAPIVersion(apiVersion)
	openAPISchemaKey := GVKToString(group, version, kind)

	// Determine which spec file might contain this GVK
	// This is a simplified assumption; a more robust way might involve checking all loaded schemas
	// or having a mapping of GVK prefixes to spec files.
	var targetSpecName string
	switch group {
	case "", "core":
		targetSpecName = coreAPISpecName
	case "apps":
		targetSpecName = appsAPISpecName
	case "networking.k8s.io":
		targetSpecName = networkingAPISpecName
	default:
		// For other groups, we might need to search or have a more dynamic loading mechanism
		// For now, try searching in all known schemas as a fallback
		// This part needs refinement for broader GVK support.
		return searchInAllSchemas(openAPISchemaKey)
	}

	doc, ok := GetLoadedSchema(targetSpecName)
	if !ok || doc == nil {
		// Fallback to searching all schemas if the specific one isn't loaded or doesn't contain it
		// This can happen if our group-to-specName mapping is incomplete or incorrect.
		// fmt.Printf("Schema for GVK %s/%s (key: %s) not found in target spec %s, trying all schemas\n", apiVersion, kind, openAPISchemaKey, targetSpecName)
		return searchInAllSchemas(openAPISchemaKey)
	}

	if doc.Components == nil || doc.Components.Schemas == nil {
		return nil, fmt.Errorf("spec %s has no components.schemas defined", targetSpecName)
	}

	schemaRef, found := doc.Components.Schemas[openAPISchemaKey]
	if !found {
		// fmt.Printf("Schema for GVK %s/%s (key: %s) not found in spec %s, trying all schemas as fallback\n", apiVersion, kind, openAPISchemaKey, targetSpecName)
		return searchInAllSchemas(openAPISchemaKey)
	}

	return schemaRef, nil
}

// searchInAllSchemas searches for a schema key in all loaded schemas.
func searchInAllSchemas(schemaKey string) (*openapi3.SchemaRef, error) {
	globalSchemas.mu.RLock()
	defer globalSchemas.mu.RUnlock()

	for specName, doc := range globalSchemas.schemas {
		if doc.Components != nil && doc.Components.Schemas != nil {
			if schemaRef, found := doc.Components.Schemas[schemaKey]; found {
				return schemaRef, nil
			}
		}
		// Try with a common prefix if it's a definition from the same file but not a GVK anker
		// This is a simple heuristic for refs like '#/components/schemas/io.k8s.api.core.v1.PodSpec'
		// which are not top-level GVKs but are defined within a spec file.
		if strings.HasPrefix(schemaKey, KubeObjectPathPrefix) {
			shortKey := strings.TrimPrefix(schemaKey, KubeObjectPathPrefix)
			if schemaRef, found := doc.Components.Schemas[shortKey]; found {
				return schemaRef, nil
			}
		}
		_ = specName // Avoid unused variable if logs are commented out
		// fmt.Printf("Key %s not found in spec %s\n", schemaKey, specName)
	}
	return nil, fmt.Errorf("schema with key '%s' not found in any loaded OpenAPI spec", schemaKey)
}

// splitAPIVersion splits apiVersion (e.g., "apps/v1" or "v1") into group and version.
func splitAPIVersion(apiVersion string) (group, version string) {
	parts := strings.Split(apiVersion, "/")
	if len(parts) == 1 {
		return "", parts[0] // core group
	}
	return parts[0], parts[1]
}

// GetSchemaDescription extracts the description from a SchemaRef.
func GetSchemaDescription(schemaRef *openapi3.SchemaRef) string {
	if schemaRef != nil && schemaRef.Value != nil {
		return schemaRef.Value.Description
	}
	return ""
}

// GetSchemaType extracts the primary type from a SchemaRef.
func GetSchemaType(schemaRef *openapi3.SchemaRef) string {
	if schemaRef != nil && schemaRef.Value != nil && schemaRef.Value.Type != nil && len(*schemaRef.Value.Type) > 0 {
		return (*schemaRef.Value.Type)[0] // Return the first type
	}
	return ""
}

// IsPropertyRequired checks if a propertyName is in the schema's required list.
func IsPropertyRequired(propertyName string, schemaRef *openapi3.SchemaRef) bool {
	if schemaRef == nil || schemaRef.Value == nil {
		return false
	}
	for _, requiredName := range schemaRef.Value.Required {
		if requiredName == propertyName {
			return true
		}
	}
	return false
}
