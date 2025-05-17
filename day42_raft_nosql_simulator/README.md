# Day42: Go Raft NoSQL Simulator

これは、Go言語と `hashicorp/raft` ライブラリを使用して、結果整合性を持つNoSQLデータベースの動作をシミュレートするCLIアプリケーションです。
分散合意、リーダー選出、ログ複製、書き込みパスのリーダー集約、結果整合性読み取りといった概念の学習を目的としています。

## 主な機能

- Raftクラスタのシミュレーション (3ノード)
- HTTP API経由での操作
- CLIによるテーブル操作とアイテム操作:
  - `create-table`: テーブルを作成します。
  - `delete-table`: テーブルを削除します。
  - `put-item`: テーブルにアイテムを登録または更新します。
  - `get-item`: テーブルからアイテムを取得します。
  - `delete-item`: テーブルからアイテムを削除します。
  - `query-items`: テーブル内のアイテムをパーティションキーとソートキープレフィックスでクエリします。
  - `status`: 指定ノードのステータス情報を表示します。
- 書き込み操作のRaft合意とリーダーへのリクエストフォワーディング (クライアントサイド)
- 読み取り操作のローカルリードによる結果整合性
- Last Write Wins (LWW) による競合解決 (アイテムのタイムスタンプベース)

## 技術スタック

- 言語: Go
- 主要ライブラリ:
  - `hashicorp/raft`: Raftコンセンサスアルゴリズムの実装。
  - `hashicorp/raft-boltdb`: Raftログと安定ストアのためのBoltDBバックエンド。
  - `spf13/cobra`: 高機能なCLIアプリケーションフレームワーク。

## ビルド方法

プロジェクトのルートディレクトリで以下のコマンドを実行します。

```bash
make build
```

これにより、`day42_raft_nosql_simulator` という名前の実行可能ファイルがプロジェクトルートに生成されます。

## 実行方法

### 1. サーバークラスタの起動

まず、3ノード構成のRaftクラスタを起動します。

```bash
make server
# または直接実行:
# ./day42_raft_nosql_simulator server
```

デフォルトでは、データはプロジェクトルートの `data/` ディレクトリ配下に `node0`, `node1`, `node2` として保存されます。
データディレクトリを変更する場合は、`DATA_DIR` 環境変数を指定するか、`--data-dir-root` フラグを使用します。

```bash
# DATA_DIR 環境変数を指定
# DATA_DIR=./my_cluster_data make server

# --data-dir-root フラグを使用
# ./day42_raft_nosql_simulator server --data-dir-root ./my_cluster_data
```

各ノードは以下のHTTP APIエンドポイントも公開します:
- Node0: `localhost:8100`
- Node1: `localhost:8101`
- Node2: `localhost:8102`

CLIから操作を行う際は、`--target-addr` フラグでこれらのいずれかのアドレスを指定します。書き込み操作はリーダーノードに転送されます。

### 2. CLIコマンドの実行

別のターミナルを開き、CLIコマンドを実行します。

基本的な構文:
```bash
./day42_raft_nosql_simulator <コマンド> --target-addr <ノードAPIアドレス> [オプション]
```

#### CLIコマンド使用例

**テーブル作成**
```bash
./day42_raft_nosql_simulator create-table --target-addr localhost:8100 --table-name Music --partition-key Artist --sort-key SongTitle
```

**アイテム登録**
```bash
# シングルクオートでJSON文字列全体を囲むことを推奨
ITEM_DATA='{
  "Artist": "Journey",
  "SongTitle": "Don\'t Stop Believin\'",
  "Album": "Escape",
  "Year": 1981
}'
./day42_raft_nosql_simulator put-item --target-addr localhost:8100 --table-name Music --item-data "$ITEM_DATA"

ITEM_DATA2='{
  "Artist": "Journey",
  "SongTitle": "Separate Ways (Worlds Apart)",
  "Album": "Frontiers",
  "Year": 1983
}'
./day42_raft_nosql_simulator put-item --target-addr localhost:8100 --table-name Music --item-data "$ITEM_DATA2"
```

**アイテム取得**
```bash
./day42_raft_nosql_simulator get-item --target-addr localhost:8100 --table-name Music --partition-key "Journey" --sort-key "Don\'t Stop Believin\'"
# フォロワーノードからも取得可能 (結果整合性)
# ./day42_raft_nosql_simulator get-item --target-addr localhost:8101 --table-name Music --partition-key "Journey" --sort-key "Don\'t Stop Believin\'"
```

