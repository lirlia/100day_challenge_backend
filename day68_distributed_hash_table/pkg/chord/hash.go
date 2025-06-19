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
func HashToString(data []byte) string {
	h := sha1.New()
	h.Write(data)
	return fmt.Sprintf("%x", h.Sum(nil))
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
	if start == end {
		return id == start
	}

	if start < end {
		return id >= start && id <= end
	}

	// Wrap around case: start > end
	return id >= start || id <= end
}

// PowerOfTwo は 2^k を計算する
func PowerOfTwo(k int) NodeID {
	if k >= M {
		return 0 // オーバーフロー防止
	}
	return NodeID(1 << k)
}

// AddPowerOfTwo は NodeID に 2^k を加算する（mod 2^m）
func AddPowerOfTwo(id NodeID, k int) NodeID {
	return (id + PowerOfTwo(k)) % HASH_SPACE
}

// Distance は start から end までの距離を計算する（時計回り）
func Distance(start, end NodeID) NodeID {
	if end >= start {
		return end - start
	}
	return HASH_SPACE - start + end
}

// ClosestPrecedingNode は target に最も近い先行ノードを見つける
func (n *Node) ClosestPrecedingNode(target NodeID) *Node {
	n.mu.RLock()
	defer n.mu.RUnlock()

	// フィンガーテーブルを逆順に検索
	for i := M - 1; i >= 0; i-- {
		finger := n.fingerTable[i]
		if finger != nil && Between(finger.ID, n.ID, target) {
			return finger
		}
	}

	return n
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
