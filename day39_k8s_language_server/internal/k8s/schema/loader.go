package schema

import (
	_ "embed"
	"fmt"
	"sync"

	"github.com/getkin/kin-openapi/openapi3"
)

//go:embed spec/v1.30.2/api__v1.json
var coreAPISpecBytes []byte

//go:embed spec/v1.30.2/apis__apps__v1.json
var appsAPISpecBytes []byte

//go:embed spec/v1.30.2/apis__networking.k8s.io__v1.json
var networkingAPISpecBytes []byte

const (
	CoreAPISpecName       = "api__v1.json"
	AppsAPISpecName       = "apis__apps__v1.json"
	NetworkingAPISpecName = "apis__networking.k8s.io__v1.json"
)

// LoadedSchemas は、ロードおよびパースされたOpenAPIスキーマを保持します。
// キーはスキーマ名 (例: "api__v1.json")、値はパースされたスキーマです。
type LoadedSchemas struct {
	mu      sync.RWMutex
	schemas map[string]*openapi3.T
}

var globalSchemas = &LoadedSchemas{
	schemas: make(map[string]*openapi3.T),
}

// LoadAndParseSchemas は埋め込まれたOpenAPI仕様ファイルをロードし、パースします。
// この関数はアプリケーション起動時に一度だけ呼び出されることを想定しています。
func LoadAndParseSchemas() error {
	globalSchemas.mu.Lock()
	defer globalSchemas.mu.Unlock()

	specsToLoad := map[string]struct {
		content []byte
	}{
		CoreAPISpecName:       {coreAPISpecBytes},
		AppsAPISpecName:       {appsAPISpecBytes},
		NetworkingAPISpecName: {networkingAPISpecBytes},
	}

	// これらのファイルは既知の default validation error を含むため、エラーを無視する
	knownProblematicSpecs := map[string]bool{
		CoreAPISpecName:       true,
		AppsAPISpecName:       true,
		NetworkingAPISpecName: true,
	}

	for name, specInfo := range specsToLoad {
		if _, ok := globalSchemas.schemas[name]; ok {
			// すでにロード済み
			continue
		}

		if len(specInfo.content) == 0 {
			return fmt.Errorf("embedded spec %s is empty", name)
		}

		loader := openapi3.NewLoader()
		doc, err := loader.LoadFromData(specInfo.content)
		if err != nil {
			return fmt.Errorf("failed to parse spec %s: %w", name, err)
		}

		if err := doc.Validate(loader.Context); err != nil {
			if isProblematic, known := knownProblematicSpecs[name]; known && isProblematic {
				// fmt.Printf("Ignoring validation errors for known problematic spec: %s. Error: %v\n", name, err) // LSP通信を汚染する可能性があるためコメントアウト
				// 代わりにサーバーのロガーを使用することを検討 (要リファクタリング)
				// logger.Printf("Ignoring validation errors for known problematic spec: %s. Error: %v", name, err) // 例
				// 特定のファイルからのエラーは無視する
			} else {
				// 未知のファイルまたは問題ないはずのファイルのエラーは報告する
				return fmt.Errorf("spec %s failed validation: %w", name, err)
			}
		}

		globalSchemas.schemas[name] = doc
	}

	if len(globalSchemas.schemas) == 0 {
		return fmt.Errorf("no schemas were loaded")
	}
	if len(globalSchemas.schemas) != len(specsToLoad) {
		return fmt.Errorf("expected to load %d schemas, but loaded %d", len(specsToLoad), len(globalSchemas.schemas))
	}

	return nil
}

// GetLoadedSchema は指定された名前のロード済みスキーマを返します。
func GetLoadedSchema(name string) (*openapi3.T, bool) {
	globalSchemas.mu.RLock()
	defer globalSchemas.mu.RUnlock()
	schema, ok := globalSchemas.schemas[name]
	return schema, ok
}
