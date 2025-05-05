package rdbms

import (
	"fmt"
)

// Insert はB+Treeに新しいキーと値のペアを挿入します。 DiskManager を使用します。
// tableName はルートが変更された場合にメタデータを更新するために必要です。
func (t *BTree) Insert(tableName string, key KeyType, value ValueType) error {
	// fmt.Printf("Insert: key=%v, value=%v, initialRoot=%d\\n", key, value, t.rootPageID)
	// ルートノードを読み込む
	rootNode, err := t.dm.ReadNode(t.rootPageID)
	if err != nil {
		return fmt.Errorf("Insert: failed to read root node %d: %w", t.rootPageID, err)
	}
	// デバッグ: ルートノードの内容を確認
	// fmt.Printf("Insert: Read root node (%T) with pageID %d\\n", rootNode, rootNode.getPageID())
	// if !rootNode.isLeaf() {
	// 	internalRoot := rootNode.(*InternalNode)
	// 	fmt.Printf("Insert: Root Internal keys: %v, children: %v\\n", internalRoot.keys, internalRoot.children)
	// } else {
	// 	leafRoot := rootNode.(*LeafNode)
	// 	fmt.Printf("Insert: Root Leaf keys: %v, next: %d\\n", leafRoot.keys, leafRoot.next)
	// }

	// ルートが満杯の場合、新しいルートを作成し、古いルートを分割する
	if rootNode.isFull(t.degree) {
		// fmt.Printf("Insert: Root node %d is full. Splitting.\\n", t.rootPageID)
		oldRootPageID := t.rootPageID
		oldRootNode := rootNode
		// newRootPageID := t.dm.AllocatePage() // Error: returns (PageID, error)
		newRootPageID, err := t.dm.AllocatePage()
		if err != nil {
			return fmt.Errorf("Insert: failed to allocate page for new root: %w", err)
		}
		newRoot := NewInternalNode(newRootPageID, t.degree)
		newRoot.children = append(newRoot.children, oldRootPageID) // 最初の子供は古いルート

		// 古いルートを分割する (splitChild は子ノードを分割するので、ここではルートを分割するロジックが必要)
		// -> splitChild を呼び出して、新しいルートに情報を反映させる
		//    splitChild は子を分割し、その結果を親に反映させる。
		//    ここでは、古いルート (oldRootNode) を newRoot の子 (インデックス0) として扱い、
		//    splitChild を呼び出して oldRootNode を分割させる。
		err = t.splitChild(newRoot, 0, oldRootNode) // newRootを親として、その0番目の子(oldRoot)を分割
		if err != nil {
			// TODO: Deallocate newRootPageID?
			return fmt.Errorf("Insert: failed to split old root node %d: %w", oldRootPageID, err)
		}

		// 新しいルートノードをディスクに書き込む
		if err := t.dm.WriteNode(newRoot); err != nil {
			// TODO: Deallocate page? Cleanup?
			return fmt.Errorf("Insert: failed to write new root node %d after split: %w", newRootPageID, err)
		}

		// BTree構造体のルートIDと、ディスク上のメタデータを更新
		t.rootPageID = newRootPageID
		// if err := t.dm.WriteMetadata(t.rootPageID, t.degree); err != nil { // Error: WriteMetadata does not exist
		// 	 return fmt.Errorf("Insert: failed to write metadata after root split: %w", err)
		// }
		// メタデータの更新は DiskManager の SetTableRoot を使う
		if err := t.dm.SetTableRoot(tableName, t.rootPageID); err != nil {
			// TODO: Consider state consistency issues here. Maybe rollback?
			return fmt.Errorf("Insert: failed to set table root in metadata after root split: %w", err)
		}
		// fmt.Printf("Insert: Root split complete. New root is %d.\\n", t.rootPageID)
		rootNode = newRoot // 次のステップで挿入を行うために、新しいルートを参照する
	}

	// ルートから挿入を開始
	err = t.insertRecursive(rootNode, key, value)
	if err != nil {
		return fmt.Errorf("Insert: failed during recursive insert: %w", err)
	}
	// fmt.Printf("Insert successful for key %v. Current root is %d\\n", key, t.rootPageID)
	return nil
}

