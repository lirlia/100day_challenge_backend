# Day 19: OIDC Provider (IDaaS)

## 概要

OpenID Connect (OIDC) 1.0 に準拠した ID プロバイダー (IDaaS) を実装します。
バックエンド API は Go で実装し、フロントエンドのログイン・同意画面などは Next.js (App Router) で実装します。

他のアプリケーションからの認証・認可を受け付け、シングルサインオン (SSO) を実現することを目的とします。

## 主要機能

*   **OIDC/OAuth 2.0 エンドポイント (Go):**
    *   `/authorize`: 認証・同意リクエスト受付
    *   `/token`: トークン発行
    *   `/userinfo`: ユーザー情報提供
    *   `/jwks`: 公開鍵提供
*   **ユーザー認証 (Go):** メールアドレス・パスワード認証 (bcrypt)
*   **クライアント管理 (Go):** DB で Client ID/Secret/Redirect URI を管理
*   **ログイン画面 (Next.js):** ユーザー認証 UI
*   **同意画面 (Next.js):** スコープ許可 UI

## 技術スタック

*   **バックエンド:** Go, chi (router), sqlx (DB), go-sqlite3, golang-jwt, bcrypt
*   **フロントエンド:** Next.js (App Router), TypeScript, Tailwind CSS
*   **データベース:** SQLite (`prisma/dev.db` を Go からも参照)
*   **DB マイグレーション (Go):** golang-migrate/migrate

## 起動方法

1.  **Go バックエンド:**
    ```bash
    cd backend_go
    # (初回) DBマイグレーション
    # migrate -database "sqlite3://../prisma/dev.db" -path db/migrations up
    go run cmd/server/main.go
    # デフォルト: http://localhost:8080
    ```
2.  **Next.js フロントエンド:**
    ```bash
    npm install
    npm run dev -- -p 3001
    # デフォルト: http://localhost:3001
    ```

## テスト用クライアント

別途、`day19_test_client_a` (`localhost:3002`), `day19_test_client_b` (`localhost:3003`) を用意し、この IDaaS (`http://localhost:8080`) を利用するように設定してテストします。
