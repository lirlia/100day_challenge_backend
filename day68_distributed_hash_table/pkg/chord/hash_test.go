package chord

import (
	"testing"
)

func TestHashString(t *testing.T) {
	tests := []struct {
		input    string
		expected bool // テストの種類（一意性、範囲など）
	}{
		{"localhost:8000", true},
		{"localhost:8001", true},
		{"localhost:8002", true},
		{"example.com:9000", true},
		{"", true},
		{"test", true},
	}

	seenHashes := make(map[NodeID]bool)

	for _, test := range tests {
		hash := HashString(test.input)

		// ハッシュが範囲内にあることを確認
		if hash >= HASH_SPACE {
			t.Errorf("HashString(%s) = %d, which is >= HASH_SPACE (%d)",
				test.input, hash, HASH_SPACE)
		}

		// 同じ入力に対して同じハッシュが生成されることを確認
		hash2 := HashString(test.input)
		if hash != hash2 {
			t.Errorf("HashString(%s) is not deterministic: %d != %d",
				test.input, hash, hash2)
		}

		seenHashes[hash] = true
	}

	t.Logf("Generated %d unique hashes from %d inputs", len(seenHashes), len(tests))
}

func TestGenerateNodeID(t *testing.T) {
	tests := []struct {
		address string
		port    int
	}{
		{"localhost", 8000},
		{"localhost", 8001},
		{"localhost", 8002},
		{"example.com", 9000},
		{"test.local", 3000},
	}

	seenIDs := make(map[NodeID]bool)

	for _, test := range tests {
		nodeID := GenerateNodeID(test.address, test.port)

		// NodeID が範囲内にあることを確認
		if nodeID >= HASH_SPACE {
			t.Errorf("GenerateNodeID(%s, %d) = %d, which is >= HASH_SPACE (%d)",
				test.address, test.port, nodeID, HASH_SPACE)
		}

		// 決定的であることを確認
		nodeID2 := GenerateNodeID(test.address, test.port)
		if nodeID != nodeID2 {
			t.Errorf("GenerateNodeID(%s, %d) is not deterministic: %d != %d",
				test.address, test.port, nodeID, nodeID2)
		}

		seenIDs[nodeID] = true
	}

	t.Logf("Generated %d unique node IDs from %d inputs", len(seenIDs), len(tests))
}

func TestHashKey(t *testing.T) {
	tests := []string{
		"key1",
		"key2",
		"user:123",
		"data:profile:456",
		"",
		"very long key with spaces and special characters !@#$%^&*()",
	}

	for _, key := range tests {
		keyID := HashKey(key)

		// キーIDが範囲内にあることを確認
		if keyID >= HASH_SPACE {
			t.Errorf("HashKey(%s) = %d, which is >= HASH_SPACE (%d)",
				key, keyID, HASH_SPACE)
		}

		// 決定的であることを確認
		keyID2 := HashKey(key)
		if keyID != keyID2 {
			t.Errorf("HashKey(%s) is not deterministic: %d != %d",
				key, keyID, keyID2)
		}

		t.Logf("HashKey(%s) = %d", key, keyID)
	}
}

func TestBetween(t *testing.T) {
	tests := []struct {
		id, start, end NodeID
		expected       bool
		description    string
	}{
		{5, 3, 7, true, "5 between 3 and 7"},
		{3, 3, 7, false, "3 not between 3 and 7 (exclusive)"},
		{7, 3, 7, false, "7 not between 3 and 7 (exclusive)"},
		{1, 3, 7, false, "1 not between 3 and 7"},
		{8, 3, 7, false, "8 not between 3 and 7"},
		{3, 7, 3, false, "3 not between 7 and 3 (same start/end)"},

		// Wrap around cases
		{1, 250, 10, true, "1 between 250 and 10 (wrap around)"},
		{255, 250, 10, true, "255 between 250 and 10 (wrap around)"},
		{5, 250, 10, true, "5 between 250 and 10 (wrap around)"},
		{250, 250, 10, false, "250 not between 250 and 10 (exclusive)"},
		{10, 250, 10, false, "10 not between 250 and 10 (exclusive)"},
		{100, 250, 10, false, "100 not between 250 and 10 (wrap around)"},
	}

	for _, test := range tests {
		result := Between(test.id, test.start, test.end)
		if result != test.expected {
			t.Errorf("Between(%d, %d, %d) = %v, expected %v (%s)",
				test.id, test.start, test.end, result, test.expected, test.description)
		}
	}
}

