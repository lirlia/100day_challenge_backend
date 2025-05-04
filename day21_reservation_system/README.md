# Day 21 - Facility Reservation System

カレンダー形式で設備の空き状況を確認し、予約・管理を行うシステム。

https://github.com/user-attachments/assets/e1d4485c-fc05-4269-ae3d-35a82f3ee0c4

[100日チャレンジ day21](https://zenn.dev/gin_nazo/scraps/3acda5cc4111f2)

## 主要機能

- **設備管理:** 設備の登録・一覧表示・削除 (`/facilities`)
- **設備詳細・予約:** 設備ごとの詳細情報と予約カレンダー表示 (`/facilities/[id]`)。
    - カレンダー (`react-big-calendar`) 上で空き時間を選択して予約作成。
    - 予約済みのスロットをクリックすると簡易情報を表示。
- **マイ予約:** 現在選択中のユーザーの予約一覧表示とキャンセル (`/reservations/my`)
- **ユーザー切り替え:** ヘッダーのドロップダウンで操作ユーザーを切り替え (状態管理: Zustand)

## 技術スタック

- Next.js (App Router, v15 / Webpack Dev Server)
- TypeScript
- Prisma
- SQLite
- Tailwind CSS
- react-big-calendar
- date-fns
- Zustand (クライアント状態管理)

## データモデル (`prisma/schema.prisma`)

```prisma
model User {
  id           Int           @id @default(autoincrement())
  name         String
  reservations Reservation[]
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt
}

model Facility {
  id                 Int           @id @default(autoincrement())
  name               String
  description        String?
  capacity           Int?          // 定員 (Optional)
  availableStartTime String?       // HH:mm format (Optional)
  availableEndTime   String?       // HH:mm format (Optional)
  reservations       Reservation[]
  createdAt          DateTime      @default(now())
  updatedAt          DateTime      @updatedAt
}

model Reservation {
  id         Int      @id @default(autoincrement())
  startTime  DateTime
  endTime    DateTime
  facility   Facility @relation(fields: [facilityId], references: [id], onDelete: Cascade)
  facilityId Int
  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId     Int
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([facilityId, startTime, endTime])
}
```

## APIエンドポイント (`app/api/...`)

- `GET /api/facilities`: 設備一覧取得
- `POST /api/facilities`: 設備新規作成
- `GET /api/facilities/:id`: 設備詳細取得
- `PUT /api/facilities/:id`: 設備更新 (今回はUI未実装)
- `DELETE /api/facilities/:id`: 設備削除
- `GET /api/reservations?facilityId=...&start=...&end=...`: 指定設備・期間の予約取得 (カレンダー用)
- `GET /api/reservations?userId=...`: 指定ユーザーの予約取得 (マイ予約用)
- `POST /api/reservations`: 予約新規作成 (重複チェックあり)
- `DELETE /api/reservations/:id`: 予約削除

## 画面構成

- `/`: トップページ
- `/facilities`: 設備管理ページ (一覧表示、新規作成、削除)
- `/facilities/[id]`: 設備詳細・予約ページ (カレンダー表示、予約作成)
- `/reservations/my`: マイ予約ページ (一覧表示、キャンセル)

## 開始方法

1. **依存パッケージをインストール**
   ```bash
   npm install
   ```

2. **データベースの準備**
   ```bash
   # 初回またはスキーマ変更時
   npx prisma migrate deploy
   npx prisma db seed # 初期データ投入
   ```

3. **開発サーバーを起動**
   ```bash
   npm run dev
   ```
   ブラウザで [http://localhost:3001](http://localhost:3001) を開くと結果が表示されます。

## その他

- 予約時の時間帯重複チェックは実装済み。
- 設備ごとの予約可能時間帯 (availableStartTime/EndTime) のチェックは未実装 (APIのTODOコメントあり)。
- エラーハンドリングは基本的なもののみ。
- 認証・認可は簡略化 (ユーザー切り替えのみ)。
