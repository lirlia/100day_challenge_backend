package client

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"
	"sort"
	"strings"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/config"
	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/pkg/utils"
	pb "github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/proto"
	"google.golang.org/grpc"
)

// Client DFSクライアント
type Client struct {
	config       *config.Config
	nameNodeConn *grpc.ClientConn
	nameNodeStub pb.NameNodeServiceClient
}

// NewClient 新しいクライアントを作成
func NewClient(cfg *config.Config) (*Client, error) {
	client := &Client{
		config: cfg,
	}

	if err := client.connectToNameNode(); err != nil {
		return nil, fmt.Errorf("failed to connect to NameNode: %w", err)
	}

	return client, nil
}

// connectToNameNode NameNodeに接続
func (c *Client) connectToNameNode() error {
	nameNodeAddr := c.config.GetNameNodeAddr()
	log.Printf("Connecting to NameNode at %s", nameNodeAddr)

	conn, err := grpc.Dial(nameNodeAddr, grpc.WithInsecure())
	if err != nil {
		return fmt.Errorf("failed to connect to NameNode: %w", err)
	}

	c.nameNodeConn = conn
	c.nameNodeStub = pb.NewNameNodeServiceClient(conn)

	return nil
}

// Close クライアントを閉じる
func (c *Client) Close() {
	if c.nameNodeConn != nil {
		c.nameNodeConn.Close()
	}
}

// PutFile ファイルをアップロード
func (c *Client) PutFile(localPath, remotePath string) error {
	log.Printf("Uploading file: %s -> %s", localPath, remotePath)

	// ローカルファイルを確認
	if !utils.FileExists(localPath) {
		return fmt.Errorf("local file not found: %s", localPath)
	}

	fileSize, err := utils.GetFileSize(localPath)
	if err != nil {
		return fmt.Errorf("failed to get file size: %w", err)
	}

	log.Printf("File size: %s", utils.FormatBytes(fileSize))

	// NameNodeにファイル作成を要求
	createResp, err := c.nameNodeStub.CreateFile(context.Background(), &pb.CreateFileRequest{
		Path:        remotePath,
		Size:        fileSize,
		Replication: int32(c.config.DFS.Replication),
	})
	if err != nil {
		return fmt.Errorf("failed to create file metadata: %w", err)
	}

	if !createResp.Success {
		return fmt.Errorf("failed to create file: %s", createResp.Message)
	}

	// チャンクを割り当て
	allocateResp, err := c.nameNodeStub.AllocateChunks(context.Background(), &pb.AllocateChunksRequest{
		FilePath:    remotePath,
		FileSize:    fileSize,
		Replication: int32(c.config.DFS.Replication),
	})
	if err != nil {
		return fmt.Errorf("failed to allocate chunks: %w", err)
	}

	if !allocateResp.Success {
		return fmt.Errorf("failed to allocate chunks: %s", allocateResp.Message)
	}

	log.Printf("Allocated %d chunks", len(allocateResp.Allocations))

	// ファイルを読み込んでチャンクに分割してアップロード
	file, err := os.Open(localPath)
	if err != nil {
		return fmt.Errorf("failed to open file: %w", err)
	}
	defer file.Close()

	for i, allocation := range allocateResp.Allocations {
		log.Printf("Uploading chunk %d/%d: %s", i+1, len(allocateResp.Allocations), allocation.ChunkId)

		// チャンクデータを読み込み
		chunkData := make([]byte, allocation.Size)
		n, err := file.Read(chunkData)
		if err != nil && err != io.EOF {
			return fmt.Errorf("failed to read chunk data: %w", err)
		}
		chunkData = chunkData[:n]

		// 各DataNodeにチャンクを書き込み
		for j, dataNodeID := range allocation.DatanodeIds {
			log.Printf("Writing chunk %s to DataNode %s (%d/%d)", allocation.ChunkId, dataNodeID, j+1, len(allocation.DatanodeIds))

			if err := c.writeChunkToDataNode(dataNodeID, allocation.ChunkId, chunkData); err != nil {
				log.Printf("Failed to write chunk to DataNode %s: %v", dataNodeID, err)
				// 他のレプリカが成功すれば続行
			}
		}
	}

	log.Printf("Successfully uploaded file: %s", remotePath)
	return nil
}