func TestBetweenInclusive(t *testing.T) {
	tests := []struct {
		id       NodeID
		start    NodeID
		end      NodeID
		expected bool
	}{
		{5, 0, 10, true},     // 通常のケース: 0 <= 5 <= 10
		{0, 0, 10, true},     // 境界値: start
		{10, 0, 10, true},    // 境界値: end
		{15, 0, 10, false},   // 範囲外
		{5, 10, 0, false},    // リングを跨ぐケース: 10 <= 5 <= 0 は false
		{200, 150, 50, true}, // リングを跨ぐケース: 150 <= 200 <= 50 (wrap around)
		{25, 150, 50, true},  // リングを跨ぐケース: 150 <= 25 <= 50 (wrap around)
		{100, 150, 50, false}, // リングを跨ぐケース: 150 <= 100 <= 50 は false
	}

	for _, test := range tests {
		result := BetweenInclusive(test.id, test.start, test.end)
		if result != test.expected {
			t.Errorf("BetweenInclusive(%d, %d, %d) = %v, expected %v",
				test.id, test.start, test.end, result, test.expected)
		}
	}
}

func TestDistance(t *testing.T) {
	tests := []struct {
		from     NodeID
		to       NodeID
		expected NodeID
	}{
		{0, 0, 0},     // 同じ場所
		{0, 10, 10},   // 通常のケース
		{10, 0, 246},  // リングを跨ぐケース: (256 - 10) + 0 = 246
		{100, 150, 50}, // 通常のケース
		{200, 50, 106}, // リングを跨ぐケース: (256 - 200) + 50 = 106
	}

	for _, test := range tests {
		result := Distance(test.from, test.to)
		if result != test.expected {
			t.Errorf("Distance(%d, %d) = %d, expected %d",
				test.from, test.to, result, test.expected)
		}
	}
}

func TestPowerOfTwo(t *testing.T) {
	tests := []struct {
		input    int
		expected NodeID
	}{
		{0, 1},   // 2^0 = 1
		{1, 2},   // 2^1 = 2
		{2, 4},   // 2^2 = 4
		{3, 8},   // 2^3 = 8
		{4, 16},  // 2^4 = 16
		{5, 32},  // 2^5 = 32
		{6, 64},  // 2^6 = 64
		{7, 128}, // 2^7 = 128
		{8, 0},   // 2^8 = 256, but NodeID is uint8 so it should return 0 for overflow
	}

	for _, test := range tests {
		result := PowerOfTwo(test.input)
		if result != test.expected {
			t.Errorf("PowerOfTwo(%d) = %d, expected %d", test.input, result, test.expected)
		}
	}
}

func TestAddPowerOfTwo(t *testing.T) {
	tests := []struct {
		nodeID   NodeID
		i        int
		expected NodeID
	}{
		{0, 0, 1},     // 0 + 2^0 = 1
		{0, 1, 2},     // 0 + 2^1 = 2
		{0, 7, 128},   // 0 + 2^7 = 128
		{100, 0, 101}, // 100 + 2^0 = 101
		{100, 1, 102}, // 100 + 2^1 = 102
		{250, 3, 2},   // 250 + 8 = 258, 258 % 256 = 2
		{255, 1, 1},   // 255 + 2 = 257, 257 % 256 = 1
	}

	for _, test := range tests {
		result := AddPowerOfTwo(test.nodeID, test.i)
		if result != test.expected {
			t.Errorf("AddPowerOfTwo(%d, %d) = %d, expected %d",
				test.nodeID, test.i, result, test.expected)
		}
	}
}

func TestComputeFingerStart(t *testing.T) {
	nodeID := NodeID(10)

	for i := 0; i < M; i++ {
		start := ComputeFingerStart(nodeID, i)
		expected := AddPowerOfTwo(nodeID, i)

		if start != expected {
			t.Errorf("ComputeFingerStart(%d, %d) = %d, expected %d",
				nodeID, i, start, expected)
		}

		t.Logf("Finger[%d] start = %d", i, start)
	}
}

func TestBetweenExclusive(t *testing.T) {
	tests := []struct {
		id       NodeID
		start    NodeID
		end      NodeID
		expected bool
	}{
		{5, 0, 10, true},     // 通常のケース: 0 < 5 < 10
		{0, 0, 10, false},    // 境界値: start (排他的)
		{10, 0, 10, false},   // 境界値: end (排他的)
		{15, 0, 10, false},   // 範囲外
		{200, 150, 50, true}, // リングを跨ぐケース: 150 < 200 < 50 (wrap around)
		{25, 150, 50, true},  // リングを跨ぐケース: 150 < 25 < 50 (wrap around)
		{150, 150, 50, false}, // 境界値: start (排他的)
		{50, 150, 50, false}, // 境界値: end (排他的)
	}

	for _, test := range tests {
		result := BetweenExclusive(test.id, test.start, test.end)
		if result != test.expected {
			t.Errorf("BetweenExclusive(%d, %d, %d) = %v, expected %v",
				test.id, test.start, test.end, result, test.expected)
		}
	}
}

