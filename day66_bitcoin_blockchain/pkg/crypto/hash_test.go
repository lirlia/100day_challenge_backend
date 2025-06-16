package crypto

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestHashSHA256(t *testing.T) {
	// 空のデータ
	emptyData := []byte{}
	emptyHash := HashSHA256(emptyData)

	// 期待されるSHA-256ハッシュ長（32バイト）
	if len(emptyHash) != 32 {
		t.Errorf("Hash length should be 32 bytes, got %d", len(emptyHash))
	}

	// 標準ライブラリと同じ結果か確認
	expectedEmpty := sha256.Sum256(emptyData)
	if !bytes.Equal(emptyHash, expectedEmpty[:]) {
		t.Error("Hash should match standard library result for empty data")
	}

	// 通常のデータ
	testData := []byte("Hello, Bitcoin!")
	testHash := HashSHA256(testData)

	if len(testHash) != 32 {
		t.Errorf("Hash length should be 32 bytes, got %d", len(testHash))
	}

	// 標準ライブラリと同じ結果か確認
	expectedTest := sha256.Sum256(testData)
	if !bytes.Equal(testHash, expectedTest[:]) {
		t.Error("Hash should match standard library result for test data")
	}

	// 同じデータは同じハッシュを生成
	testHash2 := HashSHA256(testData)
	if !bytes.Equal(testHash, testHash2) {
		t.Error("Same data should produce same hash")
	}

	// 異なるデータは異なるハッシュを生成
	differentData := []byte("Hello, Bitcoin?")
	differentHash := HashSHA256(differentData)
	if bytes.Equal(testHash, differentHash) {
		t.Error("Different data should produce different hash")
	}
}

func TestHashSHA256String(t *testing.T) {
	testString := "Hello, Bitcoin!"
	stringHash := HashSHA256String(testString)
	byteHash := HashSHA256([]byte(testString))

	if !bytes.Equal(stringHash, byteHash) {
		t.Error("String hash should match byte hash for same content")
	}
}

func TestHashSHA256Hex(t *testing.T) {
	testData := []byte("test")
	hexHash := HashSHA256Hex(testData)

	// HEX文字列の長さチェック（SHA-256は64文字）
	if len(hexHash) != 64 {
		t.Errorf("Hex hash length should be 64 characters, got %d", len(hexHash))
	}

	// 有効なHEX文字列かチェック
	decoded, err := hex.DecodeString(hexHash)
	if err != nil {
		t.Error("Hex hash should be valid hex string")
	}

	// バイト版と一致するかチェック
	byteHash := HashSHA256(testData)
	if !bytes.Equal(decoded, byteHash) {
		t.Error("Hex hash should match byte hash when decoded")
	}
}

func TestHashSHA256StringHex(t *testing.T) {
	testString := "test"
	stringHexHash := HashSHA256StringHex(testString)
	byteHexHash := HashSHA256Hex([]byte(testString))

	if stringHexHash != byteHexHash {
		t.Error("String hex hash should match byte hex hash for same content")
	}
}

func TestDoubleSHA256(t *testing.T) {
	testData := []byte("Bitcoin")
	doubleHash := DoubleSHA256(testData)

	// 長さチェック
	if len(doubleHash) != 32 {
		t.Errorf("Double hash length should be 32 bytes, got %d", len(doubleHash))
	}

	// 手動で2回ハッシュした結果と比較
	firstHash := HashSHA256(testData)
	expectedDouble := HashSHA256(firstHash)

	if !bytes.Equal(doubleHash, expectedDouble) {
		t.Error("Double hash should match manually calculated double hash")
	}

	// シングルハッシュとは異なることを確認
	singleHash := HashSHA256(testData)
	if bytes.Equal(doubleHash, singleHash) {
		t.Error("Double hash should be different from single hash")
	}
}

