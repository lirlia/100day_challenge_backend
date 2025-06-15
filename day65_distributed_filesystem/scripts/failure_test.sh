#!/bin/bash

# 障害試験スクリプト for GolangDFS
set -e

DFS_BIN="./bin/dfs"
LOG_DIR="logs"
TEST_DATA_DIR="test_data"

echo "🧪 GolangDFS 障害試験開始"
echo "=================================="

# カラー出力用関数
red() { echo -e "\033[31m$1\033[0m"; }
green() { echo -e "\033[32m$1\033[0m"; }
yellow() { echo -e "\033[33m$1\033[0m"; }
blue() { echo -e "\033[34m$1\033[0m"; }

# テストファイル作成
setup_test_data() {
  echo "📁 テストデータ作成中..."
  mkdir -p $TEST_DATA_DIR

  # 小さなファイル (1チャンク以下)
  echo "小さなテストファイルです。" >$TEST_DATA_DIR/small.txt
  for i in {1..10}; do
    echo "行 $i: 小さなファイルのテスト内容" >>$TEST_DATA_DIR/small.txt
  done

  # 大きなファイル (複数チャンク)
  echo "大きなテストファイルを作成中..."
  for i in {1..5000}; do
    echo "行 $i: これは大きなファイルのテスト用データです。チャンクが複数に分かれることを想定しています。" >>$TEST_DATA_DIR/large.txt
  done

  # 中程度のファイル
  for i in {1..1000}; do
    echo "行 $i: 中程度のサイズのファイルです。レプリケーションテスト用。" >>$TEST_DATA_DIR/medium.txt
  done

  green "✅ テストデータ作成完了"
  echo "  - small.txt: $(wc -c <$TEST_DATA_DIR/small.txt) bytes"
  echo "  - medium.txt: $(wc -c <$TEST_DATA_DIR/medium.txt) bytes"
  echo "  - large.txt: $(wc -c <$TEST_DATA_DIR/large.txt) bytes"
  echo
}

# クラスター状態確認
check_cluster_status() {
  echo "🔍 クラスター状態確認..."

  # NameNode確認
  if pgrep -f "namenode" >/dev/null; then
    green "✅ NameNode: 動作中"
  else
    red "❌ NameNode: 停止中"
  fi

  # DataNode確認
  for i in {1..3}; do
    if pgrep -f "datanode$i" >/dev/null; then
      green "✅ DataNode$i: 動作中"
    else
      red "❌ DataNode$i: 停止中"
    fi
  done
  echo
}

# ファイルアップロード
upload_test_files() {
  echo "📤 テストファイルアップロード..."

  $DFS_BIN put $TEST_DATA_DIR/small.txt /test/small.txt
  green "✅ small.txt アップロード完了"

  $DFS_BIN put $TEST_DATA_DIR/medium.txt /test/medium.txt
  green "✅ medium.txt アップロード完了"

  $DFS_BIN put $TEST_DATA_DIR/large.txt /test/large.txt
  green "✅ large.txt アップロード完了"

  echo
  echo "📋 アップロード済みファイル一覧:"
  $DFS_BIN ls /test/
  echo
}

# 障害試験1: DataNode単体障害
test_single_datanode_failure() {
  echo "🔥 試験1: DataNode単体障害"
  echo "------------------------"

  # DataNode1を停止
  yellow "🔌 DataNode1を停止します..."
  pkill -f "datanode1" || true
  sleep 3

  check_cluster_status

  # ファイルアクセステスト
  echo "📥 障害中のファイルアクセステスト..."

  if $DFS_BIN get /test/small.txt $TEST_DATA_DIR/small_after_failure.txt; then
    green "✅ small.txt ダウンロード成功（レプリカから取得）"
  else
    red "❌ small.txt ダウンロード失敗"
  fi

  if $DFS_BIN get /test/medium.txt $TEST_DATA_DIR/medium_after_failure.txt; then
    green "✅ medium.txt ダウンロード成功（レプリカから取得）"
  else
    red "❌ medium.txt ダウンロード失敗"
  fi

  # ファイル整合性確認
  if diff $TEST_DATA_DIR/small.txt $TEST_DATA_DIR/small_after_failure.txt >/dev/null; then
    green "✅ small.txt データ整合性OK"
  else
    red "❌ small.txt データ破損検出"
  fi

  if diff $TEST_DATA_DIR/medium.txt $TEST_DATA_DIR/medium_after_failure.txt >/dev/null; then
    green "✅ medium.txt データ整合性OK"
  else
    red "❌ medium.txt データ破損検出"
  fi

  echo
}

# 障害試験2: DataNode複数障害
test_multiple_datanode_failure() {
  echo "🔥 試験2: DataNode複数障害"
  echo "-------------------------"

  # DataNode2も停止（計2台停止）
  yellow "🔌 DataNode2も停止します（計2台障害）..."
  pkill -f "datanode2" || true
  sleep 3

  check_cluster_status

  # 新規ファイルアップロードテスト
  echo "📤 障害中の新規アップロードテスト..."
  echo "追加テストファイル" >$TEST_DATA_DIR/new_during_failure.txt

  if $DFS_BIN put $TEST_DATA_DIR/new_during_failure.txt /test/new_during_failure.txt; then
    yellow "⚠️  新規ファイルアップロード成功（レプリケーション数不足の可能性）"
  else
    red "❌ 新規ファイルアップロード失敗（期待される動作）"
  fi

  # 既存ファイルアクセステスト
  echo "📥 障害中の既存ファイルアクセステスト..."

  if $DFS_BIN get /test/large.txt $TEST_DATA_DIR/large_after_multi_failure.txt; then
    green "✅ large.txt ダウンロード成功（最後のレプリカから取得）"
  else
    red "❌ large.txt ダウンロード失敗"
  fi

  echo
}

