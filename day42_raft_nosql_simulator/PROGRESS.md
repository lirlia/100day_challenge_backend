# PROGRESS.md - Day42: Go Raft NoSQL Simulator

## フェーズ1: プロジェクト初期化とRaftクラスタ基盤
- [x] プロジェクトディレクトリ作成 (`day42_raft_nosql_simulator`) と `template` からのコピー (完了)
- [x] `package.json` の `name` を `day42_raft_nosql_simulator` に更新 (完了)
- [x] Goモジュールの初期化 (`go mod init github.com/lirlia/100day_challenge_backend/day42_raft_nosql_simulator`) (完了)
- [x] 必要なGoライブラリのインストール (`hashicorp/raft`, `github.com/hashicorp/raft-boltdb`, `github.com/spf13/cobra`, `github.com/peterh/liner`, `github.com/stretchr/testify`) (完了)
- [x] `README.md` にプロジェクト概要とビルド/実行方法を記述 (初期版) (完了)
- [x] `PROGRESS.md` に作業工程を記載 (このファイル) (完了)
- [x] 基本的なRaftノード構造の定義 (`internal/raft_node/node.go`) (完了)
- [x] 単一Raftノードの起動と停止処理の実装 (複数ノード起動の中で確認) (完了)
- [x] 複数Raftノード (3ノード想定) をTCPトランスポートでクラスタを形成する処理の実装 (完了)
- [x] リーダー選出の確認 (ログ出力などで) (完了)
- [x] テスト作成: クラスタ起動、リーダー選出、シャットダウン (`internal/raft_node/node_test.go`) (完了)
- [x] テスト実施 (`go test ./internal/raft_node/...`) と確認
- [x] コミット: `day42: step 1/7 Raft cluster foundation setup and initial tests`

## フェーズ2: データストアとFSM (Finite State Machine)
- [X] **FSM実装 (`internal/store/fsm.go`)**
    - [X] `TableMetadata` 構造体定義と `FSM` へのテーブルメタデータマップ追加
    - [X] `Apply` メソッドでの `CreateTableCommand`, `DeleteTableCommand` 処理実装
    - [X] `Snapshot` / `Restore` メソッドでのテーブルメタデータ永続化・復元実装
    - [X] `GetTableMetadata`, `ListTables` リード専用メソッド実装
    - [X] `Apply` メソッドでの `PutItemCommand`, `DeleteItemCommand` 処理実装 (アイテム操作)
- [X] **ローカルデータストア実装 (`internal/store/kv_store.go`)**
    - [X] `KVStore` 構造体定義と初期化 (ベースディレクトリ管理)
    - [X] `EnsureTableDir`, `RemoveTableDir` (テーブルディレクトリ操作) 実装
    - [X] `PutItem`: アイテムをJSONファイルとして保存 (LWW考慮)
    - [X] `GetItem`: アイテムをJSONファイルから読み込み
    - [X] `DeleteItem`: アイテムのJSONファイルを削除
    - [X] `QueryItems`: パーティションキーとソートキープレフィックスでのスキャン実装
- [X] **Raftノード拡張 (`internal/raft_node/node.go`)**
    - [X] `Node` への `KVStore` 参照追加と `NewNode` での初期化
    - [X] `ProposeCreateTable`, `ProposeDeleteTable` 実装
    - [X] `ProposePutItem`, `ProposeDeleteItem` 実装
    - [X] ローカルリード用 `GetItemFromLocalStore`, `QueryItemsFromLocalStore` メソッド実装 (KVStoreを直接呼び出し)
- [X] **単体テスト**
    - [X] `commands_test.go`: コマンド (デ)シリアライズテスト
    - [X] `fsm_test.go`: FSMのテーブル操作、アイテム操作、スナップショット/リストアのテスト
    - [X] `kv_store_test.go`: KVStoreのディレクトリ操作、アイテムCRUD操作、クエリ操作のテスト
- [X] **統合テスト (`internal/raft_node/integration_test.go`)**
    - [X] クラスタ経由でのテーブル作成・削除・一覧取得のテスト
    - [X] クラスタ経由でのアイテムPut・Get・Delete・Queryのテスト
    - [ ] リーダー障害時のスナップショットからの復旧テスト (発展)
- [X] コミット: `day42: step 2/7 Data store, FSM, and initial integration tests`

