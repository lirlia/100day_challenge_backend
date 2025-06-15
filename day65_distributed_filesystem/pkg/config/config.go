package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/spf13/viper"
)

// Config システム全体の設定
type Config struct {
	NameNode NameNodeConfig `yaml:"namenode"`
	DataNode DataNodeConfig `yaml:"datanode"`
	DFS      DFSConfig      `yaml:"dfs"`
	Log      LogConfig      `yaml:"log"`
}

// NameNodeConfig NameNodeの設定
type NameNodeConfig struct {
	Address      string `yaml:"address"`
	Port         int    `yaml:"port"`
	DatabasePath string `yaml:"database_path"`
}

// DataNodeConfig DataNodeの設定
type DataNodeConfig struct {
	ID                string        `yaml:"id"`
	Address           string        `yaml:"address"`
	Port              int           `yaml:"port"`
	DataDir           string        `yaml:"data_dir"`
	Capacity          int64         `yaml:"capacity"`
	NameNodeAddress   string        `yaml:"namenode_address"`
	NameNodePort      int           `yaml:"namenode_port"`
	HeartbeatInterval time.Duration `yaml:"heartbeat_interval"`
}

// DFSConfig 分散ファイルシステムの設定
type DFSConfig struct {
	ChunkSize   int64 `yaml:"chunk_size"`
	Replication int   `yaml:"replication"`
	BlockSize   int64 `yaml:"block_size"`
}

// LogConfig ログの設定
type LogConfig struct {
	Level  string `yaml:"level"`
	Format string `yaml:"format"`
}

// DefaultConfig デフォルト設定を返す
func DefaultConfig() *Config {
	return &Config{
		NameNode: NameNodeConfig{
			Address:      "localhost",
			Port:         9000,
			DatabasePath: "data/namenode/metadata.db",
		},
		DataNode: DataNodeConfig{
			ID:                "datanode1",
			Address:           "localhost",
			Port:              9001,
			DataDir:           "data/datanode1",
			Capacity:          1024 * 1024 * 1024, // 1GB
			NameNodeAddress:   "localhost",
			NameNodePort:      9000,
			HeartbeatInterval: 30 * time.Second,
		},
		DFS: DFSConfig{
			ChunkSize:   64 * 1024 * 1024, // 64MB
			Replication: 3,
			BlockSize:   128 * 1024 * 1024, // 128MB
		},
		Log: LogConfig{
			Level:  "info",
			Format: "text",
		},
	}
}

// LoadConfig 設定ファイルから設定を読み込む
func LoadConfig(configPath string) (*Config, error) {
	config := DefaultConfig()

	if configPath != "" {
		// 設定ファイルが指定されている場合
		viper.SetConfigFile(configPath)
	} else {
		// デフォルトの設定ファイルを探す
		viper.SetConfigName("config")
		viper.SetConfigType("yaml")
		viper.AddConfigPath(".")
		viper.AddConfigPath("./configs")
	}

	// 環境変数の設定
	viper.AutomaticEnv()
	viper.SetEnvPrefix("DFS")

	// 設定ファイルの読み込み
	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("failed to read config file: %w", err)
		}
		// 設定ファイルが見つからない場合はデフォルト設定を使用
	}

	// 設定をstructにマップ
	if err := viper.Unmarshal(config); err != nil {
		return nil, fmt.Errorf("failed to unmarshal config: %w", err)
	}

	// 設定の検証
	if err := validateConfig(config); err != nil {
		return nil, fmt.Errorf("invalid config: %w", err)
	}

	return config, nil
}

// validateConfig 設定の妥当性をチェック
func validateConfig(config *Config) error {
	if config.NameNode.Port <= 0 || config.NameNode.Port > 65535 {
		return fmt.Errorf("invalid namenode port: %d", config.NameNode.Port)
	}

	if config.DataNode.Port <= 0 || config.DataNode.Port > 65535 {
		return fmt.Errorf("invalid datanode port: %d", config.DataNode.Port)
	}

	if config.DFS.ChunkSize <= 0 {
		return fmt.Errorf("invalid chunk size: %d", config.DFS.ChunkSize)
	}

	if config.DFS.Replication <= 0 {
		return fmt.Errorf("invalid replication factor: %d", config.DFS.Replication)
	}

	if config.DataNode.Capacity <= 0 {
		return fmt.Errorf("invalid datanode capacity: %d", config.DataNode.Capacity)
	}

	return nil
}

// EnsureDataDirs データディレクトリを作成
func EnsureDataDirs(cfg *Config) error {
	dirs := []string{
		cfg.NameNode.DatabasePath,
		cfg.DataNode.DataDir,
	}

	for _, dir := range dirs {
		if dir != "" {
			if err := EnsureDir(filepath.Dir(dir)); err != nil {
				return fmt.Errorf("failed to create directory for %s: %w", dir, err)
			}
		}
	}

	return nil
}

// EnsureDir ディレクトリを作成
func EnsureDir(dir string) error {
	if _, err := os.Stat(dir); os.IsNotExist(err) {
		return os.MkdirAll(dir, 0755)
	}
	return nil
}

// GetNameNodeAddr NameNodeのアドレスを取得
func (c *Config) GetNameNodeAddr() string {
	return fmt.Sprintf("%s:%d", c.NameNode.Address, c.NameNode.Port)
}

// GetNameNodeEndpoint NameNodeのエンドポイントを取得（クライアント用）
func (c *Config) GetNameNodeEndpoint() string {
	return fmt.Sprintf("%s:%d", c.NameNode.Address, c.NameNode.Port)
}

// GetDataNodeAddr DataNodeのアドレスを取得
func (c *Config) GetDataNodeAddr() string {
	return fmt.Sprintf("%s:%d", c.DataNode.Address, c.DataNode.Port)
}

// DataNodeConfigWithID DataNode固有の設定を適用
func DataNodeConfigWithID(baseConfig *Config, nodeID string, port int) *Config {
	cfg := *baseConfig // コピーを作成

	cfg.DataNode.ID = nodeID
	cfg.DataNode.Port = port
	cfg.DataNode.DataDir = fmt.Sprintf("data/%s", nodeID)

	return &cfg
}
