package chord

import (
	"crypto/sha1"
	"fmt"
	"math/big"
)

// HashString は文字列をSHA-1でハッシュ化してNodeIDに変換する
func HashString(s string) NodeID {
	h := sha1.New()
	h.Write([]byte(s))
	hash := h.Sum(nil)

	// SHA-1の最初の1バイト（8bit）を使用してNodeIDを生成
	// 2^8 = 256の範囲で NodeID を生成
	return NodeID(hash[0])
}

// HashBytes はバイト配列をハッシュ化してNodeIDに変換する
func HashBytes(data []byte) NodeID {
	h := sha1.New()
	h.Write(data)
	hash := h.Sum(nil)
	return NodeID(hash[0])
}

// HashKey はキーをハッシュ化してNodeIDに変換する
// データの格納位置を決定するために使用
func HashKey(key string) NodeID {
	return HashString(key)
}

// GenerateNodeID はアドレスとポートからNodeIDを生成する
func GenerateNodeID(address string, port int) NodeID {
	addressWithPort := fmt.Sprintf("%s:%d", address, port)
	return HashString(addressWithPort)
}

// HashToString はハッシュ値を16進文字列に変換する（デバッグ用）
func HashToString(nodeID NodeID) string {
	return fmt.Sprintf("%02x", uint8(nodeID))
}

// NodeIDFromBigInt は big.Int から NodeID を生成する
func NodeIDFromBigInt(n *big.Int) NodeID {
	// big.Int を 2^8 の範囲に収める
	mod := big.NewInt(HASH_SPACE)
	result := new(big.Int)
	result.Mod(n, mod)
	return NodeID(result.Uint64())
}

// NodeIDToBigInt は NodeID を big.Int に変換する
func NodeIDToBigInt(id NodeID) *big.Int {
	return big.NewInt(int64(id))
}

// Between は id が start と end の間にあるかどうかを判定する
// Chord リングの循環性を考慮する
func Between(id, start, end NodeID) bool {
	if start == end {
		return false
	}

	if start < end {
		return id > start && id < end
	}

	// Wrap around case: start > end
	return id > start || id < end
}

// BetweenInclusive は id が start と end の間にあるかどうかを判定する（境界を含む）
func BetweenInclusive(id, start, end NodeID) bool {
	if start <= end {
		// 通常のケース: start <= end
		return start <= id && id <= end
	} else {
		// リングの境界を跨ぐケース: start > end
		return id >= start || id <= end
	}
}

// PowerOfTwo は 2^i を計算する
func PowerOfTwo(i int) NodeID {
	if i >= M {
		return 0
	}
	return NodeID(1 << uint(i))
}

// AddPowerOfTwo は nodeID + 2^i を計算する（リング演算）
func AddPowerOfTwo(nodeID NodeID, i int) NodeID {
	if i >= M {
		return nodeID
	}
	powerOfTwo := PowerOfTwo(i)
	return (nodeID + powerOfTwo) % NodeID(HASH_SPACE)
}

// Distance はリング上での距離を計算する
func Distance(from, to NodeID) NodeID {
	if to >= from {
		return to - from
	}
	return (NodeID(HASH_SPACE) - from) + to
}

// ComputeFingerStart は i番目のフィンガーテーブルエントリの開始位置を計算する
func ComputeFingerStart(nodeID NodeID, i int) NodeID {
	return AddPowerOfTwo(nodeID, i)
}

// IsResponsibleFor は指定されたキーに対してこのノードが責任を持つかどうかを判定する
func (n *Node) IsResponsibleFor(key string) bool {
	keyID := HashKey(key)

	n.mu.RLock()
	defer n.mu.RUnlock()

	// predecessor がない場合（単一ノード）は全てのキーに責任を持つ
	if n.predecessor == nil {
		return true
	}

	// keyID が (predecessor, n] の範囲にあるかチェック
	return BetweenInclusive(keyID, n.predecessor.ID, n.ID) && keyID != n.predecessor.ID
}

// ResponsibleRange はこのノードが責任を持つID範囲を返す
func (n *Node) ResponsibleRange() (start, end NodeID) {
	n.mu.RLock()
	defer n.mu.RUnlock()

	if n.predecessor == nil {
		// 単一ノードの場合は全範囲
		return 0, HASH_SPACE - 1
	}

	// (predecessor.ID, n.ID] の範囲
	return n.predecessor.ID, n.ID
}

// BetweenExclusive は id が (start, end) の排他的範囲内にあるかチェック
func BetweenExclusive(id, start, end NodeID) bool {
	if start < end {
		// 通常のケース: start < end
		return start < id && id < end
	} else {
		// リングの境界を跨ぐケース: start > end
		return id > start || id < end
	}
}

// BetweenLeftInclusive は id が [start, end) の範囲内にあるかチェック
func BetweenLeftInclusive(id, start, end NodeID) bool {
	if start < end {
		// 通常のケース: start < end
		return start <= id && id < end
	} else {
		// リングの境界を跨ぐケース: start > end
		return id >= start || id < end
	}
}

// BetweenRightInclusive は id が (start, end] の範囲内にあるかチェック
func BetweenRightInclusive(id, start, end NodeID) bool {
	if start < end {
		// 通常のケース: start < end
		return start < id && id <= end
	} else {
		// リングの境界を跨ぐケース: start > end
		return id > start || id <= end
	}
}

// IsSuccessor は candidate が id の successor として適切かチェック
func IsSuccessor(id, candidate, currentSuccessor NodeID) bool {
	if currentSuccessor == id {
		// 現在のsuccessorが自分自身の場合、任意のcandidateが適切
		return true
	}

	// candidate が (id, currentSuccessor] の範囲内にある場合、より良いsuccessor
	return BetweenRightInclusive(candidate, id, currentSuccessor)
}

// IsPredecessor は candidate が id の predecessor として適切かチェック
func IsPredecessor(id, candidate, currentPredecessor NodeID) bool {
	if currentPredecessor == id {
		// 現在のpredecessorが自分自身の場合、任意のcandidateが適切
		return true
	}

	// candidate が [currentPredecessor, id) の範囲内にある場合、より良いpredecessor
	return BetweenLeftInclusive(candidate, currentPredecessor, id)
}

// HashInfo はハッシュ値の詳細情報を返す（デバッグ用）
func HashInfo(value string) map[string]interface{} {
	nodeID := HashString(value)

	return map[string]interface{}{
		"input":       value,
		"node_id":     nodeID,
		"hex":         HashToString(nodeID),
		"binary":      fmt.Sprintf("%08b", uint8(nodeID)),
		"hash_space":  HASH_SPACE,
	}
}
