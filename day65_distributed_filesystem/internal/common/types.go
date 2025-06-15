package common

import (
	"fmt"
	"sync"
	"time"
)

// FileMetadata ファイルのメタデータ
type FileMetadata struct {
	ID          string    `json:"id"`
	Path        string    `json:"path"`
	Size        int64     `json:"size"`
	BlockSize   int64     `json:"block_size"`
	Replication int       `json:"replication"`
	CreatedAt   time.Time `json:"created_at"`
	ModifiedAt  time.Time `json:"modified_at"`
	Chunks      []string  `json:"chunks"` // チャンクIDのリスト
}

// ChunkMetadata チャンクのメタデータ
type ChunkMetadata struct {
	ID        string    `json:"id"`
	FileID    string    `json:"file_id"`
	FilePath  string    `json:"file_path"`
	Offset    int64     `json:"offset"`
	Size      int64     `json:"size"`
	Checksum  string    `json:"checksum"`
	DataNodes []string  `json:"data_nodes"` // データノードIDのリスト
	CreatedAt time.Time `json:"created_at"`
}

// DataNodeMetadata DataNodeのメタデータ
type DataNodeMetadata struct {
	ID            string       `json:"id"`
	Address       string       `json:"address"`
	Port          int          `json:"port"`
	Capacity      int64        `json:"capacity"`
	Used          int64        `json:"used"`
	Available     int64        `json:"available"`
	LastHeartbeat time.Time    `json:"last_heartbeat"`
	IsAlive       bool         `json:"is_alive"`
	Chunks        []string     `json:"chunks"` // 保存しているチャンクIDのリスト
	mu            sync.RWMutex `json:"-"`
}

// UpdateLastHeartbeat ハートビートのタイムスタンプを更新
func (d *DataNodeMetadata) UpdateLastHeartbeat() {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.LastHeartbeat = time.Now()
	d.IsAlive = true
}

// SetUsedCapacity 使用容量を設定
func (d *DataNodeMetadata) SetUsedCapacity(used int64) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.Used = used
	d.Available = d.Capacity - used
}

// AddChunk チャンクを追加
func (d *DataNodeMetadata) AddChunk(chunkID string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for _, id := range d.Chunks {
		if id == chunkID {
			return // 既に存在する
		}
	}
	d.Chunks = append(d.Chunks, chunkID)
}

// RemoveChunk チャンクを削除
func (d *DataNodeMetadata) RemoveChunk(chunkID string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	for i, id := range d.Chunks {
		if id == chunkID {
			d.Chunks = append(d.Chunks[:i], d.Chunks[i+1:]...)
			return
		}
	}
}

// GetChunks チャンクリストのコピーを取得
func (d *DataNodeMetadata) GetChunks() []string {
	d.mu.RLock()
	defer d.mu.RUnlock()
	chunks := make([]string, len(d.Chunks))
	copy(chunks, d.Chunks)
	return chunks
}

// IsHealthy DataNodeが健全かチェック
func (d *DataNodeMetadata) IsHealthy(timeout time.Duration) bool {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.IsAlive && time.Since(d.LastHeartbeat) < timeout
}

// GetAvailableCapacity 利用可能容量を取得
func (d *DataNodeMetadata) GetAvailableCapacity() int64 {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.Available
}

// GetUsedCapacity 使用済み容量を取得
func (d *DataNodeMetadata) GetUsedCapacity() int64 {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return d.Used
}

// DataNodeStatus DataNodeの状態
type DataNodeStatus int

const (
	DataNodeStatusUnknown DataNodeStatus = iota
	DataNodeStatusAlive
	DataNodeStatusDead
	DataNodeStatusDecommissioning
)

// String DataNodeStatusの文字列表現
func (s DataNodeStatus) String() string {
	switch s {
	case DataNodeStatusAlive:
		return "alive"
	case DataNodeStatusDead:
		return "dead"
	case DataNodeStatusDecommissioning:
		return "decommissioning"
	default:
		return "unknown"
	}
}

// ReplicationStatus レプリケーションの状態
type ReplicationStatus int

const (
	ReplicationStatusUnknown ReplicationStatus = iota
	ReplicationStatusHealthy
	ReplicationStatusUnderReplicated
	ReplicationStatusOverReplicated
)