// insertRecursive はノード `n` にキーと値を再帰的に挿入します。
func (t *BTree) insertRecursive(node Node, key KeyType, value ValueType) error {
	if node.isLeaf() {
		// リーフノードの場合
		leaf := node.(*LeafNode)
		// fmt.Printf("Inserting (%d, %s) into Leaf %d (keys: %v)\n", key, string(value), leaf.getPageID(), leaf.keys)
		index, found := findKeyIndex(leaf.keys, key)
		if found {
			// キーが既に存在する場合、値を上書きする
			// fmt.Printf("Key %d already exists in leaf %d. Overwriting value.\n", key, leaf.getPageID())
			leaf.values[index] = value // Update the value at the found index
			// Write the modified leaf node back to disk
			return t.dm.WriteNode(leaf) // Return after writing update
		}
		// Key not found, insert new key/value
		leaf.insertIntoLeaf(key, value, index)
		// Write the modified leaf node back to disk
		return t.dm.WriteNode(leaf)
	} else {
		// 内部ノードの場合 (Proactive Split)
		internal := node.(*InternalNode)
		// fmt.Printf("Searching child in Internal %d (keys: %v)\n", internal.getPageID(), internal.keys)

		// 挿入すべき子ノードのインデックスを見つける
		i := 0
		for i < len(internal.keys) && key >= internal.keys[i] { // Use >= to go right if key matches
			i++
		}
		childPageID := internal.children[i]

		// --- Proactive Split ---
		childNode, err := t.dm.ReadNode(childPageID)
		if err != nil {
			return fmt.Errorf("failed to read child node %d for proactive check: %w", childPageID, err)
		}

		// もし子ノードが満杯なら、降りる前に分割する
		if childNode.isFull(t.degree) {
			// fmt.Printf("Child node %d is full, proactively splitting...\n", childPageID)
			// // Call splitNode directly and update parent manually (Old logic)
			// newSibling, keyToPromote, err := t.splitNode(childNode, t.degree)
			// if err != nil {
			// 	 return fmt.Errorf("failed during proactive split of child %d: %w", childPageID, err)
			// }
			// // Write the modified child node AFTER splitNode successfully returns and writes the new sibling
			// if err = t.dm.WriteNode(childNode); err != nil {
			// 	 return fmt.Errorf("failed to write modified child node %d after split: %w", childNode.getPageID(), err)
			// }
			// // Insert the promoted key and new sibling pointer into the current node (internal)
			// internal.insertIntoInternal(keyToPromote, newSibling.getPageID(), i)
			// // Write the modified parent node back to disk *after* insertion
			// if err := t.dm.WriteNode(internal); err != nil {
			// 	 return fmt.Errorf("failed to write parent node %d after proactive split: %w", internal.getPageID(), err)
			// }

			// Call splitChild helper which handles splitting and updating the parent (internal)
			err = t.splitChild(internal, i, childNode)
			if err != nil {
				return fmt.Errorf("insertRecursive: failed to split child %d: %w", childPageID, err)
			}

			// After splitChild, the parent (internal) is modified and written.
			// We need to re-determine which child to descend into based on the updated parent.
			// The key might now belong to the new sibling created by the split.
			i = 0                                                   // Reset index for searching the updated parent
			for i < len(internal.keys) && key >= internal.keys[i] { // Use >= to go right if key matches
				i++
			}
			// No need to re-read childNode, just descend into the correct child based on the new index 'i'

			// childPageID = internal.children[i] // Update childPageID based on new index
			// childNode, err = t.dm.ReadNode(childPageID) // Read the correct node to descend into
			// if err != nil {
			// 	 return fmt.Errorf("failed to read child node %d after proactive split adjustment recalc: %w", childPageID, err)
			// }
		}
		// --- End Proactive Split ---

		// Descend into the correct child node (index 'i' might have been updated if split occurred)
		// Read the correct child node *before* descending
		childPageID = internal.children[i]
		childNode, err = t.dm.ReadNode(childPageID)
		if err != nil {
			return fmt.Errorf("failed to read child node %d before descending: %w", childPageID, err)
		}
		return t.insertRecursive(childNode, key, value)
	}
}

