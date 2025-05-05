package rdbms

import (
	"fmt"
	"slices"
)

// mergeChildren は、親ノード `parent` の `index` 番目の子 `leftChild` と
// `index+1` 番目の子 `rightChild` をマージします。
// マージは `leftChild` に行われ、`rightChild` は解放されます。
// 親ノード `parent` も変更されるため、呼び出し元で書き込む必要があります。
// `leftChild` の変更はこの関数内で書き込まれます。
func (t *BTree) mergeChildren(parent *InternalNode, index int, leftChild Node, rightChild Node) error {
	parentKey := parent.keys[index]
	fmt.Printf("DEBUG [Merge %d]: Merging Right(%d) into Left(%d) under Parent(%d) using parent key %d at index %d\n", parent.getPageID(), rightChild.getPageID(), leftChild.getPageID(), parent.getPageID(), parentKey, index)

	if leftChild.isLeaf() {
		// --- Case 1: Merging Leaf Nodes ---
		leftLeaf := leftChild.(*LeafNode)
		rightLeaf := rightChild.(*LeafNode)

		// Move all keys and values from rightLeaf to leftLeaf
		// No need to pull down parent key for leaf merge (it only separates leaves)
		leftLeaf.keys = append(leftLeaf.keys, rightLeaf.keys...)
		leftLeaf.values = append(leftLeaf.values, rightLeaf.values...)
		// Update the next pointer of the left leaf
		leftLeaf.next = rightLeaf.next

	} else {
		// --- Case 2: Merging Internal Nodes ---
		leftInternal := leftChild.(*InternalNode)
		rightInternal := rightChild.(*InternalNode)

		// Pull down the separating key from the parent
		leftInternal.keys = append(leftInternal.keys, parentKey)
		// Move all keys and children from rightInternal to leftInternal
		leftInternal.keys = append(leftInternal.keys, rightInternal.keys...)
		leftInternal.children = append(leftInternal.children, rightInternal.children...)
	}

	// Remove the key and child pointer from the parent node
	parent.keys = slices.Delete(parent.keys, index, index+1)
	parent.children = slices.Delete(parent.children, index+1, index+2)

	// --- Write Modified Nodes and Deallocate ---
	// Write the updated left child node
	if err := t.dm.WriteNode(leftChild); err != nil {
		// This is difficult to recover from cleanly. Log and return error.
		fmt.Printf("CRITICAL: Failed to write merged left child node %d: %v\n", leftChild.getPageID(), err)
		return fmt.Errorf("failed to write merged left child node %d: %w", leftChild.getPageID(), err)
	}

	// Write the updated parent node
	if err := t.dm.WriteNode(parent); err != nil {
		// Rollback might involve trying to undo the merge in leftChild, complex.
		fmt.Printf("CRITICAL: Failed to write parent node %d after merge: %v\n", parent.getPageID(), err)
		// TODO: Consider how to handle this error state more robustly.
		return fmt.Errorf("failed to write parent node %d after merge: %w", parent.getPageID(), err)
	}

	// Deallocate the right child's page
	rightChildPageID := rightChild.getPageID()
	fmt.Printf("DEBUG [Merge %d]: Deallocating right child page %d.\n", parent.getPageID(), rightChildPageID)
	if err := t.dm.DeallocatePage(rightChildPageID); err != nil {
		// Log warning, but proceed as merge is logically complete in other nodes.
		fmt.Printf("Warning: failed to deallocate merged right child page %d: %v\n", rightChildPageID, err)
	}

	fmt.Printf("DEBUG [Merge %d]: Merge complete. Left(%d) keys: %v, Parent(%d) keys: %v\n", parent.getPageID(), leftChild.getPageID(), leftChild.getKeys(), parent.getPageID(), parent.getKeys())
	return nil
}

