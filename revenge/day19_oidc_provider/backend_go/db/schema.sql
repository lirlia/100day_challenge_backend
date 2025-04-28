-- Users テーブル
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Clients テーブル
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  redirect_uris TEXT NOT NULL,
  -- JSON 配列を TEXT で保存
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Authorization Codes テーブル (OAuth 2.0 Authorization Code Flow 用)
CREATE TABLE IF NOT EXISTS authorization_codes (
  code TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  scopes TEXT NOT NULL,
  -- スペース区切りのスコープ文字列
  nonce TEXT,
  -- OIDC 用
  code_challenge TEXT,
  -- PKCE 用
  code_challenge_method TEXT,
  -- PKCE 用
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
-- Sessions テーブル (ユーザーログインセッション管理用)
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
-- Refresh Tokens テーブル
CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash TEXT PRIMARY KEY,
  -- ハッシュ化して保存
  client_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);
-- Interactions テーブル (OIDCプロバイダがログイン/同意などのユーザー操作を追跡するため)
CREATE TABLE IF NOT EXISTS interactions (
  id TEXT PRIMARY KEY,
  -- Interaction ID
  prompt TEXT NOT NULL,
  -- 'login', 'consent' など
  params TEXT NOT NULL,
  -- OIDCリクエストパラメータ (JSON)
  result TEXT,
  -- ユーザー操作の結果 (JSON)
  return_to TEXT NOT NULL,
  -- 操作後に戻るべきOIDCプロバイダのエンドポイントURL
  session_id TEXT,
  -- 関連するユーザーセッションID (ログイン済みの場合)
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
-- Grants テーブル (同意記録)
CREATE TABLE IF NOT EXISTS grants (
  id TEXT PRIMARY KEY,
  -- Grant ID
  user_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  scopes TEXT NOT NULL,
  -- 許可されたスコープ (JSON配列またはスペース区切り)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP,
  -- 同意の有効期限 (任意)
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  UNIQUE (user_id, client_id) -- ユーザーとクライアントの組み合わせはユニーク
);
-- インデックス作成 (パフォーマンス向上のため)
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_auth_codes_user_client ON authorization_codes(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_client ON refresh_tokens(user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_interactions_expires ON interactions(expires_at);
CREATE INDEX IF NOT EXISTS idx_grants_user_client ON grants(user_id, client_id);