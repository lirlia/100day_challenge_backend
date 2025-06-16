package crypto

import (
	"crypto/sha256"
	"encoding/hex"
)

// MerkleNode はMerkle Treeのノードを表す
type MerkleNode struct {
	Left  *MerkleNode
	Right *MerkleNode
	Data  []byte
}

// NewMerkleNode は新しいMerkleNodeを作成する
func NewMerkleNode(left, right *MerkleNode, data []byte) *MerkleNode {
	node := &MerkleNode{}

	if left == nil && right == nil {
		// 葉ノード（実際のデータを持つ）
		hash := sha256.Sum256(data)
		node.Data = hash[:]
	} else {
		// 内部ノード（子ノードのハッシュを結合）
		prevHashes := append(left.Data, right.Data...)
		hash := sha256.Sum256(prevHashes)
		node.Data = hash[:]
	}

	node.Left = left
	node.Right = right

	return node
}

// MerkleTree はMerkle Treeを表す
type MerkleTree struct {
	RootNode *MerkleNode
}

// NewMerkleTree は与えられたデータからMerkle Treeを構築する
func NewMerkleTree(data [][]byte) *MerkleTree {
	if len(data) == 0 {
		return &MerkleTree{}
	}

	// データの数が奇数の場合、最後の要素を複製
	if len(data)%2 != 0 {
		data = append(data, data[len(data)-1])
	}

	// 葉ノードを作成
	var nodes []*MerkleNode
	for _, datum := range data {
		node := NewMerkleNode(nil, nil, datum)
		nodes = append(nodes, node)
	}

	// ボトムアップでツリーを構築
	for len(nodes) > 1 {
		var level []*MerkleNode

		for i := 0; i < len(nodes); i += 2 {
			var left, right *MerkleNode
			left = nodes[i]

			if i+1 < len(nodes) {
				right = nodes[i+1]
			} else {
				// 奇数個の場合、左ノードを複製
				right = nodes[i]
			}

			node := NewMerkleNode(left, right, nil)
			level = append(level, node)
		}

		nodes = level
	}

	tree := &MerkleTree{RootNode: nodes[0]}
	return tree
}

// GetRootHash はMerkle Treeのルートハッシュを返す
func (mt *MerkleTree) GetRootHash() []byte {
	if mt.RootNode == nil {
		return nil
	}
	return mt.RootNode.Data
}

// GetRootHashString はMerkle TreeのルートハッシュをHEX文字列で返す
func (mt *MerkleTree) GetRootHashString() string {
	if mt.RootNode == nil {
		return ""
	}
	return hex.EncodeToString(mt.RootNode.Data)
}

// VerifyTransaction はトランザクションがMerkle Treeに含まれているかを検証する
// (簡易実装: 本格的な実装では Merkle Proof を使用)
func (mt *MerkleTree) VerifyTransaction(txHash []byte) bool {
	return mt.searchInTree(mt.RootNode, txHash)
}

// searchInTree はツリー内を再帰的に検索する
func (mt *MerkleTree) searchInTree(node *MerkleNode, target []byte) bool {
	if node == nil {
		return false
	}

	// 葉ノードの場合
	if node.Left == nil && node.Right == nil {
		return CompareHashes(node.Data, target)
	}

	// 子ノードを再帰的に検索
	return mt.searchInTree(node.Left, target) || mt.searchInTree(node.Right, target)
}

// PrintTree はツリー構造をデバッグ用に出力する（開発用）
func (mt *MerkleTree) PrintTree() []string {
	if mt.RootNode == nil {
		return []string{}
	}

	var result []string
	mt.printNode(mt.RootNode, "", true, &result)
	return result
}

// printNode はノードを再帰的に出力する
func (mt *MerkleTree) printNode(node *MerkleNode, prefix string, isLast bool, result *[]string) {
	if node == nil {
		return
	}

	connector := "├── "
	if isLast {
		connector = "└── "
	}

	hashStr := hex.EncodeToString(node.Data)[:16] + "..."
	*result = append(*result, prefix+connector+hashStr)

	newPrefix := prefix
	if isLast {
		newPrefix += "    "
	} else {
		newPrefix += "│   "
	}

	if node.Left != nil {
		mt.printNode(node.Left, newPrefix, node.Right == nil, result)
	}
	if node.Right != nil {
		mt.printNode(node.Right, newPrefix, true, result)
	}
}

// CalculateMerkleRoot は簡易的なMerkle Root計算（デバッグ用）
func CalculateMerkleRoot(txHashes [][]byte) []byte {
	if len(txHashes) == 0 {
		return []byte{}
	}

	tree := NewMerkleTree(txHashes)
	return tree.GetRootHash()
}

// NewMerkleTreeFromHashes は既にハッシュ化されたデータからMerkle Treeを構築する
// トランザクションIDなど、既にハッシュ値のデータに使用
func NewMerkleTreeFromHashes(hashes [][]byte) *MerkleTree {
	if len(hashes) == 0 {
		return &MerkleTree{}
	}

	// データの数が奇数の場合、最後の要素を複製
	if len(hashes)%2 != 0 {
		hashes = append(hashes, hashes[len(hashes)-1])
	}

	// 葉ノードを作成（ハッシュ化せずに直接使用）
	var nodes []*MerkleNode
	for _, hash := range hashes {
		node := &MerkleNode{
			Left:  nil,
			Right: nil,
			Data:  hash, // ハッシュ化せずに直接使用
		}
		nodes = append(nodes, node)
	}

	// ボトムアップでツリーを構築
	for len(nodes) > 1 {
		var level []*MerkleNode

		for i := 0; i < len(nodes); i += 2 {
			var left, right *MerkleNode
			left = nodes[i]

			if i+1 < len(nodes) {
				right = nodes[i+1]
			} else {
				// 奇数個の場合、左ノードを複製
				right = nodes[i]
			}

			// 内部ノードは子ノードのハッシュを結合してハッシュ化
			prevHashes := append(left.Data, right.Data...)
			hash := sha256.Sum256(prevHashes)

			node := &MerkleNode{
				Left:  left,
				Right: right,
				Data:  hash[:],
			}
			level = append(level, node)
		}

		nodes = level
	}

	tree := &MerkleTree{RootNode: nodes[0]}
	return tree
}

// CalculateMerkleRootFromHashes は既にハッシュ化されたデータからMerkle Root計算（トランザクションID用）
func CalculateMerkleRootFromHashes(txHashes [][]byte) []byte {
	if len(txHashes) == 0 {
		return []byte{}
	}

	tree := NewMerkleTreeFromHashes(txHashes)
	return tree.GetRootHash()
}
