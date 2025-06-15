package namenode

import (
	"context"
	"fmt"
	"log"
	"net"
	"sort"
	"sync"
	"time"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/internal/common"
	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/config"
	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/utils"
	pb "github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/proto"
	"google.golang.org/grpc"
)

// Server NameNodeサーバー
type Server struct {
	pb.UnimplementedNameNodeServiceServer
	config      *config.Config
	db          *Database
	grpcServer  *grpc.Server
	dataNodes   map[string]*common.DataNodeMetadata
	dataNodesMu sync.RWMutex
	replication *ReplicationManager
	running     bool
}

// NewServer 新しいNameNodeサーバーを作成
func NewServer(cfg *config.Config) (*Server, error) {
	// データベースを初期化
	if err := config.EnsureDataDirs(cfg); err != nil {
		return nil, fmt.Errorf("failed to ensure data dirs: %w", err)
	}

	db, err := NewDatabase(cfg.NameNode.DatabasePath)
	if err != nil {
		return nil, fmt.Errorf("failed to create database: %w", err)
	}

	server := &Server{
		config:    cfg,
		db:        db,
		dataNodes: make(map[string]*common.DataNodeMetadata),
	}

	// レプリケーション管理を初期化
	server.replication = NewReplicationManager(server, cfg.DFS.Replication)

	return server, nil
}

// Start サーバーを開始
func (s *Server) Start() error {
	listener, err := net.Listen("tcp", s.config.GetNameNodeAddr())
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	s.grpcServer = grpc.NewServer()
	pb.RegisterNameNodeServiceServer(s.grpcServer, s)

	log.Printf("NameNode starting on %s", s.config.GetNameNodeAddr())

	// バックグラウンドタスクを開始
	go s.startBackgroundTasks()

	s.running = true
	return s.grpcServer.Serve(listener)
}

// Stop サーバーを停止
func (s *Server) Stop() {
	s.running = false
	if s.grpcServer != nil {
		s.grpcServer.GracefulStop()
	}
	if s.db != nil {
		s.db.Close()
	}
}

// startBackgroundTasks バックグラウンドタスクを開始
func (s *Server) startBackgroundTasks() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for s.running {
		select {
		case <-ticker.C:
			s.checkDataNodeHealth()
			s.replication.CheckAndRepair()
		}
	}
}

// checkDataNodeHealth DataNodeの健康状態をチェック
func (s *Server) checkDataNodeHealth() {
	s.dataNodesMu.Lock()
	defer s.dataNodesMu.Unlock()

	timeout := 2 * time.Minute
	for id, node := range s.dataNodes {
		if !node.IsHealthy(timeout) {
			node.IsAlive = false
			log.Printf("DataNode %s marked as dead (last heartbeat: %v)", id, node.LastHeartbeat)

			// データベースを更新
			s.db.UpdateDataNodeHeartbeat(id, node.GetUsedCapacity(), false)
		}
	}
}

// ファイル操作

// CreateFile ファイルを作成
func (s *Server) CreateFile(ctx context.Context, req *pb.CreateFileRequest) (*pb.CreateFileResponse, error) {
	log.Printf("CreateFile request: path=%s, size=%d, replication=%d", req.Path, req.Size, req.Replication)

	// 既存ファイルをチェック
	existing, err := s.db.GetFile(req.Path)
	if err != nil {
		return &pb.CreateFileResponse{
			Success: false,
			Message: fmt.Sprintf("failed to check existing file: %v", err),
		}, nil
	}
	if existing != nil {
		return &pb.CreateFileResponse{
			Success: false,
			Message: "file already exists",
		}, nil
	}

	// ファイルメタデータを作成
	fileID := utils.GenerateFileID()
	now := time.Now()
	fileMetadata := &common.FileMetadata{
		ID:          fileID,
		Path:        req.Path,
		Size:        req.Size,
		BlockSize:   s.config.DFS.ChunkSize,
		Replication: int(req.Replication),
		CreatedAt:   now,
		ModifiedAt:  now,
	}

	// データベースに保存
	if err := s.db.CreateFile(fileMetadata); err != nil {
		return &pb.CreateFileResponse{
			Success: false,
			Message: fmt.Sprintf("failed to create file metadata: %v", err),
		}, nil
	}

	return &pb.CreateFileResponse{
		Success: true,
		Message: "file created successfully",
		FileInfo: &pb.FileInfo{
			Path:        fileMetadata.Path,
			Size:        fileMetadata.Size,
			BlockSize:   fileMetadata.BlockSize,
			Replication: int32(fileMetadata.Replication),
			CreatedAt:   fileMetadata.CreatedAt.Unix(),
			ModifiedAt:  fileMetadata.ModifiedAt.Unix(),
		},
	}, nil
}

