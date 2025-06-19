# Day68 - 分散ハッシュテーブル（DHT）実装

## プロジェクト概要

**Chord アルゴリズムベースの分散ハッシュテーブル（DHT）を完全実装**

P2Pネットワークにおいて、データを効率的に分散保存・検索するシステムです。ノードの動的参加・離脱に対応し、一貫性ハッシュリングによる高効率なルーティングを実現します。

## 主な特徴

### 🔗 Chord アルゴリズム
- **一貫性ハッシュリング**: 2^8空間（256ノード対応）
- **フィンガーテーブル**: O(log N)ルーティング効率
- **動的ネットワーク**: ノードの参加・離脱に自動対応

### 🌐 P2Pネットワーキング
- **TCP通信**: 高信頼性のノード間通信
- **JSON-RPC**: シンプルで拡張性の高いプロトコル
- **ノード発見**: Bootstrap ノードからの自動参加

### 📊 分散データ管理
- **Key-Value ストア**: 任意のデータ型対応
- **データ複製**: R=3（3台のSuccessorに複製）
- **整合性保証**: Eventual Consistency

### 🛡️ 障害耐性
- **ノード監視**: Heartbeat による生存確認
- **障害回復**: 自動的なデータ再配置
- **ネットワーク分断**: Split-brain対策

### 🎯 リアルタイム可視化
- **ネットワーク トポロジー**: リング構造の視覚化
- **データ分布**: 各ノードの負荷状況表示
- **リアルタイム監視**: 動的な状態変化追跡

## 技術スタック

| 技術領域 | 使用技術 | 用途 |
|---------|----------|------|
| **メインロジック** | Go | DHT実装、P2P通信 |
| **Web UI** | Next.js + TypeScript | 可視化、管理画面 |
| **通信プロトコル** | TCP Socket + JSON-RPC | ノード間通信 |
| **データ永続化** | SQLite | ローカルデータ保存 |
| **可視化** | Chart.js, D3.js | ネットワーク図、統計 |

## 学習目標

1. **分散システム理論**: Chord アルゴリズム、一貫性ハッシュ、DHT理論
2. **P2Pネットワーキング**: ノード発見、メッセージルーティング、TCP通信
3. **障害耐性**: ノード離脱検知、データ複製、ネットワーク分断対応
4. **並行処理**: goroutine、チャネル、分散状態管理
5. **暗号学**: SHA-1ハッシュ、ノードID生成、データ整合性

## プロジェクト構造

```
day68_distributed_hash_table/
├── cmd/
│   └── dht/                # DHT ノード実行ファイル
├── pkg/
│   ├── chord/              # Chord アルゴリズム実装
│   ├── network/            # P2P通信層
│   ├── storage/            # データ格納・管理
│   └── monitor/            # 監視・障害処理
├── web/                    # Next.js Web UI
├── tests/                  # 統合テスト
├── docs/                   # 技術ドキュメント
└── examples/               # 使用例・デモ
```

## 使用方法

### 1. DHTノード起動
```bash
# Bootstrap ノード（最初のノード）を起動
go run cmd/dht/main.go --port 8000 --bootstrap

# 他のノードを起動（Bootstrap ノードに接続）
go run cmd/dht/main.go --port 8001 --join localhost:8000
go run cmd/dht/main.go --port 8002 --join localhost:8000
```

### 2. Web UI起動
```bash
npm run dev
# http://localhost:3001 でアクセス
```

### 3. CLI操作
```bash
# データ保存
curl -X POST localhost:8000/api/put -d '{"key":"hello","value":"world"}'

# データ取得
curl localhost:8000/api/get?key=hello

# ノード状態確認
curl localhost:8000/api/status
```

## 実装フェーズ

### フェーズ1: 基本実装
- [x] Chord アルゴリズム実装
- [x] TCP通信・JSON-RPC
- [x] データ格納・検索

### フェーズ2: 高度な機能
- [x] ノード監視・障害処理
- [x] データ複製・整合性
- [x] パフォーマンス最適化

### フェーズ3: 可視化・UI
- [x] Web UI実装
- [x] ネットワーク可視化
- [x] リアルタイム監視

## 参考資料

- [Chord: A Scalable Peer-to-peer Lookup Service](https://pdos.csail.mit.edu/papers/chord:sigcomm01/chord_sigcomm.pdf)
- [Distributed Hash Tables](https://en.wikipedia.org/wiki/Distributed_hash_table)
- [Consistent Hashing](https://en.wikipedia.org/wiki/Consistent_hashing)

## ライセンス

MIT License - 教育目的での使用を前提としています。
