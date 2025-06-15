package namenode

import (
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/lirlia/100day_challenge_backend/day65_distributed_filesystem/internal/common"
)

// ReplicationManager レプリケーション管理
type ReplicationManager struct {
	namenode          *Server
	targetReplication int
	badChunks         map[string][]BadChunkReport
	badChunksMu       sync.RWMutex
	commands          map[string][]string // DataNodeID -> Commands
	commandsMu        sync.RWMutex
}

// BadChunkReport 不良チャンク報告
type BadChunkReport struct {
	ChunkID    string
	DataNodeID string
	Error      string
	ReportedAt time.Time
}

// NewReplicationManager 新しいReplicationManagerを作成
func NewReplicationManager(namenode *Server, targetReplication int) *ReplicationManager {
	return &ReplicationManager{
		namenode:          namenode,
		targetReplication: targetReplication,
		badChunks:         make(map[string][]BadChunkReport),
		commands:          make(map[string][]string),
	}
}

// HandleBadChunk 不良チャンクを処理
func (rm *ReplicationManager) HandleBadChunk(chunkID, dataNodeID, errorMessage string) {
	rm.badChunksMu.Lock()
	defer rm.badChunksMu.Unlock()

	report := BadChunkReport{
		ChunkID:    chunkID,
		DataNodeID: dataNodeID,
		Error:      errorMessage,
		ReportedAt: time.Now(),
	}

	if rm.badChunks[chunkID] == nil {
		rm.badChunks[chunkID] = []BadChunkReport{}
	}
	rm.badChunks[chunkID] = append(rm.badChunks[chunkID], report)

	log.Printf("Bad chunk reported: %s on %s - %s", chunkID, dataNodeID, errorMessage)

	// 即座に修復を試行
	go rm.repairChunk(chunkID)
}

// CheckAndRepair レプリケーション状態をチェックして修復
func (rm *ReplicationManager) CheckAndRepair() {
	log.Printf("Checking replication status...")

	// 不足レプリケーションをチェック
	rm.checkUnderReplicatedChunks()

	// 過剰レプリケーションをチェック
	rm.checkOverReplicatedChunks()

	// 古い不良チャンク報告をクリーンアップ
	rm.cleanupOldBadChunks()
}

// checkUnderReplicatedChunks レプリケーション不足のチャンクをチェック
func (rm *ReplicationManager) checkUnderReplicatedChunks() {
	dataNodes, err := rm.namenode.db.GetDataNodes()
	if err != nil {
		log.Printf("Error getting data nodes: %v", err)
		return
	}

	// 生きているDataNodeのマップを作成
	aliveNodes := make(map[string]*common.DataNodeMetadata)
	for _, node := range dataNodes {
		if node.IsAlive {
			aliveNodes[node.ID] = node
		}
	}

	// 全チャンクをチェック
	stats, err := rm.namenode.db.GetSystemStats()
	if err != nil {
		log.Printf("Error getting system stats: %v", err)
		return
	}

	log.Printf("Checking %d chunks for under-replication", stats.TotalChunks)

	// TODO: 実際のチャンクレプリケーション状態をチェックする実装
	// 現在は簡単な実装のみ
}

// checkOverReplicatedChunks レプリケーション過剰のチャンクをチェック
func (rm *ReplicationManager) checkOverReplicatedChunks() {
	// TODO: 過剰レプリケーションをチェックして削除する実装
}

