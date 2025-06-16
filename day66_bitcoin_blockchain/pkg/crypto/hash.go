package crypto

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
)

// HashSHA256 SHA-256ハッシュを計算
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

// DoubleSHA256 Bitcoin風のダブルSHA-256ハッシュ
func DoubleSHA256(data []byte) []byte {
	first := sha256.Sum256(data)
	second := sha256.Sum256(first[:])
	return second[:]
}

// DoubleSHA256Hex は2回のSHA-256ハッシュをHEX文字列で返す
func DoubleSHA256Hex(data []byte) string {
	hash := DoubleSHA256(data)
	return hex.EncodeToString(hash)
}

// VerifyHash ハッシュが正しいかを検証
func VerifyHash(data []byte, expectedHash []byte) bool {
	actualHash := HashSHA256(data)
	return hex.EncodeToString(actualHash) == hex.EncodeToString(expectedHash)
}

// VerifyHashHex はデータとHEX文字列ハッシュが一致するかを検証する
func VerifyHashHex(data []byte, expectedHashHex string) bool {
	actualHash := HashSHA256Hex(data)
	return actualHash == expectedHashHex
}

// FormatHash ハッシュを読みやすい形式にフォーマット
func FormatHash(hash []byte) string {
	return hex.EncodeToString(hash)
}

// ValidateHashFormat ハッシュ形式が有効かチェック
func ValidateHashFormat(hashStr string) bool {
	_, err := hex.DecodeString(hashStr)
	return err == nil && len(hashStr) == 64 // SHA-256は32バイト = 64文字
}

// IsValidHash バイト配列が有効なSHA-256ハッシュかチェック
func IsValidHash(hash []byte) bool {
	return len(hash) == 32 // SHA-256は32バイト
}

// GenerateHashTarget 指定された難易度に対応するターゲットハッシュを生成
func GenerateHashTarget(difficulty int) string {
	target := ""
	for i := 0; i < difficulty; i++ {
		target += "0"
	}
	for i := difficulty; i < 64; i++ {
		target += "f"
	}
	return target
}

// HashPubKey 公開鍵をハッシュ化（Bitcoin風のアドレス生成用）
func HashPubKey(pubKey []byte) []byte {
	pubSHA256 := sha256.Sum256(pubKey)

	// 簡易版：SHA256のみ（実際のBitcoinはRIPEMD160も使用）
	return pubSHA256[:]
}

// RestorePublicKey バイト配列から公開鍵を復元
func RestorePublicKey(pubKeyBytes []byte) (*ecdsa.PublicKey, error) {
	if len(pubKeyBytes) != 64 {
		return nil, fmt.Errorf("invalid public key length: expected 64, got %d", len(pubKeyBytes))
	}

	curve := elliptic.P256()
	x := new(big.Int).SetBytes(pubKeyBytes[:32])
	y := new(big.Int).SetBytes(pubKeyBytes[32:])

	pubKey := &ecdsa.PublicKey{
		Curve: curve,
		X:     x,
		Y:     y,
	}

	return pubKey, nil
}

// CompareHashes 2つのハッシュを比較
func CompareHashes(hash1, hash2 []byte) bool {
	return hex.EncodeToString(hash1) == hex.EncodeToString(hash2)
}

// HasLeadingZeros ハッシュが指定された数の先頭ゼロを持つかチェック
func HasLeadingZeros(hash []byte, numZeros int) bool {
	hashStr := hex.EncodeToString(hash)

	if len(hashStr) < numZeros {
		return false
	}

	for i := 0; i < numZeros; i++ {
		if hashStr[i] != '0' {
			return false
		}
	}

	return true
}

// HexEncode バイト配列を16進文字列に変換
func HexEncode(data []byte) string {
	return hex.EncodeToString(data)
}

// HexDecode 16進文字列をバイト配列に変換
func HexDecode(s string) ([]byte, error) {
	return hex.DecodeString(s)
}

// RestorePrivateKey バイト配列からECDSA秘密鍵を復元
func RestorePrivateKey(privateKeyBytes []byte) (*ecdsa.PrivateKey, error) {
	curve := elliptic.P256()

	// 秘密鍵のDを設定
	d := new(big.Int).SetBytes(privateKeyBytes)

	// 公開鍵を計算
	x, y := curve.ScalarBaseMult(privateKeyBytes)

	privateKey := &ecdsa.PrivateKey{
		PublicKey: ecdsa.PublicKey{
			Curve: curve,
			X:     x,
			Y:     y,
		},
		D: d,
	}

	return privateKey, nil
}
