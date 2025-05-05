package rdbms

import (
	"fmt"
)

// KeyValuePair はスキャン結果のキーと値のペアです。
type KeyValuePair struct {
	Key   KeyType
	Value ValueType
}

// ScanRange は指定されたキー範囲のすべてのキーと値のペアを返します。
// includeStart=true の場合 startKey <= key、false の場合 startKey < key
// includeEnd=true の場合 key <= endKey、false の場合 key < endKey
// DiskManager を使用します。
func (t *BTree) ScanRange(startKey, endKey KeyType, includeStart, includeEnd bool) ([]KeyValuePair, error) {
	var results []KeyValuePair

	// 開始キーを持つべきリーフノードを見つける
	currentLeafPageID, err := t.findLeafPageID(t.rootPageID, startKey)
	if err != nil {
		return nil, fmt.Errorf("error finding start leaf page for ScanRange: %w", err)
	}
	if currentLeafPageID == 0 { // リーフが見つからない場合 (空のツリーなど)
		return results, nil
	}

	// スキャンを開始
	for currentLeafPageID != 0 {
		currentNode, err := t.dm.ReadNode(currentLeafPageID)
		if err != nil || currentNode == nil || !currentNode.isLeaf() {
			// リーフの読み込み失敗または不正なページ
			return results, fmt.Errorf("error reading leaf page %d during scan: %w", currentLeafPageID, err)
		}
		currentLeaf := currentNode.(*LeafNode)

		// 現在のリーフ内のキーをスキャン
		foundStartInLeaf := false                    // Track if we found the start key or first relevant key in this leaf
		for i := 0; i < len(currentLeaf.keys); i++ { // Start from index 0 within the leaf
			key := currentLeaf.keys[i]

			// Skip keys less than startKey if we haven't started collecting yet
			// Or skip if key == startKey and includeStart is false
			startCheckPass := false
			if includeStart {
				if key >= startKey {
					startCheckPass = true
				}
			} else {
				if key > startKey {
					startCheckPass = true
				}
			}

			if !foundStartInLeaf && !startCheckPass {
				continue
			}
			foundStartInLeaf = true // Found the first key >= startKey

			// Check if key is within the end range
			endCheckPass := false
			if includeEnd {
				if key <= endKey {
					endCheckPass = true
				}
			} else {
				if key < endKey {
					endCheckPass = true
				}
			}

			if endCheckPass {
				results = append(results, KeyValuePair{
					Key:   key,
					Value: currentLeaf.values[i],
				})
			} else {
				// Key is outside the end boundary, stop scanning
				return results, nil
			}
		}

		// 次のリーフページへ移動
		currentLeafPageID = currentLeaf.next // Use the next PageID
	}

	return results, nil
}

// findStartLeaf は ScanRange の開始点となるリーフノードと、
// そのノード内でスキャンを開始すべきインデックスを返します。
// (findLeafPageID に統合されたためコメントアウトまたは削除)
/*
func (t *BTree) findStartLeaf(node Node, startKey KeyType) (*LeafNode, int) {
	if node.isLeaf() {
		leaf := node.(*LeafNode)
		// リーフ内で startKey 以上の最初のキーを探す
		index := sort.Search(len(leaf.keys), func(i int) bool { return leaf.keys[i] >= startKey })
		return leaf, index
	}

	internal := node.(*InternalNode)
	i := findKeyIndexForChild(internal.keys, startKey)
	return t.findStartLeaf(internal.children[i], startKey)
}
*/

// ScanAll はB+Treeのすべてのキーと値のペアをリーフノードの順序で返します。
// DiskManager を使用します。
func (t *BTree) ScanAll() ([]KeyValuePair, error) {
	var results []KeyValuePair
	// 最も左のリーフノードを見つける
	currentLeafPageID, err := t.findLeftmostLeafPageID(t.rootPageID)
	if err != nil || currentLeafPageID == 0 {
		return results, err // Return empty if tree is empty or error occurs
	}

	// リーフノードを順番にたどる
	for currentLeafPageID != 0 {
		currentNode, err := t.dm.ReadNode(currentLeafPageID)
		if err != nil || currentNode == nil || !currentNode.isLeaf() {
			return results, fmt.Errorf("error reading leaf page %d during ScanAll: %w", currentLeafPageID, err)
		}
		currentLeaf := currentNode.(*LeafNode)

		// 現在のリーフノードのすべてのキーと値を追加
		for i := 0; i < len(currentLeaf.keys); i++ {
			results = append(results, KeyValuePair{
				Key:   currentLeaf.keys[i],
				Value: currentLeaf.values[i],
			})
		}
		// 次のリーフページへ移動
		currentLeafPageID = currentLeaf.next
	}

	return results, nil
}

// findLeftmostLeafPageID はツリーの最も左にあるリーフノードの PageID を見つけます。
func (t *BTree) findLeftmostLeafPageID(pageID PageID) (PageID, error) {
	if pageID == 0 {
		return 0, nil // Empty tree
	}

	currentNode, err := t.dm.ReadNode(pageID)
	if err != nil {
		return 0, err
	}

	for !currentNode.isLeaf() {
		internal, ok := currentNode.(*InternalNode)
		if !ok {
			// Should not happen if isLeaf() is correct
			return 0, fmt.Errorf("node %d is not leaf but not InternalNode", currentNode.getPageID())
		}
		if len(internal.children) == 0 {
			return 0, fmt.Errorf("internal node %d has no children", internal.getPageID())
		}
		// Follow the leftmost child
		pageID = internal.children[0]
		nextNode, err := t.dm.ReadNode(pageID)
		if err != nil {
			return 0, err
		}
		currentNode = nextNode
	}

	// Found the leftmost leaf
	return currentNode.getPageID(), nil
}
