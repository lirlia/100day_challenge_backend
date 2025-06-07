package bloom

import (
	"encoding/binary"
	"hash/fnv"
)

// BloomFilter represents a Bloom filter data structure
type BloomFilter struct {
	bitSet     []bool
	numBits    uint64
	numHash    int
	itemsAdded uint64
}

// NewBloomFilter creates a new Bloom filter
// n: expected number of items
// p: desired false positive probability
func NewBloomFilter(n uint64, p float64) *BloomFilter {
	numBits, numHash := calculateOptimalParams(n, p)
	return &BloomFilter{
		bitSet:  make([]bool, numBits),
		numBits: numBits,
		numHash: numHash,
	}
}

// Add adds an item to the Bloom filter
func (bf *BloomFilter) Add(item []byte) {
	hashes := bf.hash(item)
	for _, h := range hashes {
		bf.bitSet[h%bf.numBits] = true
	}
	bf.itemsAdded++
}

// MayContain checks if an item may be in the set
func (bf *BloomFilter) MayContain(item []byte) bool {
	hashes := bf.hash(item)
	for _, h := range hashes {
		if !bf.bitSet[h%bf.numBits] {
			return false
		}
	}
	return true
}

// hash generates multiple hash values for an item
func (bf *BloomFilter) hash(item []byte) []uint64 {
	hashes := make([]uint64, bf.numHash)

	// Use FNV-1a as the base hash function
	h := fnv.New64a()
	h.Write(item)
	h1 := h.Sum64()

	h.Reset()
	h.Write(item)
	// Add a salt to generate the second hash
	binary.Write(h, binary.LittleEndian, uint32(h1))
	h2 := h.Sum64()

	for i := 0; i < bf.numHash; i++ {
		// Combine h1 and h2 to generate multiple hashes (Kirsch-Mitzenmacher optimization)
		hashes[i] = h1 + uint64(i)*h2
	}

	return hashes
}

// NumBits returns the number of bits in the Bloom filter
func (bf *BloomFilter) NumBits() uint64 {
	return bf.numBits
}

// NumHash returns the number of hash functions used
func (bf *BloomFilter) NumHash() int {
	return bf.numHash
}

// ToBytes serializes the Bloom filter to a byte slice
func (bf *BloomFilter) ToBytes() []byte {
	// Simple serialization: just the bit set
	// In a real implementation, we'd also store numBits and numHash
	bytes := make([]byte, (bf.numBits+7)/8)
	for i, bit := range bf.bitSet {
		if bit {
			bytes[i/8] |= (1 << (i % 8))
		}
	}
	return bytes
}

// FromBytes deserializes a Bloom filter from a byte slice
func FromBytes(data []byte, numBits uint64, numHash int) *BloomFilter {
	bf := &BloomFilter{
		bitSet:  make([]bool, numBits),
		numBits: numBits,
		numHash: numHash,
	}

	for i := range bf.bitSet {
		byteIndex := i / 8
		bitIndex := i % 8
		if byteIndex < len(data) && (data[byteIndex]>>(bitIndex))&1 == 1 {
			bf.bitSet[i] = true
		}
	}
	return bf
}
