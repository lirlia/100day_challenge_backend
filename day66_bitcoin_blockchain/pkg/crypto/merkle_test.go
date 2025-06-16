package crypto

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"testing"
)

func TestNewMerkleNode(t *testing.T) {
	// 葉ノード（データを持つ）のテスト
	data := []byte("test data")
	leafNode := NewMerkleNode(nil, nil, data)

	if leafNode.Left != nil || leafNode.Right != nil {
		t.Error("Leaf node should not have children")
	}

	if len(leafNode.Data) == 0 {
		t.Error("Leaf node should have data")
	}

	// データのハッシュが正しく計算されているかチェック
	expectedHash := sha256.Sum256(data)
	if !bytes.Equal(leafNode.Data, expectedHash[:]) {
		t.Error("Leaf node data should be hash of input data")
	}

	// 内部ノード（子ノードのハッシュを結合）のテスト
	leftChild := NewMerkleNode(nil, nil, []byte("left"))
	rightChild := NewMerkleNode(nil, nil, []byte("right"))
	internalNode := NewMerkleNode(leftChild, rightChild, nil)

	if internalNode.Left != leftChild || internalNode.Right != rightChild {
		t.Error("Internal node should have correct children")
	}

	// 内部ノードのハッシュが子ノードのハッシュの結合であることをチェック
	expectedCombined := append(leftChild.Data, rightChild.Data...)
	expectedInternalHash := sha256.Sum256(expectedCombined)
	if !bytes.Equal(internalNode.Data, expectedInternalHash[:]) {
		t.Error("Internal node data should be hash of combined child hashes")
	}
}

func TestNewMerkleTree(t *testing.T) {
	// 空のデータでのテスト
	emptyTree := NewMerkleTree([][]byte{})
	if emptyTree.RootNode != nil {
		t.Error("Empty tree should have nil root node")
	}

	// 単一データでのテスト
	singleData := [][]byte{[]byte("single")}
	singleTree := NewMerkleTree(singleData)
	if singleTree.RootNode == nil {
		t.Error("Single data tree should have root node")
	}

	// 複数データでのテスト（偶数個）
	evenData := [][]byte{
		[]byte("data1"),
		[]byte("data2"),
		[]byte("data3"),
		[]byte("data4"),
	}
	evenTree := NewMerkleTree(evenData)
	if evenTree.RootNode == nil {
		t.Error("Even data tree should have root node")
	}

	// 複数データでのテスト（奇数個）
	oddData := [][]byte{
		[]byte("data1"),
		[]byte("data2"),
		[]byte("data3"),
	}
	oddTree := NewMerkleTree(oddData)
	if oddTree.RootNode == nil {
		t.Error("Odd data tree should have root node")
	}
}

func TestMerkleTreeGetRootHash(t *testing.T) {
	// 空のツリー
	emptyTree := NewMerkleTree([][]byte{})
	if emptyTree.GetRootHash() != nil {
		t.Error("Empty tree should return nil root hash")
	}

	// データありのツリー
	data := [][]byte{
		[]byte("transaction1"),
		[]byte("transaction2"),
	}
	tree := NewMerkleTree(data)
	rootHash := tree.GetRootHash()

	if len(rootHash) == 0 {
		t.Error("Non-empty tree should return non-empty root hash")
	}

	// 同じデータから作った別のツリーは同じルートハッシュを持つべき
	tree2 := NewMerkleTree(data)
	rootHash2 := tree2.GetRootHash()

	if !bytes.Equal(rootHash, rootHash2) {
		t.Error("Trees with same data should have same root hash")
	}

	// 異なるデータは異なるルートハッシュを持つべき
	differentData := [][]byte{
		[]byte("different1"),
		[]byte("different2"),
	}
	differentTree := NewMerkleTree(differentData)
	differentRootHash := differentTree.GetRootHash()

	if bytes.Equal(rootHash, differentRootHash) {
		t.Error("Trees with different data should have different root hashes")
	}
}

func TestMerkleTreeGetRootHashString(t *testing.T) {
	data := [][]byte{[]byte("test")}
	tree := NewMerkleTree(data)

	hashString := tree.GetRootHashString()
	if len(hashString) == 0 {
		t.Error("Root hash string should not be empty")
	}

	// HEX文字列として有効かチェック
	_, err := hex.DecodeString(hashString)
	if err != nil {
		t.Error("Root hash string should be valid hex")
	}

	// バイト配列とHEX文字列が一致するかチェック
	expectedHex := hex.EncodeToString(tree.GetRootHash())
	if hashString != expectedHex {
		t.Error("Root hash string should match hex encoding of root hash bytes")
	}
}

