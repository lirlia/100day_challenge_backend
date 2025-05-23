# Day44 - E2E暗号化チャット アプリケーション開発進捗

## 作業計画

- [x] **Day44: プロジェクト初期化と基本設定 (1/8)**
    - [x] `template` から `day44_e2e_encrypted_chat` へプロジェクトコピー。
    - [x] `package.json` の `name` を `day44_e2e_encrypted_chat` に変更。
    - [x] README.md にアプリ概要と上記設計を記載。
    - [x] PROGRESS.md に作業工程を記載。
    - [x] 基本レイアウト (`app/layout.tsx`) とトップページ (`app/page.tsx`) を作成 (ニューモーフィズム風の背景など)。
    - [x] Tailwind CSS の設定でニューモーフィズムに必要な色や影を定義。
    - [x] DBスキーマ (`lib/db.ts`) を定義し、`db/dev.db` を一度削除して再生成。
    - [ ] テスト: `npm run dev` で起動し、基本レイアウトが表示されることを確認。DBファイルが生成されることを確認。
    - [ ] コミット: `git commit -m "Day44: step 1/8 Project initialization and basic setup"`

- [ ] **Day44: ユーザー管理と鍵生成UI (2/8)**
    - [ ] API: ユーザー登録 (`POST /api/users`)、ユーザー一覧取得 (`GET /api/users`)。
    - [ ] クライアントサイド: `app/_lib/crypto.ts` に RSA-OAEP (暗号化用) および RSA-PSS (署名用) の鍵ペア生成関数を実装 (Web Crypto API)。
    - [ ] UI: ユーザー名を入力して登録するフォーム。登録時に鍵ペアを生成し、公開鍵をサーバーに送信。秘密鍵は `localStorage` に保存 (ユーザー名と紐付けて)。
    - [ ] UI: 登録済みユーザーを一覧表示し、選択してチャット相手を選べるようにする (初期段階ではチャット相手の選択のみ)。
    - [ ] テスト: 複数ユーザーを登録し、公開鍵がDBに保存されること、秘密鍵がローカルストレージに保存されることを確認。
    - [ ] コミット: `git commit -m "Day44: step 2/8 User management and key generation UI"`

- [ ] **Day44: 暗号化・復号・署名・検証ロジック実装 (3/8)**
    - [ ] `app/_lib/crypto.ts` に以下の関数を実装:
        - [ ] `encryptMessage(plaintext: string, publicKey: CryptoKey, iv: Uint8Array): Promise<{encryptedData: ArrayBuffer, iv: Uint8Array}>` (AES-GCM で共通鍵暗号化し、その共通鍵を RSA-OAEP で暗号化するハイブリッド暗号も検討。ここではまずシンプルにRSA-OAEPで直接暗号化、もしくは AES-GCM の共通鍵を相手の公開鍵で暗号化)
        - [ ] `decryptMessage(encryptedData: ArrayBuffer, privateKey: CryptoKey, iv: Uint8Array): Promise<string>`
        - [ ] `signMessage(data: ArrayBuffer, privateKey: CryptoKey): Promise<ArrayBuffer>` (RSA-PSS)
        - [ ] `verifySignature(signature: ArrayBuffer, data: ArrayBuffer, publicKey: CryptoKey): Promise<boolean>`
    - [ ] 文字列とArrayBuffer、Base64間の変換ユーティリティも用意。
    - [ ] テスト: 各暗号化/復号、署名/検証関数が正しく動作することをユニットテスト的に確認 (ブラウザコンソールで)。
    - [ ] コミット: `git commit -m "Day44: step 3/8 Implement encryption, decryption, signing, and verification logic"`

