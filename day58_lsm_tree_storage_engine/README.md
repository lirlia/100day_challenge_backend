# Day 58 - LSM-Tree ストレージエンジン

## 概要

LSM-Tree（Log-Structured Merge-Tree）ベースのストレージエンジンをGoで実装します。
現代のNoSQLデータベース（LevelDB、RocksDB、Cassandraなど）で広く使われている
高性能な書き込み特化型ストレージ技術の学習とCLIベースの実装です。

## 主要機能

### 核心コンポーネント
- **MemTable**: メモリ内ソート済みデータ構造（Skip List実装）
- **SSTable**: ディスク上のソート済みテーブル（Sorted String Table）
- **WAL**: Write-Ahead Log（耐久性保証）
- **Compaction**: レベル間マージ処理（Size-Tiered戦略）
- **Bloom Filter**: 存在しないキーの高速判定

### CLI操作
```bash
> put key1 value1       # キー・値の挿入
> get key1              # 値の取得
> delete key2           # キーの削除
> scan key1 key5        # 範囲スキャン
> stats                 # 統計情報表示
> compact               # 手動Compaction実行
> exit                  # 終了
```

## 技術学習ポイント

### LSM-Tree 原理
- **ログ構造化ストレージ**: 追記専用の書き込み最適化
- **Write Amplification**: 書き込み増幅の理解と最適化
- **Read Amplification**: 読み込み性能とのトレードオフ
- **Compaction戦略**: Size-Tiered vs Leveled Compaction

### 実装技術
- **Skip List**: 確率的データ構造によるO(log n)操作
- **Bloom Filter**: False Positive許容の高速存在判定
- **バイナリファイル操作**: 効率的なディスクI/O
- **メモリ管理**: ガベージコレクションとの協調
- **並行制御**: 読み書き同期（実装scope外だが設計考慮）

## アーキテクチャ

```
┌─────────────────┐    ┌──────────────┐
│   CLI Client    │    │     WAL      │
└─────────────────┘    │  (durability)│
         │              └──────────────┘
         ▼                       │
┌─────────────────┐              ▼
│   LSM Engine    │    ┌──────────────┐
│                 │◄───┤   MemTable   │
│  - Put/Get/Del  │    │ (Skip List)  │
│  - Scan         │    └──────────────┘
│  - Compaction   │              │ flush
└─────────────────┘              ▼
         │              ┌──────────────┐
         │              │   SSTable    │
         │              │   Level 0    │
         │              └──────────────┘
         │                       │ compaction
         ▼                       ▼
┌─────────────────┐    ┌──────────────┐
│  Bloom Filters  │    │   SSTable    │
│   (for each     │    │   Level 1+   │
│    SSTable)     │    └──────────────┘
└─────────────────┘
```

## ディレクトリ構造

```
day58_lsm_tree_storage_engine/
├── cmd/
│   └── lsm/
│       └── main.go           # エントリーポイント
├── internal/
│   ├── engine/
│   │   ├── engine.go         # LSMエンジン本体
│   │   └── config.go         # 設定管理
│   ├── memtable/
│   │   ├── skiplist.go       # Skip List実装
│   │   └── memtable.go       # MemTable wrapper
│   ├── sstable/
│   │   ├── sstable.go        # SSTable読み書き
│   │   ├── block.go          # データブロック
│   │   └── iterator.go       # スキャン用イテレータ
│   ├── wal/
│   │   └── wal.go            # Write-Ahead Log
│   ├── compaction/
│   │   ├── compaction.go     # Compaction制御
│   │   └── merger.go         # マージ処理
│   ├── bloom/
│   │   └── filter.go         # Bloom Filter実装
│   └── cli/
│       ├── cli.go            # CLI制御
│       └── commands.go       # コマンド処理
├── testdata/                 # テスト用データ
├── data/                     # ストレージディレクトリ
│   ├── wal/                  # WALファイル
│   └── sstables/             # SSTableファイル
├── go.mod
├── go.sum
├── README.md
├── PROGRESS.md
└── .gitignore
```

## パフォーマンス目標

- **書き込み**: >100K ops/sec (順次書き込み)
- **読み込み**: >10K ops/sec (キー検索)
- **メモリ使用量**: <100MB (中規模データセット)
- **Compaction**: バックグラウンド実行、書き込み性能への影響最小化

## 使用方法

```bash
# ビルド
go build -o lsm cmd/lsm/main.go

# 実行
./lsm

# インタラクティブCLI
> put user:1 {"name":"Alice","age":30}
> get user:1
> scan user:1 user:999
> stats
> exit
```

## 学習成果

このプロジェクトを通じて以下を習得します：

1. **ログ構造化ストレージの深い理解**
2. **高性能データ構造の実装（Skip List、Bloom Filter）**
3. **効率的なディスクI/O設計**
4. **メモリとディスクのハイブリッド管理**
5. **Compaction戦略とパフォーマンスチューニング**
6. **現代NoSQLデータベースの基盤技術**

---

© 2025 LSM-Tree Storage Engine Implementation