// repairChunk チャンクを修復
func (rm *ReplicationManager) repairChunk(chunkID string) {
	log.Printf("Attempting to repair chunk: %s", chunkID)

	// チャンク情報を取得
	chunk, err := rm.namenode.db.GetChunk(chunkID)
	if err != nil {
		log.Printf("Error getting chunk %s: %v", chunkID, err)
		return
	}
	if chunk == nil {
		log.Printf("Chunk %s not found", chunkID)
		return
	}

	// 利用可能なDataNodeを確認
	availableNodes := rm.namenode.getAvailableDataNodes()
	aliveReplicas := 0
	var sourceNode *common.DataNodeMetadata

	// 生きているレプリカを数える
	for _, nodeID := range chunk.DataNodes {
		if node := rm.namenode.getDataNode(nodeID); node != nil && node.IsAlive {
			aliveReplicas++
			if sourceNode == nil {
				sourceNode = node
			}
		}
	}

	log.Printf("Chunk %s has %d alive replicas (target: %d)", chunkID, aliveReplicas, rm.targetReplication)

	// レプリケーション不足の場合
	if aliveReplicas < rm.targetReplication {
		needed := rm.targetReplication - aliveReplicas
		log.Printf("Chunk %s needs %d more replicas", chunkID, needed)

		if sourceNode == nil {
			log.Printf("No alive source node found for chunk %s", chunkID)
			return
		}

		// 新しいDataNodeを選択
		for i := 0; i < needed && i < len(availableNodes); i++ {
			targetNode := availableNodes[i]

			// 既存のレプリカが存在しないNodeを選択
			isExisting := false
			for _, nodeID := range chunk.DataNodes {
				if nodeID == targetNode.ID {
					isExisting = true
					break
				}
			}

			if !isExisting {
				// レプリケーションコマンドを発行
				command := fmt.Sprintf("replicate:%s:%s", chunkID, targetNode.ID)
				rm.addCommandForDataNode(sourceNode.ID, command)
				log.Printf("Scheduled replication: %s -> %s", sourceNode.ID, targetNode.ID)
			}
		}
	}
}

// addCommandForDataNode DataNodeにコマンドを追加
func (rm *ReplicationManager) addCommandForDataNode(dataNodeID, command string) {
	rm.commandsMu.Lock()
	defer rm.commandsMu.Unlock()

	if rm.commands[dataNodeID] == nil {
		rm.commands[dataNodeID] = []string{}
	}
	rm.commands[dataNodeID] = append(rm.commands[dataNodeID], command)
}

// GetCommandsForDataNode DataNode用のコマンドを取得
func (rm *ReplicationManager) GetCommandsForDataNode(dataNodeID string) []string {
	rm.commandsMu.Lock()
	defer rm.commandsMu.Unlock()

	commands := rm.commands[dataNodeID]
	rm.commands[dataNodeID] = nil // コマンドをクリア

	return commands
}

// cleanupOldBadChunks 古い不良チャンク報告をクリーンアップ
func (rm *ReplicationManager) cleanupOldBadChunks() {
	rm.badChunksMu.Lock()
	defer rm.badChunksMu.Unlock()

	cutoff := time.Now().Add(-24 * time.Hour) // 24時間以上古い報告を削除

	for chunkID, reports := range rm.badChunks {
		var newReports []BadChunkReport
		for _, report := range reports {
			if report.ReportedAt.After(cutoff) {
				newReports = append(newReports, report)
			}
		}

		if len(newReports) == 0 {
			delete(rm.badChunks, chunkID)
		} else {
			rm.badChunks[chunkID] = newReports
		}
	}
}

// GetBadChunks 不良チャンク一覧を取得
func (rm *ReplicationManager) GetBadChunks() map[string][]BadChunkReport {
	rm.badChunksMu.RLock()
	defer rm.badChunksMu.RUnlock()

	result := make(map[string][]BadChunkReport)
	for chunkID, reports := range rm.badChunks {
		result[chunkID] = make([]BadChunkReport, len(reports))
		copy(result[chunkID], reports)
	}

	return result
}

// GetReplicationStats レプリケーション統計を取得
func (rm *ReplicationManager) GetReplicationStats() map[string]interface{} {
	rm.badChunksMu.RLock()
	badChunkCount := len(rm.badChunks)
	rm.badChunksMu.RUnlock()

	rm.commandsMu.RLock()
	pendingCommands := 0
	for _, commands := range rm.commands {
		pendingCommands += len(commands)
	}
	rm.commandsMu.RUnlock()

	return map[string]interface{}{
		"target_replication": rm.targetReplication,
		"bad_chunks":         badChunkCount,
		"pending_commands":   pendingCommands,
	}
}
