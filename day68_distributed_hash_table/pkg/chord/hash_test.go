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
		{"127.0.0.1", 8000},
		{"example.com", 9000},
	}

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

		t.Logf("GenerateNodeID(%s, %d) = %d", test.address, test.port, nodeID)
	}
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
		id, start, end NodeID
		expected       bool
		description    string
	}{
		{5, 3, 7, true, "5 between 3 and 7 (inclusive)"},
		{3, 3, 7, true, "3 between 3 and 7 (inclusive)"},
		{7, 3, 7, true, "7 between 3 and 7 (inclusive)"},
		{1, 3, 7, false, "1 not between 3 and 7"},
		{8, 3, 7, false, "8 not between 3 and 7"},
		{3, 3, 3, true, "3 between 3 and 3 (same)"},

		// Wrap around cases
		{1, 250, 10, true, "1 between 250 and 10 (wrap around, inclusive)"},
		{255, 250, 10, true, "255 between 250 and 10 (wrap around, inclusive)"},
		{250, 250, 10, true, "250 between 250 and 10 (wrap around, inclusive)"},
		{10, 250, 10, true, "10 between 250 and 10 (wrap around, inclusive)"},
		{100, 250, 10, false, "100 not between 250 and 10 (wrap around)"},
	}

	for _, test := range tests {
		result := BetweenInclusive(test.id, test.start, test.end)
		if result != test.expected {
			t.Errorf("BetweenInclusive(%d, %d, %d) = %v, expected %v (%s)",
				test.id, test.start, test.end, result, test.expected, test.description)
		}
	}
}

func TestDistance(t *testing.T) {
	tests := []struct {
		start, end NodeID
		expected   NodeID
		description string
	}{
		{3, 7, 4, "distance from 3 to 7"},
		{7, 3, 252, "distance from 7 to 3 (wrap around)"},
		{0, 255, 255, "distance from 0 to 255"},
		{255, 0, 1, "distance from 255 to 0 (wrap around)"},
		{100, 100, 0, "distance from 100 to 100 (same)"},
		{0, 128, 128, "distance from 0 to 128 (half ring)"},
		{128, 0, 128, "distance from 128 to 0 (half ring wrap)"},
	}

	for _, test := range tests {
		result := Distance(test.start, test.end)
		if result != test.expected {
			t.Errorf("Distance(%d, %d) = %d, expected %d (%s)",
				test.start, test.end, result, test.expected, test.description)
		}
	}
}

func TestPowerOfTwo(t *testing.T) {
	tests := []struct {
		k        int
		expected NodeID
	}{
		{0, 1},
		{1, 2},
		{2, 4},
		{3, 8},
		{4, 16},
		{5, 32},
		{6, 64},
		{7, 128},
		{8, 0}, // オーバーフロー
		{9, 0}, // オーバーフロー
	}

	for _, test := range tests {
		result := PowerOfTwo(test.k)
		if result != test.expected {
			t.Errorf("PowerOfTwo(%d) = %d, expected %d",
				test.k, result, test.expected)
		}
	}
}

func TestAddPowerOfTwo(t *testing.T) {
	tests := []struct {
		id       NodeID
		k        int
		expected NodeID
	}{
		{10, 0, 11},      // 10 + 2^0 = 10 + 1 = 11
		{10, 1, 12},      // 10 + 2^1 = 10 + 2 = 12
		{10, 2, 14},      // 10 + 2^2 = 10 + 4 = 14
		{10, 3, 18},      // 10 + 2^3 = 10 + 8 = 18
		{250, 3, 2},      // 250 + 8 = 258 mod 256 = 2
		{255, 1, 1},      // 255 + 2 = 257 mod 256 = 1
		{128, 7, 0},      // 128 + 128 = 256 mod 256 = 0
	}

	for _, test := range tests {
		result := AddPowerOfTwo(test.id, test.k)
		if result != test.expected {
			t.Errorf("AddPowerOfTwo(%d, %d) = %d, expected %d",
				test.id, test.k, result, test.expected)
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

func BenchmarkBetween(b *testing.B) {
	id := NodeID(5)
	start := NodeID(3)
	end := NodeID(7)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Between(id, start, end)
	}
}

func BenchmarkDistance(b *testing.B) {
	start := NodeID(100)
	end := NodeID(200)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Distance(start, end)
	}
}
