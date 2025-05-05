package rdbms

import (
	// For gob encoding buffer
	// For header encoding
	// For easy serialization
	"fmt"
	"sort"
)

// KeyType はB+Treeのキーの型を表します。今回はintを想定します。
type KeyType int64

// ValueType はB+Treeの値の型を表します。仕様に基づき[]byteとします。
type ValueType []byte

// Node はB+Treeのノードのインターフェースです。
type Node interface {
	getPageID() PageID
	setPageID(id PageID)
	isLeaf() bool
	getKeys() []KeyType
	// isFull(degree int) bool // Checks if the node is full
	findKeyIndex(key KeyType) (int, bool) // キーのインデックスと存在有無を返す
	findMedianKeyIndex() int              // 中央値のキーのインデックスを返す
	getKey(index int) KeyType             // 指定インデックスのキーを返す
	// deleteKeyAtIndex(index int)           // キーを削除する (必要なら子も)
	isFull(degree int) bool // Checks if the node is full
}

// InternalNode はB+Treeの内部ノードを表します。
type InternalNode struct {
	pageID   PageID
	keys     []KeyType // キーの配列
	children []PageID  // 子ノードへのポインタの配列
	// parent   Node    // 親ノードへのポインタ (必要に応じて)
}

// LeafNode はB+Treeのリーフノードを表します。
type LeafNode struct {
	pageID PageID
	keys   []KeyType   // キーの配列
	values []ValueType // 値 (ペイロード) の配列
	// parent Node    // 親ノードへのポインタ (必要に応じて)
	prev PageID // Optional: Added for consistency
	next PageID // 次のリーフノードへのポインタ
}

// isLeaf は InternalNode がリーフノードでないことを示します。
func (n *InternalNode) isLeaf() bool {
	return false
}

// getKeys は InternalNode のキーを返します。
func (n *InternalNode) getKeys() []KeyType {
	return n.keys
}

// isLeaf は LeafNode がリーフノードであることを示します。
func (n *LeafNode) isLeaf() bool {
	return true
}

// getKeys は LeafNode のキーを返します。
func (n *LeafNode) getKeys() []KeyType {
	return n.keys
}

// getPageID は LeafNode の PageID を返します。
func (n *LeafNode) getPageID() PageID {
	return n.pageID
}

// setPageID は LeafNode の PageID を設定します。
func (n *LeafNode) setPageID(id PageID) {
	n.pageID = id
}

// getPageID は InternalNode の PageID を返します。
func (n *InternalNode) getPageID() PageID {
	return n.pageID
}

// setPageID は InternalNode の PageID を設定します。
func (n *InternalNode) setPageID(id PageID) {
	n.pageID = id
}

// isNodeFull はノードが満杯かどうかをチェックします (キー数が degree - 1)。
// Note: Changed definition from 2*degree-1 to degree-1 (assuming degree is order 'm').
// Note: Reverted back to 2*degree-1, which is common for B-Tree/B+Tree definition where 'degree' is minimum keys/children.
// Let's stick to the definition used in Insert/Delete logic: Max keys = 2*degree - 1
func isNodeFull(node Node, degree int) bool {
	// return numKeys(node) == degree-1 // Using removed numKeys
	// Direct check after type assertion:
	if node.isLeaf() {
		return len(node.(*LeafNode).keys) >= 2*degree-1
	} else {
		return len(node.(*InternalNode).keys) >= 2*degree-1
	}
}

// findKeyIndex はソート済みのキー配列から指定されたキーの位置を探します。
// キーが存在する場合はそのインデックスとtrueを返します。
// キーが存在しない場合は、そのキーが挿入されるべきインデックスとfalseを返します。
// Goの `sort.Search` を利用します。
func findKeyIndex(keys []KeyType, key KeyType) (int, bool) {
	// sort.Search は条件を満たす最小のインデックスを返す。
	// ここでは key 以上の最初の要素のインデックスを探す。
	i := sort.Search(len(keys), func(i int) bool { return keys[i] >= key })

	if i < len(keys) && keys[i] == key {
		// キーが見つかった場合
		return i, true
	}
	// キーが見つからなかった場合 (iは挿入位置)
	return i, false
}

// --- ここからノード操作に関するヘルパー関数などを追加していく ---

// insertIntoLeaf はリーフノードにキーと値を挿入します (ノードは満杯でない前提)。
func (n *LeafNode) insertIntoLeaf(key KeyType, value ValueType, index int) {
	// indexの位置に要素を挿入するためにスライスを拡張
	n.keys = append(n.keys, 0) // ダミーの値を追加
	copy(n.keys[index+1:], n.keys[index:])
	n.keys[index] = key

	n.values = append(n.values, nil) // ダミーの値を追加
	copy(n.values[index+1:], n.values[index:])
	n.values[index] = value
}

