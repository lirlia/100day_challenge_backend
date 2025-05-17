# Day42: Go Raft NoSQL Simulator

これは、Go言語と `hashicorp/raft` ライブラリを使用して、結果整合性を持つNoSQLデータベースの動作をシミュレートするCLIアプリケーションです。
分散合意、リーダー選出、ログ複製、書き込みパスのリーダー集約、結果整合性読み取りといった概念の学習を目的としています。

https://github.com/user-attachments/assets/c402dd6c-6659-47a1-82d1-be45089486af

[100日チャレンジ day42（自作NoSQL）](https://zenn.dev/gin_nazo/scraps/97459ba625f082)

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

## PutItemの処理フロー：Raftログ伝播とKVストア書き込み

このセクションでは、`put-item`コマンドが実行されてから、データがすべてのノードに伝播するまでの流れを説明します。

### 1. クライアントからサーバーへの流れ
1. **CLI/HTTPリクエスト**: ユーザーが`put-item`コマンドを実行すると、指定されたノードにHTTPリクエストが送信されます。
2. **リーダーチェック**: リクエストを受け取ったノードがリーダーかどうかを確認します。
   - リーダーでない場合：クライアントにリーダーの情報を返し、再試行を促します（クライアントサイドリダイレクト）。
   - リーダーである場合：処理を続行します。

### 2. リーダーノード内での処理
1. **コマンド生成**: `PutItemCommandPayload`を作成し、JSON形式にシリアライズします。
2. **Raftログに追加**: リーダーは`raft.Apply()`メソッドを呼び出し、シリアライズされたコマンドをRaftログに追加します。
3. **フォロワーへの複製開始**: ここから`hashicorp/raft`ライブラリの内部処理が始まります：
   - リーダーは`AppendEntries` RPCを使用して、新しいログエントリをすべてのフォロワーに送信します。
   - フォロワーはログエントリを受信し、自分のログに追加します。
   - フォロワーはリーダーに応答（Acknowledgement）を返します。
4. **合意形成**: リーダーはクラスタの過半数（通常は3ノード中2ノード以上）からの応答を待ちます。
5. **コミット**: 過半数の応答を受け取ると、リーダーはそのログエントリをコミット済みとマークします。

### 3. FSMによる状態更新（各ノード）
1. **リーダーのFSM実行**: リーダーノードでは、コミット後すぐにFSMの`Apply`メソッドが呼び出されます。
   - コマンドのタイプ（`PutItemCommandType`）を識別します。
   - ペイロードをデシリアライズします。
   - テーブルの存在やキーの整合性をチェックします。
   - Raftログのインデックスをタイムスタンプとして使用します。
   - `kvStore.PutItem()`を呼び出してアイテムを永続化します。
2. **フォロワーのFSM実行**: フォロワーノードでは、Raftログの更新を検出した時点で同様にFSMの`Apply`メソッドが呼び出されます。
   - 同じコマンドに対して同じ処理を実行します。
   - 同じRaftログインデックス（タイムスタンプ）を使用します。

### 4. KVStoreによるデータ永続化
1. **ファイルパス生成**: テーブル名とキーからファイルパスを生成します。
2. **Last Write Wins (LWW)チェック**:
   - 既存アイテムが存在する場合、そのタイムスタンプを確認します。
   - 新しいアイテムのタイムスタンプが古い場合は書き込みをスキップします（古い更新を無視）。
3. **ファイル書き込み**: アイテムデータをJSONとしてディスク上のファイルに書き込みます。

### 5. 結果整合性の実現
1. **リーダーの即時応答**: リーダーノードではコミット後すぐにFSMの`Apply`が実行されるため、リーダーからの読み取りはすぐに新しい値を返します。
2. **フォロワーの遅延反映**: フォロワーノードではログエントリの受信とコミットに若干のタイムラグが発生する可能性があります。
3. **最終的な整合性**: 短時間経過後、すべてのノードでデータが整合し、どのノードからクエリしても同じ結果が得られます。

このフローにより、リーダーへの書き込みを中心としたデータの一貫性と、一時的な不整合を許容する結果整合性モデルを実現しています。`test_eventual_consistency.sh`スクリプトでこの動作を確認できます。

## 結果整合性（Eventual Consistency）について

このシミュレータでは、結果整合性（Eventual Consistency）モデルを採用しています。これは、分散システムにおいて以下のような特性を持ちます：

1. **可用性を優先**: CAP定理のうち、一貫性（Consistency）よりも可用性（Availability）を優先します。
2. **最終的な整合性**: 短い時間内に全てのノードが最終的に同じデータ状態に収束します。
3. **読み取りの局所性**: 各ノードはローカルのデータを直接読み取ります（リーダーへの転送なし）。
4. **書き込みの集約**: 書き込みはリーダーに集約され、Raftを通じて全ノードに伝播します。

### 結果整合性の重要な性質：

- **リーダーからの読み取り**: リーダーノードからの読み取りは常に最新のコミット済みデータを返します。
- **フォロワーからの読み取り**: フォロワーノードからの読み取りは、そのノードに伝播済みの最新データを返しますが、これはリーダーの最新状態より古い可能性があります。
- **短時間の不整合**: 更新直後の短時間は、異なるノードから同じデータに対するクエリが異なる結果を返す可能性があります。
- **最終的な収束**: 全てのノードは短時間（通常は数ミリ秒～数秒）で同じデータ状態に収束します。

### Last Write Wins（LWW）による競合解決：

複数のクライアントが同じデータを同時に更新すると競合が発生する可能性がありますが、このシミュレータでは：

1. 各更新にはRaftログのインデックスに基づくタイムスタンプが付与されます。
2. 同じキーのアイテムに対する複数の更新は、タイムスタンプが最新のもの（最後の書き込み）が優先されます。
3. 古いタイムスタンプの更新は無視されます（リーダーでも各フォロワーでも同様）。

これにより、分散環境でのデータ整合性を確保しながら、高い可用性を実現しています。

`test_eventual_consistency.sh` スクリプトでは、この動作を実際に確認できます：

```bash
make run-consistency-test
```

このテストでは：
1. リーダーにアイテムを書き込み
2. 書き込み直後にフォロワーからの読み取りを試み（まだ伝播していないため失敗や古いデータを返す可能性）
3. 短時間待機後に再度フォロワーから読み取り（伝播完了後なので最新データを返すはず）
4. 全てのノードで整合性が取れていることを確認

実際の分散データベースシステム（例：Amazon DynamoDB, Cassandra など）も同様の結果整合性モデルを採用しており、このシミュレータはその動作原理を理解するのに役立ちます。

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
./day42_raft_nosql_simulator create-table --target-addr localhost:8100 --table-name Music --partition-key-name Artist --sort-key-name SongTitle
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
    ./day42_raft_nosql_simulator create-table --target-addr localhost:8100 --table-name Music --partition-key-name Artist --sort-key-name SongTitle
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
9.  **サーバー停止**: ターミナル1で `Ctrl+C`
