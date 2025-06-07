package bloom

import (
	"math"
)

// calculateOptimalParams calculates the optimal number of bits (m) and hash functions (k)
// for a given number of items (n) and desired false positive probability (p).
// m = - (n * ln(p)) / (ln(2)^2)
// k = (m / n) * ln(2)
func calculateOptimalParams(n uint64, p float64) (uint64, int) {
	if n == 0 {
		return 1, 1
	}

	ln2 := math.Log(2)
	ln2_squared := ln2 * ln2

	// Calculate optimal number of bits (m)
	m := -(float64(n) * math.Log(p)) / ln2_squared
	numBits := uint64(math.Ceil(m))

	// Calculate optimal number of hash functions (k)
	k := (float64(numBits) / float64(n)) * ln2
	numHash := int(math.Ceil(k))

	// Ensure at least 1 hash function and 1 bit
	if numHash < 1 {
		numHash = 1
	}
	if numBits < 1 {
		numBits = 1
	}

	return numBits, numHash
}