func TestDoubleSHA256Hex(t *testing.T) {
	testData := []byte("Bitcoin")
	doubleHexHash := DoubleSHA256Hex(testData)

	// HEX文字列の長さチェック
	if len(doubleHexHash) != 64 {
		t.Errorf("Double hex hash length should be 64 characters, got %d", len(doubleHexHash))
	}

	// バイト版と一致するかチェック
	doubleByteHash := DoubleSHA256(testData)
	expectedHex := hex.EncodeToString(doubleByteHash)

	if doubleHexHash != expectedHex {
		t.Error("Double hex hash should match hex encoding of double byte hash")
	}
}

func TestVerifyHash(t *testing.T) {
	testData := []byte("verify test")
	correctHash := HashSHA256(testData)
	incorrectHash := HashSHA256([]byte("wrong data"))

	// 正しいハッシュの検証
	if !VerifyHash(testData, correctHash) {
		t.Error("Should verify correct hash")
	}

	// 間違ったハッシュの検証
	if VerifyHash(testData, incorrectHash) {
		t.Error("Should not verify incorrect hash")
	}

	// 空のデータの検証
	emptyData := []byte{}
	emptyHash := HashSHA256(emptyData)
	if !VerifyHash(emptyData, emptyHash) {
		t.Error("Should verify empty data hash")
	}
}

func TestVerifyHashHex(t *testing.T) {
	testData := []byte("verify hex test")
	correctHashHex := HashSHA256Hex(testData)
	incorrectHashHex := HashSHA256Hex([]byte("wrong data"))

	// 正しいHEXハッシュの検証
	if !VerifyHashHex(testData, correctHashHex) {
		t.Error("Should verify correct hex hash")
	}

	// 間違ったHEXハッシュの検証
	if VerifyHashHex(testData, incorrectHashHex) {
		t.Error("Should not verify incorrect hex hash")
	}

	// 無効なHEX文字列の検証
	if VerifyHashHex(testData, "invalid_hex") {
		t.Error("Should not verify invalid hex string")
	}
}

func TestFormatHash(t *testing.T) {
	// 空のハッシュ
	emptyHash := []byte{}
	formatted := FormatHash(emptyHash)
	if formatted != "<empty>" {
		t.Error("Empty hash should be formatted as '<empty>'")
	}

	// 短いハッシュ
	shortHash := []byte{0x01, 0x02, 0x03, 0x04}
	shortFormatted := FormatHash(shortHash)
	expected := hex.EncodeToString(shortHash)
	if shortFormatted != expected {
		t.Errorf("Short hash should be fully displayed, expected %s, got %s", expected, shortFormatted)
	}

	// 長いハッシュ（通常のSHA-256）
	longHash := HashSHA256([]byte("test"))
	longFormatted := FormatHash(longHash)
	longHashHex := hex.EncodeToString(longHash)
	expectedLong := longHashHex[:8] + "..." + longHashHex[len(longHashHex)-8:]

	if longFormatted != expectedLong {
		t.Errorf("Long hash should be truncated, expected %s, got %s", expectedLong, longFormatted)
	}
}

func TestIsValidHashHex(t *testing.T) {
	// 有効なSHA-256ハッシュ
	validHash := HashSHA256Hex([]byte("test"))
	if !IsValidHashHex(validHash) {
		t.Error("Valid SHA-256 hex should be recognized as valid")
	}

	// 無効なケース
	invalidCases := []struct {
		name string
		hash string
	}{
		{"empty string", ""},
		{"too short", "abc123"},
		{"too long", validHash + "extra"},
		{"invalid characters", "xyz" + validHash[3:]},
		{"mixed case with invalid", "G" + validHash[1:]},
	}

	for _, tc := range invalidCases {
		t.Run(tc.name, func(t *testing.T) {
			if IsValidHashHex(tc.hash) {
				t.Errorf("Invalid hash should not be recognized as valid: %s", tc.hash)
			}
		})
	}

	// 大文字小文字の混在（有効）
	mixedCase := "A1B2C3D4E5F60708A1B2C3D4E5F60708A1B2C3D4E5F60708A1B2C3D4E5F60708"
	if !IsValidHashHex(mixedCase) {
		t.Error("Mixed case hex should be valid")
	}
}

