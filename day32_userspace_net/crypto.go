package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/sha256" // Needed for SHA384 if used in PRF
	"encoding/binary"
	"errors"
	"fmt"
	"log"
)

// --- TLS 1.2 PRF (Pseudo-Random Function) --- RFC 5246 Section 5 ---

// P_hash expands a secret and seed into an output string of arbitrary length.
// P_hash(secret, seed) = HMAC_hash(secret, A(1) + seed) +
//
//	HMAC_hash(secret, A(2) + seed) +
//	HMAC_hash(secret, A(3) + seed) + ...
//
// Where A(0) = seed, A(i) = HMAC_hash(secret, A(i-1)).
// TLS 1.2 uses SHA-256 for P_hash in its PRF.
func pHash(secret, seed []byte, length int) []byte {
	hmacSha256 := hmac.New(sha256.New, secret)

	var result []byte
	// Calculate A(1) = HMAC_hash(secret, A(0)) where A(0) = seed
	hmacSha256.Write(seed)
	a := hmacSha256.Sum(nil)

	// Iterate, calculating HMAC_hash(secret, A(i) + seed) and appending to result
	for len(result) < length {
		hmacSha256.Reset()
		hmacSha256.Write(a)    // A(i)
		hmacSha256.Write(seed) // seed
		result = append(result, hmacSha256.Sum(nil)...)

		// Calculate A(i+1) = HMAC_hash(secret, A(i)) for the next iteration
		hmacSha256.Reset()
		hmacSha256.Write(a)
		a = hmacSha256.Sum(nil)
	}

	return result[:length]
}

// PRF12 implements the TLS 1.2 PRF.
// PRF(secret, label, seed) = P_SHA256(secret, label + seed)
// Length is determined by the specific usage (e.g., 48 for Master Secret, 12 for Finished verify_data).
func PRF12(secret []byte, label string, seed []byte, length int) []byte {
	labelBytes := []byte(label)
	combinedSeed := append(labelBytes, seed...)
	return pHash(secret, combinedSeed, length)
}

// --- Key Derivation (TLS 1.2 using PRF) ---

