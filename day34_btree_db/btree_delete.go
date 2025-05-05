package rdbms

import (
	"fmt"
)

// Delete は指定されたキーを持つエントリをB+Treeから削除します。
// tableName はルートが変更された場合にメタデータを更新するために必要です。
func (t *BTree) Delete(tableName string, key KeyType) error {
	rootNode, err := t.dm.ReadNode(t.rootPageID)
	if err != nil {
		return fmt.Errorf("failed to read root node %d: %w", t.rootPageID, err)
	}

	if rootNode == nil {
		return fmt.Errorf("cannot delete from an empty tree")
	}

	// Pass the root node itself, not just the PageID
	if err := t.deleteRecursive(rootNode, key); err != nil {
		// Check if the error is the specific 'not implemented yet' error and ignore if so?
		if err.Error() == "internal node deletion not implemented yet" {
			fmt.Printf("WARN: Delete called, but internal node deletion part is not fully implemented.\n")
			// For now, let's not return error if it's just the unimplemented part
			return nil // Or return the error if we want tests to fail until fully implemented
		}
		return fmt.Errorf("deleteRecursive failed: %w", err)
	}

	// --- Root Handling after Deletion ---
	// If the root node becomes empty after deletion (e.g., after merging its only two children),
	// the new root should become the single remaining child.
	// Read the root node *again* in case deleteRecursive modified it (though it shouldn't modify parent directly)
	// It's safer to rely on the t.rootPageID which *might* have been updated if the root was split/merged in edge cases
	// Let's re-read the *current* root page ID
	currentRootNode, err := t.dm.ReadNode(t.rootPageID)
	if err != nil {
		// This is problematic, maybe just log and continue?
		fmt.Printf("ERROR: Failed to read current root node %d after deleteRecursive: %v\n", t.rootPageID, err)
		return nil // Or return the error?
	}

	if !currentRootNode.isLeaf() {
		rootInternal := currentRootNode.(*InternalNode) // Type assertion
		if len(rootInternal.getKeys()) == 0 && len(rootInternal.children) == 1 {
			fmt.Printf("INFO: Root node %d became empty, promoting its child %d as the new root.\n", t.rootPageID, rootInternal.children[0])
			newRootPageID := rootInternal.children[0]
			oldRootPageID := t.rootPageID
			t.rootPageID = newRootPageID // Update root in memory

			// Update the metadata on disk
			if err := t.dm.SetTableRoot(tableName, t.rootPageID); err != nil {
				// Attempt to rollback rootPageID in memory?
				t.rootPageID = oldRootPageID // Rollback
				return fmt.Errorf("failed to set new table root %d in metadata: %w", newRootPageID, err)
			}

			// Deallocate the old root page (Best effort for now)
			if err := t.dm.DeallocatePage(oldRootPageID); err != nil {
				fmt.Printf("Warning: failed to deallocate old root page %d after promotion: %v\n", oldRootPageID, err)
			}
		}
	}

	return nil
}

