# Day59 - OAuth2/OpenID Connect Provider (Go API) + React Client

OAuth2 および OpenID Connect (OIDC) 仕様に準拠した認証プロバイダーをGo言語で実装し、それと連携するReact/Next.jsクライアントアプリケーションも含むプロジェクトです。

https://github.com/user-attachments/assets/fafc690f-df51-4163-8fd6-5ec0be43bf32

[100日チャレンジ day59（OIDC Provider）](https://zenn.dev/gin_nazo/scraps/2945f0901f44aa)

## 🎯 学習目標

- OAuth2フローの深い理解（Authorization Code、Client Credentials等）
- OpenID Connectの実装（ID Token、UserInfo）
- JWT（JSON Web Token）の生成・検証
- PKCE（Proof Key for Code Exchange）対応
- スコープベースのアクセス制御
- セキュリティベストプラクティス
- **React/Next.jsでのOAuth2クライアント実装**
- **グラスモーフィズムデザインによるモダンUI**
- **CORS設定とプリフライトリクエスト対応**

## 🚀 機能

### OAuth2/OpenID Connect標準エンドポイント
- `GET /.well-known/openid_configuration` - Discovery endpoint
- `GET /.well-known/jwks.json` - JSON Web Key Set
- `GET /authorize` - Authorization endpoint
- `POST /token` - Token endpoint (CORS対応)
- `GET /userinfo` - UserInfo endpoint (CORS対応)

### 管理API
- OAuth2クライアント管理（CRUD）
- ユーザー管理（作成・認証）
- トークン管理（一覧・失効）

### React Client
- **Authorization Code Flow with PKCE** - セキュアな認証フロー
- **グラスモーフィズムUI** - モダンで美しいインターフェース
- **リアルタイム認証状態管理** - React Hooksによる状態管理
- **セキュアなトークン管理** - ローカルストレージでの安全な保存
- **完全なCORS対応** - プリフライトリクエスト対応済み

### 対応フロー
1. **Authorization Code Flow** - 標準的なWebアプリ向け
2. **Authorization Code Flow with PKCE** - SPA・モバイル向け
3. **Client Credentials Flow** - サーバー間通信
4. **OpenID Connect** - 認証情報付き

## 🛠 技術スタック

### Backend (OAuth Provider)
- **言語**: Go 1.21+
- **HTTP Router**: カスタムルーター（CORS完全対応）
- **JWT**: `golang-jwt/jwt/v5`
- **Database**: SQLite3 (`modernc.org/sqlite`)
- **UUID**: `google/uuid`
- **暗号化**: 標準ライブラリ `crypto/rsa`
- **CORS**: カスタム実装（OPTIONS対応）

### Frontend (React Client)
- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **UI**: React 19
- **スタイリング**: Tailwind CSS v3 (グラスモーフィズム)
- **認証**: OAuth2/OpenID Connect
- **セキュリティ**: PKCE, State Parameter
- **HTTP Client**: Fetch API (CORS完全対応)

## 📁 プロジェクト構成

```
day59_oauth_provider/
├── main.go                    # エントリーポイント (カスタムCORSルーター)
├── go.mod                     # Go modules
├── go.sum                     # 依存関係ハッシュ
├── data/                      # データベースファイル
│   └── oauth.db              # SQLiteデータベース
├── internal/
│   ├── handlers/              # HTTPハンドラー (CORS対応済み)
│   │   ├── oauth.go          # OAuth2エンドポイント
│   │   ├── oidc.go           # OpenID Connectエンドポイント
│   │   └── admin.go          # 管理API
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
├── client/                   # React Client
│   ├── app/
│   │   ├── callback/
│   │   │   └── page.tsx     # OAuth コールバック処理
│   │   ├── globals.css      # グローバルスタイル (Tailwind v3)
│   │   ├── layout.tsx       # アプリケーションレイアウト
│   │   └── page.tsx         # メインページ (グラスモーフィズムUI)
│   ├── package.json         # 依存関係とスクリプト
│   ├── tailwind.config.js   # Tailwind CSS 設定
│   ├── tsconfig.json        # TypeScript 設定
│   └── README.md            # Client専用README
└── README.md                # このファイル
```

## 🔧 セットアップ

### 1. OAuth Provider起動

```bash
# 依存関係のインストール
go mod tidy

# プロバイダーのビルド
go build -o oauth_provider main.go

# サーバー起動
./oauth_provider
```

**または開発モード:**
```bash
go run main.go
```

### 2. React Client起動

```bash
# クライアントディレクトリに移動
cd client

# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev
```

### 3. アクセス
- **React Client**: http://localhost:3001 🎨
- **OAuth Provider**: http://localhost:8081
- **Discovery Endpoint**: http://localhost:8081/.well-known/openid_configuration

## 📝 使用例

### 1. React Clientでの認証体験（推奨）
1. **http://localhost:3001** にアクセス
2. 美しいグラスモーフィズムUIで「🚀 OAuth2でログイン」ボタンをクリック
3. OAuth Provider の認証画面で認証（デモ用ユーザーID: `bf3e5ff7-32b5-426f-8e2d-3d56e81d10a5`）
4. 自動的にクライアントアプリに戻り、認証完了
5. ユーザー情報の表示とプロフィール取得を確認

### 2. OAuth2クライアント作成
```bash
curl -X POST http://localhost:8081/api/clients \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test App",
    "redirect_uris": ["http://localhost:3001/callback"],
    "scopes": ["openid", "profile", "email"],
    "grant_types": ["authorization_code", "refresh_token"]
  }'
```

### 3. CORS動作確認
```bash
# プリフライトリクエストのテスト
curl -i -X OPTIONS http://localhost:8081/token \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST"

# レスポンス例：
# HTTP/1.1 200 OK
# Access-Control-Allow-Origin: http://localhost:3001
# Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
# Access-Control-Allow-Headers: Content-Type, Authorization
# Access-Control-Allow-Credentials: true
```

## 🔐 セキュリティ機能

### Backend
- RSA鍵ペア生成（2048bit）
- JWT署名・検証（RS256）
- PKCE対応（S256）
- CSRF保護（state parameter）
- トークン有効期限管理
- **完全CORS対応**: プリフライトリクエスト対応
- **セキュアヘッダー**: 適切なCORSヘッダー設定

### Frontend
- **PKCE実装**: Code Verifier/Challenge による追加セキュリティ
- **State Parameter**: CSRF攻撃防止
- **Secure Token Storage**: ローカルストレージでの安全な保存
- **Session管理**: セッションストレージでの一時データ管理
- **エラーハンドリング**: 認証エラーの適切な処理

## 🎨 デザイン特徴 (React Client)

### グラスモーフィズム
- **半透明背景**: `bg-white/10`
- **バックドロップブラー**: `backdrop-blur-lg`
- **グラデーション**: `bg-gradient-to-br from-purple-900 via-blue-900 to-green-500`
- **ボーダー**: `border border-white/20`
- **ホバーエフェクト**: `hover:bg-white/15`

### レスポンシブ対応
- **モバイルファースト**: 小画面から大画面まで対応
- **フレキシブルレイアウト**: Grid と Flexbox の組み合わせ
- **適応的タイポグラフィ**: 画面サイズに応じたフォントサイズ

## 🧪 テスト

### CORS動作確認
```bash
# TokenエンドポイントのCORS確認
curl -i -X OPTIONS http://localhost:8081/token \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: POST"

# UserInfoエンドポイントのCORS確認
curl -i -X OPTIONS http://localhost:8081/userinfo \
  -H "Origin: http://localhost:3001" \
  -H "Access-Control-Request-Method: GET"
```

### OAuth2フローテスト
```bash
# ヘルスチェック
curl http://localhost:8081/health

# Discovery設定確認
curl http://localhost:8081/.well-known/openid_configuration

# 手動でのトークン取得テスト
curl -X POST http://localhost:8081/token \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "Origin: http://localhost:3001" \
  -d "grant_type=authorization_code&code=CODE&client_id=CLIENT_ID&client_secret=CLIENT_SECRET&redirect_uri=http://localhost:3001/callback"
```

## 🚨 トラブルシューティング

### CORS エラーが発生する場合
1. **プリフライトリクエスト確認**:
   ```bash
   curl -i -X OPTIONS http://localhost:8081/token \
     -H "Origin: http://localhost:3001" \
     -H "Access-Control-Request-Method: POST"
   ```

2. **OAuth Provider再起動**:
   ```bash
   pkill -f oauth_provider
   go run main.go
   ```

3. **ブラウザキャッシュクリア**: 開発者ツールでキャッシュを無効化

### React Client接続エラーの場合
1. **両方のサーバーが起動しているか確認**:
   - OAuth Provider: http://localhost:8081/health
   - React Client: http://localhost:3001

2. **ポート競合の確認**:
   ```bash
   lsof -i :8081
   lsof -i :3001
   ```

## 📚 参考資料

- [RFC 6749 - OAuth 2.0 Authorization Framework](https://tools.ietf.org/html/rfc6749)
- [RFC 7662 - OAuth 2.0 Token Introspection](https://tools.ietf.org/html/rfc7662)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [RFC 7636 - PKCE](https://tools.ietf.org/html/rfc7636)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Tailwind CSS](https://tailwindcss.com/)

## ✨ 特徴

✅ **完全なOAuth2/OIDC準拠**  
✅ **セキュアなPKCE対応**  
✅ **美しいグラスモーフィズムUI**  
✅ **完全CORS対応**  
✅ **プロダクション品質のコード**  
✅ **包括的なドキュメント**  

---

💡 **このプロジェクトは、OAuth2/OpenID Connectの理解とモダンな認証システムの実装スキル向上を目的として作成されました。**
