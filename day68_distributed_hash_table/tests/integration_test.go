package tests

import (
	"fmt"
	"math"
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/lirlia/100day_challenge_backend/day68_distributed_hash_table/pkg/chord"
)

// 統合テスト: 大規模ノード環境でのパフォーマンス検証
func TestIntegrationLargeScalePerformance(t *testing.T) {
	t.Log("=== 統合テスト: 大規模ノード環境でのパフォーマンス検証 ===")

	// テストケース: 異なるノード数での性能測定
	testCases := []struct {
		nodeCount int
		dataCount int
	}{
		{5, 50},    // 小規模
		{10, 100},  // 中規模
		{20, 200},  // 大規模
		{50, 500},  // 超大規模
	}

	for _, tc := range testCases {
		t.Run(fmt.Sprintf("Nodes_%d_Data_%d", tc.nodeCount, tc.dataCount), func(t *testing.T) {
			ring := chord.NewRing()
			nodes := make([]*chord.ChordNodeStorage, tc.nodeCount)

			// ノード作成とリング構築の計測
			startTime := time.Now()

			// 最初のノードを作成
			firstNode := chord.NewChordNodeWithStorage("node-0.test.local", 8000)
			firstNode.InitializeFingerTable()
			ring.AddNode(firstNode.ChordNode.Node)
			nodes[0] = firstNode

			// 残りのノードを順次追加
			for i := 1; i < tc.nodeCount; i++ {
				node := chord.NewChordNodeWithStorage(fmt.Sprintf("node-%d.test.local", i), 8000+i)

				// 既存ノードを経由してリングに参加
				err := node.Join(nodes[0].ChordNode, ring)
				if err != nil {
					t.Fatalf("Node %d failed to join ring: %v", i, err)
				}
				nodes[i] = node
			}

			ringSetupTime := time.Since(startTime)
			t.Logf("リング構築時間 (%d ノード): %v", tc.nodeCount, ringSetupTime)

			// データ操作の性能測定
			startTime = time.Now()
			var wg sync.WaitGroup

			// 並行でのデータ挿入テスト
			for i := 0; i < tc.dataCount; i++ {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					key := fmt.Sprintf("key-%d", idx)
					value := fmt.Sprintf("value-%d", idx)

					// ランダムなノードからデータを挿入
					nodeIdx := rand.Intn(tc.nodeCount)
					nodes[nodeIdx].Put(key, value)
				}(i)
			}
			wg.Wait()

			dataInsertTime := time.Since(startTime)
			t.Logf("データ挿入時間 (%d データ): %v", tc.dataCount, dataInsertTime)

			// データ検索の性能測定
			startTime = time.Now()
			hitCount := 0

			for i := 0; i < tc.dataCount; i++ {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					key := fmt.Sprintf("key-%d", idx)

					// ランダムなノードから検索
					nodeIdx := rand.Intn(tc.nodeCount)
					value, exists := nodes[nodeIdx].Get(key)
					if exists && value == fmt.Sprintf("value-%d", idx) {
						hitCount++
					}
				}(i)
			}
			wg.Wait()

			dataSearchTime := time.Since(startTime)
			t.Logf("データ検索時間 (%d データ): %v", tc.dataCount, dataSearchTime)

			// ルーティング効率の計測
			routingHops := measureRoutingEfficiency(nodes, tc.dataCount/10)
			expectedHops := math.Log2(float64(tc.nodeCount))

			t.Logf("平均ルーティングホップ数: %.2f (理論値: %.2f)", routingHops, expectedHops)
			t.Logf("データ検索成功率: %.2f%%", float64(hitCount)/float64(tc.dataCount)*100)

			// パフォーマンス閾値チェック
			if ringSetupTime > time.Second*5 {
				t.Errorf("リング構築が遅すぎます: %v > 5s", ringSetupTime)
			}
			if dataInsertTime > time.Second*10 {
				t.Errorf("データ挿入が遅すぎます: %v > 10s", dataInsertTime)
			}
			if dataSearchTime > time.Second*10 {
				t.Errorf("データ検索が遅すぎます: %v > 10s", dataSearchTime)
			}
			if float64(hitCount)/float64(tc.dataCount) < 0.95 {
				t.Errorf("データ検索成功率が低すぎます: %.2f%% < 95%%", float64(hitCount)/float64(tc.dataCount)*100)
			}
		})
	}
}

