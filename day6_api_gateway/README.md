# 100日チャレンジ - day6: API Gateway

このプロジェクトは [Next.js](https://nextjs.org) (App Router) を使用した100日チャレンジの6日目、API Gateway を実装します。
[100日チャレンジ day6](https://zenn.dev/gin_nazo/scraps/53c75f4a01f2cc)

https://github.com/user-attachments/assets/081974ab-94a0-4e4e-a451-627d25d4d03c

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

## 内部アーキテクチャ

この API Gateway は、`app/api/gateway/[[...slug]]/route.ts` に実装された単一の Route Handler によって処理されます。主な処理フローは以下の通りです。

1.  **リクエスト受信:** 全ての `/api/gateway/*` へのリクエスト（任意の HTTP メソッド）を受け付けます。
2.  **認証:**
    *   リクエストヘッダーから `Authorization: Bearer <API_KEY>` を抽出します。
    *   `lib/store.ts` が `config/apiKeys.json` を基に保持している情報と照合し、有効な API キーか検証します。
    *   無効な場合は `401 Unauthorized` または `403 Forbidden` を返します。
3.  **レート制限:**
    *   有効な API キーに対し、`lib/store.ts` がインメモリで管理しているタイムスタンプ情報を参照します。
    *   `config/apiKeys.json` で定義された `interval` と `limit` に基づき、現在のリクエストが許容範囲内かチェックします。
    *   制限を超えている場合は `429 Too Many Requests` を返します。
4.  **ルーティング:**
    *   リクエストパス (`/api/gateway/time` など) を `config/routes.json` の `pathPrefix` と前方一致で比較します。
    *   一致するルールが見つからない場合は `404 Not Found` を返します。
5.  **プロキシ (転送):**
    *   一致したルールの `targetUrl` と、必要に応じて `stripPrefix` で加工されたパスを結合し、最終的な転送先 URL を決定します。
    *   Node.js の `fetch` API を使用して、オリジナルのリクエストメソッド、ボディ、（一部の）ヘッダーを転送先 URL に送信します。
    *   `X-Forwarded-For` ヘッダーなどが追加される場合があります。
6.  **レスポンス返却:**
    *   転送先からのレスポンスを受け取ります。
    *   `X-RateLimit-Remaining` ヘッダーを追加し、転送先のレスポンスヘッダーとボディをクライアントに返します。
7.  **ロギング:**
    *   リクエスト情報（メソッド、パス、APIキー、IP）とレスポンス情報（ステータスコード）、エラー情報などを `lib/store.ts` の `addLog` 関数に渡し、コンソール出力およびインメモリ配列に記録します。

**状態管理:**
*   API キーの設定、レートリミットの現在の状態（各キーのタイムスタンプ）、直近のログはすべて `lib/store.ts` 内の変数（インメモリ）で管理されています。アプリケーションの再起動でリセットされます。
*   レートリミット設定は管理画面から動的に更新可能で、更新内容は `lib/store.ts` 内の `apiKeysConfig` 変数に反映されます（ファイルへの書き戻しは行われません）。