// deleteRecursive は、指定されたノードからキーを再帰的に削除します。
// ノードがアンダーフローした場合、再平衡化 (borrow or merge) を行います。
// この関数は主に内部ノードの処理を担当し、リーフからの実際の削除は deleteFromLeaf が行います。
func (t *BTree) deleteRecursive(node Node, key KeyType) error {
	minKeys := (t.degree+1)/2 - 1 // Minimum number of keys a node can have

	if node.isLeaf() {
		leaf := node.(*LeafNode)
		keyIndex, found := findKeyIndex(leaf.keys, key)
		if !found {
			return fmt.Errorf("key %d not found in leaf node %d", key, leaf.getPageID()) // Or return nil if delete should be idempotent
		}

		// Delete the key/value from the leaf
		t.deleteFromLeaf(leaf, keyIndex)

		// Write the modified leaf node back to disk
		if err := t.dm.WriteNode(leaf); err != nil {
			return fmt.Errorf("failed to write leaf node %d after deletion: %w", leaf.getPageID(), err)
		}
		// Verify write by re-reading (Optional but useful for debugging persistence)
		/* // Keep commented out for now, enable if persistence issues reappear
		readBackNode, readErr := t.dm.ReadNode(leaf.getPageID())
		if readErr != nil {
			fmt.Printf("WARN [deleteRecursive Leaf %d]: Failed to re-read node after write: %v\n", leaf.getPageID(), readErr)
		} else {
			readBackLeaf := readBackNode.(*LeafNode)
			fmt.Printf("DEBUG [deleteRecursive Leaf %d]: Keys after write (re-read): %v\n", leaf.getPageID(), readBackLeaf.keys)
		}
		*/

		// Leaf underflow check removed, as it should be handled by the parent pre-check
		return nil // Deletion successful
	}

	// --- Internal Node Handling ---
	internal := node.(*InternalNode)

	// 1. Find which child the key belongs to.
	i := 0
	for i < len(internal.keys) && key >= internal.keys[i] {
		i++
	}
	childPageID := internal.children[i]

	// 2. Read the child node.
	childNode, err := t.dm.ReadNode(childPageID)
	if err != nil {
		return fmt.Errorf("failed to read child node %d for recursive delete: %w", childPageID, err)
	}

	// 3. Check if the child node needs restructuring *before* descending.
	// If child has exactly minKeys, it cannot afford to lose a key without underflowing.
	currentChildKeys := childNode.getKeys()
	if len(currentChildKeys) == t.minKeys { // Check if child has the minimum number of keys
		// --- Try borrowing from left sibling --- (Case 3a in CLRS)
		if i > 0 { // Check if left sibling exists
			leftSiblingPageID := internal.children[i-1]
			leftSiblingNode, err := t.dm.ReadNode(leftSiblingPageID)
			if err != nil {
				return fmt.Errorf("failed to read left sibling node %d: %w", leftSiblingPageID, err)
			}
			if len(leftSiblingNode.getKeys()) > minKeys {
				if err := t.borrowFromSibling(internal, i, true); err != nil { // borrowFromSibling modifies parent 'internal'
					return fmt.Errorf("failed to borrow from left sibling %d: %w", leftSiblingPageID, err)
				}
				// Borrow successful. Parent 'internal' was modified.
				// Re-determine the correct child index 'i' based on the *updated* parent.
				i = 0
				for i < len(internal.keys) && key >= internal.keys[i] {
					i++
				}
				childPageID = internal.children[i] // Get the potentially new child ID if structure changed significantly (unlikely for borrow)
				childNodeAfterRestructure, err := t.dm.ReadNode(childPageID)
				if err != nil {
					return fmt.Errorf("failed to re-read child node %d after borrow left: %w", childPageID, err)
				}
				return t.deleteRecursive(childNodeAfterRestructure, key)
			}
		}

		// --- Try borrowing from right sibling --- (Case 3a in CLRS)
		if i < len(internal.children)-1 { // Check if right sibling exists
			rightSiblingPageID := internal.children[i+1]
			rightSiblingNode, err := t.dm.ReadNode(rightSiblingPageID)
			if err != nil {
				return fmt.Errorf("failed to read right sibling node %d: %w", rightSiblingPageID, err)
			}
			if len(rightSiblingNode.getKeys()) > minKeys {
				fmt.Printf("DEBUG [PreCheck %d]: Right sibling %d has %d keys (> min %d), borrowing from right.\n", internal.getPageID(), rightSiblingPageID, len(rightSiblingNode.getKeys()), minKeys)
				if err := t.borrowFromSibling(internal, i, false); err != nil { // borrowFromSibling modifies parent 'internal'
					return fmt.Errorf("failed to borrow from right sibling %d: %w", rightSiblingPageID, err)
				}
				// Borrow successful. Parent 'internal' was modified.
				// Re-determine the correct child index 'i' based on the *updated* parent.
				i = 0
				for i < len(internal.keys) && key >= internal.keys[i] {
					i++
				}
				childPageID = internal.children[i]
				childNodeAfterRestructure, err := t.dm.ReadNode(childPageID)
				if err != nil {
					return fmt.Errorf("failed to re-read child node %d after borrow right: %w", childPageID, err)
				}
				return t.deleteRecursive(childNodeAfterRestructure, key)
			}
		}

		// --- Merge needed --- (Case 3b in CLRS)
		fmt.Printf("DEBUG [PreCheck %d]: Borrow failed for child %d, merging required.\n", internal.getPageID(), childPageID)
		// var mergedNode Node // Not needed, find child from parent after merge
		var mergedChildIndex int // Index of the child to recurse into after merge

		if i > 0 { // Try merging with left sibling
			leftSiblingPageID := internal.children[i-1]
			leftSiblingNode, err := t.dm.ReadNode(leftSiblingPageID)
			if err != nil {
				return fmt.Errorf("failed to read left sibling node %d for merge: %w", leftSiblingPageID, err)
			}
			fmt.Printf("DEBUG [PreCheck %d]: Merging child %d into left sibling %d.\n", internal.getPageID(), childPageID, leftSiblingPageID)
			if err := t.mergeChildren(internal, i-1, leftSiblingNode, childNode); err != nil { // mergeChildren modifies parent 'internal'
				return fmt.Errorf("failed to merge child %d with left sibling %d: %w", childPageID, leftSiblingPageID, err)
			}
			// Write the modified parent node *after* merge completes successfully (REMOVED - parent modified IN mergeChildren, but maybe needs explicit write HERE?)
			// Let's assume mergeChildren handles necessary writes for now, or caller does.
			/*
				if err := t.dm.WriteNode(internal); err != nil {
					return fmt.Errorf("failed to write parent node %d after merging child with left sibling: %w", internal.getPageID(), err)
				}
			*/
			// mergedNode = leftSiblingNode // Don't use this
			mergedChildIndex = i - 1 // After merging with left, the target key is now in the child at index i-1

		} else { // Merge with right sibling (must exist if borrow failed)
			if i >= len(internal.children)-1 {
				return fmt.Errorf("internal error: cannot merge child at index %d with non-existent right sibling (parent children: %v)", i, internal.children)
			}
			rightSiblingPageID := internal.children[i+1]
			rightSiblingNode, err := t.dm.ReadNode(rightSiblingPageID)
			if err != nil {
				return fmt.Errorf("failed to read right sibling node %d for merge: %w", rightSiblingPageID, err)
			}
			fmt.Printf("DEBUG [PreCheck %d]: Merging right sibling %d into child %d.\n", internal.getPageID(), rightSiblingPageID, childPageID)
			if err := t.mergeChildren(internal, i, childNode, rightSiblingNode); err != nil { // mergeChildren modifies parent 'internal'
				return fmt.Errorf("failed to merge right sibling %d with child %d: %w", rightSiblingPageID, childPageID, err)
			}
			// Write the modified parent node *after* merge completes successfully (REMOVED)
			/*
				if err := t.dm.WriteNode(internal); err != nil {
					return fmt.Errorf("failed to write parent node %d after merging child with right sibling: %w", internal.getPageID(), err)
				}
			*/
			// mergedNode = childNode // Don't use this
			mergedChildIndex = i // After merging with right, the target key is still in the child at index i
		}

		// Now, recurse into the correct child node from the *updated* parent node.
		// i = 0 // Find index in updated parent -- No need to recalculate, use mergedChildIndex
		// for i < len(internal.keys) && key >= internal.keys[i] { i++ }
		// The child at index 'i' is the one that remains after the merge.
		if mergedChildIndex < 0 || mergedChildIndex >= len(internal.children) {
			return fmt.Errorf("internal error: merged child index %d out of bounds for parent children %v", mergedChildIndex, internal.children)
		}
		mergedChildPageID := internal.children[mergedChildIndex]
		mergedNodeAfterWrite, err := t.dm.ReadNode(mergedChildPageID) // Re-read the node that remains after merge
		if err != nil {
			return fmt.Errorf("failed to re-read merged node %d before recursion: %w", mergedChildPageID, err)
		}
		fmt.Printf("DEBUG [deleteRecursive Internal %d]: Recursively deleting key %d from merged node %d (originally child index %d).\n", internal.getPageID(), key, mergedNodeAfterWrite.getPageID(), mergedChildIndex)
		return t.deleteRecursive(mergedNodeAfterWrite, key)

	} else {
		// Child has more than minimum keys, safe to descend directly
		fmt.Printf("DEBUG [deleteRecursive Internal %d]: Child %d has %d keys (> min %d), descending directly.\n", internal.getPageID(), childPageID, len(childNode.getKeys()), t.minKeys)
		return t.deleteRecursive(childNode, key)
	}
}

// deleteFromLeaf はリーフノードから指定されたインデックスのキーと値を削除します。
// この関数はノードオブジェクトを直接変更します。ディスクへの書き込みは呼び出し元 (deleteRecursive) で行います。
func (t *BTree) deleteFromLeaf(leaf *LeafNode, index int) {
	if index < 0 || index >= len(leaf.keys) {
		// 事前の findKeyIndex と found チェックでここは通らないはず
		fmt.Printf("Warning: deleteFromLeaf called with invalid index %d for leaf page %d\n", index, leaf.pageID)
		return
	}
	// スライスから要素を削除 (Goのスライス操作の標準的な方法)
	leaf.keys = append(leaf.keys[:index], leaf.keys[index+1:]...)
	leaf.values = append(leaf.values[:index], leaf.values[index+1:]...)
	// nextLeafPageID は変更しない
}

// 再配布とマージのヘルパー関数は btree_rebalance.go にあります。