// GetFile ファイルをダウンロード
func (c *Client) GetFile(remotePath, localPath string) error {
	log.Printf("Downloading file: %s -> %s", remotePath, localPath)

	// ファイル情報を取得
	fileInfoResp, err := c.nameNodeStub.GetFileInfo(context.Background(), &pb.GetFileInfoRequest{
		Path: remotePath,
	})
	if err != nil {
		return fmt.Errorf("failed to get file info: %w", err)
	}

	if !fileInfoResp.Success {
		return fmt.Errorf("failed to get file info: %s", fileInfoResp.Message)
	}

	// チャンクの場所を取得
	locationsResp, err := c.nameNodeStub.GetChunkLocations(context.Background(), &pb.GetChunkLocationsRequest{
		FilePath: remotePath,
	})
	if err != nil {
		return fmt.Errorf("failed to get chunk locations: %w", err)
	}

	if !locationsResp.Success {
		return fmt.Errorf("failed to get chunk locations: %s", locationsResp.Message)
	}

	log.Printf("File size: %s, chunks: %d", utils.FormatBytes(fileInfoResp.FileInfo.Size), len(locationsResp.Locations))

	// チャンクをオフセット順にソート
	sort.Slice(locationsResp.Locations, func(i, j int) bool {
		return locationsResp.Locations[i].Offset < locationsResp.Locations[j].Offset
	})

	// ローカルファイルを作成
	localFile, err := os.Create(localPath)
	if err != nil {
		return fmt.Errorf("failed to create local file: %w", err)
	}
	defer localFile.Close()

	// 各チャンクをダウンロード
	for i, location := range locationsResp.Locations {
		log.Printf("Downloading chunk %d/%d: %s", i+1, len(locationsResp.Locations), location.ChunkId)

		chunkData, err := c.readChunkFromDataNode(location)
		if err != nil {
			return fmt.Errorf("failed to read chunk %s: %w", location.ChunkId, err)
		}

		// ファイルに書き込み
		if _, err := localFile.Write(chunkData); err != nil {
			return fmt.Errorf("failed to write chunk data: %w", err)
		}
	}

	log.Printf("Successfully downloaded file: %s", localPath)
	return nil
}

// ListFiles ファイル一覧を取得
func (c *Client) ListFiles(path string) error {
	log.Printf("Listing files: %s", path)

	resp, err := c.nameNodeStub.ListFiles(context.Background(), &pb.ListFilesRequest{
		Path: path,
	})
	if err != nil {
		return fmt.Errorf("failed to list files: %w", err)
	}

	if !resp.Success {
		return fmt.Errorf("failed to list files: %s", resp.Message)
	}

	fmt.Printf("Files in %s:\n", path)
	fmt.Printf("%-60s %12s %12s %s\n", "PATH", "SIZE", "BLOCKS", "REPLICATION")
	fmt.Printf("%s\n", strings.Repeat("-", 100))

	for _, file := range resp.Files {
		fmt.Printf("%-60s %12s %12d %d\n",
			file.Path,
			utils.FormatBytes(file.Size),
			len(file.Chunks),
			file.Replication,
		)
	}

	fmt.Printf("\nTotal: %d files\n", len(resp.Files))
	return nil
}

// GetFileInfo ファイル情報を取得
func (c *Client) GetFileInfo(path string) error {
	log.Printf("Getting file info: %s", path)

	resp, err := c.nameNodeStub.GetFileInfo(context.Background(), &pb.GetFileInfoRequest{
		Path: path,
	})
	if err != nil {
		return fmt.Errorf("failed to get file info: %w", err)
	}

	if !resp.Success {
		return fmt.Errorf("failed to get file info: %s", resp.Message)
	}

	file := resp.FileInfo
	fmt.Printf("File Information:\n")
	fmt.Printf("  Path:        %s\n", file.Path)
	fmt.Printf("  Size:        %s (%d bytes)\n", utils.FormatBytes(file.Size), file.Size)
	fmt.Printf("  Block Size:  %s\n", utils.FormatBytes(file.BlockSize))
	fmt.Printf("  Replication: %d\n", file.Replication)
	fmt.Printf("  Created:     %s\n", utils.TimestampToTime(file.CreatedAt).Format("2006-01-02 15:04:05"))
	fmt.Printf("  Modified:    %s\n", utils.TimestampToTime(file.ModifiedAt).Format("2006-01-02 15:04:05"))
	fmt.Printf("  Chunks:      %d\n", len(file.Chunks))

	return nil
}

