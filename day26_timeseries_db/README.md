# Day 26: 簡易 時系列データベース on SQLite

SQLite をバックエンドとして使用し、時系列データの格納、取得、集計、ダウンサンプリング、ギャップフィル（一部）を行う簡易的な時系列データベース API とその UI を実装します。

## 主な機能

- データ登録 API (`POST /api/data`)
- 時間範囲データ取得 API (`GET /api/data`)
- 時間ベース集計 API (`GET /api/data/aggregated`)
- ダウンサンプリング API (`GET /api/data/downsampled`)
- 最新 N 件取得 API (`GET /api/data/latest`)
- (発展) ギャップフィル API (`GET /api/data/gapfilled`)
- 上記 API を操作し、結果をグラフ表示する Web UI

## 学習ポイント

- SQLite での時系列データに適したテーブル設計とインデックス活用
- `strftime` や算術演算を用いた SQL での時間単位グルーピングと集計
- SQLite のウィンドウ関数 (`ROW_NUMBER`, `LAG`) の活用 (ダウンサンプリング、ギャップフィル)
- Prisma Client (`$queryRaw`) を用いた複雑な SQL の実行
- Chart.js によるデータ可視化

## 技術スタック

- Next.js (App Router)
- TypeScript
- Prisma
- SQLite
- Tailwind CSS
- Chart.js