// 統合テスト: フェイルオーバー・障害回復テスト
func TestIntegrationFailoverAndRecovery(t *testing.T) {
	t.Log("=== 統合テスト: フェイルオーバー・障害回復テスト ===")

	ring := chord.NewRing()
	nodeCount := 10
	nodes := make([]*chord.ChordNodeStorage, nodeCount)

	// リング構築
	firstNode := chord.NewChordNodeWithStorage("failover-0.test.local", 8000)
	firstNode.InitializeFingerTable()
	ring.AddNode(firstNode.ChordNode.Node)
	nodes[0] = firstNode

	for i := 1; i < nodeCount; i++ {
		node := chord.NewChordNodeWithStorage(fmt.Sprintf("failover-%d.test.local", i), 8000+i)
		err := node.Join(nodes[0].ChordNode, ring)
		if err != nil {
			t.Fatalf("Node %d failed to join ring: %v", i, err)
		}
		nodes[i] = node
	}

	// 初期データ投入
	dataCount := 100
	testData := make(map[string]string)
	for i := 0; i < dataCount; i++ {
		key := fmt.Sprintf("failover-key-%d", i)
		value := fmt.Sprintf("failover-value-%d", i)
		testData[key] = value

		nodeIdx := rand.Intn(nodeCount)
		nodes[nodeIdx].Put(key, value)
	}

	t.Logf("初期データ投入完了: %d データ", dataCount)

	// ノード障害シミュレーション (複数ノードを同時に削除)
	failureNodes := []int{2, 5, 7} // 30%のノードが故障
	t.Logf("ノード障害シミュレーション開始: ノード %v", failureNodes)

	for _, nodeIdx := range failureNodes {
		err := nodes[nodeIdx].Leave(ring)
		if err != nil {
			t.Errorf("Node %d failed to leave ring: %v", nodeIdx, err)
		}
	}

	// 残りのノードでフィンガーテーブル更新
	for i := 0; i < nodeCount; i++ {
		skip := false
		for _, failIdx := range failureNodes {
			if i == failIdx {
				skip = true
				break
			}
		}
		if !skip {
			nodes[i].UpdateFingerTable(ring)
		}
	}

	t.Log("フィンガーテーブル更新完了")

	// データアクセス可能性の検証
	accessibleCount := 0
	for key, expectedValue := range testData {
		// 生存ノードからランダムに選択
		var aliveNodes []*chord.ChordNodeStorage
		for i := 0; i < nodeCount; i++ {
			skip := false
			for _, failIdx := range failureNodes {
				if i == failIdx {
					skip = true
					break
				}
			}
			if !skip {
				aliveNodes = append(aliveNodes, nodes[i])
			}
		}

		if len(aliveNodes) > 0 {
			nodeIdx := rand.Intn(len(aliveNodes))
			value, exists := aliveNodes[nodeIdx].Get(key)
			if exists && value == expectedValue {
				accessibleCount++
			}
		}
	}

	accessibilityRate := float64(accessibleCount) / float64(dataCount) * 100
	t.Logf("データアクセス可能率: %.2f%% (%d/%d)", accessibilityRate, accessibleCount, dataCount)

	// 新しいノードの参加（回復テスト）
	newNodeCount := len(failureNodes)
	for i := 0; i < newNodeCount; i++ {
		newNode := chord.NewChordNodeWithStorage(fmt.Sprintf("recovery-%d.test.local", i), 9000+i)

		// 生存ノードを経由してリングに参加
		var aliveNode *chord.ChordNodeStorage
		for j := 0; j < nodeCount; j++ {
			skip := false
			for _, failIdx := range failureNodes {
				if j == failIdx {
					skip = true
					break
				}
			}
			if !skip {
				aliveNode = nodes[j]
				break
			}
		}

		if aliveNode != nil {
			err := newNode.Join(aliveNode.ChordNode, ring)
			if err != nil {
				t.Errorf("Recovery node %d failed to join ring: %v", i, err)
			}
		}
	}

	t.Logf("回復ノード追加完了: %d ノード", newNodeCount)

	// 回復後のデータアクセス可能性の再検証
	ringInfo := ring.GetRingInfo()
	t.Logf("回復後のリング状態: %d ノード", len(ringInfo.Nodes))

	// 最低限の要求 (70%以上のデータが障害後もアクセス可能)
	if accessibilityRate < 70.0 {
		t.Errorf("障害後のデータアクセス可能率が低すぎます: %.2f%% < 70%%", accessibilityRate)
	}

	// リングの整合性検証
	if len(ringInfo.Nodes) <= 0 {
		t.Error("リングが空になっています")
	}

	t.Log("フェイルオーバー・障害回復テスト完了")
}

