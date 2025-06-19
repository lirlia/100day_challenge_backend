package chord

import (
	"fmt"
	"net"
	"sync"
	"time"
)

// ハッシュ空間のサイズ (2^m, m=8 で 256 ノード対応)
const (
	M          = 8    // ハッシュ空間のビット数
	HASH_SPACE = 256  // 2^8 = 256
)

// NodeID は Chord リング上のノードの識別子
type NodeID uint16

// Node は Chord リング上の単一ノードを表す
type Node struct {
	ID      NodeID      `json:"id"`
	Address string      `json:"address"` // "host:port" 形式
	Port    int         `json:"port"`

	// 内部状態
	mu          sync.RWMutex
	fingerTable [M]*Node    `json:"finger_table"`
	successor   *Node       `json:"successor"`
	predecessor *Node       `json:"predecessor"`

	// ネットワーク状態
	listener    net.Listener
	connections map[string]net.Conn // address -> connection

	// 監視・生存確認
	lastSeen    map[NodeID]time.Time
	isAlive     bool

	// データストレージ
	storage     map[string]string // Key-Value ストア
	storageMu   sync.RWMutex
}

// FingerEntry はフィンガーテーブルのエントリ
type FingerEntry struct {
	Start     NodeID `json:"start"`     // (n + 2^(i-1)) mod 2^m
	Interval  string `json:"interval"`  // [start, start + 2^i)
	Successor *Node  `json:"successor"` // この区間の successor
}

// FingerTable はフィンガーテーブル全体を表す
type FingerTable struct {
	Entries [M]*FingerEntry `json:"entries"`
	Owner   NodeID          `json:"owner"`
}

// Message は ノード間通信のメッセージ
type Message struct {
	Type      string                 `json:"type"`
	From      NodeID                 `json:"from"`
	To        NodeID                 `json:"to"`
	Data      map[string]interface{} `json:"data"`
	Timestamp time.Time              `json:"timestamp"`
	ID        string                 `json:"id"` // メッセージ識別子
}

// MessageType はメッセージの種類
const (
	MSG_FIND_SUCCESSOR   = "find_successor"
	MSG_FIND_PREDECESSOR = "find_predecessor"
	MSG_GET_SUCCESSOR    = "get_successor"
	MSG_GET_PREDECESSOR  = "get_predecessor"
	MSG_NOTIFY           = "notify"
	MSG_PING             = "ping"
	MSG_PONG             = "pong"
	MSG_JOIN             = "join"
	MSG_LEAVE            = "leave"
	MSG_PUT              = "put"
	MSG_GET              = "get"
	MSG_RESPONSE         = "response"
	MSG_ERROR            = "error"
)

// Response は RPC レスポンス
type Response struct {
	Success bool                   `json:"success"`
	Data    map[string]interface{} `json:"data"`
	Error   string                 `json:"error,omitempty"`
}

// KeyValue はデータストレージのエントリ
type KeyValue struct {
	Key       string    `json:"key"`
	Value     string    `json:"value"`
	Timestamp time.Time `json:"timestamp"`
	Replicas  []NodeID  `json:"replicas"` // 複製先ノード
}

// NodeInfo はノードの状態情報
type NodeInfo struct {
	ID          NodeID                `json:"id"`
	Address     string                `json:"address"`
	IsAlive     bool                  `json:"is_alive"`
	Successor   *Node                 `json:"successor"`
	Predecessor *Node                 `json:"predecessor"`
	DataCount   int                   `json:"data_count"`
	LastSeen    time.Time             `json:"last_seen"`
	FingerTable [M]*Node              `json:"finger_table"`
}

// Ring は Chord リング全体の情報
type RingInfo struct {
	Nodes       []NodeInfo `json:"nodes"`
	TotalData   int        `json:"total_data"`
	Connections int        `json:"connections"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

// NewNode は新しいノードを作成する
func NewNode(address string, port int) *Node {
	nodeID := HashString(address)

	return &Node{
		ID:          nodeID,
		Address:     address,
		Port:        port,
		connections: make(map[string]net.Conn),
		lastSeen:    make(map[NodeID]time.Time),
		isAlive:     true,
		storage:     make(map[string]string),
	}
}

// NewFingerTable は新しいフィンガーテーブルを作成する
func NewFingerTable(ownerID NodeID) *FingerTable {
	ft := &FingerTable{
		Owner:   ownerID,
		Entries: [M]*FingerEntry{},
	}

	// フィンガーテーブルエントリを初期化
	for i := 0; i < M; i++ {
		start := (ownerID + NodeID(1<<i)) % HASH_SPACE
		ft.Entries[i] = &FingerEntry{
			Start:    start,
			Interval: fmt.Sprintf("[%d, %d)", start, (start+NodeID(1<<i))%HASH_SPACE),
		}
	}

	return ft
}

// String は Node の文字列表現を返す
func (n *Node) String() string {
	if n == nil {
		return "<nil>"
	}
	return fmt.Sprintf("Node{ID: %d, Addr: %s}", n.ID, n.Address)
}

// String は NodeID の文字列表現を返す
func (id NodeID) String() string {
	return fmt.Sprintf("%d", id)
}

// Distance は2つのNodeID間のChord距離を計算する
func (id NodeID) Distance(target NodeID) NodeID {
	if target >= id {
		return target - id
	}
	return HASH_SPACE - id + target
}

// InRange は ID が範囲内にあるかチェックする
func (id NodeID) InRange(start, end NodeID, inclusive bool) bool {
	if start == end {
		return inclusive
	}

	if start < end {
		if inclusive {
			return id >= start && id <= end
		}
		return id > start && id < end
	}

	// Wrap around case
	if inclusive {
		return id >= start || id <= end
	}
	return id > start || id < end
}
