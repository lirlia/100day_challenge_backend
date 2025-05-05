package rdbms

import (
	"bytes"
	"reflect"
	"testing"
)

// Test helper to compare two nodes deeply
func assertNodesEqual(t *testing.T, expected, actual Node, msg string) {
	t.Helper()
	if !reflect.DeepEqual(expected, actual) {
		t.Errorf("%s: Node mismatch.\nExpected: %+v\nActual:   %+v", msg, expected, actual)
	}
}

// Test helper to create a simple leaf node for testing
func createTestLeafNode(pageID PageID, keys []KeyType, values []ValueType) *LeafNode {
	return &LeafNode{
		pageID: pageID,
		keys:   keys,
		values: values,
		next:   InvalidPageID, // Assuming 0 is invalid/null
		prev:   InvalidPageID,
	}
}

// Test helper to create a simple internal node for testing
func createTestInternalNode(pageID PageID, keys []KeyType, children []PageID) *InternalNode {
	return &InternalNode{
		pageID:   pageID,
		keys:     keys,
		children: children,
	}
}

func TestNodeTypes(t *testing.T) {
	leaf := createTestLeafNode(1, nil, nil)
	internal := createTestInternalNode(2, nil, nil)

	if !leaf.isLeaf() {
		t.Error("Expected leaf.isLeaf() to be true")
	}
	if internal.isLeaf() {
		t.Error("Expected internal.isLeaf() to be false")
	}
}

func TestKeyTypeValueType(t *testing.T) {
	var k KeyType = 10
	var v ValueType = []byte("test")
	if reflect.TypeOf(k).Kind() != reflect.Int64 {
		t.Errorf("Expected KeyType to be int64, got %v", reflect.TypeOf(k))
	}
	if reflect.TypeOf(v).Kind() != reflect.Slice {
		t.Errorf("Expected ValueType to be slice, got %v", reflect.TypeOf(v))
	}
}

func TestIsNodeFull(t *testing.T) {
	degree := 3 // Max keys = 2*3 - 1 = 5
	leafFull := createTestLeafNode(1, make([]KeyType, 5), make([]ValueType, 5))
	leafNotFull := createTestLeafNode(2, make([]KeyType, 4), make([]ValueType, 4))
	internalFull := createTestInternalNode(3, make([]KeyType, 5), make([]PageID, 6))
	internalNotFull := createTestInternalNode(4, make([]KeyType, 4), make([]PageID, 5))

	if !leafFull.isFull(degree) {
		t.Error("Expected leaf node with 5 keys to be full for degree 3")
	}
	if leafNotFull.isFull(degree) {
		t.Error("Expected leaf node with 4 keys not to be full for degree 3")
	}
	if !internalFull.isFull(degree) {
		t.Error("Expected internal node with 5 keys to be full for degree 3")
	}
	if internalNotFull.isFull(degree) {
		t.Error("Expected internal node with 4 keys not to be full for degree 3")
	}
}

func TestFindKeyIndex(t *testing.T) {
	keys := []KeyType{10, 20, 30, 40, 50}
	leaf := createTestLeafNode(1, keys, nil)
	internal := createTestInternalNode(2, keys, nil)

	// Test cases for both leaf and internal (findKeyIndex is on the node interface now)
	tests := []struct {
		node          Node
		key           KeyType
		expectedIdx   int
		expectedFound bool
	}{
		{leaf, 20, 1, true},       // Found in middle
		{leaf, 10, 0, true},       // Found at start
		{leaf, 50, 4, true},       // Found at end
		{leaf, 5, 0, false},       // Not found, insert at start
		{leaf, 25, 2, false},      // Not found, insert in middle
		{leaf, 60, 5, false},      // Not found, insert at end
		{internal, 30, 2, true},   // Found in middle
		{internal, 15, 1, false},  // Not found, child index 1
		{internal, 10, 0, true},   // Found at start
		{internal, 45, 4, false},  // Not found, child index 4
		{internal, 5, 0, false},   // Not found, child index 0
		{internal, 50, 4, true},   // Found at end
		{internal, 100, 5, false}, // Not found, child index 5
	}

	for _, tt := range tests {
		idx, found := tt.node.findKeyIndex(tt.key)
		if idx != tt.expectedIdx || found != tt.expectedFound {
			nodeType := "Internal"
			if tt.node.isLeaf() {
				nodeType = "Leaf"
			}
			t.Errorf("%s node findKeyIndex(%d): Got (%d, %t), Expected (%d, %t)",
				nodeType, tt.key, idx, found, tt.expectedIdx, tt.expectedFound)
		}
	}
}

