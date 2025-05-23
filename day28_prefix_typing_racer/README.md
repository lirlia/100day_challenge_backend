# Day 28: Prefix Typing Racer

これは、与えられた接頭辞 (Prefix) で始まる英単語を素早く入力するタイピングゲームです。

## 概要

画面に表示される接頭辞 (例: "pre", "str") に対し、その接頭辞で始まる実在する英単語 (例: "prefix", "string") を制限時間内に入力します。正解するとスコアが加算され、次の接頭辞が表示されます。

https://github.com/user-attachments/assets/d36457d4-a9bd-46f4-8cb5-8ddd7e1bb7a2

[100日チャレンジ day28](https://zenn.dev/gin_nazo/scraps/f67318b424fc46)

## 主な機能

- ランダムな接頭辞の表示
- プレイヤーによる単語入力
- 入力単語の正当性チェック (接頭辞の一致、辞書存在確認)
- スコア計算
- 制限時間タイマー

## 技術的特徴

- **Trie (Prefix Tree):** 辞書データをメモリ上の Trie 構造で管理し、単語の存在確認を高速に行います。
- **Next.js App Router:** フロントエンド UI と API ルートハンドラを実装します。
- **Prisma & SQLite:** 英単語の辞書データを格納します。
- **Tailwind CSS:** ミニマリストなデザインの UI を構築します。

## セットアップ & 実行

1. 依存関係のインストール:
   ```bash
   npm install
   ```
2. 辞書データの準備:
   - 適切な英単語リストファイル (`words_alpha.txt` など) をダウンロードし、`prisma/` ディレクトリなどに配置します。
   - Prisma Seed を実行して、単語データを SQLite データベースにインポートします:
     ```bash
     npx prisma db seed
     ```
   *Seed スクリプトは別途作成が必要です。*
3. データベースマイグレーション:
   ```bash
   npx prisma migrate deploy
   ```
4. 開発サーバーの起動:
   ```bash
   npm run dev -- --port 3001
   ```
5. ブラウザで `http://localhost:3001` を開きます。

## 注意事項

- このテンプレートはローカル開発環境を主眼としています。
- 本番デプロイには追加の考慮が必要です。
- エラーハンドリングやセキュリティは簡略化されています。
