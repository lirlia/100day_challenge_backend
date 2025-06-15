package datanode

import (
	"context"
	"fmt"
	"io"
	"log"
	"net"
	"strings"
	"time"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/config"
	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/utils"
	pb "github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/proto"
	"google.golang.org/grpc"
)

// Server DataNodeサーバー
type Server struct {
	pb.UnimplementedDataNodeServiceServer
	config       *config.Config
	storage      *ChunkStorage
	grpcServer   *grpc.Server
	nameNodeConn *grpc.ClientConn
	nameNodeStub pb.NameNodeServiceClient
	running      bool
}

// NewServer 新しいDataNodeサーバーを作成
func NewServer(cfg *config.Config) (*Server, error) {
	// データディレクトリを作成
	if err := config.EnsureDataDirs(cfg); err != nil {
		return nil, fmt.Errorf("failed to ensure data dirs: %w", err)
	}

	// チャンクストレージを初期化
	storage, err := NewChunkStorage(cfg.DataNode.DataDir)
	if err != nil {
		return nil, fmt.Errorf("failed to create chunk storage: %w", err)
	}

	server := &Server{
		config:  cfg,
		storage: storage,
	}

	// NameNodeに接続
	if err := server.connectToNameNode(); err != nil {
		return nil, fmt.Errorf("failed to connect to NameNode: %w", err)
	}

	return server, nil
}

// connectToNameNode NameNodeに接続
func (s *Server) connectToNameNode() error {
	nameNodeAddr := s.config.GetNameNodeEndpoint()
	log.Printf("Connecting to NameNode at %s", nameNodeAddr)

	conn, err := grpc.Dial(nameNodeAddr, grpc.WithInsecure())
	if err != nil {
		return fmt.Errorf("failed to connect to NameNode: %w", err)
	}

	s.nameNodeConn = conn
	s.nameNodeStub = pb.NewNameNodeServiceClient(conn)

	return nil
}

// Start サーバーを開始
func (s *Server) Start() error {
	listener, err := net.Listen("tcp", s.config.GetDataNodeAddr())
	if err != nil {
		return fmt.Errorf("failed to listen: %w", err)
	}

	s.grpcServer = grpc.NewServer()
	pb.RegisterDataNodeServiceServer(s.grpcServer, s)

	log.Printf("DataNode %s starting on %s", s.config.DataNode.ID, s.config.GetDataNodeAddr())

	// NameNodeに登録
	if err := s.registerWithNameNode(); err != nil {
		return fmt.Errorf("failed to register with NameNode: %w", err)
	}

	// ハートビートを開始
	go s.startHeartbeat()

	s.running = true
	return s.grpcServer.Serve(listener)
}

// Stop サーバーを停止
func (s *Server) Stop() {
	s.running = false
	if s.grpcServer != nil {
		s.grpcServer.GracefulStop()
	}
	if s.nameNodeConn != nil {
		s.nameNodeConn.Close()
	}
}

// registerWithNameNode NameNodeに登録
func (s *Server) registerWithNameNode() error {
	log.Printf("Registering DataNode %s with NameNode", s.config.DataNode.ID)

	resp, err := s.nameNodeStub.RegisterDataNode(context.Background(), &pb.RegisterDataNodeRequest{
		Id:       s.config.DataNode.ID,
		Address:  s.config.DataNode.Address,
		Port:     int32(s.config.DataNode.Port),
		Capacity: s.config.DataNode.Capacity,
	})
	if err != nil {
		return fmt.Errorf("failed to register: %w", err)
	}

	if !resp.Success {
		return fmt.Errorf("registration failed: %s", resp.Message)
	}

	log.Printf("Successfully registered with NameNode: %s", resp.Message)
	return nil
}

// startHeartbeat ハートビートを開始
func (s *Server) startHeartbeat() {
	ticker := time.NewTicker(s.config.DataNode.HeartbeatInterval)
	defer ticker.Stop()

	for s.running {
		select {
		case <-ticker.C:
			s.sendHeartbeat()
		}
	}
}

