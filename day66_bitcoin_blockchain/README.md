# Day66 - Bitcoin ブロックチェーン実装

## 概要

教育目的のBitcoin風ブロックチェーンをGoで完全実装しました。マイニング、トランザクション、ウォレット管理、Web UIを含む本格的なブロックチェーンシステムです。

https://github.com/user-attachments/assets/e9fb7eaf-bcfd-4663-9366-188c1373c5cf

[100日チャレンジ day66 (ブロックチェーンエンジン）](https://zenn.dev/gin_nazo/scraps/3ecee3411c3b95)

## 学習目標

- ブロックチェーンの基本原理
- Proof of Work (PoW) マイニング
- デジタル署名とトランザクション検証
- UTXO (Unspent Transaction Output) モデル
- Merkle Tree によるトランザクション検証
- 簡易P2Pネットワーク

## 技術スタック

- **言語**: Go
- **CLI**: cobra
- **データベース**: SQLite
- **暗号化**: ECDSA, SHA-256
- **エンコード**: Base58

## 主要機能

### 1. ブロックチェーン基本機能
- ブロック生成・検証
- チェーン整合性チェック
- Merkle Tree によるトランザクション検証

### 2. マイニング (Proof of Work)
- SHA-256 ハッシュベースの PoW
- 難易度調整 (開発用: 1-2秒でマイニング完了)
- ブロック報酬システム

### 3. ウォレット機能
- ECDSA 鍵ペア生成
- Bitcoin風アドレス生成
- 残高計算
- トランザクション作成・署名

### 4. トランザクション処理
- UTXO モデル実装
- トランザクション検証
- Coinbase トランザクション
- デジタル署名検証

### 5. Web UI
- モダンなWebインターフェース
- リアルタイムブロックチェーン情報表示
- ウォレット管理とトランザクション送信
- マイニング制御とチェーン検証

## ディレクトリ構造

```
day66_bitcoin_blockchain/
├── cmd/
│   └── bitcoin/           # CLI + API サーバー
├── internal/
│   ├── blockchain/        # ブロックチェーンコア
│   ├── wallet/           # ウォレット機能
│   ├── storage/          # SQLite データベース
│   ├── engine/           # 統合エンジン
│   └── server/           # HTTP API サーバー
├── pkg/
│   └── crypto/           # 暗号化関連 (ECDSA, Base58, Merkle Tree)
├── web/                  # Web UI (HTML/CSS/JavaScript)
├── data/                 # データベースファイル
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

## 使用方法

### サーバー起動
```bash
# Bitcoin ブロックチェーンサーバー起動
./bitcoin -port 3001 -db data/dev.db

# Web UI にアクセス
http://localhost:3001
```

### API エンドポイント
```bash
# システム情報取得
curl http://localhost:3001/api/info

# ウォレット一覧
curl http://localhost:3001/api/wallets

# ウォレット作成
curl -X POST http://localhost:3001/api/wallets/create

# ブロック一覧
curl http://localhost:3001/api/blocks

# トランザクション送信
curl -X POST http://localhost:3001/api/transactions/send \
  -H "Content-Type: application/json" \
  -d '{"from":"1ABC...","to":"1DEF...","amount":100000000}'

# ブロックマイニング
curl -X POST http://localhost:3001/api/mining/mine \
  -H "Content-Type: application/json" \
  -d '{"miner":"1ABC..."}'

# チェーン検証
curl -X POST http://localhost:3001/api/validate
```

## セットアップ・実行

```bash
# 依存関係インストール
go mod tidy

# ビルド
go build -o bitcoin ./cmd/bitcoin

# テスト実行
make test

# サーバー起動
./bitcoin -port 3001 -db data/dev.db

# Web UI アクセス
http://localhost:3001
```

## アーキテクチャ

### ブロック構造
```go
type Block struct {
    Timestamp     int64
    Transactions  []*Transaction
    PrevBlockHash []byte
    Hash          []byte
    Nonce         int64
    Height        int64
}
```

### トランザクション構造
```go
type Transaction struct {
    ID       []byte
    Inputs   []TxInput
    Outputs  []TxOutput
}

type TxInput struct {
    Txid      []byte
    Vout      int
    Signature []byte
    PubKey    []byte
}

type TxOutput struct {
    Value      int64
    PubKeyHash []byte
}
```

## 実装の特徴

- **教育重視**: 理解しやすい構造とコメント
- **テスト駆動**: 各コンポーネントに包括的なunit test
- **実用性**: 実際のBitcoinプロトコルに近い実装
- **セキュリティ**: ECDSA署名による安全なトランザクション
- **可視性**: 詳細なログとCLI出力

## 実装完了機能

1. ✅ ブロック構造実装 (SHA-256, Merkle Tree)
2. ✅ トランザクション実装 (UTXO, ECDSA署名)  
3. ✅ マイニング (Proof of Work, 難易度調整)
4. ✅ ウォレット機能 (アドレス生成, 残高計算)
5. ✅ データベース管理 (SQLite, チェーン検証)
6. ✅ 統合エンジン (メンプール, 自動マイニング)
7. ✅ REST API サーバー (8つのエンドポイント)
8. ✅ Web UI (モダンなブロックチェーン管理画面)

## 技術的特徴

- **本格的な実装**: Bitcoin準拠のPoW, UTXO, ECDSA
- **暗号学的準拠**: SHA256+RIPEMD160ハッシュによるBitcoin標準アドレス生成
- **教育的価値**: 理解しやすいコード構造とコメント
- **完全なテスト**: 包括的なUnit Test (50+ テストケース)
- **実用性**: Web UIと REST API による操作性
- **セキュリティ**: 暗号学的に安全な実装
- **安定性**: エラーハンドリングとパニック対策による堅牢なシステム

## ライセンス

MIT License

## Copyright

© 2025 Bitcoin Blockchain Implementation (Educational Purpose)