// GetFileInfo ファイル情報を取得
func (s *Server) GetFileInfo(ctx context.Context, req *pb.GetFileInfoRequest) (*pb.GetFileInfoResponse, error) {
	log.Printf("GetFileInfo request: path=%s", req.Path)

	file, err := s.db.GetFile(req.Path)
	if err != nil {
		return &pb.GetFileInfoResponse{
			Success: false,
			Message: fmt.Sprintf("failed to get file: %v", err),
		}, nil
	}
	if file == nil {
		return &pb.GetFileInfoResponse{
			Success: false,
			Message: "file not found",
		}, nil
	}

	return &pb.GetFileInfoResponse{
		Success: true,
		Message: "file found",
		FileInfo: &pb.FileInfo{
			Path:        file.Path,
			Size:        file.Size,
			BlockSize:   file.BlockSize,
			Replication: int32(file.Replication),
			CreatedAt:   file.CreatedAt.Unix(),
			ModifiedAt:  file.ModifiedAt.Unix(),
			Chunks:      file.Chunks,
		},
	}, nil
}

// ListFiles ファイル一覧を取得
func (s *Server) ListFiles(ctx context.Context, req *pb.ListFilesRequest) (*pb.ListFilesResponse, error) {
	log.Printf("ListFiles request: path=%s", req.Path)

	files, err := s.db.ListFiles(req.Path)
	if err != nil {
		return &pb.ListFilesResponse{
			Success: false,
			Message: fmt.Sprintf("failed to list files: %v", err),
		}, nil
	}

	var fileInfos []*pb.FileInfo
	for _, file := range files {
		fileInfos = append(fileInfos, &pb.FileInfo{
			Path:        file.Path,
			Size:        file.Size,
			BlockSize:   file.BlockSize,
			Replication: int32(file.Replication),
			CreatedAt:   file.CreatedAt.Unix(),
			ModifiedAt:  file.ModifiedAt.Unix(),
			Chunks:      file.Chunks,
		})
	}

	return &pb.ListFilesResponse{
		Success: true,
		Message: fmt.Sprintf("found %d files", len(fileInfos)),
		Files:   fileInfos,
	}, nil
}

// DeleteFile ファイルを削除
func (s *Server) DeleteFile(ctx context.Context, req *pb.DeleteFileRequest) (*pb.DeleteFileResponse, error) {
	log.Printf("DeleteFile request: path=%s", req.Path)

	// ファイル情報を取得
	file, err := s.db.GetFile(req.Path)
	if err != nil {
		return &pb.DeleteFileResponse{
			Success: false,
			Message: fmt.Sprintf("failed to get file: %v", err),
		}, nil
	}
	if file == nil {
		return &pb.DeleteFileResponse{
			Success: false,
			Message: "file not found",
		}, nil
	}

	// チャンクを削除（データベースの外部キー制約により自動的に削除される）
	if err := s.db.DeleteFile(req.Path); err != nil {
		return &pb.DeleteFileResponse{
			Success: false,
			Message: fmt.Sprintf("failed to delete file: %v", err),
		}, nil
	}

	// TODO: DataNodeに実際のチャンクファイル削除を指示

	return &pb.DeleteFileResponse{
		Success: true,
		Message: "file deleted successfully",
	}, nil
}

// チャンク操作

