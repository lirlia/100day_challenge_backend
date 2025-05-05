package rdbms

import (
	"fmt"
)

// DefaultDegree はB+Treeのデフォルト次数 (各ノードが持てるキーの最大数に関連)
// degree=3 の場合、ノードあたり最大2キー、最小1キー
const DefaultDegree = 3 // Exported constant

// BTree はB+Tree全体の構造体です。
type BTree struct {
	dm         *DiskManager // ディスクマネージャ
	rootPageID PageID       // ルートノードのページID
	degree     int          // B+Treeの次数
	minKeys    int          // Minimum number of keys in a node
}

// NewBTree は指定されたルートページIDと次数でB+Tree構造体を初期化します。
// CreateTableで初期ルートが作成された後や、既存テーブルロード時に呼び出されます。
func NewBTree(dm *DiskManager, rootPageID PageID, degree int) (*BTree, error) {
	if degree < 2 {
		return nil, fmt.Errorf("B+Tree degree must be at least 2, got %d", degree)
	}
	if rootPageID == InvalidPageID {
		// This case should ideally be handled by CreateTable now.
		// If called directly with InvalidPageID, it implies an issue.
		return nil, fmt.Errorf("NewBTree called with InvalidPageID; use CreateTable first")
	}

	// Validate if the root page actually exists (optional sanity check)
	// _, err := dm.ReadNode(rootPageID) // ReadNode now returns []byte, error
	// if err != nil {
	// 	return nil, fmt.Errorf("failed to read root node page %d provided to NewBTree: %w", rootPageID, err)
	// }

	// BTree構造体を初期化
	tree := &BTree{
		dm:         dm,
		degree:     degree,
		rootPageID: rootPageID,
		// Calculate minKeys based on standard B-Tree definition (minimum number of keys)
		// minKeys = ceil(degree / 2) - 1
		minKeys: (degree+1)/2 - 1, // Use integer division which effectively does ceil(d/2)-1 for odd degrees
		// For degree=3, minKeys = (3+1)/2 - 1 = 1
		// For degree=4, minKeys = (4+1)/2 - 1 = 5/2 - 1 = 2 - 1 = 1 (Standard ceil(4/2)-1 = 2-1 = 1)
		// For degree=5, minKeys = (5+1)/2 - 1 = 3 - 1 = 2 (Standard ceil(5/2)-1 = 3-1 = 2)
	}
	// fmt.Printf("Loaded BTree with root PageID: %d, Degree: %d\n", rootPageID, degree)
	return tree, nil
}

// TODO: Implement BTree methods (Insert, Delete, Search, Scan) using DiskManager