// insertIntoInternal は内部ノードにキーと子ノードを挿入します (ノードは満杯でない前提)。
func (n *InternalNode) insertIntoInternal(key KeyType, child PageID, index int) {
	// Insert key at index
	n.keys = append(n.keys, 0) // dummy value to extend slice
	copy(n.keys[index+1:], n.keys[index:])
	n.keys[index] = key

	// Insert child PageID at index + 1
	n.children = append(n.children, 0) // dummy value to extend slice
	// Shift elements from index+1 onwards to make space at index+1
	copy(n.children[index+2:], n.children[index+1:]) // Corrected copy source/destination
	n.children[index+1] = child
}

// --- Add Page/Serialization related definitions ---

// NodeType はページのヘッダーに格納されるノードの種類を表します。
type NodeType uint8

const (
	NodeTypeInternal NodeType = 0
	NodeTypeLeaf     NodeType = 1
	// Other page types (e.g., metadata, freelist) can be defined later.
)

// Page Header Layout (example within PageData)
const (
	NodeTypeOffset = 0                  // 1 byte (NodeType)
	NumKeysOffset  = NodeTypeOffset + 1 // 2 bytes (uint16 for number of keys)
	// For Leaf nodes, you might add Next/Prev PageID offsets here if needed
	// NextPageIDOffset = NumKeysOffset + 2 // 4 bytes (PageID/uint32)
	// PrevPageIDOffset = NextPageIDOffset + 4 // 4 bytes (PageID/uint32)
	HeaderSize = NumKeysOffset + 2 // Current header size
)

// --- Serialization/Deserialization Functions (Moved to disk_node_io.go) ---

// // serializeNode - Moved
// func serializeNode(node Node, data *PageData) error {
// // ... implementation moved ...
// }

// // deserializeNode - Moved
// func deserializeNode(data *PageData) (Node, error) {
// // ... implementation moved ...
// }

// --- Node Creation Helper Functions ---

// NewLeafNode creates a new leaf node.
func NewLeafNode(pageID PageID, degree int) *LeafNode {
	return &LeafNode{
		pageID: pageID,
		keys:   make([]KeyType, 0, 2*degree-1),
		values: make([]ValueType, 0, 2*degree-1),
		next:   InvalidPageID,
		prev:   InvalidPageID,
	}
}

// NewInternalNode creates a new internal node.
func NewInternalNode(pageID PageID, degree int) *InternalNode {
	return &InternalNode{
		pageID:   pageID,
		keys:     make([]KeyType, 0, 2*degree-1),
		children: make([]PageID, 0, 2*degree),
	}
}

// --- Node Interface Method Implementations ---

// isFull for LeafNode
func (n *LeafNode) isFull(degree int) bool {
	return len(n.keys) >= 2*degree-1
}

// isFull for InternalNode
func (n *InternalNode) isFull(degree int) bool {
	return len(n.keys) >= 2*degree-1
}

// findKeyIndex for LeafNode
func (n *LeafNode) findKeyIndex(key KeyType) (int, bool) {
	i := sort.Search(len(n.keys), func(i int) bool { return n.keys[i] >= key })
	if i < len(n.keys) && n.keys[i] == key {
		return i, true
	}
	return i, false
}

// findMedianKeyIndex for LeafNode
func (n *LeafNode) findMedianKeyIndex() int {
	return len(n.keys) / 2
}

// getKey for LeafNode
func (n *LeafNode) getKey(index int) KeyType {
	if index < 0 || index >= len(n.keys) {
		panic(fmt.Sprintf("getKey index out of bounds for leaf node %d: index %d, len %d", n.pageID, index, len(n.keys)))
	}
	return n.keys[index]
}

// findKeyIndex for InternalNode
func (n *InternalNode) findKeyIndex(key KeyType) (int, bool) {
	i := sort.Search(len(n.keys), func(i int) bool { return n.keys[i] >= key })
	if i < len(n.keys) && n.keys[i] == key {
		// In internal nodes, finding the exact key means the key exists
		// but the value is in the right subtree. Search returns insertion point.
		// For exact match check, this indicates key is present.
		// However, for traversal, we need the child pointer *before* this key's index.
		// Let's clarify the 'bool' return value meaning.
		// Let's say bool means 'exact key found'.
		return i, true
	}
	return i, false // i is the index of the child pointer to follow
}

// findMedianKeyIndex for InternalNode
func (n *InternalNode) findMedianKeyIndex() int {
	return len(n.keys) / 2
}

// getKey for InternalNode
func (n *InternalNode) getKey(index int) KeyType {
	if index < 0 || index >= len(n.keys) {
		panic(fmt.Sprintf("getKey index out of bounds for internal node %d: index %d, len %d", n.pageID, index, len(n.keys)))
	}
	return n.keys[index]
}
