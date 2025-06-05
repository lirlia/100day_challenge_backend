# Day 56 - イベント駆動型システム (Go)

## 概要

このプロジェクトでは、Go言語を使用してイベント駆動型のマイクロサービスシステムを構築します。
注文処理、在庫管理、配送処理をそれぞれ独立したサービスとして実装し、NATS メッセージブローカーを介した非同期イベント通信で連携させています。

## システム構成要素

### マイクロサービス

- **注文サービス (Order Service)**: ユーザーからの注文を受け付け、注文イベントを発行
- **在庫サービス (Inventory Service)**: 商品の在庫を管理し、注文に応じて在庫を確保
- **配送サービス (Shipping Service)**: 在庫確保後、商品の配送を手配

### インフラストラクチャ

- **NATS**: サービス間のイベント通信を仲介するメッセージブローカー
- **SQLite**: 各サービスが独立したデータベースを持つ
- **Docker Compose**: NATS サーバーの起動管理

## アーキテクチャ

### イベントフロー

#### 正常フロー
```
注文作成 → OrderCreatedEvent → 在庫予約 → StockReservedEvent → 配送開始 → ShipmentCompletedEvent → 注文完了
```

#### 在庫不足フロー  
```
注文作成 → OrderCreatedEvent → 在庫不足検出 → StockReservationFailedEvent → 注文キャンセル
```

#### 配送失敗フロー
```
注文作成 → OrderCreatedEvent → 在庫予約 → StockReservedEvent → 配送失敗 → ShipmentFailedEvent → 在庫補償 + 注文失敗
```

### データベース設計

各サービスが独立したSQLiteデータベースを持ちます：

- **注文サービス**: `orders`, `order_items` テーブル
- **在庫サービス**: `products` テーブル
- **配送サービス**: `shipments`, `shipment_items` テーブル

## 技術スタック

- **言語**: Go 1.21+
- **メッセージブローカー**: NATS 2.9
- **データベース**: SQLite 3
- **コンテナ**: Docker Compose
- **主要ライブラリ**:
  - `github.com/nats-io/nats.go` - NATS クライアント
  - `github.com/mattn/go-sqlite3` - SQLite ドライバー
  - `github.com/google/uuid` - UUID 生成

## 起動方法

### 1. NATS サーバー起動

```bash
docker-compose up -d
```

### 2. 各マイクロサービス起動

```bash
# 在庫サービス
go run cmd/inventory_service/main.go &

# 配送サービス  
go run cmd/shipping_service/main.go &

# 注文サービス
go run cmd/order_service/main.go &
```

### 3. 停止

```bash
# サービス停止
kill %1 %2 %3

# NATS停止
docker-compose down
```

## API仕様

### 注文サービス (ポート: 8080)

#### 注文作成
```bash
POST /orders
Content-Type: application/json

{
  "userId": "user123",
  "items": [
    {
      "productId": "prod001",
      "quantity": 2,
      "price": 5000
    }
  ]
}
```

#### 注文取得
```bash
GET /orders/{orderId}
```

## テスト方法

### 1. 正常な注文フロー
```bash
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "items": [
      {"productId": "prod001", "quantity": 2, "price": 5000},
      {"productId": "prod002", "quantity": 1, "price": 3000}
    ]
  }'
```

### 2. 在庫不足のテスト
```bash
curl -X POST http://localhost:8080/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user456", 
    "items": [
      {"productId": "prod001", "quantity": 20, "price": 5000}
    ]
  }'
```

### 3. 注文状況確認
```bash
curl -X GET http://localhost:8080/orders/{注文ID}
```

## イベント設計

### 定義済みイベント

- `OrderCreatedEvent`: 注文作成時
- `StockReservedEvent`: 在庫予約成功時
- `StockReservationFailedEvent`: 在庫予約失敗時
- `ShipmentInitiatedEvent`: 配送開始時
- `ShipmentCompletedEvent`: 配送完了時
- `ShipmentFailedEvent`: 配送失敗時

### 注文ステータス

- `PENDING`: 注文作成済み
- `AWAITING_SHIPMENT`: 在庫確保済み、配送待ち
- `COMPLETED`: 配送完了
- `CANCELLED_NO_STOCK`: 在庫不足によりキャンセル
- `SHIPMENT_FAILED`: 配送失敗

## 学習ポイント

### イベント駆動アーキテクチャ
- サービス間の疎結合化
- 非同期処理による可用性向上
- イベントソーシングの基礎概念

### 分散システム設計
- 補償トランザクション (Saga パターン)
- データ整合性の管理
- エラーハンドリングとリトライ機構

### マイクロサービス
- 単一責任原則の適用
- 独立したデータストア
- サービス間通信パターン

## 制約事項

- SQLite の `FOR UPDATE` 構文は未サポートのため削除済み
- 配送処理は90%の成功率でシミュレーション
- 認証・認可機能は簡素化
- 本格的なエラーリトライ機構は未実装

## 今後の拡張可能性

- Kubernetes での本格運用
- 分散トレーシング (OpenTelemetry)
- メトリクス監視 (Prometheus)
- イベントストアの永続化
- より複雑な Saga パターンの実装 