func TestInsertIntoLeaf(t *testing.T) {
	leaf := createTestLeafNode(1, []KeyType{10, 30}, []ValueType{[]byte("v10"), []byte("v30")})

	leaf.insertIntoLeaf(20, []byte("v20"), 1) // Insert in middle
	expectedKeys := []KeyType{10, 20, 30}
	expectedValues := []ValueType{[]byte("v10"), []byte("v20"), []byte("v30")}
	if !reflect.DeepEqual(leaf.keys, expectedKeys) {
		t.Errorf("InsertIntoLeaf keys mismatch. Got %v, want %v", leaf.keys, expectedKeys)
	}
	if !reflect.DeepEqual(leaf.values, expectedValues) {
		// Comparing byte slices needs careful handling if DeepEqual doesn't work as expected
		if len(leaf.values) != len(expectedValues) {
			t.Errorf("InsertIntoLeaf values length mismatch. Got %d, want %d", len(leaf.values), len(expectedValues))
		} else {
			for i := range expectedValues {
				if !bytes.Equal(leaf.values[i], expectedValues[i]) {
					t.Errorf("InsertIntoLeaf value mismatch at index %d. Got %s, want %s", i, leaf.values[i], expectedValues[i])
				}
			}
		}
	}

	leaf.insertIntoLeaf(5, []byte("v5"), 0) // Insert at beginning
	expectedKeys = []KeyType{5, 10, 20, 30}
	if !reflect.DeepEqual(leaf.keys, expectedKeys) {
		t.Errorf("InsertIntoLeaf (start) keys mismatch. Got %v, want %v", leaf.keys, expectedKeys)
	}
}

func TestInsertIntoInternal(t *testing.T) {
	internal := createTestInternalNode(1, []KeyType{20}, []PageID{10, 30})

	internal.insertIntoInternal(15, 15, 0) // Insert before 20, child 15
	expectedKeys := []KeyType{15, 20}
	expectedChildren := []PageID{10, 15, 30}
	if !reflect.DeepEqual(internal.keys, expectedKeys) {
		t.Errorf("InsertIntoInternal keys mismatch. Got %v, want %v", internal.keys, expectedKeys)
	}
	if !reflect.DeepEqual(internal.children, expectedChildren) {
		t.Errorf("InsertIntoInternal children mismatch. Got %v, want %v", internal.children, expectedChildren)
	}

	internal.insertIntoInternal(25, 25, 2) // Insert after 20, child 25
	expectedKeys = []KeyType{15, 20, 25}
	expectedChildren = []PageID{10, 15, 30, 25}
	if !reflect.DeepEqual(internal.keys, expectedKeys) {
		t.Errorf("InsertIntoInternal (end) keys mismatch. Got %v, want %v", internal.keys, expectedKeys)
	}
	if !reflect.DeepEqual(internal.children, expectedChildren) {
		t.Errorf("InsertIntoInternal (end) children mismatch. Got %v, want %v", internal.children, expectedChildren)
	}
}

