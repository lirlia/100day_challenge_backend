package store

import (
	"encoding/json"
	"fmt"
	"time"
)

// CommandType はFSMに適用されるコマンドの種類を表します。
type CommandType string

const (
	CreateTableCommandType CommandType = "CreateTable"
	DeleteTableCommandType CommandType = "DeleteTable"
	PutItemCommandType     CommandType = "PutItem"
	DeleteItemCommandType  CommandType = "DeleteItem"
)

// Command はFSMに適用される操作の汎用ラッパーです。
type Command struct {
	Type    CommandType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// CreateTableCommandPayload はテーブル作成コマンドのペイロードです。
type CreateTableCommandPayload struct {
	TableName        string `json:"table_name"`
	PartitionKeyName string `json:"partition_key_name"`
	SortKeyName      string `json:"sort_key_name"` // オプショナル
}

// DeleteTableCommandPayload はテーブル削除コマンドのペイロードです。
type DeleteTableCommandPayload struct {
	TableName string `json:"table_name"`
}

// PutItemCommandPayload はアイテム書き込みコマンドのペイロードです。
type PutItemCommandPayload struct {
	TableName string          `json:"table_name"`
	Item      json.RawMessage `json:"item"`      // アイテムデータ本体 (キーを含む)
	Timestamp int64           `json:"timestamp"` // LWW用タイムスタンプ (UnixNano)
}

// DeleteItemCommandPayload はアイテム削除コマンドのペイロードです。
type DeleteItemCommandPayload struct {
	TableName    string `json:"table_name"`
	PartitionKey string `json:"partition_key"`
	SortKey      string `json:"sort_key"`  // オプショナル
	Timestamp    int64  `json:"timestamp"` // LWW用タイムスタンプ (UnixNano)
}

// EncodeCommand は指定されたコマンドタイプとペイロードからコマンドを生成し、JSONバイト列にエンコードします。
func EncodeCommand(cmdType CommandType, payload interface{}) ([]byte, error) {
	payloadBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal command payload: %w", err)
	}
	cmd := Command{
		Type:    cmdType,
		Payload: payloadBytes,
	}
	cmdBytes, err := json.Marshal(cmd)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal command: %w", err)
	}
	return cmdBytes, nil
}

// DecodeCreateTableCommand はコマンドペイロードからCreateTableCommandPayloadをデコードします。
func DecodeCreateTableCommand(payload json.RawMessage) (*CreateTableCommandPayload, error) {
	var cmdPayload CreateTableCommandPayload
	if err := json.Unmarshal(payload, &cmdPayload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal CreateTableCommandPayload: %w", err)
	}
	return &cmdPayload, nil
}

// DecodeDeleteTableCommand はコマンドペイロードからDeleteTableCommandPayloadをデコードします。
func DecodeDeleteTableCommand(payload json.RawMessage) (*DeleteTableCommandPayload, error) {
	var cmdPayload DeleteTableCommandPayload
	if err := json.Unmarshal(payload, &cmdPayload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal DeleteTableCommandPayload: %w", err)
	}
	return &cmdPayload, nil
}

// DecodePutItemCommand はコマンドペイロードからPutItemCommandPayloadをデコードします。
func DecodePutItemCommand(payload json.RawMessage) (*PutItemCommandPayload, error) {
	var cmdPayload PutItemCommandPayload
	if err := json.Unmarshal(payload, &cmdPayload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal PutItemCommandPayload: %w", err)
	}
	return &cmdPayload, nil
}

// DecodeDeleteItemCommand はコマンドペイロードからDeleteItemCommandPayloadをデコードします。
func DecodeDeleteItemCommand(payload json.RawMessage) (*DeleteItemCommandPayload, error) {
	var cmdPayload DeleteItemCommandPayload
	if err := json.Unmarshal(payload, &cmdPayload); err != nil {
		return nil, fmt.Errorf("failed to unmarshal DeleteItemCommandPayload: %w", err)
	}
	return &cmdPayload, nil
}

// NewPutItemCommandPayload creates a new PutItemCommandPayload with the current timestamp.
func NewPutItemCommandPayload(tableName string, itemData map[string]interface{}) (*PutItemCommandPayload, error) {
	itemBytes, err := json.Marshal(itemData)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal item data for PutItemCommand: %w", err)
	}
	return &PutItemCommandPayload{
		TableName: tableName,
		Item:      itemBytes,
		Timestamp: time.Now().UnixNano(),
	}, nil
}

// NewDeleteItemCommandPayload creates a new DeleteItemCommandPayload with the current timestamp.
func NewDeleteItemCommandPayload(tableName, partitionKey, sortKey string) *DeleteItemCommandPayload {
	return &DeleteItemCommandPayload{
		TableName:    tableName,
		PartitionKey: partitionKey,
		SortKey:      sortKey,
		Timestamp:    time.Now().UnixNano(),
	}
}

// CommandResponse はFSMのApplyメソッドからの標準的なレスポンスです。
// Raftのログ適用結果としてクライアントに返されることを想定しています。
type CommandResponse struct {
	Success   bool        `json:"success"`
	Message   string      `json:"message,omitempty"`
	Data      interface{} `json:"data,omitempty"`       // GetItemやQueryItemsなどの結果用
	Error     string      `json:"error,omitempty"`      // エラー時の詳細
	TableName string      `json:"table_name,omitempty"` // 操作対象のテーブル名
	ItemKey   string      `json:"item_key,omitempty"`   // 操作対象のアイテムキー (PK or PK_SK)
}
