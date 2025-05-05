package rdbms

import "fmt"

// Search はB+Treeからキーに対応する値を検索します。 DiskManager を使用します。
func (t *BTree) Search(key KeyType) (ValueType, bool) {
	// ルートノードから検索を開始
	leafPageID, err := t.findLeafPageID(t.rootPageID, key)
	if err != nil || leafPageID == 0 {
		return nil, false // エラーまたはリーフが見つからない
	}

	leafNode, err := t.dm.ReadNode(leafPageID)
	if err != nil || leafNode == nil || !leafNode.isLeaf() {
		return nil, false // 読み込みエラーまたはリーフでない
	}
	leaf := leafNode.(*LeafNode)

	// リーフノード内で再度検索 (findLeafは挿入位置も返すことがあるため)
	idx, foundInLeaf := findKeyIndex(leaf.keys, key)
	if foundInLeaf {
		return leaf.values[idx], true
	}

	return nil, false
}

// findLeafPageID は指定されたキーが存在するべきリーフノードの PageID を探します。
func (t *BTree) findLeafPageID(pageID PageID, key KeyType) (PageID, error) {
	currentNode, err := t.dm.ReadNode(pageID)
	if err != nil {
		return 0, err // ページ読み込みエラー
	}

	for !currentNode.isLeaf() {
		internal := currentNode.(*InternalNode)

		// キーを比較して次にたどるべき子ページの PageID を見つける
		childIndex := 0
		for childIndex < len(internal.keys) && key >= internal.keys[childIndex] {
			childIndex++
		}
		childPageID := internal.children[childIndex]

		// 子ページを読み込む
		nextNode, err := t.dm.ReadNode(childPageID)
		if err != nil {
			return 0, err // 子ページの読み込みエラー
		}
		currentNode = nextNode
	}

	// ループを抜けたらリーフノードに到達しているはず
	if currentNode.isLeaf() {
		return currentNode.getPageID(), nil
	}

	// 通常はここに到達しないはず
	return 0, fmt.Errorf("findLeafPageID did not end on a leaf node")
}

// findKeyIndexForChild は内部ノードでキーに基づいてたどるべき子のインデックスを見つけます。
// (findLeafPageID に統合されたためコメントアウトまたは削除)
/*
func findKeyIndexForChild(keys []KeyType, key KeyType) int {
	i := 0
	for i < len(keys) && key >= keys[i] {
		i++
	}
	return i
}
*/
