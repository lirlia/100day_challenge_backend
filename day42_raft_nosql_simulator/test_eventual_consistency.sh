#!/bin/bash

# テスト設定
CLI_BIN="./day42_raft_nosql_simulator"
LOG_DIR="logs_consistency_test"
SERVER_COMBINED_LOG_FILE="$LOG_DIR/server_combined_consistency.log"

# 各ノードのHTTP APIアドレス
NODE0_API_ADDR="localhost:8100"
NODE1_API_ADDR="localhost:8101"
NODE2_API_ADDR="localhost:8102"

LEADER_ADDR=$NODE0_API_ADDR
FOLLOWER1_ADDR=$NODE1_API_ADDR
FOLLOWER2_ADDR=$NODE2_API_ADDR

CONSISTENCY_TEST_TABLE="ConsistencyDemoTable"
# テーブルのパーティションキー名とソートキー名 (実際のテーブル定義に合わせる)
# CLIの create-table で --partition-key-name と --sort-key-name で指定する名前
TABLE_PK_NAME="ID"
TABLE_SK_NAME="Timestamp" # 例: 時系列データならTimestampなど

CONSISTENCY_ITEM_PK_VALUE="eventualDemoItem1"
CONSISTENCY_ITEM_SK_VALUE="$(date +%s)"
CONSISTENCY_ITEM_ATTRS_JSON_PART="\\"Data\\":\\"InitialValue\\"" # その他の属性

# アイテムデータ構築
# 注意: $TABLE_PK_NAME と $TABLE_SK_NAME をJSONのキーとして正しく展開するために工夫が必要
ITEM_DATA_JSON_CONTENT="\\"$TABLE_PK_NAME\\":\\"$CONSISTENCY_ITEM_PK_VALUE\\",\\"$TABLE_SK_NAME\\":\\"$CONSISTENCY_ITEM_SK_VALUE\\",$CONSISTENCY_ITEM_ATTRS_JSON_PART"
ITEM_DATA_FOR_CLI='{"'$TABLE_PK_NAME'":"'$CONSISTENCY_ITEM_PK_VALUE'","'$TABLE_SK_NAME'":"'$CONSISTENCY_ITEM_SK_VALUE'","Data":"InitialValue"}'

SERVER_PID_FILE="$LOG_DIR/server.pid"

# クリーンアップ関数
cleanup() {
  echo "結果整合性テストをクリーンアップしています..."
  if [ -f "$SERVER_PID_FILE" ]; then
    SERVER_PID_TO_KILL=$(cat "$SERVER_PID_FILE")
    if [ -n "$SERVER_PID_TO_KILL" ] && ps -p "$SERVER_PID_TO_KILL" >/dev/null; then
      echo "サーバー停止中 (PID: $SERVER_PID_TO_KILL)..."
      kill "$SERVER_PID_TO_KILL"
      pkill -P "$SERVER_PID_TO_KILL"
      pgrep -P "$SERVER_PID_TO_KILL" | xargs kill
      wait "$SERVER_PID_TO_KILL" 2>/dev/null
      echo "サーバーが停止しました。"
      /bin/rm -f "$SERVER_PID_FILE"
    else
      echo "サーバープロセス (PID: $SERVER_PID_TO_KILL) が見つからないか既に停止しています。"
    fi
  else
    echo "サーバーPIDファイルが見つかりません。残っているサーバープロセスを停止しています..."
    pkill -f "$CLI_BIN server"
  fi

  echo "メインデータディレクトリ: data を削除中 (存在する場合)"
  /bin/rm -rf data # プロジェクトルートのdataを削除
  echo "ログディレクトリを削除中: $LOG_DIR"
  /bin/rm -rf "$LOG_DIR"
  echo "クリーンアップが完了しました。"
}

