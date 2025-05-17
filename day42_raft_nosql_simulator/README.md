# Day42: Go Raft NoSQL Simulator

これは、Go言語と `hashicorp/raft` ライブラリを使用して、結果整合性を持つNoSQLデータベースの動作をシミュレートするCLIアプリケーションです。
分散合意、リーダー選出、ログ複製、書き込みパスのリーダー集約、結果整合性読み取りといった概念の学習を目的としています。

## 主な機能

- Raftクラスタのシミュレーション (複数ノード)
- テーブルベースのデータモデル (パーティションキー、ソートキー)
- CLIによるテーブル操作とアイテム操作
  - `create-table`, `delete-table`
  - `put-item`, `get-item`, `delete-item`
  - `query-items`
- 書き込み操作のRaft合意とリーダーフォワーディング
- 読み取り操作のローカルリードによる結果整合性
- Last Write Wins (LWW) による競合解決

## 技術スタック

- 言語: Go
- 主要ライブラリ:
  - `hashicorp/raft`
  - `hashicorp/raft-boltdb`
  - `spf13/cobra` (CLI)
  - `peterh/liner` (CLI入力)

## ビルド方法

```bash
# (後で記述)
go build -o raft-nosql-sim ./cmd/cli
```

## 実行方法

```bash
# (後で記述)
# 例:
# ./raft-nosql-sim --config config.json
# ./raft-nosql-sim create-table --table-name mytable --partition-key id:string
# ./raft-nosql-sim put-item --table-name mytable --item '{"id": "item1", "value": "hello"}'
# ./raft-nosql-sim get-item --table-name mytable --key '{"id": "item1"}'
```

## ディレクトリ構成 (予定)

```
.
├── cmd/
│   └── cli/
│       └── main.go         # CLIエントリーポイント
├── internal/
│   ├── cli_handler/    # CLIコマンドハンドラ
│   ├── raft_node/      # Raftノード管理
│   └── store/          # データストア、FSM
├── pkg/
│   └── types/          # 型定義 (必要であれば)
├── data/                 # Raftログ、スナップショット、データストア (ノードごと)
├── go.mod
├── go.sum
├── README.md
└── PROGRESS.md
```
