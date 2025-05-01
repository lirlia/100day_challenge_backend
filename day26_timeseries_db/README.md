# Day 26: 簡易 時系列データベース on SQLite (ダークモード)

SQLite をバックエンドとして使用し、時系列データの格納、取得、集計、ダウンサンプリングを行う簡易的な時系列データベース API と、その操作 UI を実装します。UI はダークモードを基調としています。


https://github.com/user-attachments/assets/44dae080-08b2-40e6-827f-5992a10d2449

[100日チャレンジ day26](https://zenn.dev/gin_nazo/scraps/295f7b6e2d8c29)

## 主な機能

- **データ登録:** 指定したキーと値で現在のタイムスタンプを持つデータを登録します。
- **データ取得・表示:**
    - 登録されているキーの一覧を自動で取得し、選択できます。
    - 取得方法を選択できます:
        - **Raw Data:** 指定したキーと時間範囲（任意）の生データを取得します。
        - **Aggregated:** 指定した時間間隔（分/時/日）と集計方法（平均/最大/最小/合計/件数）でデータを集計して取得します。
        - **Downsampled:** データを間引いて取得します。指定した N 件ごとに点を抽出する (`every_nth`)か、指定した時間間隔（秒）で平均値を集計する (`aggregate`) かを選択できます。
        - **Latest N:** 指定したキーの最新 N 件のデータを取得します。
    - 取得したデータを Chart.js を使用して折れ線グラフで表示します。
- **UI:** ダークモードを採用し、エメラルド/ティール系のアクセントカラーを使用しています。

## 学習ポイント

- **SQLite での時系列データ処理:**
    - 時系列データに適したテーブル設計（`timestamp`, `key`, `value`）とインデックス活用（`[key, timestamp]`, `[timestamp]`）。
    - SQLite の標準 SQL 関数 (`strftime`, 集計関数 `AVG`, `MAX` 等) を用いた時間単位グルーピングと集計。
    - SQLite のウィンドウ関数 (`ROW_NUMBER()`) の活用 (ダウンサンプリング `every_nth`)。
    - Unix タイムスタンプの整数除算を利用した時間グルーピング（ダウンサンプリング `aggregate`）。
- **Prisma Client:**
    -基本的な CRUD 操作 (`createMany`, `findMany`, `deleteMany`)。
    -複雑な SQL を実行するための `prisma.$queryRaw` と `Prisma.sql` タグ付きテンプレートリテラル。
    -`distinct` オプションによるユニークなキーの取得。
    - SQLite で `BigInt` が返る場合の `Number()` による型変換。
- **Next.js (App Router):**
    - Route Handlers による API 実装。
    - Client Components (`"use client"`) での状態管理 (`useState`, `useEffect`, `useCallback`) と API フェッチ。
- **UI 実装:**
    - Tailwind CSS によるダークモードスタイリング。
    - Chart.js (`react-chartjs-2`) と `chartjs-adapter-date-fns` を用いた時系列グラフの描画とカスタマイズ。
    - Zod による API の入力バリデーション。

## API エンドポイント

ベース URL: `/api`

### `GET /api/keys`

- **説明:** データベースに登録されているユニークなキーの一覧を取得します。
- **レスポンス:** `string[]` (キー名の配列)
  ```json
  ["sensor_A", "sensor_B"]
  ```

### `POST /api/data`

- **説明:** 新しい時系列データを登録します。単一オブジェクトまたはオブジェクトの配列を受け付けます。
- **リクエストボディ:**
  ```json
  // 単一データ
  { "key": "sensor_A", "timestamp": 1678886400, "value": 25.5 }
  // または配列データ
  [
    { "key": "sensor_A", "timestamp": 1678886400, "value": 25.5 },
    { "key": "sensor_B", "timestamp": 1678886400, "value": 50.1 }
  ]
  ```
- **レスポンス (成功時):** `201 Created`
  ```json
  { "count": 1 } // 挿入されたレコード数
  ```
- **レスポンス (エラー時):** `400 Bad Request`, `500 Internal Server Error`

### `GET /api/data`

- **説明:** 指定されたキーの生データを取得します。時間範囲は任意です。
- **クエリパラメータ:**
    - `key` (必須): 取得するデータのキー (例: `sensor_A`)
    - `start` (任意): 開始タイムスタンプ (Unix秒)
    - `end` (任意): 終了タイムスタンプ (Unix秒)
- **レスポンス:** `TimeSeriesPoint[]`
  ```json
  [
    { "id": 1, "timestamp": 1678886400, "key": "sensor_A", "value": 25.5, "createdAt": "..." },
    { "id": 2, "timestamp": 1678886460, "key": "sensor_A", "value": 25.7, "createdAt": "..." }
  ]
  ```

### `GET /api/data/aggregated`

- **説明:** 指定されたキーのデータを時間間隔ごとに集計して取得します。
- **クエリパラメータ:**
    - `key` (必須): キー名
    - `interval` (必須): 集計間隔 (`minute`, `hour`, `day`)
    - `aggregation` (必須): 集計方法 (`avg`, `max`, `min`, `sum`, `count`)
    - `start` (任意): 開始タイムスタンプ (Unix秒)
    - `end` (任意): 終了タイムスタンプ (Unix秒)
- **レスポンス:** `{ timestamp: number; value: number }[]` (集計結果のタイムスタンプと値の配列)
  ```json
  [
    { "timestamp": 1678886400, "value": 25.6 }, // 該当時間の平均値など
    { "timestamp": 1678890000, "value": 26.1 }
  ]
  ```

### `GET /api/data/downsampled`

- **説明:** 指定されたキーのデータをダウンサンプリング（間引き）して取得します。
- **クエリパラメータ:**
    - `key` (必須): キー名
    - `method` (必須): ダウンサンプリング方法 (`every_nth` または `aggregate`)
    - `factor` (必須): `method=every_nth` の場合は抽出間隔 (N番目ごと)、`method=aggregate` の場合は集計時間間隔 (秒)。正の整数。
    - `start` (任意): 開始タイムスタンプ (Unix秒)
    - `end` (任意): 終了タイムスタンプ (Unix秒)
- **レスポンス:** `{ timestamp: number; value: number }[]` (ダウンサンプリング結果の配列)
  ```json
  [
    { "timestamp": 1678886400, "value": 25.5 },
    { "timestamp": 1678886700, "value": 25.8 } // N件目または時間間隔の集計値
  ]
  ```

### `GET /api/data/latest`

- **説明:** 指定されたキーの最新 N 件のデータを取得します。
- **クエリパラメータ:**
    - `key` (必須): キー名
    - `limit` (任意): 取得する件数 (デフォルト: 10、正の整数)
- **レスポンス:** `TimeSeriesPoint[]` (取得したデータの配列、時系列昇順)
  ```json
  [
    { "id": 999, "timestamp": 1678972500, "key": "sensor_A", "value": 28.1, "createdAt": "..." },
    { "id": 1000, "timestamp": 1678972800, "key": "sensor_A", "value": 28.0, "createdAt": "..." }
  ]
  ```

## 技術スタック

- Next.js (App Router)
- TypeScript
- Prisma
- SQLite
- Tailwind CSS (with Dark Mode)
- Chart.js (react-chartjs-2, chartjs-adapter-date-fns)
- Zod (入力バリデーション)

## 使い方

1. `npm install` で依存関係をインストールします。
2. `npx prisma db seed` で初期データを投入します（過去24時間分のダミーデータが生成されます）。
3. `npm run dev` で開発サーバーを起動します (http://localhost:3001)。
4. **データ登録:** 上部のフォームでキーと値を入力し「Register」ボタンをクリックします。
5. **データ取得・表示:**
    - 「Fetch & Display Data」セクションで、表示したいデータのキーを選択します。
    - Fetch Method (Raw, Aggregated, Downsampled, Latest) を選択します。
    - 必要に応じて時間範囲や各メソッド固有のパラメータ（Interval, Aggregation, Factor, Limit）を設定します。
    - 「Fetch & Display Data」ボタンをクリックすると、下部にグラフが表示されます。