- [ ] **Day44: チャットメッセージ送受信API (E2E暗号化) (4/8)**
    - [ ] API: メッセージ送信 (`POST /api/messages`): `senderId`, `recipientId`, `encryptedMessage`, `signature`, `iv` を受け取りDBに保存。
    - [ ] API: 特定ユーザー間のメッセージ取得 (`GET /api/messages?userId1=X&userId2=Y`): 指定されたユーザー間のメッセージを時系列で取得。
    - [ ] テスト: `curl` や Postman などで、暗号化・署名済みのダミーデータをAPIに送信し、DBに保存されることを確認。また、メッセージ取得APIが正しくデータを返すことを確認。
    - [ ] コミット: `git commit -m "Day44: step 4/8 Implement E2E encrypted chat message API"`

- [ ] **Day44: チャットUI実装 (メッセージ送受信) (5/8)**
    - [ ] `app/(pages)/chat/page.tsx` を中心にUIを構築。
    - [ ] 選択されたチャット相手の公開鍵を取得。
    - [ ] メッセージ入力フィールド (`MessageInput.tsx`) からメッセージを送信する際:
        - [ ] `encryptMessage` で暗号化。
        - [ ] `signMessage` で署名。
        - [ ] API (`POST /api/messages`) を呼び出し。
    - [ ] メッセージ表示エリア (`MessageList.tsx`):
        - [ ] API (`GET /api/messages`) からメッセージを取得 (ポーリングまたはWebSocket)。
        - [ ] 受信メッセージを `decryptMessage` で復号。
        - [ ] `verifySignature` で署名を検証。
        - [ ] 復号・検証できたメッセージのみ表示。署名検証失敗時はエラー表示。
    - [ ] テスト: 異なるユーザーとしてログイン（ユーザー切り替えUI経由）し、メッセージがE2E暗号化されて送受信できることを確認。DBの内容が暗号化されていることを確認。
    - [ ] コミット: `git commit -m "Day44: step 5/8 Implement chat UI for sending and receiving messages"`

- [ ] **Day44: リアルタイム更新 (WebSocketまたはポーリング) (6/8)**
    - [ ] メッセージのリアルタイム更新を実装。
        - [ ] WebSocket を使う場合: サーバー側でWebSocket接続を管理し、新しいメッセージを該当クライアントにプッシュ。
        - [ ] ポーリングの場合: `MessageList.tsx` で定期的に `GET /api/messages` を呼び出す。
    - [ ] Next.js の Route Handlers で WebSocket を扱うのは少し工夫がいるため、ここではよりシンプルなポーリングを優先的に実装し、時間が許せば WebSocket に挑戦。
    - [ ] テスト: 新しいメッセージがリアルタイム（または準リアルタイム）で表示されることを確認。
    - [ ] コミット: `git commit -m "Day44: step 6/8 Implement real-time updates (polling or WebSocket)"`

- [ ] **Day44: UI/UX改善とエラーハンドリング (7/8)**
    - [ ] ニューモーフィズムデザインの調整。
    - [ ] 暗号化/復号処理中、署名検証中などのローディング表示。
    - [ ] 鍵の不一致、署名検証失敗などのエラーメッセージをユーザーフレンドリーに表示。
    - [ ] ユーザーが秘密鍵を紛失した場合の考慮（今回はデモなので「再登録してください」程度でOK）。
    - [ ] 不要なファイルやコードの削除。
    - [ ] テスト: 様々なエラーケースを試し、UIが適切に反応することを確認。
    - [ ] コミット: `git commit -m "Day44: step 7/8 UI/UX improvements and error handling"`

- [ ] **Day44: ドキュメント更新と最終確認 (8/8)**
    - [ ] README.md に最終的な使い方、技術詳細を追記。
    - [ ] PROGRESS.md の項目をすべてチェック。
    - [ ] `.cursor/rules/knowledge.mdc` に今回のアプリ情報を追記。
    - [ ] Playwright を用いた簡単なE2Eテストシナリオを作成し実行（手動でも可）。
        - [ ] ユーザーAがユーザーBにメッセージを送信。
        - [ ] ユーザーBがメッセージを正しく受信・復号できる。
        - [ ] サーバーDBには平文メッセージが保存されていない。
    - [ ] コミット: `git commit -m "Day44: step 8/8 Documentation and final review"`


- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
