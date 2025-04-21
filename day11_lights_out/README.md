# Day 11: Lights Out Game

## アプリケーション概要

古典的なパズルゲーム「Lights Out」のウェブアプリケーション版です。
プレイヤーは 5x5 の盤面のライトをクリックし、クリックしたライトとその上下左右のライトの状態を反転させ、最終的にすべてのライトを消すことを目指します。

**本アプリケーションの特徴として、ゲームの状態管理にイベントソーシングの考え方を一部取り入れています。** プレイヤーの操作（ライトのクリック）やゲームの開始・終了といった出来事を「イベント」として時系列に記録します。現在のゲーム盤面は、これらのイベント履歴を積み重ねることで再現されます。

このアプローチにより、過去の任意の時点の状態を正確に再現する「履歴機能」や、将来的な拡張（例: アンドゥ機能）の実装が容易になります。

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
*   **履歴機能 (イベントソーシングに基づく):**
    *   ゲームの操作履歴（イベント）を右ペインに表示。
    *   履歴項目をクリックすると、その時点の盤面状態をイベントから再現表示。
    *   履歴表示中はゲーム操作不可。
    *   「Back to Latest」ボタンで最新の状態に戻る。
*   **ヒント機能:**
    *   「Hint」ボタンをクリックすると、現在の盤面を解くための次の一手（押すべきライト）がハイライト表示される（オン/オフで異なる色）。
    *   ヒントは3秒間表示され、自動的に消える。
    *   履歴表示中やゲームクリア後はヒント機能は利用不可。

## データモデル

ゲームの状態とイベントは以下の Prisma モデルで管理されます。
イベント (`DomainEvent`) が状態のソース・オブ・トゥルース (Source of Truth) となります。

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
  sequence  Int      // 同一 gameId 内でのイベント発生順序 (0始まり)
  createdAt DateTime @default(now())
  game      Game     @relation("GameEvents", fields: [gameId], references: [id])

  @@index([gameId, sequence])
  @@unique([gameId, sequence])
}
```

### イベントの種類と扱い

本アプリケーションで記録される主なイベントは以下の通りです。

*   **`GameInitialized`**: 
    *   **意味:** 新しいゲームが開始されたことを示します。
    *   **ペイロード (`payload`):** ゲームの初期盤面状態 (`{ board: boolean[][] }`) を含みます。
    *   **扱い:** 各ゲームの最初のイベント (sequence: 0) となり、盤面状態を構築する際の起点となります。
*   **`LightToggled`**: 
    *   **意味:** プレイヤーが特定のライトをクリックしたことを示します。
    *   **ペイロード (`payload`):** クリックされたライトの座標 (`{ row: number, col: number }`) を含みます。
    *   **扱い:** このイベントが発生するたびに、対応するライトとその隣接ライトの状態が反転するように盤面状態が更新されます。
*   **`GameWon`**: 
    *   **意味:** ゲームがクリアされた（すべてのライトが消灯した）ことを示します。
    *   **ペイロード (`payload`):** なし (`{}`)
    *   **扱い:** ゲームの終了状態を示すマーカーとして機能します。このイベント以降、通常は新たな `LightToggled` イベントは発生しません。

### 状態の再現

特定の時点でのゲーム盤面状態は、以下の手順で再現されます。

1.  指定されたゲーム (`gameId`) のイベント履歴をデータベースから取得します。
2.  `GameInitialized` イベントのペイロードから初期盤面を取得します。
3.  初期盤面に対し、シーケンス番号順に `LightToggled` イベントを適用していき、盤面状態を更新します。
4.  履歴表示機能で特定のシーケンス番号が指定された場合は、その番号までのイベントのみを適用します。

この処理は `app/_lib/gameLogic.ts` 内の `buildStateFromEvents` 関数および `applyEvent` 関数で実装されています。

### イベントソーシング実装の流れ

本アプリケーションにおけるイベントソーシング関連の主な処理フローは以下の通りです。

**1. 新しいゲームの開始:**
   *   ユーザーがページ (`/`) にアクセスすると、`app/page.tsx` (Server Component) が `app/_lib/actions.ts` の `createNewGame` サーバーアクションを呼び出します。
   *   `createNewGame` アクションは、`createInitialBoard` で初期盤面を生成し、Prisma を使用して新しい `Game` レコードと、最初のイベントである `DomainEvent` (`type: 'GameInitialized'`, `sequence: 0`) をアトミックにデータベースへ保存します。
   *   アクションは新しい `gameId` を返し、それが `GameClient` コンポーネントに渡されます。

**2. ライトのクリック (操作):**
   *   ユーザーが `GameClient` 上のライトボタンをクリックすると、`handleLightClick` 関数がトリガーされます。
   *   `handleLightClick` は、`fetch` を使用して `POST /api/games/[gameId]/moves` API エンドポイントを呼び出し、クリックされた座標 (`{ row, col }`) を送信します。
   *   API ルートハンドラ (`app/api/games/[gameId]/moves/route.ts`) は、受け取った座標で新しい `DomainEvent` (`type: 'LightToggled'`) を作成し、次のシーケンス番号を付与してデータベースに保存します。
   *   同時に、API は現在のイベント履歴に基づいてゲームクリア (`isGameWon`) を判定し、クリアしていれば `DomainEvent` (`type: 'GameWon'`) も追加で保存します。
   *   API は成功レスポンスを返します。

**3. 状態の更新と表示:**
   *   `handleLightClick` は、`/moves` API の成功後、`fetchEventsAndUpdateState` 関数を呼び出します。
   *   `fetchEventsAndUpdateState` は `GET /api/games/[gameId]/events` API エンドポイントを呼び出します。
   *   API ルートハンドラ (`app/api/games/[gameId]/events/route.ts`) は、指定された `gameId` のすべての `DomainEvent` をデータベースから取得し、シーケンス順にソートして返します。
   *   `GameClient` は受け取ったイベント配列を `events` state に保存します。
   *   `events` state が更新されると、`useMemo` で定義された `displayedBoard` と `displayedMoves` が再計算されます。これらは `buildStateFromEvents` を使用して、現在の `events` 配列（および履歴表示時は `displaySequence`）に基づいて最新の盤面状態と手数を算出します。
   *   算出された `displayedBoard` と `displayedMoves` に基づいて UI が再レンダリングされます。

**4. 履歴の表示と再現:**
   *   `GameClient` は常に `events` state を保持し、右ペインにそのリストを表示します。
   *   ユーザーが履歴リストの項目をクリックすると `handleHistoryClick` が呼ばれ、クリックされたイベントの `sequence` 番号が `displaySequence` state に設定されます。
   *   `displaySequence` が変更されると、`displayedBoard` と `displayedMoves` の `useMemo` が再実行され、`buildStateFromEvents` が `displaySequence` を考慮してその時点の状態を計算し、UI が更新されます。
   *   「Back to Latest」ボタンは `displaySequence` を `undefined` に戻し、最新の状態を表示します。

このように、アプリケーションは常にイベントの記録と、そのイベント履歴からの状態計算という2つのフェーズで動作しています。

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
