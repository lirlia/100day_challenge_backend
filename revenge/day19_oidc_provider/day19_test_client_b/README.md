# Day 19: Test Client B

## 概要

Day 19 で作成した OIDC プロバイダー (`day19_oidc_provider`, `http://localhost:8080`) をテストするためのクライアントアプリケーション B です。

クライアント A と同様の構成ですが、異なる Client ID とポート (`3003`) で動作し、SSO のテストに使用します。

## 機能

*   ログイン/ログアウト、ユーザー情報表示 (クライアント A と同様)

## 設定

*   OIDC プロバイダー側 (`clients` テーブル) にクライアント B の情報を登録済みであることを確認してください。
    *   `client_id`: `client-b`
    *   `client_secret`: `client-b-secret`
    *   `redirect_uris`: `["http://localhost:3003/callback"]`
*   `.env.local` ファイルに以下の環境変数を設定します:
    ```env
    # Set for Client B
    NEXT_PUBLIC_OIDC_CLIENT_ID="client-b"
    NEXT_PUBLIC_OIDC_REDIRECT_URI="http://localhost:3003/callback"

    # Shared OIDC Provider Info
    NEXT_PUBLIC_OIDC_ISSUER="http://localhost:8080"

    # Prisma (Not used for OIDC flow)
    DATABASE_URL="file:../prisma/dev.db"
    ```

## 起動方法

```
