# Day44 - E2E暗号化チャット (動的鍵生成) 作業進捗

## 計画フェーズ

- [x] アプリケーションテーマ決定: E2E暗号化チャット (ニューモーフィズムデザイン)
- [x] 初期仕様検討 (1対1チャット、RSA+AESハイブリッド暗号化、署名、動的鍵生成)

## 実装フェーズ

1.  **プロジェクト初期セットアップ**
    - [x] `template` から `day44_e2e_encrypted_chat` へコピー、`package.json` 更新
    - [x] `README.md` (初期版), `PROGRESS.md` (当ファイル) 作成
    - [x] Tailwind CSS ニューモーフィズム設定追加 (`tailwind.config.ts`, `app/globals.css`)
    - [x] 基本レイアウト (`app/layout.tsx`), トップページ (`app/page.tsx`) 作成
    - [x] DBスキーマ定義 (`lib/db.ts`: `users` (publicKey NULL許容), `messages`)
    - [x] DBファイル (`db/dev.db`) 再生成

2.  **APIと暗号処理実装 (動的鍵生成ベース)**
    - [x] ユーザーAPI (`app/api/users/route.ts`): GET (一覧), POST (登録、公開鍵なし)
    - [x] ユーザーAPI (`app/api/users/[userId]/route.ts`): PUT (公開鍵更新) - **作業中 (バグ修正)**
    - [x] 暗号ユーティリティ (`app/_lib/crypto.ts`): 鍵生成、エクスポート/インポート、localStorage保存/読込、ハイブリッド暗号化、署名
    - [x] チャットページ (`app/chat/page.tsx`)実装開始: ユーザー登録(鍵生成と公開鍵DB保存含む)、ユーザー選択、メッセージ送受信 (E2E暗号化、署名付)、ポーリング - **作業中 (バグ修正、安定化)**

3.  **PlaywrightテストとCSS問題対応**
    - [x] Playwrightテストコード (`tests/chat.e2e.spec.ts`) と設定 (`playwright.config.ts`) 作成 (動的鍵生成フローに対応)
    - [x] Tailwind CSSカスタムクラス認識問題の調査と修正
    - [-] Playwrightテストの安定化 - **作業中 (タイムアウト問題など)**

4.  **UI/UX改善と安定化**
    - [ ] エラーハンドリングと表示の改善
    - [ ] ローディング状態の表示改善
    - [ ] UIの微調整 (ニューモーフィズムデザインの適用確認)

5.  **デバッグとテスト**
    - [ ] Playwrightテストケースの拡充と最終確認 - **作業中**
    - [ ] 手動テストによる動作確認
    - [ ] 不要な `console.log` の削除

6.  **ドキュメント作成**
    - [ ] `README.md` の更新 (最終的な仕様に合わせて全面的に書き直し)
    - [ ] `PROGRESS.md` の更新 (当ファイル、最終確認)
    - [ ] `.cursor/rules/knowledge.mdc` の更新 (Day44の成果として追記)

## 以前の試行 (参考)
- 固定キーによるE2Eチャット実装 (途中で動的鍵生成へ方針転換)
- グループチャット化の試み (E2Eの複雑さから1対1チャットに回帰)

## 今後の可能性 (スコープ外)

- グループチャットにおけるE2E暗号化の実現 (鍵共有など高度な技術が必要)
- WebSocket等を利用したリアルタイム性の向上
