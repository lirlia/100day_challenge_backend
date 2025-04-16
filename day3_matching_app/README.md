# Day 3: Matching App

異性（または同性）のプロフィールを見て「いいね」か「スキップ」を選択し、相互に「いいね」となった場合にマッチングが成立するWebアプリケーションです。

[100日チャレンジ day3 の記録](https://zenn.dev/gin_nazo/scraps/bd59dbec76935d)

https://github.com/user-attachments/assets/3e7eb151-18dd-44f6-b570-1b53f378af36

## 機能一覧

- ユーザープロフィール表示 (カード形式)
- プロフィールへの「いいね」アクション
- プロフィールへの「スキップ」アクション
- 相互いいねによるマッチング成立ロジック
- マッチング成立時の画面通知
- マッチングしたユーザーの一覧表示
- 開発用の簡易ユーザー切り替え機能

## ER図

```mermaid
erDiagram
    User {
        Int id PK
        String name
        DateTime createdAt
        DateTime updatedAt
    }

    Profile {
        Int id PK
        Int userId FK
        String imageUrl
        String bio
        Int age
        String gender "Gender enum: MALE | FEMALE | OTHER"
    }

    Like {
        Int id PK
        Int fromUserId FK
        Int toUserId FK
        DateTime createdAt
    }

    Match {
        Int id PK
        Int user1Id FK
        Int user2Id FK
        DateTime createdAt
    }

    User ||--o{ Profile : "has one"
    User ||--o{ Like : "sends"
    User ||--o{ Like : "receives"
    User ||--o{ Match : "matches as user1"
    User ||--o{ Match : "matches as user2"
    Profile ||--|| User : "belongs to"
    Like }o--|| User : "sent by"
    Like }o--|| User : "received by"
    Match }o--|| User : "user1"
    Match }o--|| User : "user2"
```

## シーケンス図 (オプション)

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Database

    User->>Frontend: プロフィールカード表示要求
    Frontend->>API: GET /api/users/recommendations (自分以外の未アクションユーザー取得)
    API->>Database: ユーザー情報とLike情報を取得
    Database-->>API: 未アクションユーザーリスト
    API-->>Frontend: プロフィールデータ
    Frontend-->>User: プロフィールカード表示

    User->>Frontend: 「いいね」ボタンクリック
    Frontend->>API: POST /api/likes { toUserId: X }
    API->>Database: Likeレコード作成
    API->>Database: 相手からのLikeが存在するか確認 (相互いいねチェック)
    alt 相互いいね成立
        API->>Database: Matchレコード作成
        Database-->>API: マッチング成功
        API-->>Frontend: { matched: true }
        Frontend->>User: マッチング通知表示
    else 相互いいね不成立
        Database-->>API: 片方向いいね
        API-->>Frontend: { matched: false }
        Frontend->>User: 次のプロフィール表示
    end

    User->>Frontend: マッチ一覧表示要求
    Frontend->>API: GET /api/matches
    API->>Database: ログインユーザーのMatchレコード取得
    Database-->>API: マッチング相手リスト
    API-->>Frontend: マッチング相手データ
    Frontend-->>User: マッチング一覧表示
```

## データモデル

- **User**: アプリケーションのユーザー。基本的な認証情報（今回は名前のみ）を持つ。
- **Profile**: ユーザーの詳細情報（画像URL、自己紹介、年齢、性別）。User と 1対1 の関係。
- **Like**: あるユーザーから別のユーザーへの「いいね」アクションを記録。`fromUserId` (いいねした人) と `toUserId` (いいねされた人) を持つ。
- **Match**: 相互に「いいね」が成立したユーザーペアを記録。`user1Id` と `user2Id` を持つ。

## 画面構成

- **プロフィール表示/スワイプ画面**: メイン画面。ログインユーザー以外のプロフィールがカード形式で表示され、「いいね」「スキップ」ボタンで操作する。
- **マッチング一覧画面**: ログインユーザーがこれまでにマッチングした相手の一覧を表示する。
- **ユーザー切り替え**: ヘッダーなどに配置し、開発中に操作ユーザーを簡単に切り替えるためのドロップダウンなど。

## 使用技術スタック (テンプレート標準)

- フレームワーク: Next.js (App Router)
- 言語: TypeScript
- DB: SQLite
- ORM: Prisma
- API実装: Next.js Route Handlers
- スタイリング: Tailwind CSS
- パッケージ管理: npm
- コード品質: Biome (Lint & Format)

## 開始方法

1. **依存パッケージをインストール**
   ```bash
   npm install
   ```

2. **データベースの準備**
   ```bash
   # 初回またはスキーマ変更時
   npm run db:seed
   ```

3. **開発サーバーを起動**
   ```bash
   npm run dev
   ```
   ブラウザで [http://localhost:3001](http://localhost:3001) を開くと結果が表示されます。

## 注意事項

- このテンプレートはローカル開発環境を主眼としています。
- 本番デプロイには追加の考慮が必要です。
- エラーハンドリングやセキュリティは簡略化されています。
