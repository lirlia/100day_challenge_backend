# Day66 - Bitcoin ブロックチェーン実装

## 概要

教育目的のBitcoin風ブロックチェーンをGoで完全実装します。

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

### 5. P2P ネットワーク
- ノード間通信
- ブロック同期
- ネットワーク Discovery

## ディレクトリ構造

```
day66_bitcoin_blockchain/
├── cmd/
│   └── bitcoin/           # CLI エントリーポイント
├── internal/
│   ├── blockchain/        # ブロックチェーンコア
│   ├── wallet/           # ウォレット機能
│   ├── transaction/      # トランザクション処理
│   ├── mining/           # マイニング機能
│   ├── network/          # P2P ネットワーク
│   └── storage/          # データ永続化
├── pkg/
│   ├── crypto/           # 暗号化関連
│   └── utils/            # ユーティリティ
├── test/                 # テストファイル
├── go.mod
├── go.sum
├── Makefile
└── README.md
```

## CLI コマンド

```bash
# ウォレット作成
./bitcoin wallet create

# 残高確認
./bitcoin wallet balance --address <address>

# 送金
./bitcoin wallet send --from <address> --to <address> --amount <amount>

# ブロックチェーン作成
./bitcoin blockchain create --address <address>

# ブロック追加
./bitcoin blockchain add --address <address>

# ブロックチェーン表示
./bitcoin blockchain print

# マイニング開始
./bitcoin mine --address <address>

# ノード起動
./bitcoin node start --port <port>

# ノード接続
./bitcoin node connect --peer <host:port>
```

## セットアップ・実行

```bash
# 依存関係インストール
go mod tidy

# ビルド
make build

# テスト実行
make test

# CLI実行例
./bin/bitcoin blockchain create --address your_address
./bin/bitcoin mine --address your_address
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

## 開発進捗

実装は以下の順序で進行：

1. ✅ プロジェクト初期化
2. ⏳ ブロック構造実装
3. ⏳ トランザクション実装  
4. ⏳ マイニング (PoW) 実装
5. ⏳ ウォレット機能実装
6. ⏳ ブロックチェーン管理
7. ⏳ CLI インターフェース
8. ⏳ P2P ネットワーク

詳細は `PROGRESS.md` を参照してください。
