package config

import (
	"os"

	"gopkg.in/yaml.v3"
)

// Config はアプリケーション全体の設定を保持します。
type Config struct {
	Proxy   ProxyConfig `yaml:"proxy"`
	Cache   CacheConfig `yaml:"cache,omitempty"`
	// Logging LoggingConfig `yaml:"logging"`
	// ACL     ACLConfig     `yaml:"acl"`
}

// ProxyConfig はプロキシサーバーの設定です。
type ProxyConfig struct {
	Port       int    `yaml:"port"`
	Host       string `yaml:"host,omitempty"` // omitemptyで設定ファイルにhostがなくてもエラーにしない
	CACertPath string `yaml:"ca_cert_path,omitempty"`
	CAKeyPath  string `yaml:"ca_key_path,omitempty"`
}

// CacheConfig はキャッシュの設定です。
type CacheConfig struct {
	Enabled           bool   `yaml:"enabled"`
	SQLitePath        string `yaml:"sqlite_path,omitempty"`
	DefaultTTLSeconds int    `yaml:"default_ttl_seconds,omitempty"`
	MaxSizeMB         int    `yaml:"max_size_mb,omitempty"`
}

/* // 今後の機能のためにコメントアウト
// LoggingConfig はロギングの設定です。
// type LoggingConfig struct {
// 	Level string `yaml:"level"`
// 	File  string `yaml:"file"`
// }

// ACLConfig はアクセス制御の設定です。
// type ACLConfig struct {
// 	RulesFile string `yaml:"rules_file"`
// }
*/

// LoadConfig は指定されたパスから設定ファイルを読み込みます。
func LoadConfig(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var cfg Config
	err = yaml.Unmarshal(data, &cfg)
	if err != nil {
		return nil, err
	}

	// デフォルト値の設定 (もしあれば)
	if cfg.Proxy.Port == 0 {
		cfg.Proxy.Port = 8080 // デフォルトポート
	}
	if cfg.Proxy.CACertPath == "" {
		cfg.Proxy.CACertPath = "ca.crt" // デフォルトCA証明書パス
	}
	if cfg.Proxy.CAKeyPath == "" {
		cfg.Proxy.CAKeyPath = "ca.key" // デフォルトCA秘密鍵パス
	}

	if cfg.Cache.Enabled {
		if cfg.Cache.SQLitePath == "" {
			cfg.Cache.SQLitePath = "db/cache.db"
		}
		if cfg.Cache.DefaultTTLSeconds == 0 {
			cfg.Cache.DefaultTTLSeconds = 3600
		}
		if cfg.Cache.MaxSizeMB == 0 {
			cfg.Cache.MaxSizeMB = 100
		}
	}

	return &cfg, nil
}
