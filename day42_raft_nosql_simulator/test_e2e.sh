#!/bin/bash

# テスト設定
CLI_BIN="./day42_raft_nosql_simulator"
LOG_DIR="logs_e2e_test"
SERVER_LOG_FILE_NODE0="$LOG_DIR/server_node0.log" # 個別ログは現在使用していない
SERVER_LOG_FILE_NODE1="$LOG_DIR/server_node1.log" # 個別ログは現在使用していない
SERVER_LOG_FILE_NODE2="$LOG_DIR/server_node2.log" # 個別ログは現在使用していない
SERVER_COMBINED_LOG_FILE="$LOG_DIR/server_combined.log"
TEST_DB_NODE0="node0_data" # Go側でパスが調整される想定
TEST_DB_NODE1="node1_data"
TEST_DB_NODE2="node2_data"

# 各ノードのHTTP APIアドレス
NODE0_API_ADDR="localhost:8100" # HTTP APIのポートをGo側の実装に合わせる
NODE1_API_ADDR="localhost:8101" # HTTP APIのポートをGo側の実装に合わせる
NODE2_API_ADDR="localhost:8102" # HTTP APIのポートをGo側の実装に合わせる

# テストで使用するテーブル名とアイテム
TEST_TABLE="TestItemsE2E"
PARTITION_KEY="Artist"
SORT_KEY="SongTitle"

ITEM1_PK="Journey"
ITEM1_SK="Don't Stop Believin'" # シェル変数内ではリテラルとして扱う
ITEM1_ATTRS_JSON_PART='"Album":"Escape","Year":1981'

ITEM2_PK="Journey"
ITEM2_SK="Separate_Ways_Worlds_Apart" # 変更: (Worlds Apart) を _Worlds_Apart に
ITEM2_ATTRS_JSON_PART='"Album":"Frontiers","Year":1983'

ITEM3_PK="Queen"
ITEM3_SK="Bohemian Rhapsody" # シングルクオートなし
ITEM3_ATTRS_JSON_PART='"Album":"A Night at the Opera","Year":1975'

# クリーンアップ関数
cleanup() {
  echo "Cleaning up..."
  if [ -n "$SERVER_PID" ] && ps -p $SERVER_PID >/dev/null; then
    echo "Stopping server (PID: $SERVER_PID)..."
    kill $SERVER_PID
    # kill だけだとサブプロセスが残る場合があるので、pkill も試みる
    pkill -P $SERVER_PID              # macOSでは pkill -P は動作しないことがあるので、より汎用的な方法も検討
    pgrep -P $SERVER_PID | xargs kill # pkill の代替
    wait $SERVER_PID 2>/dev/null      # プロセスが終了するまで待つ
    echo "Server stopped."
  else
    echo "Server process not found or already stopped."
  fi
  # Goプログラムが day42_raft_nosql_simulator の中にデータディレクトリを作るので、
  # ここではワークスペースルートからの相対パスで削除
  echo "Removing main data directory: data"
  /bin/rm -rf data
  echo "Removing log directory: $LOG_DIR"
  /bin/rm -rf $LOG_DIR
  echo "Cleanup finished."
}

# テスト失敗時のハンドラ
handle_error() {
  echo "--------------------------------------------------"
  echo "ERROR: Test failed at step: $1"
  echo "--------------------------------------------------"
  if [ -f "$SERVER_COMBINED_LOG_FILE" ]; then
    echo "Combined Server Log ($SERVER_COMBINED_LOG_FILE) - Last 50 lines:"
    tail -n 50 "$SERVER_COMBINED_LOG_FILE"
  else
    echo "Combined Server Log ($SERVER_COMBINED_LOG_FILE) not found."
  fi
  echo "--------------------------------------------------"
  # cleanup # ここで cleanup を呼ぶと exit trap も実行されるので二重になる可能性
  # exit 1 # trap EXIT が処理するので不要
}

# trap 'handle_error "UNKNOWN"' ERR # ERR trap は時々意図しない挙動をするので、コマンド毎のチェックを優先
trap cleanup EXIT SIGINT SIGTERM

# 色付け用
RESET_COLOR="\e[0m"
GREEN_COLOR="\e[32m"
RED_COLOR="\e[31m"
YELLOW_COLOR="\e[33m"

echo_section() {
  echo -e "\n${YELLOW_COLOR}=== $1 ===${RESET_COLOR}"
}

