package crypto

import (
	"bytes"
	"testing"
)

// TestBase58Encode Base58エンコードテスト
func TestBase58Encode(t *testing.T) {
	tests := []struct {
		name     string
		input    []byte
		expected string
	}{
		{
			name:     "Empty input",
			input:    []byte{},
			expected: "",
		},
		{
			name:     "Single zero byte",
			input:    []byte{0},
			expected: "1",
		},
		{
			name:     "Multiple zero bytes",
			input:    []byte{0, 0, 0},
			expected: "111",
		},
		{
			name:     "Small number",
			input:    []byte{1},
			expected: "2",
		},
		{
			name:     "Larger number",
			input:    []byte{0, 255},
			expected: "15Q",
		},
		{
			name:     "Bitcoin example",
			input:    []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09},
			expected: "1kA3B2yGe2z4",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Base58Encode(tt.input)
			if result != tt.expected {
				t.Errorf("Base58Encode() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// TestBase58Decode Base58デコードテスト
func TestBase58Decode(t *testing.T) {
	tests := []struct {
		name      string
		input     string
		expected  []byte
		shouldErr bool
	}{
		{
			name:      "Empty input",
			input:     "",
			expected:  []byte{},
			shouldErr: false,
		},
		{
			name:     "Single '1'",
			input:    "1",
			expected: []byte{0},
		},
		{
			name:     "Multiple '1's",
			input:    "111",
			expected: []byte{0, 0, 0},
		},
		{
			name:     "Small number",
			input:    "2",
			expected: []byte{1},
		},
		{
			name:      "Invalid character",
			input:     "0",
			expected:  nil,
			shouldErr: true,
		},
		{
			name:      "Another invalid character",
			input:     "O",
			expected:  nil,
			shouldErr: true,
		},
		{
			name:     "Bitcoin example",
			input:    "1kA3B2yGe2z4",
			expected: []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := Base58Decode(tt.input)
			if tt.shouldErr {
				if err == nil {
					t.Errorf("Base58Decode() should return error, got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("Base58Decode() error = %v", err)
				return
			}
			if !bytes.Equal(result, tt.expected) {
				t.Errorf("Base58Decode() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// TestBase58EncodeDecodeRoundTrip エンコード・デコード往復テスト
func TestBase58EncodeDecodeRoundTrip(t *testing.T) {
	tests := [][]byte{
		{},
		{0},
		{1},
		{255},
		{0, 0, 0},
		{1, 2, 3, 4, 5},
		{0x00, 0x01, 0x02, 0x03, 0x04},
		{255, 254, 253, 252, 251},
		// ランダムなデータ
		{0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0},
	}

	for i, original := range tests {
		t.Run(string(rune('A'+i)), func(t *testing.T) {
			encoded := Base58Encode(original)
			decoded, err := Base58Decode(encoded)
			if err != nil {
				t.Errorf("Decode error: %v", err)
				return
			}
			if !bytes.Equal(original, decoded) {
				t.Errorf("Round trip failed: original %v, got %v", original, decoded)
			}
		})
	}
}

// TestBase58CheckEncode チェックサム付きエンコードテスト
func TestBase58CheckEncode(t *testing.T) {
	tests := []struct {
		name     string
		version  byte
		payload  []byte
		expected string
	}{
		{
			name:     "Bitcoin address example",
			version:  0x00,
			payload:  []byte{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14},
			expected: "16L5yRNPTuciSgXGHqYwn9N6NeoKqopAu",
		},
		{
			name:     "Empty payload",
			version:  0x00,
			payload:  []byte{},
			expected: "1Wh4bh",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := Base58CheckEncode(tt.version, tt.payload)
			if result != tt.expected {
				t.Errorf("Base58CheckEncode() = %v, want %v", result, tt.expected)
			}
		})
	}
}

// TestBase58CheckDecode チェックサム付きデコードテスト
func TestBase58CheckDecode(t *testing.T) {
	tests := []struct {
		name            string
		input           string
		expectedVersion byte
		expectedPayload []byte
		shouldErr       bool
	}{
		{
			name:            "Valid address",
			input:           "16L5yRNPTuciSgXGHqYwn9N6NeoKqopAu",
			expectedVersion: 0x00,
			expectedPayload: []byte{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14},
		},
		{
			name:            "Empty payload",
			input:           "1Wh4bh",
			expectedVersion: 0x00,
			expectedPayload: []byte{},
		},
		{
			name:      "Invalid checksum",
			input:     "16L5yRNPTuciSgXGHqYwn9N6NeoKqopAv", // 最後の文字を変更
			shouldErr: true,
		},
		{
			name:      "Too short",
			input:     "1234",
			shouldErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			version, payload, err := Base58CheckDecode(tt.input)
			if tt.shouldErr {
				if err == nil {
					t.Errorf("Base58CheckDecode() should return error, got nil")
				}
				return
			}
			if err != nil {
				t.Errorf("Base58CheckDecode() error = %v", err)
				return
			}
			if version != tt.expectedVersion {
				t.Errorf("Version = %v, want %v", version, tt.expectedVersion)
			}
			if !bytes.Equal(payload, tt.expectedPayload) {
				t.Errorf("Payload = %v, want %v", payload, tt.expectedPayload)
			}
		})
	}
}

// TestBase58CheckEncodeDecodeRoundTrip チェックサム付き往復テスト
func TestBase58CheckEncodeDecodeRoundTrip(t *testing.T) {
	tests := []struct {
		version byte
		payload []byte
	}{
		{0x00, []byte{}},
		{0x00, []byte{1, 2, 3, 4, 5}},
		{0x05, []byte{0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xAA, 0xBB, 0xCC}},
		{0xFF, []byte{255, 254, 253, 252, 251, 250, 249, 248, 247, 246, 245, 244, 243, 242, 241, 240, 239, 238, 237, 236}},
	}

	for i, tt := range tests {
		t.Run(string(rune('A'+i)), func(t *testing.T) {
			encoded := Base58CheckEncode(tt.version, tt.payload)
			decodedVersion, decodedPayload, err := Base58CheckDecode(encoded)
			if err != nil {
				t.Errorf("Decode error: %v", err)
				return
			}
			if decodedVersion != tt.version {
				t.Errorf("Version round trip failed: original %v, got %v", tt.version, decodedVersion)
			}
			if !bytes.Equal(tt.payload, decodedPayload) {
				t.Errorf("Payload round trip failed: original %v, got %v", tt.payload, decodedPayload)
			}
		})
	}
}

// TestRIPEMD160 簡易RIPEMD160テスト
func TestRIPEMD160(t *testing.T) {
	tests := []struct {
		name  string
		input []byte
	}{
		{
			name:  "Empty input",
			input: []byte{},
		},
		{
			name:  "Small input",
			input: []byte("hello"),
		},
		{
			name:  "Larger input",
			input: []byte("The quick brown fox jumps over the lazy dog"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := RIPEMD160(tt.input)
			if len(result) != 20 {
				t.Errorf("RIPEMD160() result length = %v, want 20", len(result))
			}

			// 同じ入力に対して同じ結果が返されることを確認
			result2 := RIPEMD160(tt.input)
			if !bytes.Equal(result, result2) {
				t.Error("RIPEMD160() should return consistent results")
			}
		})
	}
}

// ベンチマークテスト

// BenchmarkBase58Encode Base58エンコード性能テスト
func BenchmarkBase58Encode(b *testing.B) {
	data := []byte{0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Base58Encode(data)
	}
}

// BenchmarkBase58Decode Base58デコード性能テスト
func BenchmarkBase58Decode(b *testing.B) {
	encoded := "16L5yRNPTuciSgXGHqYwn9N6NeoKqopAu"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := Base58Decode(encoded)
		if err != nil {
			b.Fatalf("Decode error: %v", err)
		}
	}
}

// BenchmarkBase58CheckEncode チェックサム付きエンコード性能テスト
func BenchmarkBase58CheckEncode(b *testing.B) {
	version := byte(0x00)
	payload := []byte{0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Base58CheckEncode(version, payload)
	}
}

// BenchmarkBase58CheckDecode チェックサム付きデコード性能テスト
func BenchmarkBase58CheckDecode(b *testing.B) {
	encoded := "16L5yRNPTuciSgXGHqYwn9N6NeoKqopAu"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _, err := Base58CheckDecode(encoded)
		if err != nil {
			b.Fatalf("Decode error: %v", err)
		}
	}
}

// BenchmarkRIPEMD160 RIPEMD160性能テスト
func BenchmarkRIPEMD160(b *testing.B) {
	data := []byte("The quick brown fox jumps over the lazy dog")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		RIPEMD160(data)
	}
}
