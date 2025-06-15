package namenode

import (
	"database/sql"
	"fmt"
	"time"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/internal/common"
	_ "modernc.org/sqlite"
)

// Database NameNodeのメタデータ管理用データベース
type Database struct {
	db *sql.DB
}

// NewDatabase 新しいDatabase インスタンスを作成
func NewDatabase(dbPath string) (*Database, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// WAL モードを有効にしてパフォーマンスを向上
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		return nil, fmt.Errorf("failed to enable WAL mode: %w", err)
	}

	// 外部キー制約を有効にする
	if _, err := db.Exec("PRAGMA foreign_keys=ON"); err != nil {
		return nil, fmt.Errorf("failed to enable foreign keys: %w", err)
	}

	database := &Database{db: db}

	// テーブルを初期化
	if err := database.initTables(); err != nil {
		return nil, fmt.Errorf("failed to initialize tables: %w", err)
	}

	return database, nil
}

// Close データベース接続を閉じる
func (d *Database) Close() error {
	return d.db.Close()
}

// initTables テーブルを初期化
func (d *Database) initTables() error {
	// ファイルメタデータテーブル
	fileTable := `
	CREATE TABLE IF NOT EXISTS files (
		id TEXT PRIMARY KEY,
		path TEXT UNIQUE NOT NULL,
		size INTEGER NOT NULL,
		block_size INTEGER NOT NULL,
		replication INTEGER NOT NULL,
		created_at INTEGER NOT NULL,
		modified_at INTEGER NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
	`

	// チャンクメタデータテーブル
	chunkTable := `
	CREATE TABLE IF NOT EXISTS chunks (
		id TEXT PRIMARY KEY,
		file_id TEXT NOT NULL,
		file_path TEXT NOT NULL,
		offset_byte INTEGER NOT NULL,
		size INTEGER NOT NULL,
		checksum TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_chunks_file_id ON chunks(file_id);
	CREATE INDEX IF NOT EXISTS idx_chunks_file_path ON chunks(file_path);
	`

	// DataNodeメタデータテーブル
	dataNodeTable := `
	CREATE TABLE IF NOT EXISTS data_nodes (
		id TEXT PRIMARY KEY,
		address TEXT NOT NULL,
		port INTEGER NOT NULL,
		capacity INTEGER NOT NULL,
		used INTEGER NOT NULL,
		available INTEGER NOT NULL,
		last_heartbeat INTEGER NOT NULL,
		is_alive BOOLEAN NOT NULL DEFAULT 1
	);
	CREATE INDEX IF NOT EXISTS idx_data_nodes_alive ON data_nodes(is_alive);
	`

	// チャンクレプリケーションテーブル
	replicationTable := `
	CREATE TABLE IF NOT EXISTS chunk_replications (
		chunk_id TEXT NOT NULL,
		datanode_id TEXT NOT NULL,
		PRIMARY KEY (chunk_id, datanode_id),
		FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
		FOREIGN KEY (datanode_id) REFERENCES data_nodes(id) ON DELETE CASCADE
	);
	CREATE INDEX IF NOT EXISTS idx_chunk_replications_chunk ON chunk_replications(chunk_id);
	CREATE INDEX IF NOT EXISTS idx_chunk_replications_datanode ON chunk_replications(datanode_id);
	`

	queries := []string{fileTable, chunkTable, dataNodeTable, replicationTable}

	for _, query := range queries {
		if _, err := d.db.Exec(query); err != nil {
			return fmt.Errorf("failed to create table: %w", err)
		}
	}

	return nil
}

// ファイル操作

