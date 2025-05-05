package rdbms

import (
	"bytes"
	"encoding/binary"
	"encoding/gob"
	"fmt"
)

// --- DiskManager Methods for Node I/O ---

// ReadNode はページIDからノードデータを読み込み、デシリアライズして Node インターフェースを返します。
func (dm *DiskManager) ReadNode(pageID PageID) (Node, error) {
	pageData := make([]byte, dm.pageSize)
	if err := dm.ReadPage(pageID, pageData); err != nil {
		return nil, fmt.Errorf("failed to read page %d for node: %w", pageID, err)
	}

	// Deserialize the node
	node, err := deserializeNode(pageData)
	if err != nil {
		return nil, err // Pass the deserialization error up
	}

	// Set the page ID on the deserialized node
	if node != nil {
		node.setPageID(pageID)
	}

	return node, nil
}

// WriteNode は Node インターフェースをシリアライズし、対応するページIDに書き込みます。
func (dm *DiskManager) WriteNode(node Node) error {
	pageData, err := serializeNode(node)
	if err != nil {
		return fmt.Errorf("failed to serialize node for page %d: %w", node.getPageID(), err)
	}

	// Note: serializeNode now returns a full PageSize byte slice, no need for padding here.
	// if len(pageData) > int(dm.pageSize) { ... check already done in serializeNode ... }

	return dm.WritePage(node.getPageID(), pageData)
}

// --- Serialization/Deserialization Helper Functions (Moved from node.go) ---

// serializeNode encodes a Node (Leaf or Internal) into a PageSize byte array.
func serializeNode(node Node) ([]byte, error) {
	// 1. Write Header
	var numKeys uint16

	// 2. Prepare Payload based on Node Type
	var nodeType NodeType
	var payload interface{} // Use interface{} for gob encoding different structs

	if node.isLeaf() {
		leaf := node.(*LeafNode) // Type assertion
		nodeType = NodeTypeLeaf  // Set node type for header
		numKeys = uint16(len(leaf.keys))
		// Prepare payload for gob encoding (keys, values, next PageID)
		payload = struct {
			Keys   []KeyType
			Values []ValueType
			NextID PageID // PageID of next leaf
			PrevID PageID // Optional: PageID of prev leaf
		}{
			Keys:   leaf.keys,
			Values: leaf.values,
			NextID: leaf.next, // Use the PageID stored in leaf.next
			PrevID: leaf.prev, // Use the PageID stored in leaf.prev
		}

	} else {
		internal := node.(*InternalNode) // Type assertion
		nodeType = NodeTypeInternal      // Set node type for header
		numKeys = uint16(len(internal.keys))
		// Prepare payload for gob encoding (keys, children PageIDs)
		payload = struct {
			Keys     []KeyType // Keys themselves
			Children []PageID  // Store PageIDs of children
		}{
			Keys:     internal.keys,
			Children: internal.children, // Use the PageID slice directly
		}
	}

	// 3. Encode Payload using gob into a buffer
	var buf bytes.Buffer
	encoder := gob.NewEncoder(&buf)
	if err := encoder.Encode(payload); err != nil {
		return nil, fmt.Errorf("failed to gob encode node payload: %w", err)
	}
	encodedBytes := buf.Bytes()

	// 4. Prepare the full page data with header
	pageData := make([]byte, PageSize)                                              // Assume PageSize is accessible
	pageData[NodeTypeOffset] = byte(nodeType)                                       // Write NodeType to header
	binary.LittleEndian.PutUint16(pageData[NumKeysOffset:NumKeysOffset+2], numKeys) // Write numKeys to header

	// 5. Check Size and Copy to PageData
	if HeaderSize+len(encodedBytes) > PageSize {
		// This indicates an issue with B+Tree logic (node too full) or PageSize being too small
		return nil, fmt.Errorf("node data size (%d bytes) exceeds page size (%d bytes)", HeaderSize+len(encodedBytes), PageSize)
	}
	copy(pageData[HeaderSize:], encodedBytes) // Copy payload after the header

	// 6. Zero out remaining space (optional, good practice)
	zeroStart := HeaderSize + len(encodedBytes)
	for i := zeroStart; i < PageSize; i++ {
		pageData[i] = 0
	}

	return pageData, nil
}

// deserializeNode decodes a PageSize byte array back into a Node (Leaf or Internal).
func deserializeNode(data []byte) (Node, error) {
	// 1. Read Header
	if len(data) != PageSize {
		return nil, fmt.Errorf("deserializeNode expects data of PageSize (%d), got %d", PageSize, len(data))
	}
	if len(data) < HeaderSize {
		return nil, fmt.Errorf("page data too short to contain header (%d bytes)", len(data))
	}
	nodeType := NodeType(data[NodeTypeOffset])
	// numKeys := binary.LittleEndian.Uint16(data[NumKeysOffset : NumKeysOffset+2]) // Can be used for validation

	// 2. Prepare gob Decoder for the payload part
	payloadBytes := data[HeaderSize:]
	buf := bytes.NewBuffer(payloadBytes)
	decoder := gob.NewDecoder(buf)

	// 3. Decode based on NodeType
	if nodeType == NodeTypeLeaf {
		leafPayload := struct { // Must match the structure used in serializeNode
			Keys   []KeyType
			Values []ValueType
			NextID PageID
			PrevID PageID
		}{}
		if err := decoder.Decode(&leafPayload); err != nil {
			return nil, fmt.Errorf("failed to gob decode leaf node payload: %w", err)
		}
		// Create LeafNode instance
		// PageID is set by the caller (DiskManager.ReadNode)
		return &LeafNode{
			keys:   leafPayload.Keys,
			values: leafPayload.Values,
			next:   leafPayload.NextID,
			prev:   leafPayload.PrevID,
		}, nil
	} else if nodeType == NodeTypeInternal {
		internalPayload := struct { // Must match the structure used in serializeNode
			Keys     []KeyType
			Children []PageID
		}{}
		if err := decoder.Decode(&internalPayload); err != nil {
			return nil, fmt.Errorf("failed to gob decode internal node payload: %w", err)
		}
		// Create InternalNode instance
		// PageID is set by the caller (DiskManager.ReadNode)
		return &InternalNode{
			keys:     internalPayload.Keys,
			children: internalPayload.Children,
		}, nil
	} else {
		return nil, fmt.Errorf("unknown node type in page header: %d", nodeType)
	}
}
