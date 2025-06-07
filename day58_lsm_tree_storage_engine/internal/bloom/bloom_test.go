package bloom

import (
	"fmt"
	"math"
	"testing"
)

func TestBloomFilter_Basic(t *testing.T) {
	bf := NewBloomFilter(100, 0.01)

	// Add some items
	item1 := []byte("hello")
	item2 := []byte("world")
	bf.Add(item1)
	bf.Add(item2)

	// Check if they are present
	if !bf.MayContain(item1) {
		t.Errorf("Expected to find 'hello'")
	}
	if !bf.MayContain(item2) {
		t.Errorf("Expected to find 'world'")
	}

	// Check for a non-existent item
	item3 := []byte("test")
	if bf.MayContain(item3) {
		// This can happen due to false positive, but should be rare
		t.Logf("False positive for 'test'")
	}
}

func TestBloomFilter_FalsePositiveRate(t *testing.T) {
	n := uint64(1000)
	p := 0.01
	bf := NewBloomFilter(n, p)

	// Add n items
	for i := uint64(0); i < n; i++ {
		item := []byte(fmt.Sprintf("item-%d", i))
		bf.Add(item)
	}

	// Check for n other items that were not added
	falsePositives := 0
	numChecks := uint64(10000)
	for i := n; i < n+numChecks; i++ {
		item := []byte(fmt.Sprintf("item-%d", i))
		if bf.MayContain(item) {
			falsePositives++
		}
	}

	// Calculate the observed false positive rate
	observedP := float64(falsePositives) / float64(numChecks)

	// Check if the observed rate is close to the expected rate
	// We allow some tolerance
	if observedP > p*1.5 {
		t.Errorf("Observed false positive rate %.4f is much higher than expected %.4f", observedP, p)
	} else {
		t.Logf("Observed false positive rate: %.4f (Expected: <= %.4f)", observedP, p)
	}
}

func TestBloomFilter_Serialization(t *testing.T) {
	n := uint64(100)
	p := 0.01
	bf1 := NewBloomFilter(n, p)

	items := [][]byte{[]byte("a"), []byte("b"), []byte("c")}
	for _, item := range items {
		bf1.Add(item)
	}

	// Serialize
	data := bf1.ToBytes()

	// Deserialize
	bf2 := FromBytes(data, bf1.numBits, bf1.numHash)

	// Verify
	if bf1.numBits != bf2.numBits || bf1.numHash != bf2.numHash {
		t.Errorf("Mismatched parameters after deserialization")
	}

	for _, item := range items {
		if !bf2.MayContain(item) {
			t.Errorf("Item '%s' not found after deserialization", string(item))
		}
	}

	if bf2.MayContain([]byte("d")) {
		t.Logf("False positive for 'd' after deserialization")
	}
}

func TestCalculateOptimalParams(t *testing.T) {
	testCases := []struct {
		n          uint64
		p          float64
		expNumBits uint64
		expNumHash int
	}{
		{1000, 0.01, 9586, 7},
		{1000000, 0.001, 14377588, 10},
		{0, 0.1, 1, 1},
	}

	for _, tc := range testCases {
		numBits, numHash := calculateOptimalParams(tc.n, tc.p)

		// Allow some small difference due to floating point arithmetic
		if math.Abs(float64(numBits-tc.expNumBits)) > 1 {
			t.Errorf("For n=%d, p=%.3f: Expected numBits %d, got %d", tc.n, tc.p, tc.expNumBits, numBits)
		}
		if numHash != tc.expNumHash {
			t.Errorf("For n=%d, p=%.3f: Expected numHash %d, got %d", tc.n, tc.p, tc.expNumHash, numHash)
		}
	}
}