check_command_success() {
  local step_name="$1"
  local exit_code=$?
  if [ $exit_code -ne 0 ]; then
    echo -e "${RED_COLOR}FAILURE: Command for '$step_name' failed (Exit Code: $exit_code)${RESET_COLOR}"
    # 標準エラー出力も表示する（もしあれば）
    # cat stderr_temp.log # (もし標準エラーをファイルにリダイレクトしていれば)
    handle_error "$step_name command failed"
    exit 1 # ERR trap を使わないので明示的に exit
  fi
  echo -e "${GREEN_COLOR}SUCCESS: $step_name command executed successfully.${RESET_COLOR}"
}

check_grep_success() {
  local step_name="$1"
  local pattern="$2"
  local input_text="$3"

  echo "$input_text" | grep -qE "$pattern"
  local exit_code=$?

  if [ $exit_code -ne 0 ]; then
    echo -e "${RED_COLOR}FAILURE: Grep check for '$step_name' failed. Pattern '$pattern' not found in output:${RESET_COLOR}"
    echo "$input_text"
    handle_error "Grep check for '$step_name' failed"
    exit 1
  fi
  echo -e "${GREEN_COLOR}SUCCESS: Grep check for '$step_name' passed. Pattern '$pattern' found.${RESET_COLOR}"
}

