# Day 12: GUIベースのインタラクティブ・データ探索ツール

## 概要

ユーザーが複数のデータセット（CSV形式）から一つを選択し、Webブラウザ上のGUIを通じてデータのフィルタリング、グループ化、集計条件を指定し、その結果をテーブルおよびグラフ形式でインタラクティブに探索できるツールです。バックエンドでDuckDBを利用し、SQLを直接書かずにデータ分析を行います。

https://github.com/user-attachments/assets/03916f6e-0253-4a8c-aea3-8fb597a6abf9

[100日チャレンジ day12 (GUIベースのインタラクティブ・データ探索ツール)](https://zenn.dev/gin_nazo/scraps/18e06e899e1420)

## 機能一覧

-   **データセット選択:** サーバー上の `data/` ディレクトリにあるCSVデータセットを自動で検出し、ドロップダウンで選択可能。
-   **カラム情報表示:** 選択されたデータセットのカラム名、型（数値、文字列、日付等に分類）、および文字列型のサンプル値（先頭100件のユニーク値）を表示。
-   **フィルタリング:**
    -   カラム、演算子（`=`, `!=`, `>`, `<`, `>=`, `<=`, `IN`）、値を指定してフィルタ条件を追加・削除可能。
    -   カラムの型に応じて利用可能な演算子と入力形式（テキスト入力、数値入力、日付入力、ブール値選択、Distinct値からの選択）が変化。
    -   `IN` 演算子ではカンマ区切りで複数値を指定。
-   **グループ化:** チェックボックスでグループ化するカラムを複数選択可能。
-   **集計:**
    -   集計関数（`COUNT`, `SUM`, `AVG`, `MIN`, `MAX`）、集計対象カラム（`COUNT` では `*` も可）、結果のエイリアスを指定して集計条件を追加・削除可能。
    -   集計関数に応じて選択可能なカラムが動的に変化（例: `SUM`/`AVG` は数値カラムのみ）。
    -   関数やカラムを変更すると、エイリアスが自動的に推奨値に更新される。
-   **動的クエリ実行:** 左パネルでフィルタ、グループ化、集計のいずれかを変更すると、自動的にバックエンドにリクエストが送信され、クエリが実行される。
-   **結果表示:**
    -   バックエンドで生成されたSQL文を表示。
    -   クエリ実行結果をテーブル形式で表示（ヘッダー固定、縦スクロール可能）。
    -   集計結果を棒グラフで表示（グループ化キーがX軸、最初の集計結果がY軸）。
-   **エラーハンドリング:** 不正な操作（例: Group By選択時に集計未指定）やAPIエラー発生時にメッセージを表示。

## 技術スタック

-   **フレームワーク:** Next.js (App Router)
-   **言語:** TypeScript
-   **バックエンドデータ処理:** DuckDB (Node.js)
-   **フロントエンドチャート:** Chart.js (`react-chartjs-2`)
-   **スタイリング:** Tailwind CSS
-   **パッケージ管理:** npm
-   **コード品質:** Biome (Lint & Format)

## 開始方法

1.  **データセットの準備:** プロジェクトルートに `data` ディレクトリを作成し、分析したいCSVファイルを配置します。(`cars.csv`, `iris.csv`, `countries.csv` がサンプルとして含まれています。)
2.  **依存パッケージをインストール:**
    ```bash
    npm install
    ```
3.  **開発サーバーを起動:**
    ```bash
    npm run dev
    ```
    ブラウザで [http://localhost:3001](http://localhost:3001) を開くとアプリケーションが表示されます。

## 注意事項

-   このツールはローカル開発環境での利用を想定しています。
-   バックエンドのDuckDBはインメモリで動作します。
-   SQLインジェクション対策は基本的なサニタイズのみです。信頼できないデータソースには注意してください。
-   エラーハンドリングやUIの洗練度は改善の余地があります。
