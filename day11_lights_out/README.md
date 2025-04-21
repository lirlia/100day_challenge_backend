# Day 11: Lights Out Game

## アプリケーション概要

古典的なパズルゲーム「Lights Out」のウェブアプリケーション版です。
プレイヤーは 5x5 の盤面のライトをクリックし、クリックしたライトとその上下左右のライトの状態を反転させ、最終的にすべてのライトを消すことを目指します。

ゲームの操作履歴はイベントとして記録され、過去の状態を再現したり、ヒント機能を利用したりすることができます。

https://github.com/user-attachments/assets/d5a6913b-a512-49f6-949e-ef37aca0330e

[100日チャレンジ day11 (イベントソーシングをつかったパズルゲーム)](https://zenn.dev/gin_nazo/scraps/d09bcb20a672eb)

## ゲームルール

1.  **盤面:** 5x5 のグリッド状のライト（ボタン）。
2.  **初期状態:** ランダムにいくつかのライトが点灯。
3.  **操作:** ライトをクリックすると、自身と隣接するライトの状態が反転。
4.  **クリア条件:** 全てのライトを消灯させる。

## 主な機能

*   **ゲームプレイ:**
    *   5x5 のインタラクティブなゲーム盤面。
    *   ライトのオン/オフ状態の視覚的表示。
    *   クリックによるライトの状態反転。
    *   手数（クリック回数）の表示。
    *   ゲームクリア時のメッセージ表示。
    *   「New Game」ボタンによる新しいゲームの開始（ページリロード）。
*   **履歴機能:**
    *   ゲームの操作履歴（イベント）を右ペインに表示。
    *   履歴項目をクリックすると、その時点の盤面状態を再現表示。
    *   履歴表示中はゲーム操作不可。
    *   「Back to Latest」ボタンで最新の状態に戻る。
*   **ヒント機能:**
    *   「Hint」ボタンをクリックすると、現在の盤面を解くための次の一手（押すべきライト）がハイライト表示される（オン/オフで異なる色）。
    *   ヒントは3秒間表示され、自動的に消える。
    *   履歴表示中やゲームクリア後はヒント機能は利用不可。

## データモデル

ゲームの状態とイベントは以下の Prisma モデルで管理されます。

```prisma
model Game {
  id                String   @id @default(cuid())
  currentBoardState Json?    // 現在の盤面の状態 (イベントから再構築可能)
  isWon             Boolean  @default(false)
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  events            DomainEvent[] @relation("GameEvents")
}

model DomainEvent {
  id        String   @id @default(cuid())
  gameId    String
  type      String   // "GameInitialized", "LightToggled", "GameWon"
  payload   Json
  sequence  Int
  createdAt DateTime @default(now())
  game      Game     @relation("GameEvents", fields: [gameId], references: [id])

  @@index([gameId, sequence])
  @@unique([gameId, sequence])
}
```

## 画面構成

*   **メイン画面 (`/`):**
    *   **左ペイン:** ゲーム盤面、手数、Hint/New Game ボタン、クリアメッセージ。
    *   **右ペイン:** イベント履歴リスト、Back to Latest ボタン（履歴表示時）。

## 技術スタック

*   フレームワーク: Next.js (App Router)
*   言語: TypeScript
*   データベース: SQLite
*   ORM: Prisma
*   スタイリング: Tailwind CSS
*   状態管理: React Hooks (useState, useEffect, useMemo, useCallback, useRef)

## 起動方法

1.  依存関係をインストール:
    ```bash
    npm install
    ```
2.  データベースマイグレーションを適用:
    ```bash
    npx prisma migrate deploy
    ```
    (もしDBファイルが存在しない場合は `npx prisma db push` でも可)
3.  開発サーバーを起動:
    ```bash
    npm run dev
    ```
4.  ブラウザで `http://localhost:3001` を開きます。

## 注意点

*   初期ロード時や画面サイズによっては、レイアウトのちらつきが発生する場合があります。