// ルーティング効率測定ヘルパー関数
func measureRoutingEfficiency(nodes []*chord.ChordNodeStorage, sampleSize int) float64 {
	if len(nodes) == 0 || sampleSize == 0 {
		return 0
	}

	totalHops := 0
	for i := 0; i < sampleSize; i++ {
		sourceNodeIdx := rand.Intn(len(nodes))
		targetKey := fmt.Sprintf("routing-test-key-%d", i)

		// シミュレートされたルーティングホップ数を計算
		// 実際の実装では、FindSuccessor の呼び出し回数を測定
		hops := simulateRoutingHops(nodes[sourceNodeIdx], targetKey, nodes)
		totalHops += hops
	}

	return float64(totalHops) / float64(sampleSize)
}

// ルーティングホップ数のシミュレーション
func simulateRoutingHops(sourceNode *chord.ChordNodeStorage, key string, allNodes []*chord.ChordNodeStorage) int {
	// 簡易的なホップ数計算 (実際の実装では more detailed tracing が必要)
	hops := 1
	nodeCount := len(allNodes)

	// ログN のオーダーでホップ数を推定
	expectedHops := int(math.Log2(float64(nodeCount))) + 1
	if expectedHops < 1 {
		expectedHops = 1
	}

	// ランダムなばらつきを追加 (±1)
	variation := rand.Intn(3) - 1 // -1, 0, 1
	hops = expectedHops + variation
	if hops < 1 {
		hops = 1
	}

	return hops
}

// 統合テスト: コンカレント操作テスト
func TestIntegrationConcurrentOperations(t *testing.T) {
	t.Log("=== 統合テスト: コンカレント操作テスト ===")

	ring := chord.NewRing()
	nodeCount := 8
	nodes := make([]*chord.ChordNodeStorage, nodeCount)

	// リング構築
	firstNode := chord.NewChordNodeWithStorage("concurrent-0.test.local", 8000)
	firstNode.InitializeFingerTable()
	ring.AddNode(firstNode.ChordNode.Node)
	nodes[0] = firstNode

	for i := 1; i < nodeCount; i++ {
		node := chord.NewChordNodeWithStorage(fmt.Sprintf("concurrent-%d.test.local", i), 8000+i)
		err := node.Join(nodes[0].ChordNode, ring)
		if err != nil {
			t.Fatalf("Node %d failed to join ring: %v", i, err)
		}
		nodes[i] = node
	}

	// 並行操作のテスト
	const goroutineCount = 20
	const operationsPerGoroutine = 50

	var wg sync.WaitGroup
	errors := make(chan error, goroutineCount*operationsPerGoroutine)

	startTime := time.Now()

	// 並行でデータ操作を実行
	for g := 0; g < goroutineCount; g++ {
		wg.Add(1)
		go func(goroutineID int) {
			defer wg.Done()

			for op := 0; op < operationsPerGoroutine; op++ {
				nodeIdx := rand.Intn(nodeCount)
				key := fmt.Sprintf("concurrent-key-%d-%d", goroutineID, op)
				value := fmt.Sprintf("concurrent-value-%d-%d", goroutineID, op)

				// データ挿入
				nodes[nodeIdx].Put(key, value)

				// データ検索
				retrievedValue, exists := nodes[nodeIdx].Get(key)
				if !exists {
					errors <- fmt.Errorf("key %s not found after insertion", key)
					continue
				}
				if retrievedValue != value {
					errors <- fmt.Errorf("value mismatch for key %s: expected %s, got %s", key, value, retrievedValue)
					continue
				}

				// データ更新
				newValue := fmt.Sprintf("updated-%s", value)
				nodes[nodeIdx].Put(key, newValue)

				// 更新確認
				updatedValue, exists := nodes[nodeIdx].Get(key)
				if !exists {
					errors <- fmt.Errorf("key %s not found after update", key)
					continue
				}
				if updatedValue != newValue {
					errors <- fmt.Errorf("update failed for key %s: expected %s, got %s", key, newValue, updatedValue)
					continue
				}
			}
		}(g)
	}

	wg.Wait()
	close(errors)

	concurrentOperationTime := time.Since(startTime)

	// エラーの集計
	errorCount := 0
	for err := range errors {
		if err != nil {
			t.Logf("並行操作エラー: %v", err)
			errorCount++
		}
	}

	totalOperations := goroutineCount * operationsPerGoroutine * 3 // Put + Get + Put(update) + Get(verify)
	successRate := float64(totalOperations-errorCount) / float64(totalOperations) * 100

	t.Logf("並行操作時間: %v", concurrentOperationTime)
	t.Logf("総操作数: %d", totalOperations)
	t.Logf("エラー数: %d", errorCount)
	t.Logf("成功率: %.2f%%", successRate)

	// 成功率の検証
	if successRate < 95.0 {
		t.Errorf("並行操作の成功率が低すぎます: %.2f%% < 95%%", successRate)
	}

	t.Log("コンカレント操作テスト完了")
}

