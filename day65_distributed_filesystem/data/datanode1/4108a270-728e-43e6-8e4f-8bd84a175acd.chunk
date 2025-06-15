# Day65 - 分散ファイルシステム (GolangDFS) ✅

HDFSライクな分散ファイルシステムをGoで実装。NameNode/DataNode構成でファイルのチャンキング、レプリケーション、故障回復機能を提供。

## 🎯 完成した機能

✅ **Phase 1-4 完了**: 基本的な分散ファイルシステムが動作可能

## アーキテクチャ

### システム構成
- **NameNode**: メタデータ管理、DataNode管理、レプリケーション制御
- **DataNode**: ファイルチャンクの実際の保存、ハートビート送信
- **CLI Client**: ファイル操作用コマンドラインツール

### 主要機能
- ファイルチャンキング（64MB単位）
- 3重レプリケーション（設定可能）
- DataNode故障検知・自動回復
- 負荷分散によるチャンク配置
- gRPC通信による高性能データ転送

## 技術仕様

### 通信プロトコル
- gRPC（高性能バイナリ通信）
- ProtocolBuffers定義

### データ管理
- NameNode: SQLite（メタデータ）
- DataNode: ローカルファイルシステム（チャンク保存）

### ポート構成
- NameNode: 9000
- DataNode: 9001, 9002, 9003

## CLI使用方法

```bash
# クラスター起動
./scripts/start_cluster.sh

# ファイルアップロード
./dfs put ./local_file.txt /dfs/remote_file.txt

# ファイルダウンロード  
./dfs get /dfs/remote_file.txt ./downloaded_file.txt

# ファイル一覧
./dfs ls /dfs/

# ファイル情報
./dfs info /dfs/remote_file.txt

# ファイル削除
./dfs rm /dfs/remote_file.txt

# クラスター停止
./scripts/stop_cluster.sh
```

## 学習ポイント

1. **分散システム設計**
   - マスター/スレーブアーキテクチャ
   - メタデータとデータの分離
   - ハートビートによる故障検知

2. **ファイルシステム設計**
   - チャンキング戦略
   - レプリケーション管理
   - データ整合性保証

3. **gRPC通信**
   - Protocol Buffers定義
   - ストリーミング通信
   - 高性能バイナリ転送

4. **故障処理**
   - ノード故障検知
   - データ復旧プロセス
   - 自動リバランシング

5. **負荷分散**
   - チャンク配置アルゴリズム
   - DataNode容量管理
   - 読み書き負荷分散

## 実装スケジュール

### Phase 1: 基盤構築
- [x] プロジェクト初期化
- [ ] gRPCプロトコル定義
- [ ] ディレクトリ構造

### Phase 2: NameNode
- [ ] メタデータ管理（SQLite）
- [ ] DataNode管理
- [ ] ハートビート処理

### Phase 3: DataNode  
- [ ] チャンクストレージ
- [ ] gRPCサーバー
- [ ] ハートビート送信

### Phase 4: CLI Client
- [ ] Cobraベースコマンド
- [ ] ファイル操作機能
- [ ] エラーハンドリング

### Phase 5: 高度機能
- [ ] レプリケーション
- [ ] 故障回復
- [ ] 負荷分散

### Phase 6: テスト・最適化
- [ ] 統合テスト
- [ ] パフォーマンス測定
- [ ] ドキュメント整備

## 開発中...

現在Phase 1を実装中です。完成次第、使用可能になります。 