# テスト失敗時のハンドラ
handle_error() {
  echo "--------------------------------------------------"
  echo "エラー: テストが以下のステップで失敗しました: $1"
  echo "--------------------------------------------------"
  if [ -f "$SERVER_COMBINED_LOG_FILE" ]; then
    echo "サーバー統合ログ ($SERVER_COMBINED_LOG_FILE) - 最後の50行:"
    tail -n 50 "$SERVER_COMBINED_LOG_FILE"
  else
    echo "サーバー統合ログ ($SERVER_COMBINED_LOG_FILE) が見つかりません。"
  fi
  echo "--------------------------------------------------"
  exit 1
}

trap cleanup EXIT SIGINT SIGTERM

# 色付け用
RESET_COLOR="\033[0m"
GREEN_COLOR="\033[32m"
RED_COLOR="\033[31m"
YELLOW_COLOR="\033[33m"

echo_section() {
  printf "\n${YELLOW_COLOR}=== %s ===${RESET_COLOR}\n" "$1"
}

echo_subsection() {
  printf "\n  ${YELLOW_COLOR}--- %s ---${RESET_COLOR}\n" "$1"
}

check_command_success() {
  local step_name="$1"
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    printf "${RED_COLOR}失敗: '%s'のコマンドが失敗しました (終了コード: %d)${RESET_COLOR}\n" "$step_name" "$exit_code"
    handle_error "$step_name command failed"
  fi
  printf "${GREEN_COLOR}成功: %s コマンドが正常に実行されました。${RESET_COLOR}\n" "$step_name"
}

check_grep_success() {
  local step_name="$1"
  local pattern="$2"
  local input_text="$3"

  echo "$input_text" | grep -qE "$pattern"
  local exit_code=$?

  if [ $exit_code -ne 0 ]; then
    printf "${RED_COLOR}失敗: '%s'のgrep確認が失敗しました。パターン '%s' が出力に見つかりません:${RESET_COLOR}\n" "$step_name" "$pattern"
    echo "$input_text"
    handle_error "Grep check for '$step_name' failed"
  fi
  printf "${GREEN_COLOR}成功: '%s'のgrep確認が成功しました。パターン '%s' が見つかりました。${RESET_COLOR}\n" "$step_name" "$pattern"
}