func TestMerkleTreeVerifyTransaction(t *testing.T) {
	tx1 := []byte("transaction1")
	tx2 := []byte("transaction2")
	tx3 := []byte("transaction3")
	tx4 := []byte("not_in_tree")

	data := [][]byte{tx1, tx2, tx3}
	tree := NewMerkleTree(data)

	// 含まれているトランザクションのハッシュを計算
	hash1 := sha256.Sum256(tx1)
	hash2 := sha256.Sum256(tx2)
	hash3 := sha256.Sum256(tx3)
	hash4 := sha256.Sum256(tx4)

	// 含まれているトランザクションの検証
	if !tree.VerifyTransaction(hash1[:]) {
		t.Error("Should verify transaction that exists in tree")
	}

	if !tree.VerifyTransaction(hash2[:]) {
		t.Error("Should verify transaction that exists in tree")
	}

	if !tree.VerifyTransaction(hash3[:]) {
		t.Error("Should verify transaction that exists in tree")
	}

	// 含まれていないトランザクションの検証
	if tree.VerifyTransaction(hash4[:]) {
		t.Error("Should not verify transaction that does not exist in tree")
	}

	// 空のツリーでの検証
	emptyTree := NewMerkleTree([][]byte{})
	if emptyTree.VerifyTransaction(hash1[:]) {
		t.Error("Empty tree should not verify any transaction")
	}
}

func TestMerkleTreePrintTree(t *testing.T) {
	// 空のツリー
	emptyTree := NewMerkleTree([][]byte{})
	emptyResult := emptyTree.PrintTree()
	if len(emptyResult) != 0 {
		t.Error("Empty tree should return empty print result")
	}

	// データありのツリー
	data := [][]byte{
		[]byte("tx1"),
		[]byte("tx2"),
	}
	tree := NewMerkleTree(data)
	result := tree.PrintTree()

	if len(result) == 0 {
		t.Error("Non-empty tree should return non-empty print result")
	}

	// 結果が文字列のスライスであることを確認
	for _, line := range result {
		if len(line) == 0 {
			t.Error("Print result should not contain empty lines")
		}
	}
}

func TestCalculateMerkleRoot(t *testing.T) {
	// 空のスライス
	emptyRoot := CalculateMerkleRoot([][]byte{})
	if len(emptyRoot) != 0 {
		t.Error("Empty slice should return empty root")
	}

	// データありのスライス
	txHashes := [][]byte{
		HashSHA256([]byte("tx1")),
		HashSHA256([]byte("tx2")),
		HashSHA256([]byte("tx3")),
	}

	root := CalculateMerkleRoot(txHashes)
	if len(root) == 0 {
		t.Error("Non-empty slice should return non-empty root")
	}

	// 同じデータは同じルートを返すべき
	root2 := CalculateMerkleRoot(txHashes)
	if !bytes.Equal(root, root2) {
		t.Error("Same data should return same root")
	}

	// NewMerkleTreeと同じ結果を返すべき
	tree := NewMerkleTree(txHashes)
	treeRoot := tree.GetRootHash()
	if !bytes.Equal(root, treeRoot) {
		t.Error("CalculateMerkleRoot should return same result as NewMerkleTree")
	}
}

// TestMerkleTreeConsistency は異なるサイズのデータでの一貫性をテスト
func TestMerkleTreeConsistency(t *testing.T) {
	testCases := []struct {
		name string
		data [][]byte
	}{
		{
			name: "1 transaction",
			data: [][]byte{[]byte("tx1")},
		},
		{
			name: "2 transactions",
			data: [][]byte{[]byte("tx1"), []byte("tx2")},
		},
		{
			name: "3 transactions",
			data: [][]byte{[]byte("tx1"), []byte("tx2"), []byte("tx3")},
		},
		{
			name: "4 transactions",
			data: [][]byte{[]byte("tx1"), []byte("tx2"), []byte("tx3"), []byte("tx4")},
		},
		{
			name: "5 transactions",
			data: [][]byte{[]byte("tx1"), []byte("tx2"), []byte("tx3"), []byte("tx4"), []byte("tx5")},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			tree := NewMerkleTree(tc.data)

			// ルートハッシュが存在することを確認
			rootHash := tree.GetRootHash()
			if len(rootHash) == 0 {
				t.Errorf("%s: Root hash should not be empty", tc.name)
			}

			// 含まれている全トランザクションが検証できることを確認
			for _, tx := range tc.data {
				txHash := sha256.Sum256(tx)
				if !tree.VerifyTransaction(txHash[:]) {
					t.Errorf("%s: Should verify all transactions in tree", tc.name)
				}
			}
		})
	}
}

// BenchmarkMerkleTreeCreation はMerkle Tree作成のベンチマーク
func BenchmarkMerkleTreeCreation(b *testing.B) {
	data := make([][]byte, 100)
	for i := 0; i < 100; i++ {
		data[i] = HashSHA256([]byte(hex.EncodeToString([]byte{byte(i)})))
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		NewMerkleTree(data)
	}
}

// BenchmarkMerkleTreeVerification はトランザクション検証のベンチマーク
func BenchmarkMerkleTreeVerification(b *testing.B) {
	data := make([][]byte, 100)
	for i := 0; i < 100; i++ {
		data[i] = HashSHA256([]byte(hex.EncodeToString([]byte{byte(i)})))
	}

	tree := NewMerkleTree(data)
	targetHash := data[50] // 中央のトランザクション

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		tree.VerifyTransaction(targetHash)
	}
}
