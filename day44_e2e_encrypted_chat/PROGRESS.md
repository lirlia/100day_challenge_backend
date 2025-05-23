# Day44 - 署名付きグループチャット 作業進捗

## 計画フェーズ

- [x] アプリケーションテーマ決定: E2E暗号化チャット (ニューモーフィズムデザイン)
- [x] 初期仕様検討 (1対1チャット、RSA+AESハイブリッド暗号化、署名)

## 実装フェーズ

1.  **プロジェクト初期セットアップ (1対1チャットベース)**
    - [x] `template` から `day44_e2e_encrypted_chat` へコピー、`package.json` 更新
    - [x] `README.md` (初期版), `PROGRESS.md` (当ファイル) 作成
    - [x] Tailwind CSS ニューモーフィズム設定追加 (`tailwind.config.ts`, `app/globals.css`)
    - [x] 基本レイアウト (`app/layout.tsx`), トップページ (`app/page.tsx`) 作成
    - [x] DBスキーマ定義 (`lib/db.ts`: `users`, `messages` - `recipientId` NOT NULL)
    - [x] DBファイル (`db/dev.db`) 再生成

2.  **APIと暗号処理実装 (1対1チャットベース)**
    - [x] ユーザーAPI (`app/api/users/route.ts`): GET (一覧), POST (登録、公開鍵保存)
    - [x] 暗号ユーティリティ (`app/_lib/crypto.ts`): 鍵生成、エクスポート/インポート、localStorage保存/読込、ハイブリッド暗号化、署名
    - [x] チャットページ (`app/chat/page.tsx`)実装開始: ユーザー登録、ユーザー選択、メッセージ送受信 (E2E暗号化、署名付)、ポーリング

3.  **Playwrightテスト試行とCSS問題対応**
    - [x] Playwrightテストコード (`tests/chat.e2e.spec.ts`) と設定 (`playwright.config.ts`) 作成
    - [x] Tailwind CSSカスタムクラス認識問題の調査と修正 (`app/globals.css`, `postcss.config.mjs`, `package.json` の `dev` スクリプト)

4.  **仕様変更: グループチャット化と平文化**
    - [x] DBスキーマ変更 (`lib/db.ts`): `messages.recipientId` を NULL 許容に変更、DB再生成
    - [x] API修正 (`app/api/messages/route.ts`): GET (全メッセージ取得)、POST (`recipientId` を NULL で保存)
    - [x] UI修正 (`app/chat/page.tsx`): E2E暗号化無効化 (平文化)、署名検証は維持、宛先選択UI削除、グループチャット用タイトルに変更

5.  **UI不具合修正と安定化**
    - [x] ユーザー選択が機能しない問題の修正 (`app/chat/page.tsx` の表示条件緩和)
    - [x] メッセージ署名検証失敗問題の修正 (`verifySignature` 引数順、データ一貫性確認デバッグ)
    - [x] チャット送信時の画面ちらつき問題の修正 (`handleSendMessage` でAPIレスポンスを利用した即時更新)
    - [x] アイドル時の画面ちらつき問題の修正 (ポーリング処理 `fetchMessages` での `setMessages` 呼び出し条件最適化、`useEffect` 依存配列見直し、`isFetchingMessages` の抑制)
    - [x] デバッグ用 `console.log` の削除

6.  **最終調整とドキュメント**
    - [x] Playwrightテストの更新 (グループチャット仕様への追従)
    - [x] `README.md` の更新 (現在の仕様に合わせて全面的に書き直し)
    - [x] `PROGRESS.md` の更新 (当ファイル)
    - [ ] `.cursor/rules/knowledge.mdc` の更新 (Day44の成果として追記)

## 今後の可能性 (スコープ外)

- グループチャットにおけるE2E暗号化の実現 (鍵共有など高度な技術が必要)
- WebSocket等を利用したリアルタイム性の向上