// AllocateChunks チャンクを割り当て
func (s *Server) AllocateChunks(ctx context.Context, req *pb.AllocateChunksRequest) (*pb.AllocateChunksResponse, error) {
	log.Printf("AllocateChunks request: file=%s, size=%d, replication=%d", req.FilePath, req.FileSize, req.Replication)

	// チャンク情報を計算
	chunks := utils.SplitFileIntoChunks(req.FileSize, s.config.DFS.ChunkSize)
	if len(chunks) == 0 {
		return &pb.AllocateChunksResponse{
			Success: false,
			Message: "invalid file size",
		}, nil
	}

	// 利用可能なDataNodeを取得
	availableNodes := s.getAvailableDataNodes()
	if len(availableNodes) < int(req.Replication) {
		return &pb.AllocateChunksResponse{
			Success: false,
			Message: fmt.Sprintf("insufficient data nodes: need %d, available %d", req.Replication, len(availableNodes)),
		}, nil
	}

	// ファイル情報を取得
	file, err := s.db.GetFile(req.FilePath)
	if err != nil {
		return &pb.AllocateChunksResponse{
			Success: false,
			Message: fmt.Sprintf("failed to get file: %v", err),
		}, nil
	}
	if file == nil {
		return &pb.AllocateChunksResponse{
			Success: false,
			Message: "file not found",
		}, nil
	}

	var allocations []*pb.ChunkAllocation
	for _, chunk := range chunks {
		// レプリケーション用のDataNodeを選択
		selectedNodes := s.selectDataNodesForChunk(availableNodes, int(req.Replication))
		nodeIDs := make([]string, len(selectedNodes))
		for i, node := range selectedNodes {
			nodeIDs[i] = node.ID
		}

		// チャンクメタデータを作成
		chunkMetadata := &common.ChunkMetadata{
			ID:        chunk.ID,
			FileID:    file.ID,
			FilePath:  req.FilePath,
			Offset:    chunk.Offset,
			Size:      chunk.Size,
			Checksum:  "", // 実際の書き込み時に設定
			DataNodes: nodeIDs,
			CreatedAt: time.Now(),
		}

		// データベースに保存
		if err := s.db.CreateChunk(chunkMetadata); err != nil {
			return &pb.AllocateChunksResponse{
				Success: false,
				Message: fmt.Sprintf("failed to create chunk metadata: %v", err),
			}, nil
		}

		// レプリケーション情報を保存
		for _, nodeID := range nodeIDs {
			if err := s.db.AddChunkReplication(chunk.ID, nodeID); err != nil {
				log.Printf("Warning: failed to add chunk replication: %v", err)
			}
		}

		allocations = append(allocations, &pb.ChunkAllocation{
			ChunkId:     chunk.ID,
			Offset:      chunk.Offset,
			Size:        chunk.Size,
			DatanodeIds: nodeIDs,
		})
	}

	return &pb.AllocateChunksResponse{
		Success:     true,
		Message:     fmt.Sprintf("allocated %d chunks", len(allocations)),
		Allocations: allocations,
	}, nil
}

// GetChunkLocations チャンクの場所を取得
func (s *Server) GetChunkLocations(ctx context.Context, req *pb.GetChunkLocationsRequest) (*pb.GetChunkLocationsResponse, error) {
	log.Printf("GetChunkLocations request: file=%s", req.FilePath)

	// ファイル情報を取得
	file, err := s.db.GetFile(req.FilePath)
	if err != nil {
		return &pb.GetChunkLocationsResponse{
			Success: false,
			Message: fmt.Sprintf("failed to get file: %v", err),
		}, nil
	}
	if file == nil {
		return &pb.GetChunkLocationsResponse{
			Success: false,
			Message: "file not found",
		}, nil
	}

	// チャンク情報を取得
	chunks, err := s.db.GetFileChunks(file.ID)
	if err != nil {
		return &pb.GetChunkLocationsResponse{
			Success: false,
			Message: fmt.Sprintf("failed to get chunks: %v", err),
		}, nil
	}

	var locations []*pb.ChunkLocation
	for _, chunk := range chunks {
		var dataNodes []*pb.DataNodeInfo
		for _, nodeID := range chunk.DataNodes {
			if node := s.getDataNode(nodeID); node != nil && node.IsAlive {
				dataNodes = append(dataNodes, &pb.DataNodeInfo{
					Id:      node.ID,
					Address: node.Address,
					Port:    int32(node.Port),
				})
			}
		}

		locations = append(locations, &pb.ChunkLocation{
			ChunkId:   chunk.ID,
			Offset:    chunk.Offset,
			Size:      chunk.Size,
			Datanodes: dataNodes,
		})
	}

	return &pb.GetChunkLocationsResponse{
		Success:   true,
		Message:   fmt.Sprintf("found %d chunks", len(locations)),
		Locations: locations,
	}, nil
}

// ReportBadChunk 不良チャンクを報告
func (s *Server) ReportBadChunk(ctx context.Context, req *pb.ReportBadChunkRequest) (*pb.ReportBadChunkResponse, error) {
	log.Printf("ReportBadChunk: chunk=%s, datanode=%s, error=%s", req.ChunkId, req.DatanodeId, req.ErrorMessage)

	// レプリケーション管理に通知
	s.replication.HandleBadChunk(req.ChunkId, req.DatanodeId, req.ErrorMessage)

	return &pb.ReportBadChunkResponse{
		Success: true,
		Message: "bad chunk reported",
	}, nil
}

// DataNode管理

