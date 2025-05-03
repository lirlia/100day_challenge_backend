package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"log"
)

// --- TLS 1.2 Key Derivation --- From RFC 5246 Section 5 ---

// P_hash(secret, seed) = HMAC_hash(secret, A(1) + seed) +
//
//	HMAC_hash(secret, A(2) + seed) +
//	HMAC_hash(secret, A(3) + seed) + ...
//
// where A(0) = seed, A(i) = HMAC_hash(secret, A(i-1))
func pHash(secret, seed []byte, resultLen int) []byte {
	// Use SHA256 directly as required by TLS 1.2 PRF
	h := hmac.New(sha256.New, secret)

	// Calculate A(1)
	h.Write(seed)
	a := h.Sum(nil)

	var output []byte
	for len(output) < resultLen {
		h.Reset()
		h.Write(a)
		h.Write(seed)
		output = append(output, h.Sum(nil)...)

		// Calculate next A(i)
		h.Reset()
		h.Write(a)
		a = h.Sum(nil)
	}

	return output[:resultLen]
}

// prf12 implements the TLS 1.2 PRF (Pseudo-Random Function).
// PRF(secret, label, seed) = P_SHA256(secret, label + seed)
func prf12(secret []byte, label string, seed []byte) []byte {
	labelBytes := []byte(label)
	fullSeed := append(labelBytes, seed...)
	// For TLS 1.2, the PRF is always based on SHA256 (RFC 5246, Section 5)
	// Master Secret is always 48 bytes.
	return pHash(secret, fullSeed, 48) // For Master Secret derivation, 48 bytes is needed
}

// prf12ForKeyBlock is a variant of prf12 specifically for deriving the key block,
// allowing specification of the required length.
func prf12ForKeyBlock(secret []byte, label string, seed []byte, length int) []byte {
	labelBytes := []byte(label)
	fullSeed := append(labelBytes, seed...)
	return pHash(secret, fullSeed, length)
}

// computePreMasterSecret calculates the ECDHE PreMasterSecret.
func computePreMasterSecret(conn *TCPConnection) ([]byte, error) {
	if conn.ServerECDHPrivateKey == nil || len(conn.ClientECDHPublicKeyBytes) == 0 {
		return nil, errors.New("missing ECDHE keys for PMS computation")
	}

	curve := conn.ServerECDHPrivateKey.Curve()
	clientPubKey, err := curve.NewPublicKey(conn.ClientECDHPublicKeyBytes)
	if err != nil {
		// This is where "point is not on curve" errors might originate if client key is invalid
		return nil, fmt.Errorf("invalid client ECDHE public key: %w", err)
	}

	pms, err := conn.ServerECDHPrivateKey.ECDH(clientPubKey)
	if err != nil {
		return nil, fmt.Errorf("ECDH computation failed: %w", err)
	}
	log.Printf("[TLS Debug - %s] Computed PreMasterSecret (%d bytes)", conn.ConnectionKey(), len(pms))
	return pms, nil
}

// deriveKeys computes the Master Secret and then derives the write keys and IVs.
func deriveKeys(conn *TCPConnection) error {
	connKey := conn.ConnectionKey()

	// 1. Compute PreMasterSecret
	pms, err := computePreMasterSecret(conn)
	if err != nil {
		return fmt.Errorf("failed to compute PMS: %w", err)
	}
	conn.PreMasterSecret = pms

	// 2. Compute MasterSecret from PMS
	// MasterSecret = PRF(PreMasterSecret, "master secret", ClientHello.random + ServerHello.random)
	seedMS := append(conn.ClientRandom, conn.ServerRandom...)
	conn.MasterSecret = prf12(conn.PreMasterSecret, "master secret", seedMS)
	log.Printf("[TLS Debug - %s] Computed MasterSecret (%d bytes)", connKey, len(conn.MasterSecret))

	// 3. Compute Key Block from MasterSecret
	// key_block = PRF(MasterSecret, "key expansion", ServerHello.random + ClientHello.random)
	seedKB := append(conn.ServerRandom, conn.ClientRandom...)

	// Determine required key block length based on cipher suite
	// For TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:
	// - Client Write Key (16) + Server Write Key (16) + Client Write IV (4) + Server Write IV (4) = 40 bytes
	keyBlockLen := 0
	clientKeyLen := 0
	serverKeyLen := 0
	clientIVLen := 0
	serverIVLen := 0

	switch conn.CipherSuite {
	case TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:
		clientKeyLen = 16                                                     // AES-128
		serverKeyLen = 16                                                     // AES-128
		clientIVLen = 4                                                       // Fixed IV part for AES-GCM
		serverIVLen = 4                                                       // Fixed IV part for AES-GCM
		keyBlockLen = clientKeyLen + serverKeyLen + clientIVLen + serverIVLen // 40 bytes
	default:
		return fmt.Errorf("unsupported cipher suite for key derivation: 0x%04x", conn.CipherSuite)
	}

	log.Printf("[TLS Debug - %s] Required Key Block Length: %d bytes", connKey, keyBlockLen)
	keyBlock := prf12ForKeyBlock(conn.MasterSecret, "key expansion", seedKB, keyBlockLen)
	log.Printf("[TLS Debug - %s] Computed Key Block (%d bytes)", connKey, len(keyBlock))

	// 4. Extract keys and IVs from Key Block
	if len(keyBlock) < keyBlockLen {
		return fmt.Errorf("key block too short: needed %d, got %d", keyBlockLen, len(keyBlock))
	}

	offset := 0
	// Note: MAC keys are not explicitly extracted for AEAD ciphers like AES-GCM
	conn.ClientWriteKey = keyBlock[offset : offset+clientKeyLen]
	offset += clientKeyLen
	conn.ServerWriteKey = keyBlock[offset : offset+serverKeyLen]
	offset += serverKeyLen
	conn.ClientWriteIV = keyBlock[offset : offset+clientIVLen]
	offset += clientIVLen
	conn.ServerWriteIV = keyBlock[offset : offset+serverIVLen]
	offset += serverIVLen

	log.Printf("[TLS Debug - %s] Extracted Keys:", connKey)
	log.Printf("  ClientWriteKey (%d bytes)", len(conn.ClientWriteKey))
	log.Printf("  ServerWriteKey (%d bytes)", len(conn.ServerWriteKey))
	log.Printf("  ClientWriteIV  (%d bytes)", len(conn.ClientWriteIV))
	log.Printf("  ServerWriteIV  (%d bytes)", len(conn.ServerWriteIV))

	return nil
}