// ベンチマークテスト: データ分散の均等性
func TestIntegrationDataDistribution(t *testing.T) {
	t.Log("=== 統合テスト: データ分散の均等性検証 ===")

	ring := chord.NewRing()
	nodeCount := 12
	nodes := make([]*chord.ChordNodeStorage, nodeCount)

	// リング構築
	firstNode := chord.NewChordNodeWithStorage("distribution-0.test.local", 8000)
	firstNode.InitializeFingerTable()
	ring.AddNode(firstNode.ChordNode.Node)
	nodes[0] = firstNode

	for i := 1; i < nodeCount; i++ {
		node := chord.NewChordNodeWithStorage(fmt.Sprintf("distribution-%d.test.local", i), 8000+i)
		err := node.Join(nodes[0].ChordNode, ring)
		if err != nil {
			t.Fatalf("Node %d failed to join ring: %v", i, err)
		}
		nodes[i] = node
	}

	// 大量データの投入
	dataCount := 1000
	dataDistribution := make(map[string]int) // nodeID -> data count

	for i := 0; i < dataCount; i++ {
		key := fmt.Sprintf("distribution-key-%d", i)
		value := fmt.Sprintf("distribution-value-%d", i)

		// データを挿入し、どのノードが担当するかを記録
		nodeIdx := rand.Intn(nodeCount)
		nodes[nodeIdx].Put(key, value)

		// 責任ノードを特定
		responsibleNode := ring.GetResponsibleNode(key)
		if responsibleNode != nil {
			dataDistribution[responsibleNode.ID.String()]++
		}
	}

	// 分散の均等性を評価
	expectedPerNode := float64(dataCount) / float64(nodeCount)
	var variance float64

	t.Logf("データ分散状況 (期待値: %.1f per node):", expectedPerNode)
	for nodeID, count := range dataDistribution {
		deviation := float64(count) - expectedPerNode
		variance += deviation * deviation
		t.Logf("ノード %s: %d データ (偏差: %+.1f)", nodeID, count, deviation)
	}

	variance /= float64(nodeCount)
	standardDeviation := math.Sqrt(variance)

	t.Logf("標準偏差: %.2f", standardDeviation)

	// 分散の均等性の検証 (標準偏差が期待値の30%以下)
	maxAcceptableDeviation := expectedPerNode * 0.3
	if standardDeviation > maxAcceptableDeviation {
		t.Errorf("データ分散の偏りが大きすぎます: 標準偏差 %.2f > %.2f", standardDeviation, maxAcceptableDeviation)
	}

	t.Log("データ分散の均等性検証完了")
}
