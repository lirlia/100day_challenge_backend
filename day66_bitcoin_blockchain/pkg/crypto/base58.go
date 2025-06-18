package crypto

import (
	"crypto/sha256"
	"errors"
	"math/big"
)

// Base58 alphabet (Bitcoin uses this specific alphabet)
const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

var (
	bigRadix      = big.NewInt(58)
	bigZero       = big.NewInt(0)
	alphabetBytes = []byte(alphabet)
)

// Base58Encode バイト配列をBase58文字列にエンコード
func Base58Encode(input []byte) string {
	// 先頭のゼロバイトの数をカウント
	var zeroBytesCount int
	for i := 0; i < len(input); i++ {
		if input[i] != 0 {
			break
		}
		zeroBytesCount++
	}

	// big.Intに変換
	x := new(big.Int)
	x.SetBytes(input)

	// Base58変換
	var result []byte
	for x.Cmp(bigZero) > 0 {
		mod := new(big.Int)
		x.DivMod(x, bigRadix, mod)
		result = append(result, alphabetBytes[mod.Int64()])
	}

	// 先頭のゼロバイトを'1'に変換
	for i := 0; i < zeroBytesCount; i++ {
		result = append(result, alphabetBytes[0])
	}

	// 結果を逆順にする
	for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
		result[i], result[j] = result[j], result[i]
	}

	return string(result)
}

// Base58Decode Base58文字列をバイト配列にデコード
func Base58Decode(input string) ([]byte, error) {
	if len(input) == 0 {
		return []byte{}, nil
	}

	// 先頭の'1'の数をカウント
	var zeroCount int
	for i := 0; i < len(input); i++ {
		if input[i] != '1' {
			break
		}
		zeroCount++
	}

	// Base58デコード
	result := big.NewInt(0)
	multi := big.NewInt(1)

	for i := len(input) - 1; i >= zeroCount; i-- {
		// 文字をインデックスに変換
		charIndex := -1
		for j, char := range alphabetBytes {
			if byte(input[i]) == char {
				charIndex = j
				break
			}
		}
		if charIndex == -1 {
			return nil, errors.New("invalid Base58 character")
		}

		// 計算
		temp := big.NewInt(int64(charIndex))
		temp.Mul(temp, multi)
		result.Add(result, temp)
		multi.Mul(multi, bigRadix)
	}

	// バイト配列に変換
	decoded := result.Bytes()

	// 先頭のゼロバイトを追加
	if zeroCount > 0 {
		padding := make([]byte, zeroCount)
		decoded = append(padding, decoded...)
	}

	return decoded, nil
}

// Base58CheckEncode チェックサム付きBase58エンコード（Bitcoin Address用）
func Base58CheckEncode(version byte, payload []byte) string {
	// バージョン + ペイロードを連結
	combined := append([]byte{version}, payload...)

	// ダブルSHA256でチェックサム計算
	checksum := DoubleSHA256(combined)

	// 最初の4バイトをチェックサムとして使用
	combined = append(combined, checksum[:4]...)

	return Base58Encode(combined)
}

// Base58CheckDecode チェックサム付きBase58デコード
func Base58CheckDecode(input string) (byte, []byte, error) {
	decoded, err := Base58Decode(input)
	if err != nil {
		return 0, nil, err
	}

	if len(decoded) < 5 {
		return 0, nil, errors.New("decoded data too short")
	}

	// バージョン、ペイロード、チェックサムを分離
	version := decoded[0]
	payload := decoded[1 : len(decoded)-4]
	checksum := decoded[len(decoded)-4:]

	// チェックサム検証
	combined := append([]byte{version}, payload...)
	expectedChecksum := DoubleSHA256(combined)

	for i := 0; i < 4; i++ {
		if checksum[i] != expectedChecksum[i] {
			return 0, nil, errors.New("checksum mismatch")
		}
	}

	return version, payload, nil
}

// RIPEMD160 簡易版（Bitcoinアドレス生成用）
// 注意: これは教育目的の簡易実装です
func RIPEMD160(data []byte) []byte {
	// 実際のBitcoinではRIPEMD160を使用しますが、
	// 教育目的でSHA256の最初の20バイトを使用
	hash := sha256.Sum256(data)
	result := make([]byte, 20)
	copy(result, hash[:20])
	return result
}