func TestBetweenLeftInclusive(t *testing.T) {
	tests := []struct {
		id       NodeID
		start    NodeID
		end      NodeID
		expected bool
	}{
		{5, 0, 10, true},     // 通常のケース: 0 <= 5 < 10
		{0, 0, 10, true},     // 境界値: start (包含)
		{10, 0, 10, false},   // 境界値: end (排他的)
		{200, 150, 50, true}, // リングを跨ぐケース: 150 <= 200 < 50 (wrap around)
		{150, 150, 50, true}, // 境界値: start (包含)
		{50, 150, 50, false}, // 境界値: end (排他的)
	}

	for _, test := range tests {
		result := BetweenLeftInclusive(test.id, test.start, test.end)
		if result != test.expected {
			t.Errorf("BetweenLeftInclusive(%d, %d, %d) = %v, expected %v",
				test.id, test.start, test.end, result, test.expected)
		}
	}
}

func TestBetweenRightInclusive(t *testing.T) {
	tests := []struct {
		id       NodeID
		start    NodeID
		end      NodeID
		expected bool
	}{
		{5, 0, 10, true},     // 通常のケース: 0 < 5 <= 10
		{0, 0, 10, false},    // 境界値: start (排他的)
		{10, 0, 10, true},    // 境界値: end (包含)
		{200, 150, 50, true}, // リングを跨ぐケース: 150 < 200 <= 50 (wrap around)
		{150, 150, 50, false}, // 境界値: start (排他的)
		{50, 150, 50, true},  // 境界値: end (包含)
	}

	for _, test := range tests {
		result := BetweenRightInclusive(test.id, test.start, test.end)
		if result != test.expected {
			t.Errorf("BetweenRightInclusive(%d, %d, %d) = %v, expected %v",
				test.id, test.start, test.end, result, test.expected)
		}
	}
}

func TestHashInfo(t *testing.T) {
	testValues := []string{
		"test",
		"localhost:8000",
		"example.com:9000",
		"",
	}

	for _, value := range testValues {
		info := HashInfo(value)

		// 基本フィールドの存在確認
		if info["input"] != value {
			t.Errorf("HashInfo(%s) input = %v, expected %s", value, info["input"], value)
		}

		nodeID, ok := info["node_id"].(NodeID)
		if !ok {
			t.Errorf("HashInfo(%s) node_id is not NodeID type", value)
			continue
		}

		// 実際のハッシュ値と一致するか確認
		expectedNodeID := HashString(value)
		if nodeID != expectedNodeID {
			t.Errorf("HashInfo(%s) node_id = %d, expected %d", value, nodeID, expectedNodeID)
		}

		// hex フィールドの確認
		if info["hex"] == nil {
			t.Errorf("HashInfo(%s) hex is nil", value)
		}

		// binary フィールドの確認
		if info["binary"] == nil {
			t.Errorf("HashInfo(%s) binary is nil", value)
		}

		// hash_space フィールドの確認
		if info["hash_space"] != HASH_SPACE {
			t.Errorf("HashInfo(%s) hash_space = %v, expected %d", value, info["hash_space"], HASH_SPACE)
		}
	}
}

// ベンチマークテスト
func BenchmarkHashString(b *testing.B) {
	testString := "localhost:8000"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		HashString(testString)
	}
}

func BenchmarkGenerateNodeID(b *testing.B) {
	address := "localhost"
	port := 8000

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		GenerateNodeID(address, port)
	}
}

func BenchmarkPowerOfTwo(b *testing.B) {
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		PowerOfTwo(i % M)
	}
}

func BenchmarkAddPowerOfTwo(b *testing.B) {
	nodeID := NodeID(100)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		AddPowerOfTwo(nodeID, i%M)
	}
}

func BenchmarkDistance(b *testing.B) {
	from := NodeID(50)
	to := NodeID(200)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Distance(from, to)
	}
}

func BenchmarkBetweenInclusive(b *testing.B) {
	id := NodeID(100)
	start := NodeID(50)
	end := NodeID(150)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		BetweenInclusive(id, start, end)
	}
}