// String ReplicationStatusの文字列表現
func (s ReplicationStatus) String() string {
	switch s {
	case ReplicationStatusHealthy:
		return "healthy"
	case ReplicationStatusUnderReplicated:
		return "under_replicated"
	case ReplicationStatusOverReplicated:
		return "over_replicated"
	default:
		return "unknown"
	}
}

// ChunkAllocation チャンクの配置情報
type ChunkAllocation struct {
	ChunkID   string   `json:"chunk_id"`
	Offset    int64    `json:"offset"`
	Size      int64    `json:"size"`
	DataNodes []string `json:"data_nodes"`
}

// FileOperationType ファイル操作の種類
type FileOperationType int

const (
	FileOperationTypeUnknown FileOperationType = iota
	FileOperationTypeCreate
	FileOperationTypeRead
	FileOperationTypeWrite
	FileOperationTypeDelete
)

// String FileOperationTypeの文字列表現
func (t FileOperationType) String() string {
	switch t {
	case FileOperationTypeCreate:
		return "create"
	case FileOperationTypeRead:
		return "read"
	case FileOperationTypeWrite:
		return "write"
	case FileOperationTypeDelete:
		return "delete"
	default:
		return "unknown"
	}
}

// Command NameNodeからDataNodeへのコマンド
type Command struct {
	Type      string            `json:"type"`
	ChunkID   string            `json:"chunk_id,omitempty"`
	Source    string            `json:"source,omitempty"`
	Target    string            `json:"target,omitempty"`
	Params    map[string]string `json:"params,omitempty"`
	CreatedAt time.Time         `json:"created_at"`
}

// コマンドタイプ定数
const (
	CommandTypeReplicate = "replicate"
	CommandTypeDelete    = "delete"
	CommandTypeMove      = "move"
	CommandTypeCheck     = "check"
)

// SystemStats システム統計情報
type SystemStats struct {
	TotalCapacity     int64 `json:"total_capacity"`
	UsedCapacity      int64 `json:"used_capacity"`
	AvailableCapacity int64 `json:"available_capacity"`
	TotalFiles        int64 `json:"total_files"`
	TotalChunks       int64 `json:"total_chunks"`
	AliveDataNodes    int   `json:"alive_data_nodes"`
	DeadDataNodes     int   `json:"dead_data_nodes"`
	HealthyChunks     int64 `json:"healthy_chunks"`
	UnderReplicated   int64 `json:"under_replicated"`
	OverReplicated    int64 `json:"over_replicated"`
}

// Error エラー情報
type Error struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Details string `json:"details,omitempty"`
}

// String エラーの文字列表現
func (e *Error) String() string {
	if e.Details != "" {
		return fmt.Sprintf("[%s] %s: %s", e.Code, e.Message, e.Details)
	}
	return fmt.Sprintf("[%s] %s", e.Code, e.Message)
}

// エラーコード定数
const (
	ErrorCodeFileNotFound      = "FILE_NOT_FOUND"
	ErrorCodeFileAlreadyExists = "FILE_ALREADY_EXISTS"
	ErrorCodeChunkNotFound     = "CHUNK_NOT_FOUND"
	ErrorCodeDataNodeNotFound  = "DATANODE_NOT_FOUND"
	ErrorCodeInsufficientSpace = "INSUFFICIENT_SPACE"
	ErrorCodeReplicationFailed = "REPLICATION_FAILED"
	ErrorCodeChecksumMismatch  = "CHECKSUM_MISMATCH"
	ErrorCodeInternalError     = "INTERNAL_ERROR"
	ErrorCodeInvalidArgument   = "INVALID_ARGUMENT"
	ErrorCodePermissionDenied  = "PERMISSION_DENIED"
)

// NewError 新しいエラーを作成
func NewError(code, message, details string) *Error {
	return &Error{
		Code:    code,
		Message: message,
		Details: details,
	}
}

// Logger ログレベル
type LogLevel int

const (
	LogLevelDebug LogLevel = iota
	LogLevelInfo
	LogLevelWarn
	LogLevelError
	LogLevelFatal
)

// String LogLevelの文字列表現
func (l LogLevel) String() string {
	switch l {
	case LogLevelDebug:
		return "DEBUG"
	case LogLevelInfo:
		return "INFO"
	case LogLevelWarn:
		return "WARN"
	case LogLevelError:
		return "ERROR"
	case LogLevelFatal:
		return "FATAL"
	default:
		return "UNKNOWN"
	}
}