// CreateFile ファイルメタデータを作成
func (d *Database) CreateFile(file *common.FileMetadata) error {
	query := `
		INSERT INTO files (id, path, size, block_size, replication, created_at, modified_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	_, err := d.db.Exec(query, file.ID, file.Path, file.Size, file.BlockSize, file.Replication,
		file.CreatedAt.Unix(), file.ModifiedAt.Unix())
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	return nil
}

// GetFile ファイルメタデータを取得
func (d *Database) GetFile(path string) (*common.FileMetadata, error) {
	query := `
		SELECT id, path, size, block_size, replication, created_at, modified_at
		FROM files WHERE path = ?
	`
	row := d.db.QueryRow(query, path)

	var file common.FileMetadata
	var createdAt, modifiedAt int64
	err := row.Scan(&file.ID, &file.Path, &file.Size, &file.BlockSize, &file.Replication,
		&createdAt, &modifiedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get file: %w", err)
	}

	file.CreatedAt = time.Unix(createdAt, 0)
	file.ModifiedAt = time.Unix(modifiedAt, 0)

	// チャンクIDを取得
	chunks, err := d.GetFileChunks(file.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get file chunks: %w", err)
	}
	file.Chunks = make([]string, len(chunks))
	for i, chunk := range chunks {
		file.Chunks[i] = chunk.ID
	}

	return &file, nil
}

// ListFiles ファイル一覧を取得
func (d *Database) ListFiles(pathPrefix string) ([]*common.FileMetadata, error) {
	query := `
		SELECT id, path, size, block_size, replication, created_at, modified_at
		FROM files WHERE path LIKE ? ORDER BY path
	`
	rows, err := d.db.Query(query, pathPrefix+"%")
	if err != nil {
		return nil, fmt.Errorf("failed to list files: %w", err)
	}
	defer rows.Close()

	var files []*common.FileMetadata
	for rows.Next() {
		var file common.FileMetadata
		var createdAt, modifiedAt int64
		err := rows.Scan(&file.ID, &file.Path, &file.Size, &file.BlockSize, &file.Replication,
			&createdAt, &modifiedAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan file: %w", err)
		}

		file.CreatedAt = time.Unix(createdAt, 0)
		file.ModifiedAt = time.Unix(modifiedAt, 0)

		// チャンクIDを取得
		chunks, err := d.GetFileChunks(file.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to get file chunks: %w", err)
		}
		file.Chunks = make([]string, len(chunks))
		for i, chunk := range chunks {
			file.Chunks[i] = chunk.ID
		}

		files = append(files, &file)
	}

	return files, nil
}

// DeleteFile ファイルを削除
func (d *Database) DeleteFile(path string) error {
	query := `DELETE FROM files WHERE path = ?`
	result, err := d.db.Exec(query, path)
	if err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if affected == 0 {
		return fmt.Errorf("file not found: %s", path)
	}

	return nil
}

// チャンク操作

// CreateChunk チャンクメタデータを作成
func (d *Database) CreateChunk(chunk *common.ChunkMetadata) error {
	query := `
		INSERT INTO chunks (id, file_id, file_path, offset_byte, size, checksum, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	_, err := d.db.Exec(query, chunk.ID, chunk.FileID, chunk.FilePath, chunk.Offset, chunk.Size,
		chunk.Checksum, chunk.CreatedAt.Unix())
	if err != nil {
		return fmt.Errorf("failed to create chunk: %w", err)
	}
	return nil
}

// GetChunk チャンクメタデータを取得
func (d *Database) GetChunk(chunkID string) (*common.ChunkMetadata, error) {
	query := `
		SELECT id, file_id, file_path, offset_byte, size, checksum, created_at
		FROM chunks WHERE id = ?
	`
	row := d.db.QueryRow(query, chunkID)

	var chunk common.ChunkMetadata
	var createdAt int64
	err := row.Scan(&chunk.ID, &chunk.FileID, &chunk.FilePath, &chunk.Offset, &chunk.Size,
		&chunk.Checksum, &createdAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get chunk: %w", err)
	}

	chunk.CreatedAt = time.Unix(createdAt, 0)

	// DataNodeを取得
	dataNodes, err := d.GetChunkDataNodes(chunkID)
	if err != nil {
		return nil, fmt.Errorf("failed to get chunk data nodes: %w", err)
	}
	chunk.DataNodes = dataNodes

	return &chunk, nil
}

// GetFileChunks ファイルのチャンク一覧を取得
func (d *Database) GetFileChunks(fileID string) ([]*common.ChunkMetadata, error) {
	query := `
		SELECT id, file_id, file_path, offset_byte, size, checksum, created_at
		FROM chunks WHERE file_id = ? ORDER BY offset_byte
	`
	rows, err := d.db.Query(query, fileID)
	if err != nil {
		return nil, fmt.Errorf("failed to get file chunks: %w", err)
	}
	defer rows.Close()

	var chunks []*common.ChunkMetadata
	for rows.Next() {
		var chunk common.ChunkMetadata
		var createdAt int64
		err := rows.Scan(&chunk.ID, &chunk.FileID, &chunk.FilePath, &chunk.Offset, &chunk.Size,
			&chunk.Checksum, &createdAt)
		if err != nil {
			return nil, fmt.Errorf("failed to scan chunk: %w", err)
		}

		chunk.CreatedAt = time.Unix(createdAt, 0)

		// DataNodeを取得
		dataNodes, err := d.GetChunkDataNodes(chunk.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to get chunk data nodes: %w", err)
		}
		chunk.DataNodes = dataNodes

		chunks = append(chunks, &chunk)
	}

	return chunks, nil
}

// DeleteChunk チャンクを削除
func (d *Database) DeleteChunk(chunkID string) error {
	query := `DELETE FROM chunks WHERE id = ?`
	result, err := d.db.Exec(query, chunkID)
	if err != nil {
		return fmt.Errorf("failed to delete chunk: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("failed to get affected rows: %w", err)
	}

	if affected == 0 {
		return fmt.Errorf("chunk not found: %s", chunkID)
	}

	return nil
}

// DataNode操作

// RegisterDataNode DataNodeを登録
func (d *Database) RegisterDataNode(dataNode *common.DataNodeMetadata) error {
	query := `
		INSERT OR REPLACE INTO data_nodes (id, address, port, capacity, used, available, last_heartbeat, is_alive)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
	`
	_, err := d.db.Exec(query, dataNode.ID, dataNode.Address, dataNode.Port, dataNode.Capacity,
		dataNode.Used, dataNode.Available, dataNode.LastHeartbeat.Unix(), dataNode.IsAlive)
	if err != nil {
		return fmt.Errorf("failed to register data node: %w", err)
	}
	return nil
}

// GetDataNode DataNodeを取得
func (d *Database) GetDataNode(id string) (*common.DataNodeMetadata, error) {
	query := `
		SELECT id, address, port, capacity, used, available, last_heartbeat, is_alive
		FROM data_nodes WHERE id = ?
	`
	row := d.db.QueryRow(query, id)

	var dataNode common.DataNodeMetadata
	var lastHeartbeat int64
	err := row.Scan(&dataNode.ID, &dataNode.Address, &dataNode.Port, &dataNode.Capacity,
		&dataNode.Used, &dataNode.Available, &lastHeartbeat, &dataNode.IsAlive)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("failed to get data node: %w", err)
	}

	dataNode.LastHeartbeat = time.Unix(lastHeartbeat, 0)

	// チャンクを取得
	chunks, err := d.GetDataNodeChunks(id)
	if err != nil {
		return nil, fmt.Errorf("failed to get data node chunks: %w", err)
	}
	dataNode.Chunks = chunks

	return &dataNode, nil
}

// GetDataNodes DataNode一覧を取得
func (d *Database) GetDataNodes() ([]*common.DataNodeMetadata, error) {
	query := `
		SELECT id, address, port, capacity, used, available, last_heartbeat, is_alive
		FROM data_nodes ORDER BY id
	`
	rows, err := d.db.Query(query)
	if err != nil {
		return nil, fmt.Errorf("failed to get data nodes: %w", err)
	}
	defer rows.Close()

	var dataNodes []*common.DataNodeMetadata
	for rows.Next() {
		var dataNode common.DataNodeMetadata
		var lastHeartbeat int64
		err := rows.Scan(&dataNode.ID, &dataNode.Address, &dataNode.Port, &dataNode.Capacity,
			&dataNode.Used, &dataNode.Available, &lastHeartbeat, &dataNode.IsAlive)
		if err != nil {
			return nil, fmt.Errorf("failed to scan data node: %w", err)
		}

		dataNode.LastHeartbeat = time.Unix(lastHeartbeat, 0)

		// チャンクを取得
		chunks, err := d.GetDataNodeChunks(dataNode.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to get data node chunks: %w", err)
		}
		dataNode.Chunks = chunks

		dataNodes = append(dataNodes, &dataNode)
	}

	return dataNodes, nil
}

// UpdateDataNodeHeartbeat DataNodeのハートビートを更新
func (d *Database) UpdateDataNodeHeartbeat(id string, used int64, isAlive bool) error {
	query := `
		UPDATE data_nodes
		SET used = ?, available = capacity - ?, last_heartbeat = ?, is_alive = ?
		WHERE id = ?
	`
	_, err := d.db.Exec(query, used, used, time.Now().Unix(), isAlive, id)
	if err != nil {
		return fmt.Errorf("failed to update data node heartbeat: %w", err)
	}
	return nil
}

// レプリケーション操作

// AddChunkReplication チャンクレプリケーションを追加
func (d *Database) AddChunkReplication(chunkID, dataNodeID string) error {
	query := `INSERT OR IGNORE INTO chunk_replications (chunk_id, datanode_id) VALUES (?, ?)`
	_, err := d.db.Exec(query, chunkID, dataNodeID)
	if err != nil {
		return fmt.Errorf("failed to add chunk replication: %w", err)
	}
	return nil
}

// RemoveChunkReplication チャンクレプリケーションを削除
func (d *Database) RemoveChunkReplication(chunkID, dataNodeID string) error {
	query := `DELETE FROM chunk_replications WHERE chunk_id = ? AND datanode_id = ?`
	_, err := d.db.Exec(query, chunkID, dataNodeID)
	if err != nil {
		return fmt.Errorf("failed to remove chunk replication: %w", err)
	}
	return nil
}

// GetChunkDataNodes チャンクが保存されているDataNodeのIDを取得
func (d *Database) GetChunkDataNodes(chunkID string) ([]string, error) {
	query := `SELECT datanode_id FROM chunk_replications WHERE chunk_id = ?`
	rows, err := d.db.Query(query, chunkID)
	if err != nil {
		return nil, fmt.Errorf("failed to get chunk data nodes: %w", err)
	}
	defer rows.Close()

	var dataNodes []string
	for rows.Next() {
		var dataNodeID string
		err := rows.Scan(&dataNodeID)
		if err != nil {
			return nil, fmt.Errorf("failed to scan data node ID: %w", err)
		}
		dataNodes = append(dataNodes, dataNodeID)
	}

	return dataNodes, nil
}

// GetDataNodeChunks DataNodeが保存しているチャンクIDを取得
func (d *Database) GetDataNodeChunks(dataNodeID string) ([]string, error) {
	query := `SELECT chunk_id FROM chunk_replications WHERE datanode_id = ?`
	rows, err := d.db.Query(query, dataNodeID)
	if err != nil {
		return nil, fmt.Errorf("failed to get data node chunks: %w", err)
	}
	defer rows.Close()

	var chunks []string
	for rows.Next() {
		var chunkID string
		err := rows.Scan(&chunkID)
		if err != nil {
			return nil, fmt.Errorf("failed to scan chunk ID: %w", err)
		}
		chunks = append(chunks, chunkID)
	}

	return chunks, nil
}

// GetSystemStats システム統計情報を取得
func (d *Database) GetSystemStats() (*common.SystemStats, error) {
	var stats common.SystemStats

	// ファイル・チャンク統計
	err := d.db.QueryRow("SELECT COUNT(*) FROM files").Scan(&stats.TotalFiles)
	if err != nil {
		return nil, fmt.Errorf("failed to get total files: %w", err)
	}

	err = d.db.QueryRow("SELECT COUNT(*) FROM chunks").Scan(&stats.TotalChunks)
	if err != nil {
		return nil, fmt.Errorf("failed to get total chunks: %w", err)
	}

	// DataNode統計
	err = d.db.QueryRow("SELECT COUNT(*) FROM data_nodes WHERE is_alive = 1").Scan(&stats.AliveDataNodes)
	if err != nil {
		return nil, fmt.Errorf("failed to get alive data nodes: %w", err)
	}

	err = d.db.QueryRow("SELECT COUNT(*) FROM data_nodes WHERE is_alive = 0").Scan(&stats.DeadDataNodes)
	if err != nil {
		return nil, fmt.Errorf("failed to get dead data nodes: %w", err)
	}

	// 容量統計
	err = d.db.QueryRow("SELECT COALESCE(SUM(capacity), 0) FROM data_nodes WHERE is_alive = 1").Scan(&stats.TotalCapacity)
	if err != nil {
		return nil, fmt.Errorf("failed to get total capacity: %w", err)
	}

	err = d.db.QueryRow("SELECT COALESCE(SUM(used), 0) FROM data_nodes WHERE is_alive = 1").Scan(&stats.UsedCapacity)
	if err != nil {
		return nil, fmt.Errorf("failed to get used capacity: %w", err)
	}

	stats.AvailableCapacity = stats.TotalCapacity - stats.UsedCapacity

	// レプリケーション統計（TODO: 実装）
	stats.HealthyChunks = stats.TotalChunks
	stats.UnderReplicated = 0
	stats.OverReplicated = 0

	return &stats, nil
}