// splitChild は、親ノード parent の i 番目の子ノード (childToSplit) が満杯の場合に分割します。
// 分割後、中央のキーが親ノードに昇格され、新しい兄弟ノードが親ノードの子リストに追加されます。
func (t *BTree) splitChild(parent *InternalNode, i int, childToSplit Node) error {
	// fmt.Printf("splitChild: Parent %d, splitting child index %d (page %d)\n", parent.getPageID(), i, childToSplit.getPageID())

	// Call splitNode to perform the actual split logic
	newSibling, promotedKey, err := t.splitNode(childToSplit, t.degree)
	if err != nil {
		// Propagate the error from splitNode
		return fmt.Errorf("splitChild failed: %w", err)
	}

	// Insert the promoted key and the new sibling page ID into the parent node
	// Find the correct insertion index for the promoted key in the parent
	insertIndex := i // Promoted key goes where the split child was

	// Make space for the new key in the parent
	parent.keys = append(parent.keys, 0) // Add dummy value to extend slice
	copy(parent.keys[insertIndex+1:], parent.keys[insertIndex:])
	parent.keys[insertIndex] = promotedKey

	// Make space for the new child pointer in the parent
	newSiblingPageID := newSibling.getPageID()
	parent.children = append(parent.children, InvalidPageID) // Add dummy value
	copy(parent.children[insertIndex+2:], parent.children[insertIndex+1:])
	parent.children[insertIndex+1] = newSiblingPageID

	// Write the modified parent node back to disk
	if err := t.dm.WriteNode(parent); err != nil {
		// This is tricky, split already happened. Log error? Attempt rollback?
		fmt.Printf("CRITICAL: Failed to write parent node %d after splitChild: %v\n", parent.getPageID(), err)
		return fmt.Errorf("failed to write parent node %d after split: %w", parent.getPageID(), err)
	}

	// fmt.Printf("splitChild: Parent %d updated. Keys: %v, Children: %v\n", parent.getPageID(), parent.keys, parent.children)
	return nil
}

// insertIntoParent - This logic is now integrated into splitChild.
// The caller of splitChild handles writing the modified parent.