// TestNodeSerializationDeserialization tests the basic flow for both leaf and internal nodes.
func TestNodeSerializationDeserialization(t *testing.T) {
	// Create sample nodes
	leafOrig := createTestLeafNode(10, []KeyType{1, 3}, []ValueType{[]byte("one"), []byte("three")})
	leafOrig.next = 11
	internalOrig := createTestInternalNode(20, []KeyType{5}, []PageID{10, 11})

	// --- Test Leaf Node ---
	pageDataLeaf, errLeaf := serializeNode(leafOrig) // Use new signature
	if errLeaf != nil {
		t.Fatalf("Leaf serializeNode failed: %v", errLeaf)
	}
	if len(pageDataLeaf) != PageSize {
		t.Fatalf("Leaf serialized data size is %d, expected %d", len(pageDataLeaf), PageSize)
	}

	leafDeserialized, errLeafDes := deserializeNode(pageDataLeaf) // Use new signature
	if errLeafDes != nil {
		t.Fatalf("Leaf deserializeNode failed: %v", errLeafDes)
	}
	// Check type assertion
	leafFinal, okLeaf := leafDeserialized.(*LeafNode)
	if !okLeaf {
		t.Fatalf("Deserialized node is not a LeafNode, got %T", leafDeserialized)
	}
	leafFinal.setPageID(leafOrig.pageID) // Set pageID manually as deserializeNode doesn't do it
	assertNodesEqual(t, leafOrig, leafFinal, "Leaf Node Ser/Deser")

	// --- Test Internal Node ---
	pageDataInternal, errInternal := serializeNode(internalOrig) // Use new signature
	if errInternal != nil {
		t.Fatalf("Internal serializeNode failed: %v", errInternal)
	}
	if len(pageDataInternal) != PageSize {
		t.Fatalf("Internal serialized data size is %d, expected %d", len(pageDataInternal), PageSize)
	}

	internalDeserialized, errInternalDes := deserializeNode(pageDataInternal) // Use new signature
	if errInternalDes != nil {
		t.Fatalf("Internal deserializeNode failed: %v", errInternalDes)
	}
	internalFinal, okInternal := internalDeserialized.(*InternalNode)
	if !okInternal {
		t.Fatalf("Deserialized node is not an InternalNode, got %T", internalDeserialized)
	}
	internalFinal.setPageID(internalOrig.pageID)
	assertNodesEqual(t, internalOrig, internalFinal, "Internal Node Ser/Deser")
}

// TestSerializeDeserializeLeafNode focuses specifically on LeafNode variations.
func TestSerializeDeserializeLeafNode(t *testing.T) {
	// Empty Leaf
	leafEmpty := createTestLeafNode(1, []KeyType{}, []ValueType{})
	pageDataEmpty, err := serializeNode(leafEmpty)
	if err != nil {
		t.Fatalf("Empty Leaf serialize failed: %v", err)
	}
	nodeEmpty, err := deserializeNode(pageDataEmpty)
	if err != nil {
		t.Fatalf("Empty Leaf deserialize failed: %v", err)
	}
	leafEmptyRestored, _ := nodeEmpty.(*LeafNode)
	leafEmptyRestored.setPageID(leafEmpty.pageID)
	// assertNodesEqual(t, leafEmpty, leafEmptyRestored, "Empty Leaf Node")
	// Manual comparison for empty leaf node
	if leafEmptyRestored.pageID != leafEmpty.pageID {
		t.Errorf("Empty Leaf Node pageID mismatch. Got %d, want %d", leafEmptyRestored.pageID, leafEmpty.pageID)
	}
	if len(leafEmptyRestored.keys) != 0 || len(leafEmpty.keys) != 0 {
		if !reflect.DeepEqual(leafEmptyRestored.keys, leafEmpty.keys) {
			t.Errorf("Empty Leaf Node keys mismatch. Got %v, want %v", leafEmptyRestored.keys, leafEmpty.keys)
		}
	}
	if len(leafEmptyRestored.values) != 0 || len(leafEmpty.values) != 0 {
		if !reflect.DeepEqual(leafEmptyRestored.values, leafEmpty.values) {
			t.Errorf("Empty Leaf Node values mismatch. Got %v, want %v", leafEmptyRestored.values, leafEmpty.values)
		}
	}
	if leafEmptyRestored.next != leafEmpty.next {
		t.Errorf("Empty Leaf Node next mismatch. Got %d, want %d", leafEmptyRestored.next, leafEmpty.next)
	}
	if leafEmptyRestored.prev != leafEmpty.prev {
		t.Errorf("Empty Leaf Node prev mismatch. Got %d, want %d", leafEmptyRestored.prev, leafEmpty.prev)
	}

	// Leaf with data and next pointer
	leafData := createTestLeafNode(2, []KeyType{10, 20}, []ValueType{[]byte("A"), []byte("B")})
	leafData.next = 3
	pageDataData, err := serializeNode(leafData)
	if err != nil {
		t.Fatalf("Data Leaf serialize failed: %v", err)
	}
	nodeData, err := deserializeNode(pageDataData)
	if err != nil {
		t.Fatalf("Data Leaf deserialize failed: %v", err)
	}
	leafDataRestored, _ := nodeData.(*LeafNode)
	leafDataRestored.setPageID(leafData.pageID)
	// assertNodesEqual(t, leafData, leafDataRestored, "Data Leaf Node")
	// Manual comparison for data leaf node
	if leafDataRestored.pageID != leafData.pageID {
		t.Errorf("Data Leaf Node pageID mismatch. Got %d, want %d", leafDataRestored.pageID, leafData.pageID)
	}
	if !reflect.DeepEqual(leafDataRestored.keys, leafData.keys) {
		t.Errorf("Data Leaf Node keys mismatch. Got %v, want %v", leafDataRestored.keys, leafData.keys)
	}
	if len(leafDataRestored.values) != len(leafData.values) {
		t.Errorf("Data Leaf Node values length mismatch. Got %d, want %d", len(leafDataRestored.values), len(leafData.values))
	} else {
		for i := range leafData.values {
			if !bytes.Equal(leafDataRestored.values[i], leafData.values[i]) {
				t.Errorf("Data Leaf Node value mismatch at index %d. Got %s, want %s", i, leafDataRestored.values[i], leafData.values[i])
			}
		}
	}
	if leafDataRestored.next != leafData.next {
		t.Errorf("Data Leaf Node next mismatch. Got %d, want %d", leafDataRestored.next, leafData.next)
	}
	if leafDataRestored.prev != leafData.prev {
		t.Errorf("Data Leaf Node prev mismatch. Got %d, want %d", leafDataRestored.prev, leafData.prev)
	}
}

