# Day2 - シンプルECサイト

[100日チャレンジ day2 の記録](https://zenn.dev/gin_nazo/scraps/c76827570c4980)

https://github.com/user-attachments/assets/0bdc4c35-60dc-411b-8966-dbcecf2bee13

## 機能一覧
- 商品一覧表示
- 商品詳細表示
- カート機能（追加・削除・数量変更）
- 注文確定プロセス
- 注文履歴表示
- 価格変動履歴 (ProductPrice テーブル)
- 定期的な価格更新（フロントエンドトリガーによるデモ実装）

## ER図

```mermaid
erDiagram
    User {
        int id PK
        string name
        datetime createdAt
        datetime updatedAt
    }
    
    Product {
        int id PK
        string name
        string description
        string imageUrl
        int stock
        datetime createdAt
        datetime updatedAt
    }
    
    ProductPrice {
        int id PK
        int price
        datetime startDate
        int productId FK
    }
    
    Cart {
        int id PK
        int quantity
        int userId FK
        int productId FK
        int lastSeenPrice
        datetime createdAt
        datetime updatedAt
    }
    
    Order {
        int id PK
        int userId FK
        int totalPrice
        string status
        datetime createdAt
        datetime updatedAt
    }
    
    OrderItem {
        int id PK
        int orderId FK
        int productId FK
        int quantity
        int price
        datetime createdAt
        datetime updatedAt
    }
    
    User ||--o{ Cart : "has"
    User ||--o{ Order : "places"
    Product ||--o{ Cart : "added_to"
    Product ||--o{ OrderItem : "included_in"
    Product ||--o{ ProductPrice : "has"
    Order ||--o{ OrderItem : "contains"
```

## 価格更新時の処理フロー

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Database
    
    Note over User,Database: 商品をカートに追加するフロー
    User->>Frontend: 商品をカートに追加
    Frontend->>API: POST /api/cart
    API->>Database: 最新価格を取得
    API->>Database: カート情報を保存（lastSeenPrice に最新価格を設定）
    API-->>Frontend: カート情報を返却
    Frontend-->>User: カートに追加完了を表示
    
    Note over User,Database: 商品の価格変更が発生
    Database->>Database: 商品の価格が更新される
    
    Note over User,Database: 商品詳細を閲覧するフロー
    User->>Frontend: 商品詳細ページを閲覧
    Frontend->>API: POST /api/cart/update-last-seen
    API->>Database: カート内の lastSeenPrice を最新価格に更新
    API-->>Frontend: 更新完了
    
    Note over User,Database: 注文を確定するフロー
    User->>Frontend: 「注文を確定する」ボタンをクリック
    Frontend->>API: POST /api/orders
    API->>Database: 各商品の最新価格を取得
    API->>Database: lastSeenPrice と最新価格を比較
    
    alt 価格に変更がある場合
        API-->>Frontend: 409エラー + 変更商品情報
        Frontend->>API: カート情報を再取得
        API->>Database: カート情報取得
        API-->>Frontend: 最新価格を含むカート情報
        Frontend-->>User: 価格変更通知を表示
        User->>Frontend: 再度「注文を確定する」ボタンをクリック
    else 価格に変更がない場合
        API->>Database: 注文と注文明細を作成
        API->>Database: カート内の商品を削除
        API-->>Frontend: 注文完了情報
        Frontend-->>User: 注文完了画面を表示
    end
```

## データモデル
- 商品（Product）：名前、説明、画像URL、在庫数
- 価格履歴（ProductPrice）：商品ID、価格、適用開始日
- カート（Cart）：ユーザーID、商品ID、数量, lastSeenPrice
- 注文（Order）：ユーザーID、注文日、合計金額、ステータス
- 注文明細（OrderItem）：注文ID、商品ID、数量、価格（注文時の価格を記録）

## 画面構成
- ヘッダー：ロゴ、カートアイコン、ユーザー切替
- 商品一覧ページ：カード形式の商品表示
- 商品詳細ページ：商品情報、カートに追加ボタン
- カートページ：カート内商品一覧、数量変更、合計金額表示、注文ボタン
- 注文完了ページ：注文番号表示、ありがとうメッセージ
- 注文履歴ページ：過去の注文一覧

## 機能と技術
- Next.js App Router
- Prisma ORM
- SQLite データベース
- React Context（カート状態、ユーザー状態管理）
- Tailwind CSS（UI実装）

## 開始方法

1. 依存パッケージをインストールします：

```bash
npm install
```

2. 開発サーバーを起動します：

```bash
npm run dev
```

ブラウザで [http://localhost:3001](http://localhost:3001) を開くと結果が表示されます。

### データベースの確認

Prisma Studio を使用してデータベースの内容を確認・編集できます：

```bash
npx prisma studio
```


## 注意事項

- このテンプレートは開発環境のみを想定しています。
- 本番環境へのデプロイには追加の設定が必要です。
- エラー処理やセキュリティは簡略化されています。
