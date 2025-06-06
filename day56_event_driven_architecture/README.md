# Day 56 - イベント駆動型システム (Go + Web UI)

## 概要

このプロジェクトでは、Go言語を使用してイベント駆動型のマイクロサービスシステムを構築します。
注文処理、在庫管理、配送処理をそれぞれ独立したサービスとして実装し、NATS メッセージブローカーを介した非同期イベント通信で連携させています。
また、Next.js を使用したWebユーザーインターフェースも提供し、実際の注文操作を体験できます。

https://github.com/user-attachments/assets/aa9eeb48-e776-43ec-9be8-bc57d45ef8fe

[100日チャレンジ day56](https://zenn.dev/gin_nazo/scraps/ae9e6148264025)

## システム構成要素

### マイクロサービス

- **注文サービス (Order Service)**: ユーザーからの注文を受け付け、注文イベントを発行
- **在庫サービス (Inventory Service)**: 商品の在庫を管理し、注文に応じて在庫を確保
- **配送サービス (Shipping Service)**: 在庫確保後、商品の配送を手配

### フロントエンド

- **Web UI (Next.js)**: ユーザーが商品を選択し、注文を作成・確認できるWebインターフェース

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

### バックエンド
- **言語**: Go 1.21+
- **メッセージブローカー**: NATS 2.9
- **データベース**: SQLite 3
- **主要ライブラリ**:
  - `github.com/nats-io/nats.go` - NATS クライアント
  - `github.com/mattn/go-sqlite3` - SQLite ドライバー
  - `github.com/google/uuid` - UUID 生成

### フロントエンド
- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS
- **状態管理**: React Hooks
- **APIクライアント**: Fetch API

### インフラストラクチャ
- **コンテナ**: Docker Compose

## 起動方法

### 前提条件

- Go 1.21+ がインストール済み
- Docker がインストール済み
- Git リポジトリをクローン済み

### 手順

#### 1. プロジェクトディレクトリに移動

```bash
cd /path/to/100day_challenge_backend/day56_event_driven_architecture
```

#### 2. Go依存関係のインストール

```bash
go mod download
```

#### 3. NATS サーバー起動

```bash
# バックグラウンドでNATSコンテナを起動
docker-compose up -d

# 起動確認 (NATS管理画面: http://localhost:8222)
docker-compose logs nats
```

#### 4. 各マイクロサービス起動

**ターミナル1: 在庫サービス**
```bash
go run cmd/inventory_service/main.go
```

**ターミナル2: 配送サービス**
```bash
go run cmd/shipping_service/main.go
```

**ターミナル3: 注文サービス**
```bash
go run cmd/order_service/main.go
```

または、バックグラウンドで一括起動：
```bash
# 在庫サービス
go run cmd/inventory_service/main.go &

# 配送サービス  
go run cmd/shipping_service/main.go &

# 注文サービス (HTTP API: localhost:8080)
go run cmd/order_service/main.go &

# プロセス確認
jobs
```

#### 5. 動作確認

```bash
# サービスの起動確認
curl http://localhost:8080/orders/test || echo "注文サービス起動中..."

# NATSの接続確認
curl http://localhost:8222/ || echo "NATS管理画面アクセス可能"
```

#### 6. 初期データ確認

在庫サービスは起動時に以下の商品データを自動で作成します：

**メイン商品（フロントエンド対応）:**
- `keyboard`: キーボード (在庫: 10個)
- `mouse`: マウス (在庫: 5個)  
- `monitor`: モニター (在庫: 3個)
- `headset`: ヘッドセット (在庫: 7個)

**互換性商品（既存テスト用）:**
- `prod001`: Super Keyboard (在庫: 10個)
- `prod002`: Ergonomic Mouse (在庫: 5個)  
- `prod003`: 4K Monitor (在庫: 3個)

#### 7. Web UI起動

**ターミナル4: フロントエンド**
```bash
cd web-ui
npm install
npm run dev
```

Web UI は http://localhost:3001 でアクセス可能です。

### Web UI の使用方法

1. ブラウザで http://localhost:3001 にアクセス
2. ユーザーを選択（user1, user2, user3 から選択可能）
3. 商品一覧から希望の商品をカートに追加
4. 「注文を確定する」ボタンで注文を作成
5. 注文履歴でリアルタイムの注文状況を確認
   - 「処理中」→「配送待ち」→「完了」のステータス変化
   - 在庫不足の場合は「在庫不足でキャンセル」
   - 配送失敗の場合は「配送失敗」

### 停止方法

#### バックグラウンド起動の場合

```bash
# バックグラウンドジョブの確認
jobs

# 全サービス停止
kill %1 %2 %3

# または個別停止
kill %1  # 在庫サービス
kill %2  # 配送サービス
kill %3  # 注文サービス
```

#### 個別ターミナルの場合

各ターミナルで `Ctrl+C` を押してサービスを停止

#### NATS停止

```bash
docker-compose down
```

### トラブルシューティング

#### ポート競合エラー
```bash
# ポート8080が使用中の場合
lsof -i :8080
kill -9 <PID>
```

#### NATS接続エラー
```bash
# NATSコンテナ状態確認
docker-compose ps

# NATS再起動
docker-compose restart nats
```

#### 依存関係エラー
```bash
# Go モジュール再取得
go mod tidy
go mod download
```

## クイックスタート（簡単起動）

すぐに動作確認したい場合は以下のコマンドを順番に実行：

```bash
# 1. プロジェクトディレクトリに移動
cd day56_event_driven_architecture

# 2. NATS起動
docker-compose up -d

# 3. 依存関係インストール
go mod download

# 4. 全マイクロサービス起動（バックグラウンド）
go run cmd/inventory_service/main.go &
go run cmd/shipping_service/main.go &
go run cmd/order_service/main.go &

# 5. Web UI起動
cd web-ui
npm install
npm run dev &
cd ..

# 6. 動作確認
echo "バックエンド起動完了。Web UI: http://localhost:3001"
echo "API動作確認:"
sleep 5
curl -X POST http://localhost:8080/api/orders \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "items": [{"productId": "keyboard", "quantity": 2, "price": 15000}]}'

# 7. 停止
kill %1 %2 %3 %4  # 全バックグラウンドプロセス停止
docker-compose down
```

### 推奨: Web UIでのテスト

コマンドラインでのAPIテストより、Web UI (http://localhost:3001) での操作をお勧めします：
- 直感的なユーザーインターフェース
- リアルタイムの注文状況更新
- 複数ユーザーでの同時テスト
- 注文履歴の可視化

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
