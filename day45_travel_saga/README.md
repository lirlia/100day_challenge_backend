# Day45 - 旅行予約Saga体験

## 概要
複数サービス（ホテル・航空券・レンタカー）を一括で予約できる旅行予約システムです。各サービスは独立したAPIで管理され、Sagaパターンで一連の予約フローを制御します。どれか一つでも失敗した場合は、すでに成功した予約を補償（キャンセル）します。

## 主な機能
- 旅行予約フォーム（旅行日程・人数など入力）
- 予約進行状況タイムライン（各サービスの進捗・補償も見える）
- 予約履歴一覧・詳細
- ユーザー切替UI
- Sagaパターンによる状態管理・補償処理

## 予約フロー
1. ユーザーが旅行予約を開始
2. サーバー側で以下を順次実行
    - ホテル予約API呼び出し
    - 航空券予約API呼び出し
    - レンタカー予約API呼び出し
3. 途中で失敗した場合は、すでに予約済みのサービスを補償APIでキャンセル
4. すべて成功した場合のみ「予約確定」

## DB設計（イメージ）
- users（ユーザー情報）
- reservations（旅行予約全体、状態管理、ユーザー紐付け）
- reservation_steps（各サービスごとの予約・補償状態、予約ID紐付け）
    - type: hotel/flight/car
    - status: pending/success/failure/compensating/compensated
    - reservation_id: 外部サービスの予約番号（あれば）

## API設計（イメージ）
- POST `/api/reservations` … 旅行予約開始
- GET `/api/reservations/:id` … 予約詳細・進行状況取得
- POST `/api/reservations/:id/cancel` … 予約全体のキャンセル（補償処理）
- 内部API（サーバー側で呼び出し）
    - `/api/hotel/reserve` `/api/hotel/cancel`
    - `/api/flight/reserve` `/api/flight/cancel`
    - `/api/car/reserve` `/api/car/cancel`

## 学びポイント
- Sagaパターンの状態管理（進行中/補償/完了）
- 各サービスのAPI分離と補償処理
- 状態遷移の可視化
- エラー発生時のロールバック体験

## ディレクトリ構成（予定）
```
day45_travel_saga/
├── app/
│   ├── api/
│   │   ├── reservations/
│   │   ├── hotel/
│   │   ├── flight/
│   │   └── car/
│   ├── (pages)/
│   │   ├── reservations/
│   │   └── form/
│   ├── _actions/
│   ├── _lib/
│   ├── layout.tsx
│   ├── globals.css
│   └── page.tsx
├── lib/
│   ├── db.ts
│   └── types/
├── db/
│   └── dev.db
├── PROGRESS.md
├── README.md
├── package.json
└── ...
```

---
