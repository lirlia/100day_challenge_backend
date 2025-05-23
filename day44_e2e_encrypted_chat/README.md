# Day44 - E2E暗号化チャット (E2E Encrypted Chat)

エンドツーエンドで暗号化されたメッセージを送受信できるチャットアプリケーションです。
サーバーは暗号化されたメッセージを中継するだけで、内容を解読することはできません。

**デザインテーマ:** ニューモーフィズム (Neumorphism)

## 主な機能

*   ユーザー登録と簡易ログイン (ユーザー名ベース)
*   クライアントサイドでの鍵ペア生成 (RSA-OAEP/PSS + AES-GCM ハイブリッド暗号を想定)
    *   公開鍵: サーバーに登録・共有
    *   秘密鍵: ブラウザのローカルストレージに保存 (デモ用)
*   メッセージ送信:
    *   受信者の公開鍵で共通鍵を暗号化。
    *   共通鍵でメッセージ本文を暗号化 (AES-GCM)。
    *   送信者の秘密鍵で暗号化共通鍵と暗号化メッセージ全体に署名 (RSA-PSS)。
*   メッセージ受信:
    *   送信者の公開鍵で署名を検証。
    *   自身の秘密鍵で共通鍵を復号。
    *   復号した共通鍵でメッセージ本文を復号。
*   チャット相手の選択機能
*   メッセージのリアルタイム表示 (ポーリング)

## 技術スタック

*   Next.js (App Router)
*   TypeScript
*   SQLite (better-sqlite3)
*   Web Crypto API
*   Tailwind CSS

## ディレクトリ構成 (抜粋)

```
day44_e2e_encrypted_chat/
├── app/
│   ├── api/
│   │   ├── users/
│   │   │   └── route.ts         // ユーザー登録、公開鍵登録・取得
│   │   └── messages/
│   │       └── route.ts         // メッセージ送信・受信 (暗号化済み)
│   ├── (pages)/
│   │   └── chat/
│   │       ├── page.tsx         // チャットUI本体
│   │       └── components/
│   │           ├── UserSelection.tsx // ユーザー切り替えUI
│   │           ├── MessageInput.tsx  // メッセージ入力欄
│   │           └── MessageList.tsx   // メッセージ表示エリア
│   ├── _lib/
│   │   ├── crypto.ts        // Web Crypto API ラッパー
│   │   └── userService.ts   // ユーザー関連クライアントロジック
│   ├── layout.tsx
│   └── page.tsx
├── lib/
│   ├── db.ts                // DB初期化、スキーマ定義
│   └── types.ts             // 共通型定義
├── prisma/
│   └── dev.db
...
```

## DBスキーマ

*   `users` テーブル
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `username` (TEXT UNIQUE NOT NULL)
    *   `publicKey` (TEXT NOT NULL) - SPKI形式の公開鍵 (Base64)
    *   `createdAt` (DATETIME DEFAULT CURRENT_TIMESTAMP)
*   `messages` テーブル
    *   `id` (INTEGER PRIMARY KEY AUTOINCREMENT)
    *   `senderId` (INTEGER NOT NULL, FOREIGN KEY (users))
    *   `recipientId` (INTEGER NOT NULL, FOREIGN KEY (users))
    *   `encryptedMessage` (TEXT NOT NULL) - 暗号化されたメッセージ本文 (Base64)
    *   `signature` (TEXT NOT NULL) - 送信者による署名 (Base64)
    *   `iv` (TEXT NOT NULL) - 初期化ベクトル (AES-GCM用、Base64)
    *   `createdAt` (DATETIME DEFAULT CURRENT_TIMESTAMP)

## セットアップと起動

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動 (http://localhost:3001)
npm run dev
```

---

&copy; 2024 ○○○ (あなたの名前または組織名)
