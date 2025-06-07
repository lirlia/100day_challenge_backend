# Day59 - OAuth2/OpenID Connect React Client

Day59で構築したOAuth2/OpenID Connect Providerと連携するReact/Next.jsクライアントアプリケーションです。

## 🎯 学習目標

- OAuth2 Authorization Code Flow with PKCEの実装
- OpenID Connect (OIDC) による認証フローの理解
- セキュアなトークン管理とセッション処理
- モダンなReact/Next.jsによるSPAでの認証実装
- グラスモーフィズムデザインによるUI/UX
- **CORS対応のフロントエンド実装**

## 🚀 機能

### OAuth2/OIDC認証フロー
- **Authorization Code Flow with PKCE** - セキュアな認証フロー
- **State Parameter** - CSRF攻撃防止
- **Code Verifier/Challenge** - PKCE による追加セキュリティ
- **Access Token管理** - ローカルストレージでの安全な保存
- **Refresh Token** - 自動的なトークン更新
- **UserInfo取得** - 認証後のユーザー情報表示
- **完全CORS対応** - プリフライトリクエスト対応済み

### UI/UX
- **グラスモーフィズムデザイン** - モダンで美しいインターフェース
- **レスポンシブ対応** - モバイル・デスクトップ両対応
- **リアルタイムフィードバック** - 認証状態の即座な反映
- **エラーハンドリング** - 分かりやすいエラー表示
- **ローディング状態** - 認証プロセス中の適切なフィードバック

## 🛠 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **UI**: React 19
- **スタイリング**: Tailwind CSS v3 (グラスモーフィズム)
- **認証**: OAuth2/OpenID Connect (自作Provider連携)
- **セキュリティ**: PKCE, State Parameter, Secure Token Storage
- **HTTP Client**: Fetch API (CORS完全対応)
- **暗号化**: Web Crypto API (PKCE用SHA256)

## 📁 プロジェクト構成

```
client/
├── app/
│   ├── callback/
│   │   └── page.tsx          # OAuthコールバック処理 (CORS対応)
│   ├── globals.css           # Tailwind CSS v3設定
│   ├── layout.tsx            # アプリケーションレイアウト
│   └── page.tsx              # メインページ (グラスモーフィズムUI)
├── package.json              # 依存関係とスクリプト
├── tailwind.config.js        # Tailwind CSS 設定
├── tsconfig.json             # TypeScript 設定
└── README.md                 # このファイル
```

## 🔧 セットアップ

### 1. 依存関係のインストール
```bash
cd client
npm install
```

### 2. OAuth Provider起動
```bash
# 親ディレクトリでOAuth Providerを起動
cd ..
go run main.go
```

### 3. React Client起動
```bash
cd client
npm run dev
```

### 4. アクセス
- **React Client**: http://localhost:3001 🎨
- **OAuth Provider**: http://localhost:8081

## 📝 使用方法

### 1. 認証フロー体験
1. **http://localhost:3001** にアクセス
2. 美しいグラスモーフィズムUIで「🚀 OAuth2でログイン」ボタンをクリック
3. OAuth Provider の認証画面で認証（デモ用ユーザーID: `bf3e5ff7-32b5-426f-8e2d-3d56e81d10a5`）
4. 自動的にクライアントアプリに戻り、認証完了
5. プロフィール情報の自動取得と表示を確認

#### 設定済みの認証情報
- **Client ID**: `4127463f-af22-4f1e-aecb-fb178082eacb`
- **Client Secret**: `d3a8209a-ccd0-4e47-96ca-3122f47e8c91`
- **Redirect URI**: `http://localhost:3001/callback`
- **Provider URL**: `http://localhost:8081`
- **Test User ID**: `bf3e5ff7-32b5-426f-8e2d-3d56e81d10a5`

### 2. 機能確認
- **プロフィール取得**: UserInfo エンドポイントからユーザー情報を取得
- **保護されたリソース**: アクセストークンを使用したAPI呼び出し
- **ログアウト**: トークンクリアとセッション終了
- **エラーハンドリング**: ネットワークエラーや認証エラーの適切な表示

## 🔐 セキュリティ機能

