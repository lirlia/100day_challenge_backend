# Day 18 - Expandable REST API

Stripe API の `expand` パラメータのように、関連データを動的に展開できる REST API を実装します。

https://github.com/user-attachments/assets/c130485b-7fa5-4929-90ff-760a053e4215

[100日チャレンジ day18](https://zenn.dev/gin_nazo/scraps/f84a82218807b9)

## 機能

- 投稿 (`Post`)、ユーザー (`User`)、プロフィール (`Profile`)、コメント (`Comment`) のデータモデルに基づいた REST API。
- `/api/posts` エンドポイントで投稿一覧を取得。
- GET リクエスト時に `expand` クエリパラメータで関連データを指定して展開。
  - カンマ区切りで複数の関連を指定可能。
  - ドット (`.`) でネストした関連を指定可能 (例: `comments.author`)。
- `max_depth` クエリパラメータで展開する階層の深さを制限 (デフォルト: 2)。

## アプリケーション概要

このアプリケーションは、ブログ投稿とその関連データ（著者、コメント、プロファイル）を管理するシンプルなシステムです。最大の特徴は、`/api/posts` エンドポイントにおいて `expand` と `max_depth` クエリパラメータを使用することで、取得するデータの構造を柔軟に制御できる点です。これにより、クライアントは必要なデータだけを効率的に取得できます。
ルートページ (`/`) では、この機能を利用した投稿一覧が表示され、チェックボックスで展開する関連データをインタラクティブに選択できます。

## API エンドポイント

### `GET /api/posts`

投稿の一覧を取得します。

#### クエリパラメータ

- `expand` (string, オプショナル):
  - カンマ区切りで展開したい関連名を指定します。
  - ネストした関連はドット (`.`) で繋げます。
  - 指定可能な関連名: `author`, `comments`, `comments.author`, `comments.author.profile` など (スキーマに定義されているもの)
  - 例: `/api/posts?expand=author` (各投稿に著者情報を付与)
  - 例: `/api/posts?expand=author,comments.author` (各投稿に著者情報と、各コメントにそのコメントの著者情報を付与)
- `max_depth` (number, オプショナル):
  - `expand` で展開する階層の最大深度を指定します。
  - デフォルトは `2` です。
  - 例: `/api/posts?expand=comments.author.profile&max_depth=3` (コメントの著者のプロフィールまで展開)
  - 例: `/api/posts?expand=comments.author.profile&max_depth=2` (コメントの著者まで展開、プロフィールは展開されない)

#### レスポンス

- 成功時 (200 OK): Post オブジェクトの配列。`expand` パラメータに基づいて関連データが含まれます。
- エラー時 (500 Internal Server Error): エラー情報を含む JSON オブジェクト。

## データモデル (Prisma)

```prisma
model User {
  id       Int       @id @default(autoincrement())
  email    String    @unique
  name     String?
  posts    Post[]
  comments Comment[]
  profile  Profile?
}

model Profile {
  id     Int     @id @default(autoincrement())
  bio    String?
  userId Int     @unique
  user   User    @relation(fields: [userId], references: [id])
}

model Post {
  id        Int       @id @default(autoincrement())
  title     String
  content   String?
  published Boolean   @default(false)
  authorId  Int
  author    User      @relation(fields: [authorId], references: [id])
  comments  Comment[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Comment {
  id        Int      @id @default(autoincrement())
  text      String
  postId    Int
  post      Post     @relation(fields: [postId], references: [id])
  authorId  Int
  author    User     @relation(fields: [authorId], references: [id])
  createdAt DateTime @default(now())
}
```

## 画面構成

- `/`: 投稿一覧ページ。投稿のタイトル、内容、作成者、コメントなどを表示します。ページ上部のチェックボックスで、表示する関連データ（`expand` パラメータ）を動的に変更できます。

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
   # スキーマをDBに適用
   npx prisma migrate deploy
   # シードデータを投入 (既存データは削除されます)
   npx prisma db seed
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
- Linter エラー (Prisma 型インポート) が残っていますが、動作には影響しない見込みです。