func TestCompareHashes(t *testing.T) {
	hash1 := HashSHA256([]byte("test1"))
	hash2 := HashSHA256([]byte("test1")) // 同じデータ
	hash3 := HashSHA256([]byte("test2")) // 異なるデータ

	// 同じハッシュの比較
	if !CompareHashes(hash1, hash2) {
		t.Error("Same hashes should be equal")
	}

	// 異なるハッシュの比較
	if CompareHashes(hash1, hash3) {
		t.Error("Different hashes should not be equal")
	}

	// 長さが異なるハッシュの比較
	shortHash := []byte{0x01, 0x02}
	if CompareHashes(hash1, shortHash) {
		t.Error("Hashes of different lengths should not be equal")
	}

	// 空のハッシュの比較
	empty1 := []byte{}
	empty2 := []byte{}
	if !CompareHashes(empty1, empty2) {
		t.Error("Empty hashes should be equal")
	}
}

func TestHasLeadingZeros(t *testing.T) {
	// 先頭にゼロがあるハッシュを手動で作成（テスト用）
	testCases := []struct {
		name       string
		hashHex    string
		difficulty int
		expected   bool
	}{
		{"no leading zeros", "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", 1, false},
		{"one leading zero", "0bcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", 1, true},
		{"one leading zero, difficulty 2", "0bcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", 2, false},
		{"two leading zeros", "00cdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", 2, true},
		{"four leading zeros", "0000ef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", 4, true},
		{"four leading zeros, difficulty 5", "0000ef1234567890abcdef1234567890abcdef1234567890abcdef1234567890", 5, false},
		{"all zeros", "0000000000000000000000000000000000000000000000000000000000000000", 32, true},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			hashBytes, err := hex.DecodeString(tc.hashHex)
			if err != nil {
				t.Fatalf("Failed to decode test hash: %v", err)
			}

			result := HasLeadingZeros(hashBytes, tc.difficulty)
			if result != tc.expected {
				t.Errorf("Expected %v for hash %s with difficulty %d, got %v",
					tc.expected, tc.hashHex, tc.difficulty, result)
			}
		})
	}

	// 無効な入力のテスト
	hash := HashSHA256([]byte("test"))

	// 難易度が文字列長より大きい場合
	if HasLeadingZeros(hash, 100) {
		t.Error("Should return false for difficulty greater than hash string length")
	}

	// 難易度が0の場合
	if !HasLeadingZeros(hash, 0) {
		t.Error("Should return true for difficulty 0")
	}
}

// BenchmarkHashSHA256 はSHA-256ハッシュ計算のベンチマーク
func BenchmarkHashSHA256(b *testing.B) {
	data := []byte("Bitcoin blockchain benchmark test data")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		HashSHA256(data)
	}
}

// BenchmarkDoubleSHA256 はダブルSHA-256のベンチマーク
func BenchmarkDoubleSHA256(b *testing.B) {
	data := []byte("Bitcoin blockchain benchmark test data")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		DoubleSHA256(data)
	}
}

// BenchmarkHashSHA256Hex はHEXエンコードを含むハッシュのベンチマーク
func BenchmarkHashSHA256Hex(b *testing.B) {
	data := []byte("Bitcoin blockchain benchmark test data")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		HashSHA256Hex(data)
	}
}

// BenchmarkHasLeadingZeros は先頭ゼロチェックのベンチマーク
func BenchmarkHasLeadingZeros(b *testing.B) {
	hash := HashSHA256([]byte("benchmark"))
	difficulty := 4

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		HasLeadingZeros(hash, difficulty)
	}
}