### PKCE (Proof Key for Code Exchange)
- **Code Verifier**: 暗号学的に安全なランダム文字列 (43-128文字)
- **Code Challenge**: Code VerifierのSHA256ハッシュ (Base64URL)
- **S256 Method**: RFC 7636準拠のセキュアなハッシュ方式
- **Web Crypto API**: ブラウザ標準のセキュアな暗号化ライブラリ使用

### State Parameter
- **CSRF防止**: 認証リクエストとコールバックの整合性確認
- **Session管理**: セッションストレージでの一時保存
- **nanoid**: 暗号学的に安全なランダムID生成

### Token管理
- **Access Token**: Bearer トークンによるAPI認証
- **ID Token**: OpenID Connect の身元情報トークン
- **Secure Storage**: ローカルストレージでの安全な保存
- **自動クリア**: エラー時やログアウト時の適切なクリア

## 🎨 デザイン特徴

### グラスモーフィズム
- **半透明背景**: `bg-white/10`, `bg-white/5`
- **バックドロップブラー**: `backdrop-blur-lg`, `backdrop-blur-xl`
- **グラデーション**: `bg-gradient-to-br from-purple-900 via-blue-900 to-green-500`
- **ボーダー**: `border border-white/20`
- **ホバーエフェクト**: `hover:bg-white/15`, `hover:scale-105`
- **アニメーション**: `transition-all duration-300`

### レスポンシブ対応
- **モバイルファースト**: 小画面 (sm:) から大画面 (lg:) まで対応
- **フレキシブルレイアウト**: Grid と Flexbox の組み合わせ
- **適応的タイポグラフィ**: `text-xl lg:text-2xl` 等の画面サイズ対応

### アクセシビリティ
- **フォーカス表示**: `focus:outline-none focus:ring-2 focus:ring-white/30`
- **セマンティックHTML**: 適切なHTMLタグの使用
- **コントラスト**: 十分な色彩コントラストの確保

## 🧪 テスト

### 手動テスト項目（✅ 完了）
- [x] 初回ログイン
- [x] OAuth プロバイダーでの認証
- [x] コールバック処理
- [x] プロフィール取得
- [x] ログアウト
- [x] エラーハンドリング
- [x] レスポンシブ表示
- [x] CORS対応確認
- [x] PKCE フロー動作確認

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

### E2Eテスト (Future)
```bash
# Playwrightでの自動化テスト（将来実装予定）
npm run test:e2e
```

## 🚨 トラブルシューティング

### よくある問題と解決方法

#### 1. CORS エラーが発生する場合
```
Failed to fetch
TypeError: Failed to fetch
```
**解決方法**:
1. OAuth Provider が起動しているか確認: http://localhost:8081/health
2. CORS設定確認: `curl -i -X OPTIONS http://localhost:8081/token -H "Origin: http://localhost:3001"`
3. ブラウザのキャッシュをクリア

#### 2. 認証後にコールバックページでエラー
**解決方法**:
1. URLのコールバックパラメータ確認
2. OAuth Provider のクライアント設定確認
3. `sessionStorage` と `localStorage` をクリア

#### 3. プロフィール取得エラー
**解決方法**:
1. アクセストークンの有効性確認
2. UserInfo エンドポイントの稼働確認: http://localhost:8081/userinfo
3. 認証スコープに `profile` が含まれているか確認

### デバッグ方法
1. **ブラウザ開発者ツール**: コンソールログでエラー内容確認
2. **ネットワークタブ**: HTTP リクエスト/レスポンスの詳細確認
3. **アプリケーションタブ**: ローカルストレージの内容確認

## 📚 参考資料

- [OAuth 2.0 RFC 6749](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC 7636](https://tools.ietf.org/html/rfc7636)
- [OpenID Connect Core 1.0](https://openid.net/specs/openid-connect-core-1_0.html)
- [Next.js App Router](https://nextjs.org/docs/app)
- [Tailwind CSS](https://tailwindcss.com/)
- [Web Crypto API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)

## ✨ 特徴

✅ **セキュアなPKCE実装**  
✅ **美しいグラスモーフィズムUI**  
✅ **完全CORS対応**  
✅ **プロダクション品質のコード**  
✅ **包括的なエラーハンドリング**  
✅ **レスポンシブデザイン**  

---

💡 **このクライアントアプリケーションは、モダンなSPAでのOAuth2/OIDC実装のベストプラクティスを学習するために作成されました。**