// sendHeartbeat ハートビートを送信
func (s *Server) sendHeartbeat() {
	usedCapacity := s.storage.GetUsedSpace()
	chunkIDs := s.storage.GetChunkIDs()

	// log.Printf("Sending heartbeat: used=%s, chunks=%d", utils.FormatBytes(usedCapacity), len(chunkIDs))

	resp, err := s.nameNodeStub.Heartbeat(context.Background(), &pb.HeartbeatRequest{
		DatanodeId:   s.config.DataNode.ID,
		UsedCapacity: usedCapacity,
		ChunkIds:     chunkIDs,
	})
	if err != nil {
		log.Printf("Failed to send heartbeat: %v", err)
		return
	}

	if !resp.Success {
		log.Printf("Heartbeat failed: %s", resp.Message)
		return
	}

	// コマンドを処理
	if len(resp.Commands) > 0 {
		log.Printf("Received %d commands from NameNode", len(resp.Commands))
		for _, command := range resp.Commands {
			s.processCommand(command)
		}
	}
}

// processCommand NameNodeからのコマンドを処理
func (s *Server) processCommand(command string) {
	parts := strings.Split(command, ":")
	if len(parts) < 2 {
		log.Printf("Invalid command format: %s", command)
		return
	}

	commandType := parts[0]
	switch commandType {
	case "replicate":
		if len(parts) >= 3 {
			chunkID := parts[1]
			targetDataNode := parts[2]
			s.handleReplicateCommand(chunkID, targetDataNode)
		}
	case "delete":
		if len(parts) >= 2 {
			chunkID := parts[1]
			s.handleDeleteCommand(chunkID)
		}
	default:
		log.Printf("Unknown command type: %s", commandType)
	}
}

// handleReplicateCommand レプリケーションコマンドを処理
func (s *Server) handleReplicateCommand(chunkID, targetDataNode string) {
	log.Printf("Replicating chunk %s to %s", chunkID, targetDataNode)

	// TODO: 実際のレプリケーション処理を実装
	// 1. チャンクを読み込み
	// 2. ターゲットDataNodeに送信
	// 3. 成功/失敗をNameNodeに報告
}

// handleDeleteCommand 削除コマンドを処理
func (s *Server) handleDeleteCommand(chunkID string) {
	log.Printf("Deleting chunk %s", chunkID)

	if err := s.storage.DeleteChunk(chunkID); err != nil {
		log.Printf("Failed to delete chunk %s: %v", chunkID, err)
	} else {
		log.Printf("Successfully deleted chunk %s", chunkID)
	}
}

// gRPCサービス実装

// WriteChunk チャンクを書き込み
func (s *Server) WriteChunk(stream pb.DataNodeService_WriteChunkServer) error {
	var chunkID string
	var buffer []byte
	var totalSize int64

	for {
		req, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to receive chunk data: %w", err)
		}

		if chunkID == "" {
			chunkID = req.ChunkId
			log.Printf("Starting to write chunk: %s", chunkID)
		}

		buffer = append(buffer, req.Data...)
		totalSize += int64(len(req.Data))

		if req.IsLast {
			break
		}
	}

	log.Printf("Writing chunk %s: %s", chunkID, utils.FormatBytes(totalSize))

	// チャンクを書き込み
	checksum, err := s.storage.WriteChunk(chunkID, buffer)
	if err != nil {
		return fmt.Errorf("failed to write chunk: %w", err)
	}

	log.Printf("Successfully wrote chunk %s: checksum=%s", chunkID, checksum)

	return stream.SendAndClose(&pb.WriteChunkResponse{
		Success:  true,
		Message:  "chunk written successfully",
		Checksum: checksum,
	})
}