# 障害試験3: 回復試験
test_recovery() {
  echo "🔄 試験3: DataNode回復試験"
  echo "------------------------"

  # DataNode1を再起動
  yellow "🔄 DataNode1を再起動します..."
  ./bin/datanode -id=datanode1 -port=9001 >$LOG_DIR/datanode1.log 2>&1 &
  sleep 3

  check_cluster_status

  # レプリケーション回復の確認（ハートビートで自動実行される）
  echo "⏱️  レプリケーション回復を待機中（30秒）..."
  sleep 30

  # ファイル情報確認
  echo "📊 ファイル情報確認:"
  $DFS_BIN info /test/small.txt || true
  $DFS_BIN info /test/medium.txt || true

  # DataNode2も再起動
  yellow "🔄 DataNode2を再起動します..."
  ./bin/datanode -id=datanode2 -port=9002 >$LOG_DIR/datanode2.log 2>&1 &
  sleep 3

  check_cluster_status

  echo "⏱️  完全回復を待機中（30秒）..."
  sleep 30

  green "✅ 回復試験完了"
  echo
}

# 障害試験4: NameNode障害
test_namenode_failure() {
  echo "🔥 試験4: NameNode障害"
  echo "--------------------"

  yellow "🔌 NameNodeを停止します..."
  pkill -f "namenode" || true
  sleep 3

  check_cluster_status

  # NameNode停止中のアクセステスト
  echo "📥 NameNode停止中のファイルアクセステスト..."

  if $DFS_BIN ls /test/ 2>/dev/null; then
    red "❌ 予期しない成功: NameNode停止中にアクセス可能"
  else
    green "✅ 期待される動作: NameNode停止中はアクセス不可"
  fi

  # NameNode復旧
  yellow "🔄 NameNodeを再起動します..."
  ./bin/namenode >$LOG_DIR/namenode.log 2>&1 &
  sleep 5

  # メタデータ復旧確認
  echo "📋 メタデータ復旧確認:"
  if $DFS_BIN ls /test/; then
    green "✅ メタデータ復旧成功"
  else
    red "❌ メタデータ復旧失敗"
  fi

  echo
}

# 最終確認
final_verification() {
  echo "🏁 最終確認"
  echo "----------"

  check_cluster_status

  echo "📋 全ファイル一覧:"
  $DFS_BIN ls /test/

  echo
  echo "📥 全ファイルダウンロードテスト:"

  # 全ファイルを再ダウンロードして整合性確認
  mkdir -p $TEST_DATA_DIR/final_check

  if $DFS_BIN get /test/small.txt $TEST_DATA_DIR/final_check/small.txt; then
    if diff $TEST_DATA_DIR/small.txt $TEST_DATA_DIR/final_check/small.txt >/dev/null; then
      green "✅ small.txt 最終確認OK"
    else
      red "❌ small.txt データ破損"
    fi
  else
    red "❌ small.txt ダウンロード失敗"
  fi

  if $DFS_BIN get /test/medium.txt $TEST_DATA_DIR/final_check/medium.txt; then
    if diff $TEST_DATA_DIR/medium.txt $TEST_DATA_DIR/final_check/medium.txt >/dev/null; then
      green "✅ medium.txt 最終確認OK"
    else
      red "❌ medium.txt データ破損"
    fi
  else
    red "❌ medium.txt ダウンロード失敗"
  fi

  if $DFS_BIN get /test/large.txt $TEST_DATA_DIR/final_check/large.txt; then
    if diff $TEST_DATA_DIR/large.txt $TEST_DATA_DIR/final_check/large.txt >/dev/null; then
      green "✅ large.txt 最終確認OK"
    else
      red "❌ large.txt データ破損"
    fi
  else
    red "❌ large.txt ダウンロード失敗"
  fi

  echo
  green "🎉 障害試験完了！"
  echo "======================"
}

# メイン実行
main() {
  # 前準備
  if [ ! -f "$DFS_BIN" ]; then
    echo "❌ DFSバイナリが見つかりません。まず 'make build' を実行してください。"
    exit 1
  fi

  if ! pgrep -f "namenode" >/dev/null; then
    echo "❌ NameNodeが起動していません。まず 'make run-cluster' を実行してください。"
    exit 1
  fi

  echo "⚠️  注意: この試験はクラスターのDataNodeを停止・再起動します。"
  echo "続行しますか？ (y/N)"
  read -r response
  if [[ ! "$response" =~ ^[Yy]$ ]]; then
    echo "障害試験をキャンセルしました。"
    exit 0
  fi

  # 試験実行
  setup_test_data
  check_cluster_status
  upload_test_files
  test_single_datanode_failure
  test_multiple_datanode_failure
  test_recovery
  test_namenode_failure
  final_verification
}

# 実行
main "$@"