// TestSerializeDeserializeInternalNode focuses specifically on InternalNode variations.
func TestSerializeDeserializeInternalNode(t *testing.T) {
	// Internal with one key (two children)
	internalOneKey := createTestInternalNode(5, []KeyType{50}, []PageID{1, 2})
	pageDataOneKey, err := serializeNode(internalOneKey)
	if err != nil {
		t.Fatalf("Internal (1 key) serialize failed: %v", err)
	}
	nodeOneKey, err := deserializeNode(pageDataOneKey)
	if err != nil {
		t.Fatalf("Internal (1 key) deserialize failed: %v", err)
	}
	internalOneKeyRestored, _ := nodeOneKey.(*InternalNode)
	internalOneKeyRestored.setPageID(internalOneKey.pageID)
	assertNodesEqual(t, internalOneKey, internalOneKeyRestored, "Internal Node (1 key)")

	// Internal with multiple keys
	internalMultiKey := createTestInternalNode(6, []KeyType{10, 30, 50}, []PageID{1, 2, 3, 4})
	pageDataMultiKey, err := serializeNode(internalMultiKey)
	if err != nil {
		t.Fatalf("Internal (multi key) serialize failed: %v", err)
	}
	nodeMultiKey, err := deserializeNode(pageDataMultiKey)
	if err != nil {
		t.Fatalf("Internal (multi key) deserialize failed: %v", err)
	}
	internalMultiKeyRestored, _ := nodeMultiKey.(*InternalNode)
	internalMultiKeyRestored.setPageID(internalMultiKey.pageID)
	assertNodesEqual(t, internalMultiKey, internalMultiKeyRestored, "Internal Node (multi key)")
}

// TestSerializeDeserializeCorruptedData tests handling of invalid/corrupted page data.
func TestSerializeDeserializeCorruptedData(t *testing.T) {
	// 1. Invalid Node Type in Header
	pageDataInvalidType := make([]byte, PageSize)
	pageDataInvalidType[NodeTypeOffset] = 99 // Invalid type
	_, err := deserializeNode(pageDataInvalidType)
	if err == nil {
		t.Error("Expected error deserializing page with invalid node type, got nil")
	} else {
		t.Logf("Correctly got error for invalid node type: %v", err)
	}

	// 2. Corrupted Gob Data (e.g., truncated)
	leafGood := createTestLeafNode(1, []KeyType{1}, []ValueType{[]byte("a")})
	pageDataGood, _ := serializeNode(leafGood)
	// Corrupt the data by truncating the gob payload part
	pageDataCorruptGob := make([]byte, PageSize)
	copy(pageDataCorruptGob, pageDataGood)
	headerPlusPartialGob := HeaderSize + 5 // Copy only header and 5 bytes of gob
	if headerPlusPartialGob > PageSize {
		headerPlusPartialGob = PageSize
	}
	// Zero out the rest after the partial gob data
	for i := headerPlusPartialGob; i < PageSize; i++ {
		pageDataCorruptGob[i] = 0
	}
	// Try deserializing the corrupted data
	_, err = deserializeNode(pageDataCorruptGob)
	if err == nil {
		t.Error("Expected error deserializing corrupted gob data, got nil")
	} else {
		t.Logf("Correctly got error for corrupted gob data: %v", err)
	}
}