// --- TLS 1.2 AEAD (AES-GCM) Encryption/Decryption --- RFC 5116, RFC 5246 Section 6.2.3.3 ---

const (
	aesGcmNonceLength = 12 // Standard GCM nonce size
	aesGcmTagLength   = 16 // Standard GCM tag size (GMAC)
	// TLS 1.2 uses an 8-byte explicit nonce prepended to the ciphertext.
	// The full nonce is constructed as: conn.Client/ServerWriteIV (4 bytes) + explicit_nonce (8 bytes)
	tls12GcmExplicitNonceLength = 8
)

// buildAEAD creates a new AEAD cipher instance for AES-GCM.
func buildAEAD(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, fmt.Errorf("failed to create AES cipher block: %w", err)
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("failed to create GCM AEAD: %w", err)
	}
	// Check nonce size compatibility (GCM default is 12 bytes)
	if aead.NonceSize() != aesGcmNonceLength {
		return nil, fmt.Errorf("unexpected GCM nonce size: %d", aead.NonceSize())
	}
	return aead, nil
}

// buildNonce constructs the 12-byte nonce for AES-GCM in TLS 1.2.
// Nonce = implicit_iv (4 bytes) + explicit_nonce (8 bytes)
func buildNonce(implicitIV []byte, explicitNonce []byte) ([]byte, error) {
	if len(implicitIV) != 4 {
		return nil, fmt.Errorf("invalid implicit IV length: %d", len(implicitIV))
	}
	if len(explicitNonce) != tls12GcmExplicitNonceLength {
		return nil, fmt.Errorf("invalid explicit nonce length: %d", len(explicitNonce))
	}
	nonce := make([]byte, aesGcmNonceLength)
	copy(nonce[:4], implicitIV)
	copy(nonce[4:], explicitNonce)
	return nonce, nil
}

// buildAdditionalData constructs the Additional Authenticated Data (AAD) for TLS 1.2 AEAD.
// AAD = seq_num + TLSCompressed.type + TLSCompressed.version + TLSCompressed.length
// Where length is the length of the plaintext fragment.
func buildAdditionalData(seqNum uint64, recordType uint8, version uint16, plaintextLength uint16) []byte {
	aad := make([]byte, 8+1+2+2)                            // Sequence Number (8) + Type (1) + Version (2) + Length (2)
	binary.BigEndian.PutUint64(aad[0:8], seqNum)            // Sequence Number
	aad[8] = recordType                                     // Record Type
	binary.BigEndian.PutUint16(aad[9:11], version)          // Version (e.g., 0x0303)
	binary.BigEndian.PutUint16(aad[11:13], plaintextLength) // Plaintext Length
	return aad
}