// ReadChunk チャンクを読み込み
func (s *Server) ReadChunk(req *pb.ReadChunkRequest, stream pb.DataNodeService_ReadChunkServer) error {
	log.Printf("Reading chunk %s: offset=%d, size=%d", req.ChunkId, req.Offset, req.Size)

	// チャンクが存在するかチェック
	if !s.storage.ChunkExists(req.ChunkId) {
		return fmt.Errorf("chunk not found: %s", req.ChunkId)
	}

	// チャンクを読み込み
	data, err := s.storage.ReadChunk(req.ChunkId, req.Offset, req.Size)
	if err != nil {
		return fmt.Errorf("failed to read chunk: %w", err)
	}

	// データをストリーミング送信
	const bufferSize = 64 * 1024 // 64KB chunks
	for i := 0; i < len(data); i += bufferSize {
		end := i + bufferSize
		if end > len(data) {
			end = len(data)
		}

		isLast := end == len(data)
		if err := stream.Send(&pb.ReadChunkResponse{
			Data:   data[i:end],
			IsLast: isLast,
		}); err != nil {
			return fmt.Errorf("failed to send chunk data: %w", err)
		}
	}

	log.Printf("Successfully read chunk %s: %s", req.ChunkId, utils.FormatBytes(int64(len(data))))
	return nil
}

// DeleteChunk チャンクを削除
func (s *Server) DeleteChunk(ctx context.Context, req *pb.DeleteChunkRequest) (*pb.DeleteChunkResponse, error) {
	log.Printf("Deleting chunk: %s", req.ChunkId)

	if err := s.storage.DeleteChunk(req.ChunkId); err != nil {
		return &pb.DeleteChunkResponse{
			Success: false,
			Message: fmt.Sprintf("failed to delete chunk: %v", err),
		}, nil
	}

	return &pb.DeleteChunkResponse{
		Success: true,
		Message: "chunk deleted successfully",
	}, nil
}

// CheckChunk チャンクをチェック
func (s *Server) CheckChunk(ctx context.Context, req *pb.CheckChunkRequest) (*pb.CheckChunkResponse, error) {
	log.Printf("Checking chunk: %s", req.ChunkId)

	info, err := s.storage.GetChunkInfo(req.ChunkId)
	if err != nil {
		return &pb.CheckChunkResponse{
			Exists: false,
		}, nil
	}

	// 整合性を検証
	if err := s.storage.VerifyChunk(req.ChunkId); err != nil {
		log.Printf("Chunk verification failed for %s: %v", req.ChunkId, err)
		// NameNodeに不良チャンクを報告
		go s.reportBadChunk(req.ChunkId, fmt.Sprintf("verification failed: %v", err))
	}

	return &pb.CheckChunkResponse{
		Exists:   true,
		Size:     info.Size,
		Checksum: info.Checksum,
	}, nil
}

// Ping ヘルスチェック
func (s *Server) Ping(ctx context.Context, req *pb.PingRequest) (*pb.PingResponse, error) {
	return &pb.PingResponse{
		Message:   fmt.Sprintf("DataNode %s is healthy", s.config.DataNode.ID),
		Timestamp: time.Now().Unix(),
	}, nil
}

// reportBadChunk 不良チャンクをNameNodeに報告
func (s *Server) reportBadChunk(chunkID, errorMessage string) {
	_, err := s.nameNodeStub.ReportBadChunk(context.Background(), &pb.ReportBadChunkRequest{
		ChunkId:      chunkID,
		DatanodeId:   s.config.DataNode.ID,
		ErrorMessage: errorMessage,
	})
	if err != nil {
		log.Printf("Failed to report bad chunk %s: %v", chunkID, err)
	}
}

// GetStorage ストレージインスタンスを取得（テスト用）
func (s *Server) GetStorage() *ChunkStorage {
	return s.storage
}

// GetConfig 設定を取得（テスト用）
func (s *Server) GetConfig() *config.Config {
	return s.config
}