# --- テストのメイン処理 ---
main() {
  echo "結果整合性デモンストレーションテストを開始します..."
  mkdir -p "$LOG_DIR"
  /bin/rm -rf data # 既存のデータディレクトリを削除
  /bin/rm -f "$SERVER_COMBINED_LOG_FILE"
  /bin/rm -f "$SERVER_PID_FILE"

  echo_section "必要に応じてサーバーをビルド"
  # ここではビルド済みを前提とするか、毎回ビルドするか
  # test_e2e.sh に倣い、毎回ビルド
  go build -o "$CLI_BIN" ./cmd/cli
  check_command_success "CLIビルド"

  echo_section "サーバークラスタの起動"
  echo "コマンド実行: $CLI_BIN server > \"$SERVER_COMBINED_LOG_FILE\" 2>&1 &"
  "$CLI_BIN" server >"$SERVER_COMBINED_LOG_FILE" 2>&1 &
  SERVER_PID_VALUE=$!
  echo "$SERVER_PID_VALUE" >"$SERVER_PID_FILE"
  printf "サーバークラスタがPID %dで起動されました。\n" "$SERVER_PID_VALUE"
  echo "サーバーの初期化とリーダー選出を待機中（約3秒）..."
  sleep 3

  if ! ps -p "$SERVER_PID_VALUE" >/dev/null; then
    printf "${RED_COLOR}エラー: 起動後にサーバープロセス %d が見つかりません。${RESET_COLOR}\n" "$SERVER_PID_VALUE"
    cat "$SERVER_COMBINED_LOG_FILE"
    exit 1
  fi
  echo "サーバープロセス $SERVER_PID_VALUE が実行中です。"
  echo "リーダー: $LEADER_ADDR, フォロワー1: $FOLLOWER1_ADDR, フォロワー2: $FOLLOWER2_ADDR"

  # A. テスト用テーブル作成
  echo_subsection "A. テーブル '$CONSISTENCY_TEST_TABLE' を作成 (PK: $TABLE_PK_NAME, SK: $TABLE_SK_NAME)"
  OUTPUT_CREATE_TABLE=$("$CLI_BIN" create-table --target-addr "$LEADER_ADDR" --table-name "$CONSISTENCY_TEST_TABLE" --partition-key-name "$TABLE_PK_NAME" --sort-key-name "$TABLE_SK_NAME" 2>&1)
  check_command_success "テーブル '$CONSISTENCY_TEST_TABLE' の作成"
  check_grep_success "テーブル作成レスポンス" "CreateTable API call successful" "$OUTPUT_CREATE_TABLE"

  # B. リーダーへの書き込み
  echo_subsection "B. アイテム (PK: $CONSISTENCY_ITEM_PK_VALUE, SK: $CONSISTENCY_ITEM_SK_VALUE) をリーダー ($LEADER_ADDR) に書き込み"
  echo "CLI用アイテムデータ: $ITEM_DATA_FOR_CLI"
  OUTPUT_PUT_ITEM=$("$CLI_BIN" put-item --target-addr "$LEADER_ADDR" --table-name "$CONSISTENCY_TEST_TABLE" --item-data "$ITEM_DATA_FOR_CLI" 2>&1)
  check_command_success "リーダーへのアイテム書き込み"
  check_grep_success "アイテム書き込みレスポンス" "PutItem API call successful" "$OUTPUT_PUT_ITEM"
  echo "アイテムがリーダーに書き込まれました。"

  # C. 直後のフォロワーからの読み取り (失敗または古いデータを期待) - Follower 1
  echo_subsection "C. フォロワー1 ($FOLLOWER1_ADDR) から即時にアイテムを取得を試行"
  IMMEDIATE_GET_OUTPUT1=$("$CLI_BIN" get-item --target-addr "$FOLLOWER1_ADDR" --table-name "$CONSISTENCY_TEST_TABLE" --partition-key "$CONSISTENCY_ITEM_PK_VALUE" --sort-key "$CONSISTENCY_ITEM_SK_VALUE" 2>&1)
  if echo "$IMMEDIATE_GET_OUTPUT1" | grep -qE "Item not found|Failed to get item from KVStore: item file does not exist"; then
    printf "${GREEN_COLOR}成功 (期待通り): フォロワー1 (%s) で即時にアイテムが見つかりませんでした。${RESET_COLOR}\n" "$FOLLOWER1_ADDR"
  elif echo "$IMMEDIATE_GET_OUTPUT1" | grep -q "GetItem API call successful"; then
    printf "${RED_COLOR}予期せぬ結果: フォロワー1 (%s) で即時にアイテムが見つかりました。出力:${RESET_COLOR}\n" "$FOLLOWER1_ADDR"
    echo "$IMMEDIATE_GET_OUTPUT1"
  else
    printf "${YELLOW_COLOR}情報: フォロワー1 (%s) から即時取得した出力 (未検出またはエラーを期待):${RESET_COLOR}\n" "$FOLLOWER1_ADDR"
    echo "$IMMEDIATE_GET_OUTPUT1"
  fi

  # C. 直後のフォロワーからの読み取り (失敗または古いデータを期待) - Follower 2
  echo_subsection "C. フォロワー2 ($FOLLOWER2_ADDR) から即時にアイテムを取得を試行"
  IMMEDIATE_GET_OUTPUT2=$("$CLI_BIN" get-item --target-addr "$FOLLOWER2_ADDR" --table-name "$CONSISTENCY_TEST_TABLE" --partition-key "$CONSISTENCY_ITEM_PK_VALUE" --sort-key "$CONSISTENCY_ITEM_SK_VALUE" 2>&1)
  if echo "$IMMEDIATE_GET_OUTPUT2" | grep -qE "Item not found|Failed to get item from KVStore: item file does not exist"; then
    printf "${GREEN_COLOR}成功 (期待通り): フォロワー2 (%s) で即時にアイテムが見つかりませんでした。${RESET_COLOR}\n" "$FOLLOWER2_ADDR"
  elif echo "$IMMEDIATE_GET_OUTPUT2" | grep -q "GetItem API call successful"; then
    printf "${RED_COLOR}予期せぬ結果: フォロワー2 (%s) で即時にアイテムが見つかりました。出力:${RESET_COLOR}\n" "$FOLLOWER2_ADDR"
    echo "$IMMEDIATE_GET_OUTPUT2"
  else
    printf "${YELLOW_COLOR}情報: フォロワー2 (%s) から即時取得した出力 (未検出またはエラーを期待):${RESET_COLOR}\n" "$FOLLOWER2_ADDR"
    echo "$IMMEDIATE_GET_OUTPUT2"
  fi

  # D. 待機
  CONSISTENCY_WAIT_SECONDS=2 # 結果整合のため十分な時間を設定 (長めに設定)
  echo_subsection "D. データ伝播のため $CONSISTENCY_WAIT_SECONDS 秒間待機中..."
  sleep $CONSISTENCY_WAIT_SECONDS

  # E. 待機後のフォロワーからの読み取り (成功を期待) - Follower 1
  echo_subsection "E. 待機後にフォロワー1 ($FOLLOWER1_ADDR) からアイテムを取得"
  LATER_GET_OUTPUT1=$("$CLI_BIN" get-item --target-addr "$FOLLOWER1_ADDR" --table-name "$CONSISTENCY_TEST_TABLE" --partition-key "$CONSISTENCY_ITEM_PK_VALUE" --sort-key "$CONSISTENCY_ITEM_SK_VALUE" 2>&1)
  check_command_success "待機後のフォロワー1からのアイテム取得"
  check_grep_success "フォロワー1からの取得 - PK値" "\"$TABLE_PK_NAME\":\"$CONSISTENCY_ITEM_PK_VALUE\"" "$LATER_GET_OUTPUT1"
  check_grep_success "フォロワー1からの取得 - SK値" "\"$TABLE_SK_NAME\":\"$CONSISTENCY_ITEM_SK_VALUE\"" "$LATER_GET_OUTPUT1"
  echo "待機後、フォロワー1 ($FOLLOWER1_ADDR) からアイテムが正常に取得されました。"

  # F. 待機後のフォロワーからの読み取り (成功を期待) - Follower 2
  echo_subsection "F. 待機後にフォロワー2 ($FOLLOWER2_ADDR) からアイテムを取得"
  LATER_GET_OUTPUT2=$("$CLI_BIN" get-item --target-addr "$FOLLOWER2_ADDR" --table-name "$CONSISTENCY_TEST_TABLE" --partition-key "$CONSISTENCY_ITEM_PK_VALUE" --sort-key "$CONSISTENCY_ITEM_SK_VALUE" 2>&1)
  check_command_success "待機後のフォロワー2からのアイテム取得"
  check_grep_success "フォロワー2からの取得 - PK値" "\"$TABLE_PK_NAME\":\"$CONSISTENCY_ITEM_PK_VALUE\"" "$LATER_GET_OUTPUT2"
  check_grep_success "フォロワー2からの取得 - SK値" "\"$TABLE_SK_NAME\":\"$CONSISTENCY_ITEM_SK_VALUE\"" "$LATER_GET_OUTPUT2"
  echo "待機後、フォロワー2 ($FOLLOWER2_ADDR) からアイテムが正常に取得されました。"

  # G. (任意) もう一度リーダーに別のアイテムを書き込み、再度伝播を確認するなど、より複雑なシナリオも追加可能

  # H. テスト用テーブル削除
  echo_subsection "H. テーブル '$CONSISTENCY_TEST_TABLE' を削除"
  OUTPUT_DELETE_TABLE=$("$CLI_BIN" delete-table --target-addr "$LEADER_ADDR" --table-name "$CONSISTENCY_TEST_TABLE" 2>&1)
  check_command_success "テーブル '$CONSISTENCY_TEST_TABLE' の削除"
  check_grep_success "テーブル削除レスポンス" "DeleteTable API call successful" "$OUTPUT_DELETE_TABLE"

  echo_section "結果整合性デモンストレーションテストが正常に完了しました！"
}

# スクリプト実行
main
