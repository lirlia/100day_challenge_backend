# Day 19: Test Client A

## 概要

Day 19 で作成した OIDC プロバイダー (`day19_oidc_provider`, `http://localhost:8080`) をテストするためのクライアントアプリケーションです。

`next-auth` ライブラリを使用して OIDC プロバイダーとの認証連携 (Authorization Code Flow) を行います。

## 機能

*   ログインボタン: OIDC プロバイダーへリダイレクトして認証を開始します。
*   ログアウトボタン: セッションを破棄します。
*   ユーザー情報表示: ログイン後、ID トークンなどから取得したユーザー情報を表示します。

## 設定

*   OIDC プロバイダー側 (`clients` テーブル) にこのクライアントの情報を登録する必要があります。
    *   `client_id`: `client-a`
    *   `client_secret`: `client-a-secret`
    *   `redirect_uris`: `["http://localhost:3002/callback"]` (next-auth のデフォルトコールバックパスは `/api/auth/callback/:providerId` ですが、簡略化のため `/callback` を想定)
*   `.env.local` ファイルに以下の環境変数を設定します:
    ```env
    OIDC_CLIENT_ID="client-a"
    OIDC_CLIENT_SECRET="client-a-secret"
    OIDC_ISSUER="http://localhost:8080"

    NEXTAUTH_URL="http://localhost:3002" # このクライアントアプリのベースURL
    NEXTAUTH_SECRET="your-very-secure-nextauth-secret" # openssl rand -base64 32 で生成
    ```

# Prisma (Not used for OIDC flow)
DATABASE_URL="file:../prisma/dev.db"

## 起動方法

```bash
npm install
npm run dev -- -p 3002
```