// insertInternal は、キーと新しい子ノード (PageID) を内部ノードの適切な位置に挿入します。
// ノードが分割された場合は、新しい兄弟ノードと親に昇格させるキーを返します。
func (t *BTree) insertInternal(node Node, key KeyType, value ValueType) (Node, KeyType, error) {
	// If node is leaf, insert into leaf
	if node.isLeaf() {
		leaf := node.(*LeafNode)
		// Find insertion point
		index, exists := findKeyIndex(leaf.keys, key)
		if exists {
			// Key already exists, update value (or return error, depending on requirements)
			leaf.values[index] = value // Update value
			// Need to write the updated leaf node back to disk
			if err := t.dm.WriteNode(leaf); err != nil {
				return nil, 0, fmt.Errorf("failed to write updated leaf node %d: %w", leaf.getPageID(), err)
			}
			return nil, 0, nil // No split occurred
		}

		// Insert key/value into leaf at the correct index
		leaf.insertIntoLeaf(key, value, index)

		// Check if leaf needs splitting
		if len(leaf.keys) < 2*t.degree { // Max keys = 2*degree - 1
			// No split needed, write the modified leaf back to disk
			if err := t.dm.WriteNode(leaf); err != nil {
				return nil, 0, fmt.Errorf("failed to write updated leaf node %d: %w", leaf.getPageID(), err)
			}
			return nil, 0, nil // No split occurred
		} else {
			// Leaf is full, split it
			fmt.Printf("INFO: Leaf node %d is full (%d keys), splitting.\n", leaf.getPageID(), len(leaf.keys))
			newSibling, promotedKey, err := t.splitNode(leaf, t.degree)
			if err != nil {
				return nil, 0, fmt.Errorf("failed to split leaf node %d: %w", leaf.getPageID(), err)
			}
			// Write both nodes back to disk (original node was modified by splitNode)
			if err := t.dm.WriteNode(leaf); err != nil {
				// Attempt cleanup or log error?
				_ = t.dm.DeallocatePage(newSibling.getPageID()) // Best effort rollback
				return nil, 0, fmt.Errorf("failed to write original leaf %d after split: %w", leaf.getPageID(), err)
			}
			// NOTE: newSibling is already written to disk by splitNode
			// if err := t.dm.WriteNode(newSibling); err != nil { ... }
			return newSibling, promotedKey, nil // Return new sibling and promoted key
		}
	}

	// If node is internal, find correct child and recurse
	internal := node.(*InternalNode)
	// Find the index of the child subtree to descend into
	i := 0
	for i < len(internal.keys) && key >= internal.keys[i] {
		i++
	}
	childPageID := internal.children[i]
	if childPageID == InvalidPageID {
		return nil, 0, fmt.Errorf("internal error: invalid child page ID at index %d in node %d", i, internal.getPageID())
	}

	// Read the child node
	childNode, err := t.dm.ReadNode(childPageID)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to read child node %d from internal node %d: %w", childPageID, internal.getPageID(), err)
	}

	// Recursively insert into the child node
	newSiblingFromChild, keyToPromote, err := t.insertInternal(childNode, key, value)
	if err != nil {
		return nil, 0, err // Propagate error up
	}

	// If child split occurred (newSiblingFromChild is not nil)
	if newSiblingFromChild != nil {
		fmt.Printf("INFO: Child %d split, promoting key %d to parent %d at index %d.\n", childNode.getPageID(), keyToPromote, internal.getPageID(), i)
		// Insert the promoted key and the new sibling's PageID into the current internal node
		internal.insertIntoInternal(keyToPromote, newSiblingFromChild.getPageID(), i)

		// Check if the current internal node now needs splitting
		if len(internal.keys) < 2*t.degree { // Max keys = 2*degree - 1
			// No split needed for current internal node, write it back
			if err := t.dm.WriteNode(internal); err != nil {
				return nil, 0, fmt.Errorf("failed to write updated internal node %d: %w", internal.getPageID(), err)
			}
			return nil, 0, nil // Split handled, no further promotion needed from this level
		} else {
			// Current internal node is full, split it
			fmt.Printf("INFO: Internal node %d is full (%d keys), splitting.\n", internal.getPageID(), len(internal.keys))
			newSiblingInternal, promotedKeyInternal, err := t.splitNode(internal, t.degree)
			if err != nil {
				return nil, 0, fmt.Errorf("failed to split internal node %d: %w", internal.getPageID(), err)
			}
			// Write both internal nodes back to disk - *REMOVED* splitNode handles this
			/* <-- Remove this block
			if err := t.dm.WriteNode(internal); err != nil {
				_ = t.dm.DeallocatePage(newSiblingInternal.getPageID()) // Best effort rollback
				return nil, 0, fmt.Errorf("failed to write original internal node %d after split: %w", internal.getPageID(), err)
			}
			*/
			// NOTE: splitNode already writes both the modified original node (internal)
			// and the new sibling node (newSiblingInternal) to disk.

			return newSiblingInternal, promotedKeyInternal, nil // Return new sibling and promoted key
		}
	}

	// No split occurred in child, so no changes needed at this level
	return nil, 0, nil
}