// deriveKeys computes the master secret and then the client/server write keys and IVs using TLS 1.2 PRF.
func deriveKeys(conn *TCPConnection) error {
	log.Printf("%s%sStarting key derivation.%s", ColorOrange, PrefixTLS, ColorReset)

	// 1. Compute Pre-Master Secret (ECDHE)
	if conn.ServerECDHPrivateKey == nil || conn.ClientECDHPublicKeyBytes == nil {
		return errors.New("missing ECDHE keys for pre-master secret derivation")
	}
	clientPubKey, err := conn.ServerECDHPrivateKey.Curve().NewPublicKey(conn.ClientECDHPublicKeyBytes)
	if err != nil {
		return fmt.Errorf("invalid client ECDHE public key: %w", err)
	}
	preMasterSecret, err := conn.ServerECDHPrivateKey.ECDH(clientPubKey)
	if err != nil {
		return fmt.Errorf("ECDHE shared secret computation failed: %w", err)
	}
	conn.PreMasterSecret = preMasterSecret
	log.Printf("%s%sComputed Pre-Master Secret (%d bytes).%s", ColorOrange, PrefixTLS, len(preMasterSecret), ColorReset)

	// 2. Compute Master Secret using PRF12
	masterSecretLabel := "master secret"
	seed := append(conn.ClientRandom, conn.ServerRandom...)
	masterSecret := PRF12(conn.PreMasterSecret, masterSecretLabel, seed, 48) // 48 bytes for Master Secret
	conn.MasterSecret = masterSecret
	log.Printf("%s%sDerived Master Secret (%d bytes) using PRF12.%s", ColorOrange, PrefixTLS, len(masterSecret), ColorReset)

	// 3. Compute Key Block using PRF12
	keyExpansionLabel := "key expansion"
	keyBlockSeed := append(conn.ServerRandom, conn.ClientRandom...)

	// Determine required key block length based on cipher suite (AES-128-GCM)
	keyBlockLen := 0
	switch conn.CipherSuite {
	case TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:
		keyBlockLen = 16 + 16 + 4 + 4 // 2 keys (16) + 2 IVs (4) = 40 bytes
	default:
		return fmt.Errorf("unsupported cipher suite for key derivation: 0x%04x", conn.CipherSuite)
	}

	keyBlock := PRF12(conn.MasterSecret, keyExpansionLabel, keyBlockSeed, keyBlockLen)
	log.Printf("%s%sDerived Key Block (%d bytes) using PRF12.%s", ColorOrange, PrefixTLS, len(keyBlock), ColorReset)

	// 4. Assign Keys and IVs
	offset := 0
	clientKeyLen := 16
	serverKeyLen := 16
	clientIVLen := 4
	serverIVLen := 4

	if len(keyBlock) < keyBlockLen {
		return fmt.Errorf("derived key block is too short: need %d, got %d", keyBlockLen, len(keyBlock))
	}

	conn.ClientWriteKey = keyBlock[offset : offset+clientKeyLen]
	offset += clientKeyLen
	conn.ServerWriteKey = keyBlock[offset : offset+serverKeyLen]
	offset += serverKeyLen
	conn.ClientWriteIV = keyBlock[offset : offset+clientIVLen] // Implicit part
	offset += clientIVLen
	conn.ServerWriteIV = keyBlock[offset : offset+serverIVLen] // Implicit part

	log.Printf("%s%sAssigned Keys and IVs.%s", ColorOrange, PrefixTLS, ColorReset)
	log.Printf("%s%sClientWriteKey (%d): %x...%s", ColorOrange, PrefixTLS, len(conn.ClientWriteKey), conn.ClientWriteKey[:4], ColorReset)
	log.Printf("%s%sServerWriteKey (%d): %x...%s", ColorOrange, PrefixTLS, len(conn.ServerWriteKey), conn.ServerWriteKey[:4], ColorReset)
	log.Printf("%s%sClientWriteIV  (%d): %x%s", ColorOrange, PrefixTLS, len(conn.ClientWriteIV), conn.ClientWriteIV, ColorReset)
	log.Printf("%s%sServerWriteIV  (%d): %x%s", ColorOrange, PrefixTLS, len(conn.ServerWriteIV), conn.ServerWriteIV, ColorReset)

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

	// --- CCS Exception: MUST be sent plaintext ---
	if recordType == TLSRecordTypeChangeCipherSpec {
		log.Printf("%s%sCCS record type, sending plaintext unconditionally.%s", ColorOrange, PrefixTLS, ColorReset)
		// CCS payload must be {0x01}
		if len(plaintext) != 1 || plaintext[0] != 0x01 {
			// This should not happen if called correctly from sendServerCCSAndFinished
			log.Printf("%s%sEncrypt Error - %s] Invalid plaintext for CCS: %x%s", ColorOrange, PrefixTLS, connKey, plaintext, ColorReset)
			return nil, fmt.Errorf("invalid plaintext for ChangeCipherSpec: %x", plaintext)
		}
		return plaintext, nil
	}
	// --- End CCS Exception ---

	conn.Mutex.Lock() // Lock needed for checking EncryptionEnabled and accessing keys/seqnum
	defer conn.Mutex.Unlock()

	if !conn.EncryptionEnabled {
		log.Printf("%s%sEncryption not enabled, sending plaintext for type %d.%s", ColorOrange, PrefixTLS, recordType, ColorReset)
		return plaintext, nil // Return plaintext if encryption is not yet enabled
	}
	log.Printf("%s%sEncrypting record. Type: %d, Plaintext Len: %d, SeqNum: %d%s", ColorOrange, PrefixTLS, recordType, len(plaintext), conn.ServerSequenceNum, ColorReset)

	// 1. Get AEAD cipher instance for server writes
	// Need ServerWriteKey which is protected by mutex
	if conn.ServerWriteKey == nil {
		return nil, fmt.Errorf("server write key is nil for encryption")
	}
	aead, err := buildAEAD(conn.ServerWriteKey)
	if err != nil {
		return nil, fmt.Errorf("failed to build server AEAD for encryption: %w", err)
	}

	// 2. Build explicit nonce (current sequence number)
	explicitNonce := make([]byte, tls12GcmExplicitNonceLength)
	binary.BigEndian.PutUint64(explicitNonce, conn.ServerSequenceNum)

	// 3. Build full nonce (Needs ServerWriteIV)
	if conn.ServerWriteIV == nil {
		return nil, fmt.Errorf("server write IV is nil for encryption")
	}
	nonce, err := buildNonce(conn.ServerWriteIV, explicitNonce)
	if err != nil {
		return nil, fmt.Errorf("failed to build nonce for encryption: %w", err)
	}

	// 4. Build Additional Data (AAD)
	aad := buildAdditionalData(conn.ServerSequenceNum, recordType, version, uint16(len(plaintext)))

	// 5. Encrypt using aead.Seal
	ciphertextWithTag := aead.Seal(nil, nonce, plaintext, aad)

	// 6. Prepend explicit nonce to form the final payload
	encryptedPayload := append(explicitNonce, ciphertextWithTag...)

	log.Printf("%s%sEncryption successful. Encrypted Payload Len: %d (ExplicitNonce: %d, Ciphertext+Tag: %d)%s", ColorOrange, PrefixTLS, len(encryptedPayload), len(explicitNonce), len(ciphertextWithTag), ColorReset)

	// 7. Increment sequence number *after* successful encryption
	conn.ServerSequenceNum++

	return encryptedPayload, nil
}

