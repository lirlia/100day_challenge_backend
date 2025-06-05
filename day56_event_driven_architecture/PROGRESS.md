# PROGRESS

## Day 56: イベント駆動型システム (Go)

- [x] 仕様定義
- [x] プロジェクト初期セットアップ (ディレクトリ構造、Goモジュール)
- [x] メッセージブローカー (NATS) のセットアップ (docker-compose.yml 作成、接続・送受信ロジック実装 (`internal/event/*`))
- [x] 購入サービス (Order Service) 実装
  - [x] APIエンドポイント (注文受付: `POST /orders`, `GET /orders/{id}`)
  - [x] イベント発行 (`OrderCreated`)
  - [x] データモデルとDB (SQLite: `orders`, `order_items` テーブル)
- [x] 在庫サービス (Inventory Service) 実装
  - [x] イベントリッスン (`OrderCreated`)
  - [x] 在庫確認・確保ロジック (`AttemptReservation`)
  - [x] イベント発行 (`StockReserved`, `StockReservationFailed`)
  - [x] データモデルとDB (SQLite: `products` テーブル)
- [x] 配送サービス (Shipping Service) 実装
  - [x] イベントリッスン (`StockReserved`)
  - [x] 配送手配ロジック (ダミー処理、DB記録)
  - [x] イベント発行 (`ShipmentInitiated`, `ShipmentCompleted`, `ShipmentFailed`)
  - [x] データモデルとDB (SQLite: `shipments`, `shipment_items` テーブル)
- [x] サービス間連携テスト
  - [x] 正常な注文フロー (注文作成 → 在庫予約 → 配送処理 → 注文完了)
  - [x] 在庫不足のケース (在庫不足検出 → 注文キャンセル)
  - [x] 配送失敗のケース (配送失敗 → 在庫補償 → 注文失敗マーク)
- [x] README更新 