// RegisterDataNode DataNodeを登録
func (s *Server) RegisterDataNode(ctx context.Context, req *pb.RegisterDataNodeRequest) (*pb.RegisterDataNodeResponse, error) {
	log.Printf("RegisterDataNode: id=%s, address=%s:%d, capacity=%s",
		req.Id, req.Address, req.Port, utils.FormatBytes(req.Capacity))

	dataNode := &common.DataNodeMetadata{
		ID:            req.Id,
		Address:       req.Address,
		Port:          int(req.Port),
		Capacity:      req.Capacity,
		Used:          0,
		Available:     req.Capacity,
		LastHeartbeat: time.Now(),
		IsAlive:       true,
		Chunks:        []string{},
	}

	// データベースに保存
	if err := s.db.RegisterDataNode(dataNode); err != nil {
		return &pb.RegisterDataNodeResponse{
			Success: false,
			Message: fmt.Sprintf("failed to register data node: %v", err),
		}, nil
	}

	// メモリ内のDataNode情報を更新
	s.updateDataNode(dataNode)

	return &pb.RegisterDataNodeResponse{
		Success: true,
		Message: "data node registered successfully",
	}, nil
}

// Heartbeat ハートビートを処理
func (s *Server) Heartbeat(ctx context.Context, req *pb.HeartbeatRequest) (*pb.HeartbeatResponse, error) {
	// log.Printf("Heartbeat from %s: used=%s, chunks=%d", req.DatanodeId, utils.FormatBytes(req.UsedCapacity), len(req.ChunkIds))

	// DataNode情報を更新
	s.dataNodesMu.Lock()
	if node, exists := s.dataNodes[req.DatanodeId]; exists {
		node.UpdateLastHeartbeat()
		node.SetUsedCapacity(req.UsedCapacity)
		node.Chunks = req.ChunkIds
	}
	s.dataNodesMu.Unlock()

	// データベースを更新
	if err := s.db.UpdateDataNodeHeartbeat(req.DatanodeId, req.UsedCapacity, true); err != nil {
		log.Printf("Warning: failed to update heartbeat in database: %v", err)
	}

	// コマンドを取得（レプリケーション指示など）
	commands := s.replication.GetCommandsForDataNode(req.DatanodeId)

	return &pb.HeartbeatResponse{
		Success:  true,
		Message:  "heartbeat received",
		Commands: commands,
	}, nil
}

// ヘルパーメソッド

// updateDataNode DataNode情報を更新
func (s *Server) updateDataNode(dataNode *common.DataNodeMetadata) {
	s.dataNodesMu.Lock()
	defer s.dataNodesMu.Unlock()
	s.dataNodes[dataNode.ID] = dataNode
}

// getDataNode DataNode情報を取得
func (s *Server) getDataNode(id string) *common.DataNodeMetadata {
	s.dataNodesMu.RLock()
	defer s.dataNodesMu.RUnlock()
	return s.dataNodes[id]
}

// getAvailableDataNodes 利用可能なDataNodeを取得
func (s *Server) getAvailableDataNodes() []*common.DataNodeMetadata {
	s.dataNodesMu.RLock()
	defer s.dataNodesMu.RUnlock()

	var available []*common.DataNodeMetadata
	for _, node := range s.dataNodes {
		if node.IsAlive && node.GetAvailableCapacity() > 0 {
			available = append(available, node)
		}
	}

	// 利用可能容量でソート
	sort.Slice(available, func(i, j int) bool {
		return available[i].GetAvailableCapacity() > available[j].GetAvailableCapacity()
	})

	return available
}

// selectDataNodesForChunk チャンク用のDataNodeを選択
func (s *Server) selectDataNodesForChunk(available []*common.DataNodeMetadata, replication int) []*common.DataNodeMetadata {
	if len(available) <= replication {
		return available
	}

	// 簡単な負荷分散：利用可能容量が多い順に選択
	selected := make([]*common.DataNodeMetadata, replication)
	copy(selected, available[:replication])

	return selected
}

// GetDatabase データベースインスタンスを取得（テスト用）
func (s *Server) GetDatabase() *Database {
	return s.db
}

// GetDataNodes 全DataNode情報を取得（テスト用）
func (s *Server) GetDataNodes() map[string]*common.DataNodeMetadata {
	s.dataNodesMu.RLock()
	defer s.dataNodesMu.RUnlock()

	result := make(map[string]*common.DataNodeMetadata)
	for id, node := range s.dataNodes {
		result[id] = node
	}
	return result
}