// encryptRecord encrypts a TLS record payload using AES-GCM.
// It returns the GenericAEADCipher structure: explicit_nonce (8 bytes) + encrypted_data + tag (16 bytes).
func encryptRecord(conn *TCPConnection, plaintext []byte, recordType uint8, version uint16) ([]byte, error) {
	connKey := conn.ConnectionKey()
	if !conn.EncryptionEnabled {
		log.Printf("[Encrypt - %s] Encryption not enabled, sending plaintext.", connKey)
		return plaintext, nil // Return plaintext if encryption is not yet enabled
	}

	log.Printf("[Encrypt - %s] Encrypting record. Type: %d, Plaintext Len: %d, SeqNum: %d",
		connKey, recordType, len(plaintext), conn.ServerSequenceNum)

	// 1. Get AEAD cipher instance for server writes
	aead, err := buildAEAD(conn.ServerWriteKey)
	if err != nil {
		return nil, fmt.Errorf("failed to build server AEAD for encryption: %w", err)
	}

	// 2. Build explicit nonce (current sequence number)
	explicitNonce := make([]byte, tls12GcmExplicitNonceLength)
	binary.BigEndian.PutUint64(explicitNonce, conn.ServerSequenceNum)

	// 3. Build full nonce
	nonce, err := buildNonce(conn.ServerWriteIV, explicitNonce)
	if err != nil {
		return nil, fmt.Errorf("failed to build nonce for encryption: %w", err)
	}

	// 4. Build Additional Data (AAD)
	aad := buildAdditionalData(conn.ServerSequenceNum, recordType, version, uint16(len(plaintext)))

	// 5. Encrypt using aead.Seal
	// Seal format: Seal(dst, nonce, plaintext, additionalData)
	// It appends the ciphertext (including tag) to dst.
	// We need to prepend the explicit nonce to the result according to TLS 1.2 AEAD construction.
	ciphertextWithTag := aead.Seal(nil, nonce, plaintext, aad)

	// 6. Prepend explicit nonce to form the final payload
	encryptedPayload := append(explicitNonce, ciphertextWithTag...)

	log.Printf("[Encrypt - %s] Encryption successful. Encrypted Payload Len: %d (ExplicitNonce: %d, Ciphertext+Tag: %d)",
		connKey, len(encryptedPayload), len(explicitNonce), len(ciphertextWithTag))

	// 7. Increment sequence number *after* successful encryption
	conn.ServerSequenceNum++

	return encryptedPayload, nil
}

// decryptRecord decrypts a TLS record payload using AES-GCM.
// Expects payload in GenericAEADCipher format: explicit_nonce (8 bytes) + encrypted_data + tag (16 bytes).
func decryptRecord(conn *TCPConnection, encryptedPayload []byte, recordType uint8, version uint16) ([]byte, error) {
	connKey := conn.ConnectionKey()
	if !conn.EncryptionEnabled {
		log.Printf("[Decrypt - %s] Decryption not enabled, assuming plaintext.", connKey)
		return encryptedPayload, nil // Return as is if decryption is not yet enabled
	}

	log.Printf("[Decrypt - %s] Decrypting record. Type: %d, Encrypted Len: %d, SeqNum: %d",
		connKey, recordType, len(encryptedPayload), conn.ClientSequenceNum)

	// 1. Check minimum length (explicit nonce + tag)
	minLength := tls12GcmExplicitNonceLength + aesGcmTagLength
	if len(encryptedPayload) < minLength {
		return nil, fmt.Errorf("encrypted payload too short: %d bytes (min %d)", len(encryptedPayload), minLength)
	}

	// 2. Extract explicit nonce and ciphertext+tag
	explicitNonce := encryptedPayload[:tls12GcmExplicitNonceLength]
	ciphertextWithTag := encryptedPayload[tls12GcmExplicitNonceLength:]

	// 3. Get AEAD cipher instance for client writes
	aead, err := buildAEAD(conn.ClientWriteKey)
	if err != nil {
		return nil, fmt.Errorf("failed to build client AEAD for decryption: %w", err)
	}

	// 4. Build full nonce using the *received* explicit nonce
	nonce, err := buildNonce(conn.ClientWriteIV, explicitNonce)
	if err != nil {
		return nil, fmt.Errorf("failed to build nonce for decryption: %w", err)
	}

	// 5. Build Additional Data (AAD)
	// Plaintext length = Total Encrypted Length - Explicit Nonce Length - Tag Length
	plaintextLength := len(encryptedPayload) - tls12GcmExplicitNonceLength - aesGcmTagLength
	if plaintextLength < 0 {
		// Should be caught by the minLength check above, but double-check
		return nil, fmt.Errorf("calculated plaintext length is negative (%d)", plaintextLength)
	}
	aad := buildAdditionalData(conn.ClientSequenceNum, recordType, version, uint16(plaintextLength))

	// 6. Decrypt using aead.Open
	// Open format: Open(dst, nonce, ciphertextWithTag, additionalData)
	// It appends the plaintext to dst if successful.
	plaintext, err := aead.Open(nil, nonce, ciphertextWithTag, aad)
	if err != nil {
		// Decryption failed (likely authentication failure - bad tag, incorrect key, or tampered data)
		return nil, fmt.Errorf("AEAD decryption failed: %w", err)
	}

	log.Printf("[Decrypt - %s] Decryption successful. Plaintext Len: %d", connKey, len(plaintext))

	// 7. Increment sequence number *after* successful decryption
	conn.ClientSequenceNum++

	return plaintext, nil
}
