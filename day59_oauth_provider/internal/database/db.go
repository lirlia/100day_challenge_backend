package database

import (
	"database/sql"
	"log"
	"os"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

// Init initializes the database connection and creates tables
func Init() error {
	// データディレクトリの作成
	if err := os.MkdirAll("data", 0755); err != nil {
		return err
	}

	// データベース接続
	db, err := sql.Open("sqlite", "data/oauth.db")
	if err != nil {
		return err
	}

	DB = db

	// テーブル作成
	if err := createTables(); err != nil {
		return err
	}

	log.Println("Database initialized successfully")
	return nil
}

// Close closes the database connection
func Close() error {
	if DB != nil {
		return DB.Close()
	}
	return nil
}

// createTables creates all necessary tables
func createTables() error {
	schemas := []string{
		// OAuth2クライアント
		`CREATE TABLE IF NOT EXISTS oauth_clients (
			id TEXT PRIMARY KEY,
			client_secret TEXT NOT NULL,
			name TEXT NOT NULL,
			redirect_uris TEXT NOT NULL,  -- JSON配列
			scopes TEXT NOT NULL,         -- JSON配列
			grant_types TEXT NOT NULL,    -- JSON配列
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		// ユーザー
		`CREATE TABLE IF NOT EXISTS users (
			id TEXT PRIMARY KEY,
			email TEXT UNIQUE NOT NULL,
			password_hash TEXT NOT NULL,
			name TEXT NOT NULL,
			profile TEXT,                 -- JSON（プロフィール情報）
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,

		// 認可コード
		`CREATE TABLE IF NOT EXISTS authorization_codes (
			code TEXT PRIMARY KEY,
			client_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			redirect_uri TEXT NOT NULL,
			scopes TEXT NOT NULL,         -- JSON配列
			state TEXT,
			nonce TEXT,
			code_challenge TEXT,          -- PKCE
			code_challenge_method TEXT,   -- PKCE
			expires_at DATETIME NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (client_id) REFERENCES oauth_clients(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,

		// リフレッシュトークン
		`CREATE TABLE IF NOT EXISTS refresh_tokens (
			id TEXT PRIMARY KEY,
			token TEXT UNIQUE NOT NULL,
			client_id TEXT NOT NULL,
			user_id TEXT NOT NULL,
			scopes TEXT NOT NULL,         -- JSON配列
			expires_at DATETIME NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (client_id) REFERENCES oauth_clients(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,

		// アクセストークンの記録（オプション）
		`CREATE TABLE IF NOT EXISTS access_tokens (
			id TEXT PRIMARY KEY,
			token_hash TEXT UNIQUE NOT NULL,  -- SHA256ハッシュ
			client_id TEXT NOT NULL,
			user_id TEXT,                     -- Client Credentialsの場合はNULL
			scopes TEXT NOT NULL,             -- JSON配列
			expires_at DATETIME NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (client_id) REFERENCES oauth_clients(id),
			FOREIGN KEY (user_id) REFERENCES users(id)
		)`,

		// RSA鍵ペア保存
		`CREATE TABLE IF NOT EXISTS key_pairs (
			id TEXT PRIMARY KEY,
			private_key TEXT NOT NULL,    -- PEM形式
			public_key TEXT NOT NULL,     -- PEM形式
			kid TEXT UNIQUE NOT NULL,     -- Key ID
			algorithm TEXT NOT NULL,      -- RS256など
			is_active BOOLEAN DEFAULT true,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
	}

	for _, schema := range schemas {
		if _, err := DB.Exec(schema); err != nil {
			return err
		}
	}

	return nil
}