// DeleteFile ファイルを削除
func (c *Client) DeleteFile(path string) error {
	log.Printf("Deleting file: %s", path)

	resp, err := c.nameNodeStub.DeleteFile(context.Background(), &pb.DeleteFileRequest{
		Path: path,
	})
	if err != nil {
		return fmt.Errorf("failed to delete file: %w", err)
	}

	if !resp.Success {
		return fmt.Errorf("failed to delete file: %s", resp.Message)
	}

	log.Printf("Successfully deleted file: %s", path)
	return nil
}

// writeChunkToDataNode DataNodeにチャンクを書き込み
func (c *Client) writeChunkToDataNode(dataNodeID, chunkID string, data []byte) error {
	// TODO: DataNodeのアドレス解決が必要
	// 今は簡易実装として、dataNodeIDからアドレスを推測
	var dataNodeAddr string
	switch dataNodeID {
	case "datanode1":
		dataNodeAddr = "localhost:9001"
	case "datanode2":
		dataNodeAddr = "localhost:9002"
	case "datanode3":
		dataNodeAddr = "localhost:9003"
	default:
		return fmt.Errorf("unknown DataNode: %s", dataNodeID)
	}

	// DataNodeに接続
	conn, err := grpc.Dial(dataNodeAddr, grpc.WithInsecure())
	if err != nil {
		return fmt.Errorf("failed to connect to DataNode: %w", err)
	}
	defer conn.Close()

	client := pb.NewDataNodeServiceClient(conn)
	stream, err := client.WriteChunk(context.Background())
	if err != nil {
		return fmt.Errorf("failed to create write stream: %w", err)
	}

	// データをストリーミング送信
	const bufferSize = 64 * 1024 // 64KB chunks
	for i := 0; i < len(data); i += bufferSize {
		end := i + bufferSize
		if end > len(data) {
			end = len(data)
		}

		isLast := end == len(data)
		if err := stream.Send(&pb.WriteChunkRequest{
			ChunkId: chunkID,
			Data:    data[i:end],
			IsLast:  isLast,
		}); err != nil {
			return fmt.Errorf("failed to send chunk data: %w", err)
		}
	}

	resp, err := stream.CloseAndRecv()
	if err != nil {
		return fmt.Errorf("failed to close write stream: %w", err)
	}

	if !resp.Success {
		return fmt.Errorf("write failed: %s", resp.Message)
	}

	return nil
}

// readChunkFromDataNode DataNodeからチャンクを読み込み
func (c *Client) readChunkFromDataNode(location *pb.ChunkLocation) ([]byte, error) {
	if len(location.Datanodes) == 0 {
		return nil, fmt.Errorf("no available DataNodes for chunk %s", location.ChunkId)
	}

	// 最初の利用可能なDataNodeを使用
	dataNode := location.Datanodes[0]
	dataNodeAddr := fmt.Sprintf("%s:%d", dataNode.Address, dataNode.Port)

	// DataNodeに接続
	conn, err := grpc.Dial(dataNodeAddr, grpc.WithInsecure())
	if err != nil {
		return nil, fmt.Errorf("failed to connect to DataNode: %w", err)
	}
	defer conn.Close()

	client := pb.NewDataNodeServiceClient(conn)
	stream, err := client.ReadChunk(context.Background(), &pb.ReadChunkRequest{
		ChunkId: location.ChunkId,
		Offset:  0,
		Size:    location.Size,
	})
	if err != nil {
		return nil, fmt.Errorf("failed to create read stream: %w", err)
	}

	var data []byte
	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("failed to receive chunk data: %w", err)
		}

		data = append(data, resp.Data...)

		if resp.IsLast {
			break
		}
	}

	return data, nil
}
