package server

import (
	"encoding/json"
	"time"

	"github.com/hashicorp/raft"
	// "day42_raft_nosql_simulator_local_test/internal/store" // FSMの戻り値のために必要になる可能性
)

// RaftNodeProxy は APIServer が Raft ノードと対話するために必要なメソッドを定義します。
// これにより、server パッケージが raft_node パッケージの具体的な実装に依存するのを避けます。
type RaftNodeProxy interface {
	NodeID() raft.ServerID
	IsLeader() bool
	LeaderWithID() (raft.ServerAddress, raft.ServerID)
	ProposeCreateTable(tableName, partitionKeyName, sortKeyName string, timeout time.Duration) (interface{}, error)
	// TODO: PutItem, GetItem などのメソッドもここに追加
	ProposePutItem(tableName string, itemData map[string]interface{}, timeout time.Duration) (interface{}, error)
	ProposeDeleteItem(tableName string, partitionKey string, sortKey string, timeout time.Duration) (interface{}, error)
	GetItemFromLocalStore(tableName string, itemKey string) (json.RawMessage, int64, error)
	QueryItemsFromLocalStore(tableName string, partitionKey string, sortKeyPrefix string) ([]map[string]interface{}, error)
	Stats() map[string]string // /status エンドポイント用
	// GetFSM() *store.FSM // /status で FSM の情報を直接取得する場合。あるいは必要な情報だけを返すメソッドを Proxy に追加する
	ListTablesFromFSM() []string // /status でテーブル一覧を取得する例
}
