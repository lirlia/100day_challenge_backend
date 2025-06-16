package crypto

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
)

// HashSHA256 は入力データのSHA-256ハッシュを計算する
func HashSHA256(data []byte) []byte {
	hash := sha256.Sum256(data)
	return hash[:]
}

// HashSHA256String は入力文字列のSHA-256ハッシュを計算する
func HashSHA256String(data string) []byte {
	return HashSHA256([]byte(data))
}

// HashSHA256Hex は入力データのSHA-256ハッシュをHEX文字列で返す
func HashSHA256Hex(data []byte) string {
	hash := HashSHA256(data)
	return hex.EncodeToString(hash)
}

// HashSHA256StringHex は入力文字列のSHA-256ハッシュをHEX文字列で返す
func HashSHA256StringHex(data string) string {
	return HashSHA256Hex([]byte(data))
}

// DoubleSHA256 は2回のSHA-256ハッシュを実行する（Bitcoinで使用される方式）
func DoubleSHA256(data []byte) []byte {
	first := HashSHA256(data)
	return HashSHA256(first)
}

// DoubleSHA256Hex は2回のSHA-256ハッシュをHEX文字列で返す
func DoubleSHA256Hex(data []byte) string {
	hash := DoubleSHA256(data)
	return hex.EncodeToString(hash)
}

// VerifyHash はデータとハッシュが一致するかを検証する
func VerifyHash(data []byte, expectedHash []byte) bool {
	actualHash := HashSHA256(data)
	return hex.EncodeToString(actualHash) == hex.EncodeToString(expectedHash)
}

// VerifyHashHex はデータとHEX文字列ハッシュが一致するかを検証する
func VerifyHashHex(data []byte, expectedHashHex string) bool {
	actualHash := HashSHA256Hex(data)
	return actualHash == expectedHashHex
}

// FormatHash はハッシュを読みやすい形式でフォーマットする
func FormatHash(hash []byte) string {
	if len(hash) == 0 {
		return "<empty>"
	}

	hashStr := hex.EncodeToString(hash)
	if len(hashStr) > 16 {
		return fmt.Sprintf("%s...%s", hashStr[:8], hashStr[len(hashStr)-8:])
	}
	return hashStr
}

// IsValidHashHex はHEX文字列が有効なハッシュかを判定する
func IsValidHashHex(hashHex string) bool {
	// SHA-256ハッシュは64文字のHEX文字列
	if len(hashHex) != 64 {
		return false
	}

	// HEX文字のみで構成されているかチェック
	_, err := hex.DecodeString(hashHex)
	return err == nil
}

// CompareHashes は2つのハッシュを比較する
func CompareHashes(hash1, hash2 []byte) bool {
	if len(hash1) != len(hash2) {
		return false
	}

	for i := range hash1 {
		if hash1[i] != hash2[i] {
			return false
		}
	}
	return true
}

// HasLeadingZeros は指定された数の先頭ゼロを持つかチェックする（PoW用）
func HasLeadingZeros(hash []byte, difficulty int) bool {
	hashHex := hex.EncodeToString(hash)

	if difficulty > len(hashHex) {
		return false
	}

	for i := 0; i < difficulty; i++ {
		if hashHex[i] != '0' {
			return false
		}
	}
	return true
}