# --- テストのメイン処理 ---
main() {
  echo "Preparing for E2E tests..."
  mkdir -p $LOG_DIR
  # 既存のテストデータとログを削除
  /bin/rm -rf data # ここでも削除
  /bin/rm -f $SERVER_COMBINED_LOG_FILE

  # サーバーのビルド
  echo_section "Building server"
  go build -o $CLI_BIN ./cmd/cli
  check_command_success "Server build"
  echo "Build successful."

  # サーバー起動
  echo_section "Starting server cluster"
  # サーバーは内部で3ノードを起動する。
  # データディレクトリは Go プログラム側で node0_data, node1_data, node2_data のように固定で設定されている。
  # ログは combined log へ
  echo "Executing command: $CLI_BIN server > "$SERVER_COMBINED_LOG_FILE" 2>&1 &"
  $CLI_BIN server >"$SERVER_COMBINED_LOG_FILE" 2>&1 &
  SERVER_PID=$!
  echo "Server cluster potentially started with PID $SERVER_PID."                   # "potentially" に変更
  echo "Waiting for server to initialize and elect a leader (approx 10 seconds)..." # 待機時間を延長
  sleep 10                                                                          # リーダー選出と初期化のための十分な待機時間

  # サーバーが起動しているか確認
  if ! ps -p $SERVER_PID >/dev/null; then
    echo -e "${RED_COLOR}ERROR: Server process $SERVER_PID not found after startup.${RESET_COLOR}"
    cat "$SERVER_COMBINED_LOG_FILE"
    exit 1
  fi
  echo "Server process $SERVER_PID is running."

  # リーダーノードを特定する (ここではnode0が初期リーダーだと仮定)
  # 実際には /status エンドポイントで確認するのが望ましいが、ここでは簡略化
  LEADER_ADDR=$NODE0_API_ADDR
  FOLLOWER_ADDR=$NODE1_API_ADDR      # 書き込み失敗テスト用
  READ_FOLLOWER_ADDR=$NODE2_API_ADDR # 読み込みテスト用フォロワー

  echo "Assuming Node 0 ($LEADER_ADDR) is the initial leader for writes."
  echo "Follower for testing write rejection: Node 1 ($FOLLOWER_ADDR)."
  echo "Follower for testing reads: Node 2 ($READ_FOLLOWER_ADDR)."

  # 1. テーブル作成
  echo_section "Test 1: Create Table '$TEST_TABLE'"
  OUTPUT_CREATE_TABLE=$($CLI_BIN create-table --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --partition-key "$PARTITION_KEY" --sort-key "$SORT_KEY" 2>&1)
  check_command_success "Create Table '$TEST_TABLE'"
  check_grep_success "Create Table '$TEST_TABLE' response" "CreateTable API call successful" "$OUTPUT_CREATE_TABLE"

  # 2. アイテム登録 (Item1)
  echo_section "Test 2: Put Item 1 ('$ITEM1_PK'/'$ITEM1_SK') into '$TEST_TABLE'"
  ITEM1_SK_JSON_ESCAPED=$(echo "$ITEM1_SK" | sed -e 's/\\/\\\\/g' -e 's/\"/\\\"/g') # JSON文字列値用にエスケープ
  ITEM1_DATA_JSON_CONTENT="\"$PARTITION_KEY\":\"$ITEM1_PK\",\"$SORT_KEY\":\"$ITEM1_SK_JSON_ESCAPED\",$ITEM1_ATTRS_JSON_PART"
  ITEM1_DATA_FOR_CLI="{${ITEM1_DATA_JSON_CONTENT}}"
  OUTPUT_PUT_ITEM1=$($CLI_BIN put-item --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --item-data "$ITEM1_DATA_FOR_CLI" 2>&1)
  check_command_success "Put Item 1"
  check_grep_success "Put Item 1 response" "PutItem API call successful" "$OUTPUT_PUT_ITEM1"

  # 3. アイテム登録 (Item2)
  echo_section "Test 3: Put Item 2 ('$ITEM2_PK'/'$ITEM2_SK') into '$TEST_TABLE'"
  ITEM2_SK_JSON_ESCAPED=$(echo "$ITEM2_SK" | sed -e 's/\\/\\\\/g' -e 's/\"/\\\"/g')
  ITEM2_DATA_JSON_CONTENT="\"$PARTITION_KEY\":\"$ITEM2_PK\",\"$SORT_KEY\":\"$ITEM2_SK_JSON_ESCAPED\",$ITEM2_ATTRS_JSON_PART"
  ITEM2_DATA_FOR_CLI="{${ITEM2_DATA_JSON_CONTENT}}"
  OUTPUT_PUT_ITEM2=$($CLI_BIN put-item --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --item-data "$ITEM2_DATA_FOR_CLI" 2>&1)
  check_command_success "Put Item 2"
  check_grep_success "Put Item 2 response" "PutItem API call successful" "$OUTPUT_PUT_ITEM2"

  # 4. アイテム登録 (Item3)
  echo_section "Test 4: Put Item 3 ('$ITEM3_PK'/'$ITEM3_SK') into '$TEST_TABLE'"
  ITEM3_SK_JSON_ESCAPED=$(echo "$ITEM3_SK" | sed 's/\\/\\\\/g; s/"/\\"/g')
  ITEM3_DATA_JSON_CONTENT="\"$PARTITION_KEY\":\"$ITEM3_PK\",\"$SORT_KEY\":\"$ITEM3_SK_JSON_ESCAPED\",$ITEM3_ATTRS_JSON_PART"
  ITEM3_DATA_FOR_CLI="{${ITEM3_DATA_JSON_CONTENT}}"
  OUTPUT_PUT_ITEM3=$($CLI_BIN put-item --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --item-data "$ITEM3_DATA_FOR_CLI" 2>&1)
  check_command_success "Put Item 3"
  check_grep_success "Put Item 3 response" "PutItem API call successful" "$OUTPUT_PUT_ITEM3"

  # 5. アイテム取得 (Item1) - リーダーから
  echo_section "Test 5: Get Item 1 from leader ($LEADER_ADDR)"
  OUTPUT_GET_ITEM1=$($CLI_BIN get-item --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --partition-key "$ITEM1_PK" --sort-key "$ITEM1_SK" 2>&1)
  check_command_success "Get Item 1 from leader"
  check_grep_success "Get Item 1 PK" "\"Artist\":\"$ITEM1_PK\"" "$OUTPUT_GET_ITEM1"
  check_grep_success "Get Item 1 SK" "\"SongTitle\":\"$ITEM1_SK\"" "$OUTPUT_GET_ITEM1" # SKのシングルクオートエスケープはJSON内では不要
  check_grep_success "Get Item 1 Attribute (Album)" "\"Album\":\"Escape\"" "$OUTPUT_GET_ITEM1"

  # 6. アイテム取得 (Item1) - フォロワーから (読み込みはフォロワーでも可能)
  echo_section "Test 6: Get Item 1 from follower (${READ_FOLLOWER_ADDR})"
  OUTPUT_GET_ITEM1_FOLLOWER=$($CLI_BIN get-item --target-addr "${READ_FOLLOWER_ADDR}" --table-name "$TEST_TABLE" --partition-key "$ITEM1_PK" --sort-key "$ITEM1_SK" 2>&1)
  check_command_success "Get Item 1 from follower"
  check_grep_success "Get Item 1 PK (follower)" "\"Artist\":\"$ITEM1_PK\"" "$OUTPUT_GET_ITEM1_FOLLOWER"
  check_grep_success "Get Item 1 SK (follower)" "\"SongTitle\":\"$ITEM1_SK\"" "$OUTPUT_GET_ITEM1_FOLLOWER"
  check_grep_success "Get Item 1 Attribute (Album) (follower)" '"Album":"Escape"' "$OUTPUT_GET_ITEM1_FOLLOWER"

  # 7. アイテムクエリ (PartitionKey = "Journey") - リーダーから
  echo_section "Test 7: Query Items (PK='$ITEM1_PK') from leader ($LEADER_ADDR)"
  OUTPUT_QUERY_JOURNEY=$($CLI_BIN query-items --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --partition-key "$ITEM1_PK" 2>&1)
  check_command_success "Query Items PK='$ITEM1_PK' (leader)"
  check_grep_success "Query Result Item 1 SK" "$ITEM1_SK" "$OUTPUT_QUERY_JOURNEY"
  check_grep_success "Query Result Item 2 SK" "$ITEM2_SK" "$OUTPUT_QUERY_JOURNEY"
  ITEM_COUNT_JOURNEY=$(echo "$OUTPUT_QUERY_JOURNEY" | grep -c '"Artist":') # Assuming each item is a JSON object on its own line or identifiable
  if [ "$ITEM_COUNT_JOURNEY" -ne 2 ]; then
    echo -e "${RED_COLOR}FAILURE: Query '$ITEM1_PK' returned $ITEM_COUNT_JOURNEY items, expected 2.${RESET_COLOR}"
    echo "$OUTPUT_QUERY_JOURNEY"
    handle_error "Query '$ITEM1_PK' count mismatch"
    exit 1
  fi
  echo "Query '$ITEM1_PK' returned 2 items as expected."

  # 8. アイテムクエリ (PartitionKey = "Journey", SortKeyPrefix = "Don't") - リーダーから
  echo_section "Test 8: Query Items (PK='$ITEM1_PK', SKPrefix='Don\'t') from leader ($LEADER_ADDR)"
  # SKPrefix のシングルクォートエスケープに注意
  OUTPUT_QUERY_JOURNEY_DONT=$($CLI_BIN query-items --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --partition-key "$ITEM1_PK" --sort-key-prefix "Don't" 2>&1)
  check_command_success "Query Items PK='$ITEM1_PK', SKPrefix='Don\'t' (leader)"
  check_grep_success "Query SK Prefix Result Item 1 SK" "$ITEM1_SK" "$OUTPUT_QUERY_JOURNEY_DONT"
  if echo "$OUTPUT_QUERY_JOURNEY_DONT" | grep -q "$ITEM2_SK"; then
    echo -e "${RED_COLOR}FAILURE: Query PK='$ITEM1_PK', SKPrefix='Don\'t' unexpectedly found '$ITEM2_SK'.${RESET_COLOR}"
    echo "$OUTPUT_QUERY_JOURNEY_DONT"
    handle_error "Query PK='$ITEM1_PK', SKPrefix='Don\'t' found unexpected item"
    exit 1
  fi
  ITEM_COUNT_JOURNEY_DONT=$(echo "$OUTPUT_QUERY_JOURNEY_DONT" | grep -c '"Artist":')
  if [ "$ITEM_COUNT_JOURNEY_DONT" -ne 1 ]; then
    echo -e "${RED_COLOR}FAILURE: Query PK='$ITEM1_PK', SKPrefix='Don\'t' returned $ITEM_COUNT_JOURNEY_DONT items, expected 1.${RESET_COLOR}"
    echo "$OUTPUT_QUERY_JOURNEY_DONT"
    handle_error "Query PK='$ITEM1_PK', SKPrefix='Don\'t' count mismatch"
    exit 1
  fi
  echo "Query PK='$ITEM1_PK', SKPrefix='Don\'t' returned 1 item as expected."

  # 9. フォロワーへの書き込み試行 (アイテム登録) - 失敗するはず
  echo_section "Test 9: Attempt Put Item on follower ($FOLLOWER_ADDR) - Should Fail"
  FAIL_ITEM_DATA_JSON_CONTENT="\"$PARTITION_KEY\":\"FailPK\",\"$SORT_KEY\":\"FailSK\",\"data\":\"dummy\""
  FAIL_DATA_FOR_CLI="{${FAIL_ITEM_DATA_JSON_CONTENT}}"
  OUTPUT_PUT_FOLLOWER_ERR=$($CLI_BIN put-item --target-addr "$FOLLOWER_ADDR" --table-name "$TEST_TABLE" --item-data "$FAIL_DATA_FOR_CLI" 2>&1)
  # このコマンドは失敗を期待するので、check_command_success は使わない
  if echo "$OUTPUT_PUT_FOLLOWER_ERR" | grep -qE "(421 Misdirected Request|not the leader|Not a leader|Failed to forward request|no leader|Unable to apply command: not the leader)"; then
    echo -e "${GREEN_COLOR}SUCCESS: Put item on follower failed with expected message.${RESET_COLOR}"
    echo "$OUTPUT_PUT_FOLLOWER_ERR"
  else
    echo -e "${RED_COLOR}FAILURE: Put item on follower did NOT fail with expected message (421 or 'not the leader' variants).${RESET_COLOR}"
    echo "$OUTPUT_PUT_FOLLOWER_ERR"
    handle_error "Put item on follower failure message mismatch"
    exit 1
  fi

  # 10. アイテム削除 (Item2)
  echo_section "Test 10: Delete Item 2 ('$ITEM2_PK'/'$ITEM2_SK') from '$TEST_TABLE'"
  OUTPUT_DELETE_ITEM2=$($CLI_BIN delete-item --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --partition-key "$ITEM2_PK" --sort-key "$ITEM2_SK" 2>&1)
  check_command_success "Delete Item 2"
  check_grep_success "Delete Item 2 response" "DeleteItem API call successful" "$OUTPUT_DELETE_ITEM2"

  # 11. アイテム取得 (Item2) - 削除されたことを確認
  echo_section "Test 11: Get Item 2 (should not be found)"
  OUTPUT_GET_ITEM2_DELETED=$($CLI_BIN get-item --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" --partition-key "$ITEM2_PK" --sort-key "$ITEM2_SK" 2>&1)
  # 成功しないことを期待 (エラーメッセージが出るはず)
  if echo "$OUTPUT_GET_ITEM2_DELETED" | grep -qEi "(Item not found|GetItem API call failed: status 404|Failed to get item: item .+ not found)"; then # 404エラーも許容し、具体的なエラーも追加
    echo -e "${GREEN_COLOR}SUCCESS: Item 2 not found after deletion, as expected.${RESET_COLOR}"
  else
    echo -e "${RED_COLOR}FAILURE: Get Item 2 after deletion did not result in 'Item not found' or 404 error.${RESET_COLOR}"
    echo "$OUTPUT_GET_ITEM2_DELETED"
    handle_error "Get Item 2 after deletion - unexpected result"
    exit 1
  fi

  # 12. テーブル削除
  echo_section "Test 12: Delete Table '$TEST_TABLE'"
  OUTPUT_DELETE_TABLE=$($CLI_BIN delete-table --target-addr "$LEADER_ADDR" --table-name "$TEST_TABLE" 2>&1)
  check_command_success "Delete Table '$TEST_TABLE'"
  check_grep_success "Delete Table '$TEST_TABLE' response" "DeleteTable API call successful" "$OUTPUT_DELETE_TABLE"

  # # 13. (オプション) テーブルがリストから消えたことを確認 (Go側に未実装のためコメントアウト)
  # echo_section "Test 13: Verify table deletion via status (optional)"
  # sleep 2 # FSM適用までのラグを考慮
  # OUTPUT_STATUS_AFTER_DELETE=$($CLI_BIN status --target-addr "$LEADER_ADDR" 2>&1)
  # check_command_success "Get status after table deletion"
  # if echo "$OUTPUT_STATUS_AFTER_DELETE" | grep -q "$TEST_TABLE"; then
  #     echo -e "${RED_COLOR}FAILURE: Table '$TEST_TABLE' still found in status after deletion.${RESET_COLOR}"
  #     echo "$OUTPUT_STATUS_AFTER_DELETE"
  #     handle_error "Table found in status after deletion"
  #     exit 1
  # fi
  # echo -e "${GREEN_COLOR}SUCCESS: Table '$TEST_TABLE' not found in status after deletion, as expected.${RESET_COLOR}"

  echo -e "\n${GREEN_COLOR}=====================================${RESET_COLOR}"
  echo -e "${GREEN_COLOR}All E2E tests passed successfully!${RESET_COLOR}"
  echo -e "${GREEN_COLOR}=====================================${RESET_COLOR}"

}

# スクリプトの実行
main
# cleanup は trap EXIT で実行される
