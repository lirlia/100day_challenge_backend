# PROGRESS - Day 46: ACME CA Simulator

## 作業工程

- [x] 1. プロジェクト初期化、テンプレートからのコピー、`package.json` 更新
- [x] 2. DBスキーマ設計 (`TraditionalCertificates`, `AcmeAccounts`, `AcmeOrders`, `AcmeAuthorizations`, `AcmeChallenges`, `AcmeCertificates`)
- [x] 3. ACMEサーバーAPIエンドポイント実装
    - [x] `/api/acme/directory`
    - [x] `/api/acme/new-account`
    - [x] `/api/acme/new-order`
    - [x] `/api/acme/authz/:authzId`
    - [x] `/api/acme/challenge/:challengeId`
    - [x] `/api/acme/challenge/:challengeId/simulate-validation`
    - [x] `/api/acme/order/:orderId/finalize`
    - [x] `/api/acme/certificate/:certId`
- [x] 4. ACMEクライアントUI (`AcmeClientFlow.tsx`) 実装
    - [x] キーペア生成
    - [x] アカウント登録
    - [x] オーダー作成
    - [x] 認証とチャレンジ処理 (HTTP-01)
    - [x] オーダー最終化
    - [x] 証明書ダウンロード
- [x] 5. CA証明書管理UI (`/ca/certificates`) 実装 (`app/api/ca/certificates/route.ts` とフロントエンドページ)
- [x] 6. バグ修正とデバッグ
    - [x] ルーティングエラー (不正なエスケープ文字を含むディレクトリ名)
    - [x] 多数のDBスキーマ不整合 (カラム名の不一致、不足など)
    - [x] Next.js 動的APIの `params` の扱い (await不足)
    - [x] ACMEクライアントとサーバー間のNonce不一致問題
    - [x] HTTP-01チャレンジのキーオーソリゼーション計算ロジックの不一致
    - [x] チャレンジ検証シミュレーションUI (`simulateHttp01Validation`) のリクエストボディ不具合
    - [ ] UIのオーダーステータスが更新されない問題 (調査中、`AcmeClientFlow.tsx`)
    - [x] 証明書一覧API (`/api/ca/certificates`) での `commonName` (ドメイン名) 取得不具合 (SQL修正)
- [x] 7. ドキュメント作成
    - [x] `README.md` の更新
    - [x] `.cursor/rules/knowledge.mdc` の更新
    - [x] `PROGRESS.md` の作成・更新

## 残課題

- ACMEクライアントUI (`AcmeClientFlow.tsx`) で、チャレンジ成功後にオーダーステータスが `ready` に更新されず、「オーダーを最終化して証明書を発行」ボタンが有効にならない問題の解決。
            