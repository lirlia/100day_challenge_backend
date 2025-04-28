package config

import (
	"os"
	"time"
)

type Config struct {
	IssuerURL      string
	DatabasePath   string
	Port           string
	PrivateKeyPath string        // JWKS 用の秘密鍵ファイルパス
	SessionSecret  string        // セッション管理用のシークレットキー
	SessionMaxAge  time.Duration // セッションの有効期間
	TokenTTL       time.Duration // IDトークン、アクセストークンの有効期間
}

func Load() (*Config, error) {
	// 環境変数やデフォルト値から設定を読み込む
	// 簡単のため、今回はハードコードで設定します
	return &Config{
		IssuerURL:      getEnv("ISSUER_URL", "http://localhost:8080"), // GoバックエンドのURL
		DatabasePath:   getEnv("DATABASE_PATH", "../prisma/dev.db"),
		Port:           getEnv("PORT", "8080"),
		PrivateKeyPath: getEnv("PRIVATE_KEY_PATH", "./private.pem"), // 後で生成
		SessionSecret:  getEnv("SESSION_SECRET", "super-secret-key-change-me"), // 本番では変更・安全に管理
		SessionMaxAge:  24 * time.Hour,                                  // 1日
		TokenTTL:       1 * time.Hour,                                   // 1時間
	}, nil
}

func getEnv(key, fallback string) string {
	if value, exists := os.LookupEnv(key); exists {
		return value
	}
	return fallback
}