// decryptRecord decrypts a TLS record payload using AES-GCM.
// Expects payload in GenericAEADCipher format: explicit_nonce (8 bytes) + encrypted_data + tag (16 bytes).
func decryptRecord(conn *TCPConnection, encryptedPayload []byte, recordType uint8, version uint16) ([]byte, error) {
	connKey := conn.ConnectionKey()

	// --- CCS Exception: MUST be received plaintext ---
	if recordType == TLSRecordTypeChangeCipherSpec {
		log.Printf("%s%sCCS record type, processing plaintext unconditionally.%s", ColorOrange, PrefixTLS, ColorReset)
		// CCS payload must be {0x01}
		if len(encryptedPayload) != 1 || encryptedPayload[0] != 0x01 {
			log.Printf("%s%sDecrypt Error - %s] Invalid payload for CCS: %x%s", ColorOrange, PrefixTLS, connKey, encryptedPayload, ColorReset)
			return nil, fmt.Errorf("invalid payload for ChangeCipherSpec: %x", encryptedPayload)
		}
		return encryptedPayload, nil
	}
	// --- End CCS Exception ---

	conn.Mutex.Lock() // Lock needed for checking EncryptionEnabled and accessing keys/seqnum
	defer conn.Mutex.Unlock()

	if !conn.EncryptionEnabled {
		log.Printf("%s%sDecryption not enabled, assuming plaintext for type %d.%s", ColorOrange, PrefixTLS, recordType, ColorReset)
		return encryptedPayload, nil // Return as is if decryption is not yet enabled
	}

	log.Printf("%s%sDecrypting record. Type: %d, Encrypted Len: %d, SeqNum: %d%s", ColorOrange, PrefixTLS, recordType, len(encryptedPayload), conn.ClientSequenceNum, ColorReset)

	// 1. Check minimum length (explicit nonce + tag)
	minLength := tls12GcmExplicitNonceLength + aesGcmTagLength
	if len(encryptedPayload) < minLength {
		return nil, fmt.Errorf("encrypted payload too short: %d bytes (min %d)", len(encryptedPayload), minLength)
	}

	// 2. Extract explicit nonce and ciphertext+tag
	explicitNonce := encryptedPayload[:tls12GcmExplicitNonceLength]
	ciphertextWithTag := encryptedPayload[tls12GcmExplicitNonceLength:]

	// 3. Get AEAD cipher instance for client writes
	if conn.ClientWriteKey == nil {
		return nil, fmt.Errorf("client write key is nil for decryption")
	}
	aead, err := buildAEAD(conn.ClientWriteKey)
	if err != nil {
		return nil, fmt.Errorf("failed to build client AEAD for decryption: %w", err)
	}

	// 4. Build full nonce using the *received* explicit nonce
	if conn.ClientWriteIV == nil {
		return nil, fmt.Errorf("client write IV is nil for decryption")
	}
	nonce, err := buildNonce(conn.ClientWriteIV, explicitNonce)
	if err != nil {
		return nil, fmt.Errorf("failed to build nonce for decryption: %w", err)
	}

	// 5. Build Additional Data (AAD)
	plaintextLength := len(encryptedPayload) - tls12GcmExplicitNonceLength - aesGcmTagLength
	if plaintextLength < 0 {
		return nil, fmt.Errorf("calculated plaintext length is negative (%d)", plaintextLength)
	}
	aad := buildAdditionalData(conn.ClientSequenceNum, recordType, version, uint16(plaintextLength))

	// 6. Decrypt using aead.Open
	plaintext, err := aead.Open(nil, nonce, ciphertextWithTag, aad)
	if err != nil {
		return nil, fmt.Errorf("AEAD decryption failed: %w", err)
	}

	log.Printf("%s%sDecryption successful. Plaintext Len: %d%s", ColorOrange, PrefixTLS, len(plaintext), ColorReset)

	// 7. Increment sequence number *after* successful decryption
	conn.ClientSequenceNum++

	return plaintext, nil
}

// --- Finished Message Calculation ---

// computeFinishedHash calculates the verify_data for the Finished message using TLS 1.2 PRF.
func computeFinishedHash(masterSecret []byte, finishedLabel string, handshakeHash []byte) ([]byte, error) {
	// For TLS 1.2, verify_data length is 12 bytes.
	verifyData := PRF12(masterSecret, finishedLabel, handshakeHash, 12)
	if verifyData == nil { // PRF12 itself doesn't return error, check nil output
		return nil, fmt.Errorf("failed to compute finished hash using PRF12 (returned nil)")
	}
	return verifyData, nil
}