**アイテムクエリ (パーティションキー指定)**
```bash
./day42_raft_nosql_simulator query-items --target-addr localhost:8100 --table-name Music --partition-key "Journey"
```

**アイテムクエリ (パーティションキー + ソートキープレフィックス指定)**
```bash
./day42_raft_nosql_simulator query-items --target-addr localhost:8100 --table-name Music --partition-key "Journey" --sort-key-prefix "Don\'t"
```

**アイテム削除**
```bash
./day42_raft_nosql_simulator delete-item --target-addr localhost:8100 --table-name Music --partition-key "Journey" --sort-key "Separate Ways (Worlds Apart)"
```

**テーブル削除**
```bash
./day42_raft_nosql_simulator delete-table --target-addr localhost:8100 --table-name Music
```

**ノードステータス確認**
```bash
./day42_raft_nosql_simulator status --target-addr localhost:8100
./day42_raft_nosql_simulator status --target-addr localhost:8101
./day42_raft_nosql_simulator status --target-addr localhost:8102
```

## 簡単な動作デモシナリオ

1.  **サーバー起動**: ターミナル1で `make server` を実行。
2.  **テーブル作成**: ターミナル2で `Music` テーブルを作成。
    ```bash
    ./day42_raft_nosql_simulator create-table --target-addr localhost:8100 --table-name Music --partition-key Artist --sort-key SongTitle
    ```
3.  **アイテム登録**: 2つのアイテムを登録。
    ```bash
    ITEM1='{"Artist":"The Beatles","SongTitle":"Let It Be","Album":"Let It Be","Year":1970}'
    ./day42_raft_nosql_simulator put-item --target-addr localhost:8100 --table-name Music --item-data "$ITEM1"
    ITEM2='{"Artist":"Queen","SongTitle":"Bohemian Rhapsody","Album":"A Night at the Opera","Year":1975}'
    ./day42_raft_nosql_simulator put-item --target-addr localhost:8100 --table-name Music --item-data "$ITEM2"
    ```
4.  **アイテム取得**: リーダーノード (例: `localhost:8100`) から "Let It Be" を取得。
    ```bash
    ./day42_raft_nosql_simulator get-item --target-addr localhost:8100 --table-name Music --partition-key "The Beatles" --sort-key "Let It Be"
    ```
5.  **アイテム取得 (フォロワー)**: フォロワーノード (例: `localhost:8101`) から "Bohemian Rhapsody" を取得 (少し待つと複製されているはず)。
    ```bash
    # sleep 2 # 複製を待つ (必要に応じて)
    ./day42_raft_nosql_simulator get-item --target-addr localhost:8101 --table-name Music --partition-key "Queen" --sort-key "Bohemian Rhapsody"
    ```
6.  **アイテムクエリ**: "The Beatles" のアイテムをクエリ。
    ```bash
    ./day42_raft_nosql_simulator query-items --target-addr localhost:8100 --table-name Music --partition-key "The Beatles"
    ```
7.  **アイテム削除**: "Let It Be" を削除。
    ```bash
    ./day42_raft_nosql_simulator delete-item --target-addr localhost:8100 --table-name Music --partition-key "The Beatles" --sort-key "Let It Be"
    ```
8.  **テーブル削除**: `Music` テーブルを削除。
    ```bash
    ./day42_raft_nosql_simulator delete-table --target-addr localhost:8100 --table-name Music
    ```
9.  **サーバー停止**: ターミナル1で `Ctrl+C` を押してサーバーを停止。

## ディレクトリ構成

```
.
├── cmd/
│   └── cli/            # CLIエントリーポイントとコマンド定義
│       ├── main.go
│       ├── root.go
│       ├── item.go
│       └── table.go
├── internal/
│   ├── client/         # HTTP APIクライアント
│   ├── raft_node/      # Raftノード管理、Raftロジック
│   ├── server/         # HTTP APIサーバー
│   └── store/          # データストア (KVStore)、FSM、コマンド定義
├── data/                 # (実行時生成) Raftログ、スナップショット、データストア (ノードごと)
├── logs_e2e_test/        # (テスト時生成) E2Eテストログ
├── go.mod
├── go.sum
├── Makefile
├── README.md
├── PROGRESS.md
├── test_e2e.sh           # E2Eテストスクリプト
└── day42_raft_nosql_simulator # (ビルド時生成) 実行バイナリ
```
