# Day 9: リアルタイム共同編集エディタ

## 概要

このプロジェクトは、複数のユーザーが同時に同じドキュメントを編集できる、リアルタイム共同編集オンラインテキストエディタを実装します。ShareDB と rich-text OT タイプを利用して同時編集を処理し、編集内容はリアルタイムで同期されます。また、入力された Markdown はリアルタイムでプレビュー表示されます。

https://github.com/user-attachments/assets/59814b08-5f90-4880-85af-57318a382a8b

[100日チャレンジ day9 (同時編集可能なテキストエディタ)](https://zenn.dev/gin_nazo/scraps/eb18c10ff3cd4d)

## 主要機能

-   **リアルタイム共同編集:** 複数のユーザーが単一のテキストドキュメントを同時に編集できます。変更は ShareDB を使用してリアルタイムで同期されます。
-   **Markdown プレビュー:** 左側のパネルに入力された Markdown テキストが、右側のパネルでリアルタイムに HTML としてレンダリングされます。
-   **サーバーサイドでのドキュメント状態管理:** ドキュメントの最新バージョンはサーバーサイド (ShareDB バックエンド、メモリ上) で管理されます。

## 使用技術スタック

-   **フレームワーク:** Next.js (App Router)
-   **言語:** TypeScript
-   **リアルタイム同期:** ShareDB (`sharedb`, `sharedb/client`)
-   **OT 型:** rich-text (Quill Delta ベース)
-   **WebSocket サーバー:** Node.js (`ws` ライブラリ)
-   **Markdown レンダリング:** React Markdown (`react-markdown`, `remark-gfm`)
-   **構文ハイライト:** React Syntax Highlighter (`react-syntax-highlighter`)
-   **スタイリング:** Tailwind CSS

## アーキテクチャ

-   **フロントエンド (Next.js Client - `app/page.tsx`):**
    -   ページ読み込み時に WebSocket サーバーに接続します (`reconnecting-websocket` を使用)。
    -   ShareDB クライアント (`sharedb/client`) を使用してサーバーと通信します。
    -   ShareDB ドキュメントを購読し、初期状態とサーバーからの変更 (オペレーション) を受信します。
    -   テキストエリアでの変更を検知し、`quill-delta` を使って差分オペレーションを計算し、ShareDB を介してサーバーに送信します。
    -   受信したオペレーションに基づいてローカルのテキスト状態を更新します。
    -   `react-markdown` を使用してテキストエリアの内容を Markdown としてプレビュー表示します。
-   **バックエンド (Node.js WebSocket Server - `server.js`):**
    -   `ws` ライブラリで WebSocket サーバーを起動します。
    -   ShareDB バックエンドインスタンスを実行します。
    -   新しい WebSocket 接続を受け付け、ShareDB に渡します。
    -   ShareDB がドキュメントの同期処理 (オペレーションの受信、変換、ブロードキャスト) を担当します。
    -   ドキュメントの状態はメモリ上に保持されます (`rich-text` 型)。

## セットアップと実行方法

1.  **依存パッケージのインストール:**
    ```bash
    npm install
    ```
2.  **WebSocket サーバーの起動:**
    ```bash
    npm run start:ws
    ```
3.  **Next.js 開発サーバーの起動 (別のターミナルで):**
    ```bash
    npm run dev
    ```
4.  複数のブラウザタブまたはウィンドウで `http://localhost:3001` を開き、複数ユーザーをシミュレートします。

## 注意点

-   リアルタイム同期には ShareDB と `rich-text` OT タイプが使用されています。
-   WebSocket サーバーは独立した Node.js プロセスとして動作します。
-   Markdown プレビューのコードハイライトや GFM 機能は `react-markdown` と関連ライブラリによって提供されます。(現在、プレビュー関連で Linter エラーが発生しています) 