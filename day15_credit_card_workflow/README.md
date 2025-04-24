# Day 15: クレジットカード発行ワークフローシステム

## 1. 概要

クレジットカードの申し込みを受け付け、審査、発行、有効化に至るまでのワークフローを管理するシステムです。ステートマシンを用いて申請の状態遷移を管理し、各段階で実行可能なアクションを制御します。

## 2. 機能要件

*   **申請管理:**
    *   新規クレジットカード申請を受け付けます。
    *   申請情報（申請者名、メールアドレスなど）と現在のステータスを記録します。
    *   各申請の状態遷移履歴（いつ、誰が、どの状態からどの状態へ遷移したか）を記録します。
*   **ステートマシン:**
    *   定義された状態と遷移ルールに基づき、申請の状態を管理します（独自実装、ライブラリ不使用）。
    *   現在の状態に応じて、次に実行可能なアクション（遷移）を決定します。
    *   状態遷移は許可された操作によってのみ行われます。
*   **管理UI (`/admin`):**
    *   **左ペイン:**
        *   新規申請フォーム（申請者名、メールアドレス）。
        *   申請一覧をテーブル表示（ID、申請者名、現在の状態）。
        *   一覧から申請を選択すると、その詳細情報（ID、申請者、状態、履歴）を表示。
        *   選択された申請の現在の状態に基づき、**実行可能なアクションボタン**（例: 「初期審査開始」「承認」）を動的に表示し、クリックで状態遷移を実行。
    *   **右ペイン:**
        *   選択された申請が現在どのワークフロー段階にあるかを**グラフィカルに表示**。
        *   状態を表すボックスと遷移を示す矢印で構成されたシンプルな図を描画し、現在の状態に対応するボックスをハイライト表示します。

## 3. データモデル

*   **`CreditCardApplication`:**
    *   `id`: String (UUID, Primary Key)
    *   `applicantName`: String
    *   `applicantEmail`: String
    *   `status`: `ApplicationStatus` (Enum) - 現在の状態
    *   `createdAt`: DateTime (自動設定)
    *   `updatedAt`: DateTime (自動更新)
    *   `histories`: Relation to `ApplicationHistory` (1対多)
*   **`ApplicationHistory`:**
    *   `id`: String (UUID, Primary Key)
    *   `applicationId`: String (Foreign Key to `CreditCardApplication`)
    *   `fromStatus`: `ApplicationStatus` (Enum) - 遷移前の状態
    *   `toStatus`: `ApplicationStatus` (Enum) - 遷移後の状態
    *   `timestamp`: DateTime (自動設定) - 遷移が発生した日時
    *   `notes`: String? - 遷移に関するメモ（例: 否決理由、担当者コメントなど）
    *   `application`: Relation to `CreditCardApplication` (多対1)
*   **`ApplicationStatus` (Enum):**
    *   `APPLIED` (申込受付)
    *   `SCREENING` (初期審査中)
    *   `IDENTITY_VERIFICATION_PENDING` (本人確認待ち)
    *   `CREDIT_CHECK` (信用情報照会中)
    *   `MANUAL_REVIEW` (手動審査中)
    *   `APPROVED` (承認済み)
    *   `CARD_ISSUING` (カード発行準備中)
    *   `CARD_SHIPPED` (カード発送済み)
    *   `ACTIVE` (有効化済み)
    *   `REJECTED` (否決済み)
    *   `CANCELLED` (申込キャンセル)

## 4. 状態と遷移ルール

| 遷移アクション (Action Name)         | 遷移元状態 (From Status)                     | 遷移先状態 (To Status)                   | トリガー/条件                       |
| :----------------------------------- | :------------------------------------------- | :--------------------------------------- | :---------------------------------- |
| `SubmitApplication`                  | (初期状態)                                   | `APPLIED`                                | ユーザー申請                         |
| `StartScreening`                     | `APPLIED`                                    | `SCREENING`                              | システム/担当者操作                 |
| `RequestIdentityVerification`        | `SCREENING`                                  | `IDENTITY_VERIFICATION_PENDING`          | システム/担当者操作                 |
| `CompleteIdentityVerification`       | `IDENTITY_VERIFICATION_PENDING`              | `CREDIT_CHECK`                           | システム/担当者操作 (確認OK)      |
| `FailIdentityVerification`           | `IDENTITY_VERIFICATION_PENDING`              | `REJECTED`                               | システム/担当者操作 (確認NG)      |
| `StartCreditCheck`                   | `SCREENING`                                  | `CREDIT_CHECK`                           | システム/担当者操作 (本人確認不要時) |
| `PassCreditCheck`                    | `CREDIT_CHECK`                               | `APPROVED`                               | システム判断 (自動承認)           |
| `RequireManualReview`                | `CREDIT_CHECK`                               | `MANUAL_REVIEW`                          | システム判断 (自動判断不可)       |
| `FailCreditCheck`                    | `CREDIT_CHECK`                               | `REJECTED`                               | システム判断 (与信NG)             |
| `ApproveManually`                    | `MANUAL_REVIEW`                              | `APPROVED`                               | 担当者操作                         |
| `RejectManually`                     | `MANUAL_REVIEW`                              | `REJECTED`                               | 担当者操作                         |
| `StartCardIssuing`                   | `APPROVED`                                   | `CARD_ISSUING`                           | システム                           |
| `CompleteCardIssuing`                | `CARD_ISSUING`                               | `CARD_SHIPPED`                           | システム                           |
| `ActivateCard`                       | `CARD_SHIPPED`                               | `ACTIVE`                                 | ユーザー操作                       |
| `CancelApplication`                  | `APPLIED`, `SCREENING`, `IDENTITY_VERIFICATION_PENDING`, `CREDIT_CHECK`, `MANUAL_REVIEW` | `CANCELLED`                              | ユーザー操作                       |
| `RejectScreening` (否決追加)         | `SCREENING`                                  | `REJECTED`                               | 担当者操作 (初期審査で否決)        |
| `BackToScreening` (手動審査差戻し追加) | `MANUAL_REVIEW`                              | `SCREENING`                              | 担当者操作 (再確認等)              |

## 5. APIエンドポイント

*   **`POST /api/applications`**: 新規申請を作成
*   **`GET /api/applications`**: 全申請一覧を取得
*   **`GET /api/applications/[id]`**: 特定の申請詳細を取得 (状態履歴も含む)
*   **`PATCH /api/applications/[id]`**: 申請の状態を遷移させる (Body: `{ action: string, notes?: string }`)

## 6. 技術スタック

*   フレームワーク: Next.js (App Router)
*   言語: TypeScript
*   データベース: SQLite
*   ORM: Prisma
*   スタイリング: Tailwind CSS
*   パッケージ管理: npm

## 7. 実装スコープ外

*   ユーザー認証・認可
*   複雑なアクセス制御
*   外部システム連携のシミュレーション
*   メール通知など
*   高度なエラーハンドリング・バリデーション
*   詳細なレスポンシブ対応