// splitNode は子ノード (childToSplit) を分割し、新しい兄弟ノードを作成します。
// 新しい兄弟ノード (newSibling) と、親に昇格させるキー (promotedOrCopiedKey) を返します。
// 親ノードへの実際の挿入は呼び出し元が行います。
func (t *BTree) splitNode(childToSplit Node, degree int) (Node /* newSibling */, KeyType /* promotedOrCopiedKey */, error) {
	if DebugModeEnabled {
		fmt.Printf("DEBUG: splitNode called for PageID %d, degree %d. IsLeaf: %t\n", childToSplit.getPageID(), degree, childToSplit.isLeaf())
	}

	// 新しい兄弟ノードを作成
	newSiblingPageID, err := t.dm.AllocatePage()
	if err != nil {
		return nil, 0, fmt.Errorf("failed to allocate page for new sibling: %w", err)
	}
	var newSibling Node

	// 分割点を計算
	// midpoint := (degree + 1) / 2 // Unused variable
	// minKeys := (degree + 1) / 2 - 1 // Removed unused variable
	// splitIndex := minKeys // Use len() / 2 for simpler split logic below

	var promotedOrCopiedKey KeyType

	if childToSplit.isLeaf() {
		leaf := childToSplit.(*LeafNode)
		if DebugModeEnabled {
			fmt.Printf("DEBUG: splitNode (Leaf): Keys(%d): %v\n", len(leaf.keys), leaf.keys)
		}
		newSibling = NewLeafNode(newSiblingPageID, degree)
		newLeafSibling := newSibling.(*LeafNode)

		// Move keys and values to the new sibling
		splitIndex := len(leaf.keys) / 2            // For leaf, split roughly in half
		promotedOrCopiedKey = leaf.keys[splitIndex] // Key to promote/copy to parent

		newLeafSibling.keys = append(newLeafSibling.keys, leaf.keys[splitIndex:]...)
		newLeafSibling.values = append(newLeafSibling.values, leaf.values[splitIndex:]...)

		// Update original node
		leaf.keys = leaf.keys[:splitIndex]
		leaf.values = leaf.values[:splitIndex]

		// Update linked list pointers
		newLeafSibling.next = leaf.next
		newLeafSibling.prev = leaf.getPageID()
		leaf.next = newSiblingPageID
		// Update the next node's prev pointer if it exists
		if newLeafSibling.next != InvalidPageID {
			// TODO: Need to read the next node and update its prev pointer
			// This requires careful locking if concurrent access is possible
			nextNodeData, err := t.dm.ReadNode(newLeafSibling.next)
			if err == nil {
				nextNodeLeaf, ok := nextNodeData.(*LeafNode)
				if ok {
					nextNodeLeaf.prev = newSiblingPageID
					if err := t.dm.WriteNode(nextNodeLeaf); err != nil {
						// Log error, but continue? Might lead to inconsistency
						fmt.Printf("WARN: Failed to update next node's prev pointer during leaf split: %v\n", err)
					}
				}
			}
		}

	} else {
		internal := childToSplit.(*InternalNode)
		if DebugModeEnabled {
			fmt.Printf("DEBUG: splitNode (Internal): Keys(%d): %v, Children(%d): %v\n", len(internal.keys), internal.keys, len(internal.children), internal.children)
		}
		newSibling = NewInternalNode(newSiblingPageID, degree)
		newInternalSibling := newSibling.(*InternalNode)

		// Key at splitIndex is promoted
		splitIndex := len(internal.keys) / 2 // Promote the middle key
		promotedOrCopiedKey = internal.keys[splitIndex]

		// Move keys and children to the new sibling
		// Keys after the promoted key move
		newInternalSibling.keys = append(newInternalSibling.keys, internal.keys[splitIndex+1:]...)
		// Children after the promoted key's position move
		newInternalSibling.children = append(newInternalSibling.children, internal.children[splitIndex+1:]...)

		// Update original node
		internal.keys = internal.keys[:splitIndex]
		internal.children = internal.children[:splitIndex+1] // Keep children up to and including the split index
	}

	// Write the modified original node and the new sibling node
	// NOTE: The original node (childToSplit) is modified IN PLACE.
	// The caller (splitChild or Insert root split logic) is responsible
	// for writing the *parent* node after inserting the promoted key.
	if err := t.dm.WriteNode(childToSplit); err != nil {
		return nil, 0, fmt.Errorf("failed to write split child node %d: %w", childToSplit.getPageID(), err)
	}
	if err := t.dm.WriteNode(newSibling); err != nil {
		_ = t.dm.DeallocatePage(newSiblingPageID) // Best effort rollback
		return nil, 0, fmt.Errorf("failed to write new sibling node %d: %w", newSiblingPageID, err)
	}

	// Parent modification is handled by the caller
	// // Insert the promoted key and the new sibling pointer into the parent
	// parentInternal := parent.(*InternalNode)
	// parentInternal.insertIntoInternal(promotedKey, newSiblingPageID, childIndex+1)
	//
	// // Write the updated parent node
	// if err := t.dm.WriteNode(parent); err != nil {
	// 	 // More complex rollback needed here
	// 	 return nil, 0, fmt.Errorf("failed to write parent node %d after split: %w", parent.getPageID(), err)
	// }

	return newSibling, promotedOrCopiedKey, nil
}

// insertIntoLeaf は、リーフノードの正しい位置にキーと値を挿入します。
// 内部でスライスを拡張するため、ポインタレシーバが必要です。
// NOTE: This assumes the leaf is NOT full.
// func (n *LeafNode) insertIntoLeaf(key KeyType, value ValueType, index int) {
// 	// ... スライス拡張とコピーのロジック ...
// }
