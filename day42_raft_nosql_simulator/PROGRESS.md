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
- [ ] テスト実施 (`go test ./internal/raft_node/...`) と確認
- [ ] コミット: `day42: step 1/7 Raft cluster foundation setup and initial tests`

## フェーズ2: データストアとFSM (Finite State Machine)
- [ ] アイテムのデータ構造定義 (`internal/store/types.go` または `pkg/types/types.go`) - パーティションキー、ソートキー、データ本体、最終更新タイムスタンプ
- [ ] テーブルメタデータの構造定義 (`internal/store/types.go`)
- [ ] Raft FSMインターフェース (`raft.FSM`) を実装する構造体の作成 (`internal/store/fsm.go`)
- [ ] FSMに `Apply` メソッドを実装 (ログエントリをローカルストアに適用する処理)
    - `create-table`, `delete-table`, `put-item`, `delete-item` 操作に対応
- [ ] FSMに `Snapshot` と `Restore` メソッドを実装 (Raftログ圧縮のため)
- [ ] 各ノードのローカルデータストアの設計と実装 (JSONファイルベース: `data/<node_id>/_tables.json` および `data/<node_id>/<table_name>.json`)
- [ ] コミット: `day42: step 2/7 Data store and FSM implementation`

## フェーズ3: CLIインターフェースと書き込み/読み取りパス (コア機能)
- [ ] CLIフレームワーク (`spf13/cobra`) を用いた基本的なCLI構造の作成 (`cmd/cli/main.go`, `cmd/cli/root.go`)
- [ ] `create-table` コマンドの実装 (`--table-name <name> --partition-key <pk_name>:<pk_type> [--sort-key <sk_name>:<sk_type>]`)
- [ ] `put-item` コマンドの実装 (`--table-name <name> --item '<json_object_string>'`)
    - リクエストをRaftノードに送信する処理 (デフォルトはランダム、`--target-node <node_id>` で指定可)
    - リクエストを受け取ったノードがリーダーでなければリーダーに転送する処理
    - リーダーが操作をRaftログとして提案する処理 (`raft.Apply()`)
    - FSMが更新を適用し、ローカルデータストアが更新されることを確認
- [ ] `get-item` コマンドの実装 (`--table-name <name> --key '<json_object_string_for_key>'`)
    - リクエストを受け取ったノードがローカルデータストアから直接読み取る処理 (結果整合性)
- [ ] `--target-node <node_id>` グローバルオプションまたはコマンドオプションの実装
- [ ] テスト:
    - テーブル作成 (`create-table`)
    - アイテム書き込み (`put-item`)
    - アイテム読み取り (`get-item`) を複数ノードに対して行い、結果整合性を確認
- [ ] コミット: `day42: step 3/7 CLI interface and core write/read path (create-table, put-item, get-item)`

## フェーズ4: その他のテーブル・アイテム操作
- [ ] `delete-table` コマンドの実装 (`--table-name <name>`)
- [ ] `delete-item` コマンドの実装 (`--table-name <name> --key '<json_object_string_for_key>'`)
- [ ] `query-items` コマンドの実装 (`--table-name <name> --partition-key-value <value>`)
- [ ] テスト:
    - アイテム削除 (`delete-item`) 後に `get-item` で取得できないこと
    - `query-items` が正しくパーティションキーでフィルタされたアイテム一覧を返すこと
    - テーブル削除 (`delete-table`) 後、そのテーブルへの操作がエラーになること
- [ ] コミット: `day42: step 4/7 Additional item/table operations (delete-table, delete-item, query-items)`

## フェーズ5: Last Write Wins (LWW) とフォワーディング
- [ ] `put-item` および `delete-item` (論理削除の場合) 時に内部的に最終更新タイムスタンプを記録・更新する処理の確認と強化
- [ ] FSMの `Apply` で `put-item` を処理する際に、既存アイテムのタイムスタンプと比較し、新しい場合のみ更新するロジックを実装・確認 (LWW)
- [ ] 書き込み系コマンド (`create-table`, `delete-table`, `put-item`, `delete-item`) を非リーダーノードが受け取った場合にリーダーへ転送するロジックを実装・確認
- [ ] テスト:
    - 同じキーに対して異なるノードからほぼ同時に `put-item` を行い (シミュレート)、LWWが機能することを確認
    - 非リーダーノードへの書き込みリクエストがリーダーに転送され処理されることを確認