## フェーズ3: CLIインターフェースと書き込み/読み取りパス (コア機能)
- [X] CLIフレームワーク (`spf13/cobra`) を用いた基本的なCLI構造の作成 (`cmd/cli/main.go`, `cmd/cli/root.go`, `cmd/cli/table.go`, `cmd/cli/item.go`)
- [X] `create-table` コマンドのスタブ実装 (`--table-name <name> --partition-key <pk_name> [--sort-key <sk_name>:<pk_type>]`)
- [X] `put-item` コマンドのスタブ実装 (`--table-name <name> --item '<json_object_string>'`)
- [X] `get-item` コマンドのスタブ実装 (`--table-name <name> --key '<json_object_string_for_key>'`)
- [X] `delete-item` と `query-items` コマンドのスタブ実装 (item.go)
- [X] `--target-addr` グローバル永続フラグの実装 (root.go)
- [X] **RaftノードへのHTTP APIエンドポイントの実装 (`internal/server/http_api.go`)**
    - [X] `/create-table` (POST)
    - [X] `/put-item` (POST)
    - [X] `/get-item` (POST)
    - [X] `/delete-item` (POST)
    - [X] `/query-items` (POST)
    - [X] `/status` (GET)
    - [X] リーダーシップチェックとフォロワーへのエラー応答 (Misdirected Request)
    - [X] `raft_node.Node` にHTTPサーバー起動・停止処理の組み込み
    - [X] 循環参照の解消 (RaftNodeProxyインターフェース導入)
- [X] **CLIからHTTP APIを呼び出すクライアントロジックの実装 (`internal/client/client.go`)**
    - [X] テーブル作成リクエスト
    - [X] アイテムPutリクエスト
    - [X] アイテムGetリクエスト
    - [X] アイテムDeleteリクエスト
    - [X] アイテムQueryリクエスト
    - [X] ステータス取得リクエスト
    - [X] `cmd/cli/table.go`, `cmd/cli/item.go` からクライアントを利用
- [X] コミット: `day42: step 3/7 CLI, HTTP API, client logic implementation and E2E tests passed`

## フェーズ4: その他のテーブル・アイテム操作
- [x] `delete-table` コマンドの実装 (`--table-name <name>`)
- [x] `delete-item` コマンドの実装 (`--table-name <name> --key '<json_object_string_for_key>'`)
- [x] `query-items` コマンドの実装 (`--table-name <name> --partition-key-value <value>`)
- [x] テスト:
    - [x] `delete-table` コマンドがAPI経由で正しく動作すること (E2Eテストで確認)
    - [x] アイテム削除 (`delete-item`) 後に `get-item` で取得できないこと (E2Eテストで確認済み)
    - [x] `query-items` が正しくパーティションキーでフィルタされたアイテム一覧を返すこと (E2Eテストで確認済み)
    - [x] テーブル削除 (`delete-table`) 後、そのテーブルへの操作がエラーになること (E2Eテストで確認)
- [x] コミット: `day42: step 4/7 delete-table command, API endpoint, and tests completed`

## フェーズ5: Last Write Wins (LWW) とフォワーディング
- [x] `put-item` および `delete-item` (論理削除の場合) 時に内部的に最終更新タイムスタンプを記録・更新する処理の確認と強化 (確認済み)
- [x] FSMの `Apply` で `put-item` を処理する際に、既存アイテムのタイムスタンプと比較し、新しい場合のみ更新するロジックを実装・確認 (確認済み、`kv_store.go` で実装)
- [x] 書き込み系コマンド (`create-table`, `delete-table`, `put-item`, `delete-item`) を非リーダーノードが受け取った場合にリーダーへ転送するロジックを実装・確認 (クライアントサイドでリトライ実装)
- [x] テスト:
    - [x] 同じキーに対して異なるノードからほぼ同時に `put-item` を行い (シミュレート)、LWWが機能することを確認 (既存のKVStoreのLWWテストと、今回のE2Eでの複数Putで間接的に確認)
    - [x] 非リーダーノードへの書き込みリクエストがリーダーに転送され処理されることを確認 (E2E Test 9で確認)
- [x] コミット: `day42: step 5/7 LWW and client-side forwarding implemented and tested`

## フェーズ6: 安定化とリファクタリング
- [x] エラーハンドリングの改善 (CLIでのエラー表示、ノード間通信エラーなど)
- [ ] ログ出力の整備 (デバッグ用、通常運用時用)
- [ ] コード全体のリファクタリング、可読性向上
- [x] Makefile の作成 (ビルド、実行、クリーンなど)
- [x] テスト: 主要コマンドの動作を一通り再確認
- [ ] コミット: `day42: step 6/7 Stabilization and refactoring`

## フェーズ7: ドキュメントと最終化
- [ ] `README.md` のビルド方法、CLI使用方法を詳細に更新
- [ ] コード全体の最終確認、不要なコメントやログの削除
- [ ] 簡単な動作デモシナリオを `README.md` に記載
- [ ] `.cursor/rules/knowledge.mdc` の更新
- [ ] コミット: `day42: step 7/7 Documentation and finalization`

## フェーズ 2: テーブル管理とキーバリュー操作のためのFSMロジック実装