// borrowFromSibling は、内部ノード `parent` の `childIndex` 番目の子がキー数不足の場合に、
// 左 (`borrowFromLeft = true`) または右 (`borrowFromLeft = false`) の兄弟ノードからキーを借りて再配布します。
// 関連するノード (parent, child, sibling) の変更とディスク書き込みを行います。
func (t *BTree) borrowFromSibling(parent *InternalNode, childIndex int, borrowFromLeft bool) error {
	var siblingIndex int
	if borrowFromLeft {
		siblingIndex = childIndex - 1
	} else {
		siblingIndex = childIndex + 1
	}

	// Validate indices
	if childIndex < 0 || childIndex >= len(parent.children) || siblingIndex < 0 || siblingIndex >= len(parent.children) {
		return fmt.Errorf("internal error: invalid child (%d) or sibling (%d) index for parent children %v", childIndex, siblingIndex, parent.children)
	}

	childPageID := parent.children[childIndex]
	siblingPageID := parent.children[siblingIndex]

	childNode, err := t.dm.ReadNode(childPageID)
	if err != nil {
		return fmt.Errorf("borrow: failed to read child node %d: %w", childPageID, err)
	}
	siblingNode, err := t.dm.ReadNode(siblingPageID)
	if err != nil {
		return fmt.Errorf("borrow: failed to read sibling node %d: %w", siblingPageID, err)
	}

	if childNode.isLeaf() {
		// --- Case 1: Borrowing for a Leaf Node ---
		if !siblingNode.isLeaf() {
			return fmt.Errorf("borrow error: cannot borrow between leaf (%d) and internal node (%d)", childPageID, siblingPageID)
		}
		childLeaf := childNode.(*LeafNode)
		siblingLeaf := siblingNode.(*LeafNode)

		if borrowFromLeft {
			// Borrow from left sibling
			borrowedKey := siblingLeaf.keys[len(siblingLeaf.keys)-1]
			borrowedValue := siblingLeaf.values[len(siblingLeaf.values)-1]
			// Remove from sibling
			siblingLeaf.keys = siblingLeaf.keys[:len(siblingLeaf.keys)-1]
			siblingLeaf.values = siblingLeaf.values[:len(siblingLeaf.values)-1]
			// Prepend to child
			childLeaf.keys = slices.Insert(childLeaf.keys, 0, borrowedKey)
			childLeaf.values = slices.Insert(childLeaf.values, 0, borrowedValue)
			// Update parent key (replace key at childIndex-1 with the new first key of child)
			parent.keys[childIndex-1] = childLeaf.keys[0]
		} else {
			// Borrow from right sibling
			borrowedKey := siblingLeaf.keys[0]
			borrowedValue := siblingLeaf.values[0]
			// Remove from sibling
			siblingLeaf.keys = siblingLeaf.keys[1:]
			siblingLeaf.values = siblingLeaf.values[1:]
			// Append to child
			childLeaf.keys = append(childLeaf.keys, borrowedKey)
			childLeaf.values = append(childLeaf.values, borrowedValue)
			// Update parent key (replace key at childIndex with the new first key of sibling)
			parent.keys[childIndex] = siblingLeaf.keys[0]
		}
	} else {
		// --- Case 2: Borrowing for an Internal Node ---
		if siblingNode.isLeaf() {
			return fmt.Errorf("borrow error: cannot borrow between internal node (%d) and leaf node (%d)", childPageID, siblingPageID)
		}
		childInternal := childNode.(*InternalNode)
		siblingInternal := siblingNode.(*InternalNode)

		if borrowFromLeft {
			// Borrow from left sibling
			// 1. Parent key at childIndex-1 moves down to become the first key in childInternal.
			parentKeyToMoveDown := parent.keys[childIndex-1]
			childInternal.keys = slices.Insert(childInternal.keys, 0, parentKeyToMoveDown)
			// 2. The last child pointer from siblingInternal moves to become the first child pointer in childInternal.
			childPointerToMove := siblingInternal.children[len(siblingInternal.children)-1]
			siblingInternal.children = siblingInternal.children[:len(siblingInternal.children)-1]
			childInternal.children = slices.Insert(childInternal.children, 0, childPointerToMove)
			// 3. The last key from siblingInternal moves up to replace the parent key at childIndex-1.
			keyToMoveUp := siblingInternal.keys[len(siblingInternal.keys)-1]
			siblingInternal.keys = siblingInternal.keys[:len(siblingInternal.keys)-1]
			parent.keys[childIndex-1] = keyToMoveUp
		} else {
			// Borrow from right sibling
			// 1. Parent key at childIndex moves down to become the last key in childInternal.
			parentKeyToMoveDown := parent.keys[childIndex]
			childInternal.keys = append(childInternal.keys, parentKeyToMoveDown)
			// 2. The first child pointer from siblingInternal moves to become the last child pointer in childInternal.
			childPointerToMove := siblingInternal.children[0]
			siblingInternal.children = siblingInternal.children[1:]
			childInternal.children = append(childInternal.children, childPointerToMove)
			// 3. The first key from siblingInternal moves up to replace the parent key at childIndex.
			keyToMoveUp := siblingInternal.keys[0]
			siblingInternal.keys = siblingInternal.keys[1:]
			parent.keys[childIndex] = keyToMoveUp
		}
	}

	// --- Write Modified Nodes ---
	if err := t.dm.WriteNode(parent); err != nil {
		// Rollback is very complex here. Log critical error.
		fmt.Printf("CRITICAL: Failed to write parent node %d during borrow: %v\n", parent.getPageID(), err)
		return fmt.Errorf("failed to write parent node %d during borrow: %w", parent.getPageID(), err)
	}
	if err := t.dm.WriteNode(childNode); err != nil {
		fmt.Printf("CRITICAL: Failed to write child node %d during borrow: %v\n", childNode.getPageID(), err)
		// Attempt to rollback parent? Too complex for now.
		return fmt.Errorf("failed to write child node %d during borrow: %w", childNode.getPageID(), err)
	}
	if err := t.dm.WriteNode(siblingNode); err != nil {
		fmt.Printf("CRITICAL: Failed to write sibling node %d during borrow: %v\n", siblingNode.getPageID(), err)
		// Attempt rollback?
		return fmt.Errorf("failed to write sibling node %d during borrow: %w", siblingNode.getPageID(), err)
	}

	return nil
}
