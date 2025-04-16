# Day 3: Matching App

タップルのようなシンプルなマッチングアプリです。

## アプリ概要

- ユーザーは他のユーザーのプロフィールカードを見て「いいね」または「スキップ」を選択します。
- 相互に「いいね」した場合にマッチングが成立します。
- マッチング成立時にはモーダル表示とデスクトップ通知（任意）が行われます。
- マッチングした相手の一覧を確認できます。
- 画面上部のドロップダウンで簡単に操作ユーザーを切り替えられます。

## 使用技術

- Next.js (App Router)
- TypeScript
- Prisma (ORM)
- SQLite (Database)
- Tailwind CSS (Styling)

## データモデル

- `User`: ユーザー情報（名前、年齢、性別、自己紹介、プロフィール画像URL）
- `Swipe`: スワイプアクション履歴（誰が、誰を、いいね/スキップしたか）
- `Match`: マッチング成立情報（ユーザーペア）

## API エンドポイント

- `GET /api/users?currentUserId={id}`: 指定ユーザーに対する次のスワイプ候補を1件取得
- `POST /api/swipes`: スワイプアクション（いいね/スキップ）を記録。相互いいねでマッチ作成。
- `GET /api/matches?userId={id}`: 指定ユーザーのマッチング相手リストを取得。

## 主要画面

- `/`: スワイプ画面 (プロフィールカード、いいね/スキップボタン)
- `/matches`: マッチングリスト画面

## 起動方法

```bash
# 依存関係インストール
npm install

# データベースマイグレーション & シード実行
npx prisma migrate dev --name init # 初回のみ or スキーマ変更時
npx prisma db seed

# 開発サーバー起動
npm run dev
```

ブラウザで `http://localhost:3000` を開きます。 