- [ ] コミット: `day42: step 5/7 LWW conflict resolution and request forwarding`

## フェーズ6: 安定化とリファクタリング
- [ ] エラーハンドリングの改善 (CLIでのエラー表示、ノード間通信エラーなど)
- [ ] ログ出力の整備 (デバッグ用、通常運用時用)
- [ ] コード全体のリファクタリング、可読性向上
- [ ] Makefile の作成 (ビルド、実行、クリーンなど)
- [ ] テスト: 主要コマンドの動作を一通り再確認
- [ ] コミット: `day42: step 6/7 Stabilization and refactoring`

## フェーズ7: ドキュメントと最終化
- [ ] `README.md` のビルド方法、CLI使用方法を詳細に更新
- [ ] コード全体の最終確認、不要なコメントやログの削除
- [ ] 簡単な動作デモシナリオを `README.md` に記載
- [ ] `.cursor/rules/knowledge.mdc` の更新
- [ ] コミット: `day42: step 7/7 Documentation and finalization`

## フェーズ 2: テーブル管理とキーバリュー操作のためのFSMロジック実装

- [X] **コマンド構造体定義 (`internal/store/commands.go`)**
    - [X] `CreateTableCommand`, `DeleteTableCommand`, `PutItemCommand`, `DeleteItemCommand` 構造体定義
    - [X] コマンドのJSONシリアライズ/デシリアライズヘルパー関数実装
- [X] **FSM実装 (`internal/store/fsm.go`)**
    - [X] `TableMetadata` 構造体定義と `FSM` へのテーブルメタデータマップ追加
    - [X] `Apply` メソッドでの `CreateTableCommand`, `DeleteTableCommand` 処理実装
    - [X] `Snapshot` / `Restore` メソッドでのテーブルメタデータ永続化・復元実装
    - [X] `GetTableMetadata`, `ListTables` リード専用メソッド実装
    - [ ] `Apply` メソッドでの `PutItemCommand`, `DeleteItemCommand` 処理実装 (アイテム操作)
- [X] **ローカルデータストア実装 (`internal/store/kv_store.go`)**
    - [X] `KVStore` 構造体定義と初期化 (ベースディレクトリ管理)
    - [X] `EnsureTableDir`, `RemoveTableDir` (テーブルディレクトリ操作) 実装
    - [ ] `PutItem`: アイテムをJSONファイルとして保存 (LWW考慮)
    - [ ] `GetItem`: アイテムをJSONファイルから読み込み
    - [ ] `DeleteItem`: アイTEMのJSONファイルを削除
    - [ ] `QueryItems`: パーティションキーに基づいたアイテムスキャンとフィルタリング
- [X] **Raftノード拡張 (`internal/raft_node/node.go`)**
    - [X] `NewNode` で `KVStore` と `FSM` を正しく初期化・連携
    - [X] `ProposeCreateTable`, `ProposeDeleteTable` 実装
    - [ ] `ProposePutItem`, `ProposeDeleteItem` 実装
    - [ ] ローカルリード用 `GetItem`, `QueryItems` メソッド実装 (KVStoreを直接呼び出し)
- [X] **単体テスト**
    - [X] `commands_test.go`: コマンド (デ)シリアライズテスト
    - [X] `fsm_test.go`: FSMのテーブル操作、アイテム操作、スナップショット/リストアのテスト
    - [X] `kv_store_test.go`: KVStoreのディレクトリ操作、アイテムCRUD操作、クエリ操作のテスト
- [ ] **統合テスト (`main.go` または別テストファイル)**
    - [ ] クラスタ経由でのテーブル作成・削除・一覧取得のテスト
    - [ ] クラスタ経由でのアイテムPut・Get・Delete・Queryのテスト
    - [ ] リーダー障害時のスナップショットからの復旧テスト (発展)
- [ ] **PROGRESS.md 更新とコミット**

## フェーズ 3: CLIコマンドの実装 (Cobra)
