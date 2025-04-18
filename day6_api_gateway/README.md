# Day 6: API Gateway

## 機能概要

Next.js App Router を使用して、以下の機能を持つ API ゲートウェイと管理画面を実装します。

1.  **API Gateway (`/api/gateway/...`)**:
    *   設定ファイル (`config/routes.json`) に基づくリクエストルーティング
    *   API キーによる認証 (`Authorization: Bearer <key>`)
    *   API キーごとのレート制限 (インメモリ管理)
    *   リクエスト/レスポンスのロギング (コンソール & インメモリ)

2.  **ダミーバックエンド API**:
    *   `/api/time`: 現在時刻を返す
    *   `/api/random`: ランダム文字列を返す

3.  **管理・テスト UI (`/`)**:
    *   **左側**: ゲートウェイ経由でのリクエスト送信テスト (URL/API キー選択、結果表示)
    *   **右側**: ゲートウェイ管理 (ログ表示、レートリミット表示・更新)

4.  **管理用 API (`/api/admin/...`)**:
    *   ログ取得 (`/logs`)
    *   レートリミット設定取得/更新 (`/rate-limit`)

## 使用技術

*   Next.js (App Router)
*   TypeScript
*   Tailwind CSS
*   React (Client Components for UI)
*   インメモリ状態管理 (ログ、レートリミット)

## 起動方法

```bash
npm install
npm run dev # localhost:3001 で起動
```

## 設定ファイル

*   `config/routes.json`: ルーティングルール
*   `config/apiKeys.json`: API キーと初期レートリミット設定
