CREATE TABLE IF NOT EXISTS http_cache (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_key TEXT NOT NULL UNIQUE,
  -- 例: "GET:http://example.com/path"
  method TEXT NOT NULL,
  -- GET, POST など
  request_url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  response_headers TEXT,
  -- JSON形式で保存
  response_body BLOB,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  -- キャッシュ作成日時
  expires_at DATETIME,
  -- HTTPヘッダーから計算された有効期限
  etag TEXT,
  -- ETagヘッダーの値
  last_modified TEXT,
  -- Last-Modifiedヘッダーの値
  last_accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP -- 最終アクセス日時 (LRU用)
);
CREATE INDEX IF NOT EXISTS idx_http_cache_request_key ON http_cache (request_key);
CREATE INDEX IF NOT EXISTS idx_http_cache_expires_at ON http_cache (expires_at);
CREATE INDEX IF NOT EXISTS idx_http_cache_last_accessed_at ON http_cache (last_accessed_at);
