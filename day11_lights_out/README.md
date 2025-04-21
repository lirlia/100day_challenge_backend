# Day 11: Lights Out Game with Event Sourcing

## アプリケーション概要

「Lights Out」というパズルゲームを実装します。
このアプリケーションでは、ゲームの進行（プレイヤーの操作）をイベントとして記録するイベントソーシングパターンを採用します。
記録されたイベントを利用して、ゲームの操作手順を再現するリプレイ機能、および特定の過去時点の状態に戻る機能を提供します。

## デザインコンセプト

提供された画像（レトロな携帯ゲーム機風）を参考に、シンプルで遊び心のあるデザインを目指します。
-   盤面のボタンは明確なクリック領域を持つ。
-   ライトのオン/オフ状態は視覚的に分かりやすく表現する（例: 色の変化）。

## ゲームルール

1.  **盤面:** 5x5 のグリッド状のライト（ボタン）で構成されます。
2.  **初期状態:** ゲーム開始時に、いくつかのライトがランダム（または固定パターン）で点灯状態になります。
3.  **操作:** プレイヤーがいずれかのライトをクリックすると、クリックしたライト自身と、その上下左右に隣接するライトの状態（オン/オフ）が反転します。盤面の端のライトをクリックした場合、存在しない隣接マスは無視されます。
4.  **クリア条件:** 全てのライトを消灯（オフ）状態にすること。

## 機能要件

1.  **ゲームプレイ:**
    *   5x5 の盤面を表示する。
    *   ライトはオン/オフの状態に応じて見た目が変わる。
    *   クリックされたライトとその隣接ライトの状態を反転させる。
    *   現在の盤面状態をリアルタイムで表示する。
    *   すべてのライトが消灯したら、クリアメッセージを表示する。
    *   新しいゲームを開始するボタン（盤面リセット）を設ける。
    *   現在の手数（クリック回数）を表示する。
2.  **イベントソーシング:**
    *   ゲームの各操作（ライトのクリック）をイベント (`LightToggled`) として記録する。
    *   イベントには、操作されたライトの位置情報（行、列）を含める。
    *   ゲームの初期状態 (`GameInitialized`) とクリア (`GameWon`) もイベントとして記録する。
    *   イベントはデータベース (SQLite) に永続化する。
    *   各ゲームセッションは一意のID (`gameId`) で識別する。
    *   各イベントにはシーケンス番号を付与し、発生順序を保証する。
3.  **履歴表示と状態再現:**
    *   ゲーム画面の右側に、現在のゲームのイベント履歴（操作ログ）をリスト表示する。
        *   例: "Move 1: Toggled (2, 3)", "Move 2: Toggled (1, 1)", ...
    *   履歴リストの各項目をクリックすると、**そのイベントが発生した直後の盤面状態**がゲーム画面に再現表示される。
    *   履歴から状態を再現表示している間は、ゲーム操作（ライトのクリック）は無効にする。
    *   最新の状態に戻るボタン、または履歴の最新項目をクリックすることで、通常のプレイ状態に復帰できる。

## データモデル (Prisma Schema 想定)

```prisma
// イベントストア用の汎用モデル
model DomainEvent {
  id        String   @id @default(cuid())
  gameId    String   // どのゲームセッションのイベントか
  type      String   // イベントの種類 (e.g., "GameInitialized", "LightToggled", "GameWon")
  payload   Json     // イベント固有のデータ (e.g., { row: 1, col: 2 } for LightToggled)
  sequence  Int      // 同一 gameId 内でのイベント発生順序 (1始まり)
  createdAt DateTime @default(now())

  @@index([gameId, sequence]) // gameId と順序で検索・ソートするため
  @@unique([gameId, sequence]) // 同一ゲーム内でシーケンス番号は一意
}
```
*補足: 今回は状態のスナップショットは使用せず、常にイベント履歴から盤面状態を構築します。*

## 画面構成案

*   **メイン画面 (`/` または `/game/[gameId]`):**
    *   **左ペイン:**
        *   現在のゲーム盤面 (5x5 グリッド)
        *   手数カウンター
        *   「新しいゲーム」ボタン
        *   クリア時に表示されるメッセージ
    *   **右ペイン:**
        *   現在のゲームのイベント履歴リスト（クリック可能）
        *   （履歴選択時）「最新の状態に戻る」ボタン

## 技術スタック

*   フレームワーク: Next.js (App Router)
*   言語: TypeScript
*   データベース: SQLite
*   ORM: Prisma
*   スタイリング: Tailwind CSS
*   状態管理: React Hooks (useState, useReducer) / イベントソーシングによる状態再現

## 実装方針

1.  **データモデル定義:** `prisma/schema.prisma` に `DomainEvent` モデルを定義し、マイグレーションを実行 (`npx prisma migrate deploy`)。
2.  **ゲームロジック実装:**
    *   盤面状態の表現 (例: `boolean[][]`)。
    *   ライトの状態反転ロジック (`toggleLight(board, row, col)`)。
    *   クリア判定ロジック (`isGameWon(board)`)。
    *   イベントを適用して状態を更新する関数 (`applyEvent(board, event)`)。
    *   特定のシーケンスまでのイベントを適用して状態を再現する関数 (`buildStateFromEvents(events, targetSequence)`)。
    *   これらを `app/_lib/gameLogic.ts` などにまとめる。
3.  **APIエンドポイント:**
    *   `POST /api/games`: 新しいゲームを開始し、`GameInitialized` イベントを記録。`gameId` を返す。初期盤面パターンもここで決定する。
    *   `POST /api/games/[gameId]/moves`: プレイヤーの操作を受け取り (`{ row: number, col: number }`)、`LightToggled` イベントを記録。クリア判定を行い、`GameWon` イベントも記録。成功したら最新のイベントシーケンス番号を返す。
    *   `GET /api/games/[gameId]/events`: 特定ゲームの全イベント履歴 (`DomainEvent[]`) をシーケンス順に取得する。
4.  **UI実装 (Client Component 中心):**
    *   メイン画面コンポーネント (`app/page.tsx` または `app/(pages)/game/[gameId]/page.tsx`) を作成。
        *   `useState` や `useReducer` で現在の盤面状態 (`boardState`)、イベント履歴 (`events`)、現在の表示対象シーケンス (`displaySequence`) などを管理。
        *   ゲーム開始時に `/api/games` を呼び出し `gameId` を取得。
        *   盤面表示とクリックハンドリングを実装。クリック時に `/api/games/[gameId]/moves` を呼び出し、成功したらイベント履歴を再取得 (`/api/games/[gameId]/events`) してUIを更新。
        *   履歴リストを表示。クリックハンドラで `displaySequence` を更新。
        *   表示する盤面は、`events` と `displaySequence` を元に `buildStateFromEvents` を呼び出して計算する。
    *   Tailwind CSS でデザインを適用。
