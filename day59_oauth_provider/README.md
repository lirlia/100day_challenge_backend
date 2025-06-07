# Day59 - OAuth2/OpenID Connect Provider (Go API)

OAuth2 および OpenID Connect (OIDC) 仕様に準拠した認証プロバイダーをGo言語で実装したプロジェクトです。

## 🎯 学習目標

- OAuth2フローの深い理解（Authorization Code、Client Credentials等）
- OpenID Connectの実装（ID Token、UserInfo）
- JWT（JSON Web Token）の生成・検証
- PKCE（Proof Key for Code Exchange）対応
- スコープベースのアクセス制御
- セキュリティベストプラクティス

## 🚀 機能

### OAuth2/OpenID Connect標準エンドポイント
- `GET /.well-known/openid_configuration` - Discovery endpoint
- `GET /.well-known/jwks.json` - JSON Web Key Set
- `GET /authorize` - Authorization endpoint
- `POST /token` - Token endpoint
- `GET /userinfo` - UserInfo endpoint

### 管理API
- OAuth2クライアント管理（CRUD）
- ユーザー管理（作成・認証）
- トークン管理（一覧・失効）

### 対応フロー
1. **Authorization Code Flow** - 標準的なWebアプリ向け
2. **Authorization Code Flow with PKCE** - SPA・モバイル向け
3. **Client Credentials Flow** - サーバー間通信
4. **OpenID Connect** - 認証情報付き

## 🛠 技術スタック

- **言語**: Go 1.21+
- **HTTP Router**: 標準ライブラリ `net/http`
- **JWT**: `golang-jwt/jwt/v5`
- **Database**: SQLite3 (`modernc.org/sqlite`)
- **UUID**: `google/uuid`
- **暗号化**: 標準ライブラリ `crypto/rsa`

## 📁 プロジェクト構成

```
day59_oauth_provider/
├── main.go                    # エントリーポイント
├── go.mod                     # Go modules
├── go.sum                     # 依存関係ハッシュ
├── data/                      # データベースファイル
│   └── oauth.db              # SQLiteデータベース
├── internal/
│   ├── handlers/              # HTTPハンドラー
│   │   ├── oauth.go          # OAuth2エンドポイント
│   │   ├── oidc.go           # OpenID Connectエンドポイント
│   │   ├── admin.go          # 管理API
│   │   └── test.go           # テスト用API
│   ├── models/               # データモデル
│   │   ├── client.go         # OAuth2クライアント
│   │   ├── user.go           # ユーザー
│   │   ├── token.go          # トークン
│   │   └── authcode.go       # 認可コード
│   ├── services/             # ビジネスロジック
│   │   ├── oauth.go          # OAuth2サービス
│   │   ├── jwt.go            # JWT生成・検証
│   │   └── crypto.go         # 暗号化処理
│   └── database/             # DB関連
│       ├── db.go             # データベース接続
│       └── migrations.go     # スキーマ定義
├── web/                      # 静的ファイル・テンプレート
│   ├── templates/            # HTMLテンプレート
│   │   ├── login.html       # ログイン画面
│   │   ├── consent.html     # 同意画面
│   │   └── admin.html       # 管理画面
│   └── static/              # 静的ファイル
└── README.md                 # このファイル
```

## 🔧 セットアップ

### 1. 依存関係のインストール
```bash
go mod tidy
```

### 2. サーバー起動
```bash
go run main.go
```

### 3. アクセス
- **OAuth Provider**: http://localhost:8080
- **管理画面**: http://localhost:8080/admin
- **Discovery Endpoint**: http://localhost:8080/.well-known/openid_configuration

## 📝 使用例

### 1. OAuth2クライアント作成
```bash
curl -X POST http://localhost:8080/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test App",
    "redirect_uris": ["http://localhost:3000/callback"],
    "scopes": ["openid", "profile", "email"],
    "grant_types": ["authorization_code", "refresh_token"]
  }'
```

### 2. Authorization Code Flow
```bash
# 1. 認可リクエスト
http://localhost:8080/authorize?client_id=CLIENT_ID&redirect_uri=REDIRECT_URI&response_type=code&scope=openid profile&state=STATE

# 2. トークン取得
curl -X POST http://localhost:8080/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code&code=CODE&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&redirect_uri=REDIRECT_URI"
```

## 🔐 セキュリティ機能

- RSA鍵ペア生成（2048bit）
- JWT署名・検証（RS256）
- PKCE対応（S256）
- CSRF保護（state parameter）
- トークン有効期限管理
- Secure Cookie設定

## 🧪 テスト

```bash
# テスト実行
go test ./...

# カバレッジ確認
go test -cover ./...
```

## 📚 参考仕様

- [RFC 6749 - OAuth 2.0](https://tools.ietf.org/html/rfc6749)
- [RFC 7636 - PKCE](https://tools.ietf.org/html/rfc7636)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 7515 - JSON Web Signature (JWS)](https://tools.ietf.org/html/rfc7515)
- [RFC 7519 - JSON Web Token (JWT)](https://tools.ietf.org/html/rfc7519)

## 📄 ライセンス

MIT License
