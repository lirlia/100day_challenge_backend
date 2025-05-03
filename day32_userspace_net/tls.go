package main

import (
	"bytes"
	"crypto"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/tls"
	"encoding/binary"
	"errors"
	"fmt"
	"log"

	// Required for TCPConnection type in function signatures (placeholder)
	"github.com/songgao/water" // Required for water.Interface
)

// --- TLS Structures and Constants ---

// TLS Handshake State
type TLSHandshakeState int

const (
	TLSStateNone TLSHandshakeState = iota
	TLSStateExpectingClientHello
	TLSStateSentServerHello
	TLSStateSentCertificate
	TLSStateSentServerKeyExchange
	TLSStateSentServerHelloDone
	TLSStateExpectingClientKeyExchange // Added
	TLSStateExpectingChangeCipherSpec  // Added
	TLSStateExpectingFinished          // Added
	TLSStateHandshakeComplete          // Added
)

// TLS Record Types
const (
	TLSRecordTypeChangeCipherSpec uint8 = 20
	TLSRecordTypeAlert            uint8 = 21
	TLSRecordTypeHandshake        uint8 = 22
	TLSRecordTypeApplicationData  uint8 = 23
)

// TLS Handshake Message Types
const (
	TLSHandshakeTypeClientHello       uint8 = 1
	TLSHandshakeTypeServerHello       uint8 = 2
	TLSHandshakeTypeCertificate       uint8 = 11
	TLSHandshakeTypeServerKeyExchange uint8 = 12 // Added
	TLSHandshakeTypeServerHelloDone   uint8 = 14
	TLSHandshakeTypeClientKeyExchange uint8 = 16 // Added
	TLSHandshakeTypeFinished          uint8 = 20 // Added
	// ... other handshake types
)

// TLS Cipher Suites (Example, add more as needed)
const (
	TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256 uint16 = 0xc02f
	// Add other suites your server might hypothetically support
)

// TLS Extension Types
const (
	TLSExtensionTypeALPN uint16 = 16
	// ... other extension types
)

// TLSRecordHeader represents the TLS record layer header.
type TLSRecordHeader struct {
	Type    uint8
	Version uint16 // e.g., 0x0303 for TLS 1.2
	Length  uint16
}

const TLSRecordHeaderLength = 5

// ClientHelloInfo holds basic parsed info from ClientHello.
type ClientHelloInfo struct {
	Version            uint16
	Random             []byte
	SessionID          []byte
	CipherSuites       []uint16
	CompressionMethods []uint8  // Parsed but usually ignored
	ALPNProtocols      []string // Parsed from ALPN extension
	// rawExtensions    []byte // Store raw extensions for later use if needed
}

// parseTLSRecordHeader parses the 5-byte TLS record header.
func parseTLSRecordHeader(headerBytes []byte) (*TLSRecordHeader, error) {
	if len(headerBytes) < TLSRecordHeaderLength {
		return nil, errors.New("TLS record header too short")
	}
	header := &TLSRecordHeader{}
	header.Type = headerBytes[0]
	header.Version = binary.BigEndian.Uint16(headerBytes[1:3])
	header.Length = binary.BigEndian.Uint16(headerBytes[3:5])
	return header, nil
}

// handleTLSBufferedData processes the data in the connection's ReceiveBuffer.
func handleTLSBufferedData(ifce *water.Interface, conn *TCPConnection) {
	connKey := conn.ConnectionKey()
	log.Printf("[TLS Debug - %s] Entering handleTLSBufferedData. Buffer len: %d", connKey, conn.ReceiveBuffer.Len())
	for conn.ReceiveBuffer.Len() >= TLSRecordHeaderLength {
		log.Printf("[TLS Debug - %s] Loop start. Buffer len: %d", connKey, conn.ReceiveBuffer.Len())
		// Peek at the header without consuming it yet
		headerBytes := conn.ReceiveBuffer.Bytes()[:TLSRecordHeaderLength]
		log.Printf("[TLS Debug - %s] Peeked header bytes: %x", connKey, headerBytes)
		recordHeader, err := parseTLSRecordHeader(headerBytes)
		if err != nil {
			log.Printf("[TLS Error - %s] Error parsing TLS record header: %v. Buffer len: %d", connKey, err, conn.ReceiveBuffer.Len())
			conn.ReceiveBuffer.Reset()
			return
		}
		log.Printf("[TLS Debug - %s] Parsed Record Header: Type=%d, Version=0x%04x, Length=%d", connKey, recordHeader.Type, recordHeader.Version, recordHeader.Length)

		// Check if the full record payload is in the buffer
		fullRecordLength := TLSRecordHeaderLength + int(recordHeader.Length)
		if conn.ReceiveBuffer.Len() < fullRecordLength {
			log.Printf("[TLS Debug - %s] Partial TLS record. Need %d bytes, have %d. Waiting.", connKey, fullRecordLength, conn.ReceiveBuffer.Len())
			return // Need more data
		}

		// Consume the full record from the buffer
		log.Printf("[TLS Debug - %s] Consuming full record (%d bytes) from buffer.", connKey, fullRecordLength)
		fullRecordBytes := make([]byte, fullRecordLength)
		n, err := conn.ReceiveBuffer.Read(fullRecordBytes)
		if err != nil || n != fullRecordLength { // Should not happen if length check above is correct, but be safe
			log.Printf("[TLS Error - %s] Error consuming record from buffer: read %d bytes, err %v. Expected %d", connKey, n, err, fullRecordLength)
			conn.ReceiveBuffer.Reset()
			return
		}
		recordPayload := fullRecordBytes[TLSRecordHeaderLength:]
		log.Printf("[TLS Debug - %s] Consumed record. Payload length: %d. Remaining buffer: %d", connKey, len(recordPayload), conn.ReceiveBuffer.Len())

		// log.Printf("Processing TLS Record for %s: Type=%d, Version=0x%04x, Length=%d", connKey, recordHeader.Type, recordHeader.Version, recordHeader.Length)

		// Decrypt payload if encryption is enabled
		decryptedPayload, err := decryptRecord(conn, recordPayload, recordHeader.Type, recordHeader.Version)
		if err != nil {
			log.Printf("[TLS Error - %s] Failed to decrypt record: %v. Closing connection.", connKey, err)
			// TODO: Send Alert (decode_error or decrypt_error)
			// TODO: Close connection gracefully
			conn.ReceiveBuffer.Reset()      // Clear buffer
			delete(tcpConnections, connKey) // Remove connection (simplified closure)
			return                          // Stop processing this connection
		}
		// Use decryptedPayload for subsequent processing
		recordPayload = decryptedPayload // Replace original payload with decrypted one

		// Handle based on record type and current TLS state
		switch recordHeader.Type {
		case TLSRecordTypeHandshake:
			log.Printf("[TLS Debug - %s] Dispatching to handleTLSHandshakeRecord with decrypted payload (%d bytes).", connKey, len(recordPayload))
			handleTLSHandshakeRecord(ifce, conn, recordPayload)
		case TLSRecordTypeChangeCipherSpec:
			// CCS itself is not encrypted, but was handled before decryption call if enabled=true
			// This case might still be hit if CCS arrives *before* encryption is enabled.
			log.Printf("[TLS Info - %s] Received ChangeCipherSpec Record (Payload: %x)", connKey, recordPayload)
			if conn.TLSState == TLSStateExpectingChangeCipherSpec {
				// Here, we would normally transition the decryption state
				log.Printf("[TLS Info - %s] Processing ChangeCipherSpec. Enabling encryption for receiving. TLS State -> TLSStateExpectingFinished", connKey)
				conn.TLSState = TLSStateExpectingFinished
				conn.EncryptionEnabled = true // Enable encryption for incoming records
				conn.ClientSequenceNum = 0    // Reset sequence number for receiving
			} else {
				log.Printf("[TLS Warn - %s] Unexpected ChangeCipherSpec received in state %v", connKey, conn.TLSState)
				// Consider sending an alert?
			}
		case TLSRecordTypeAlert:
			log.Printf("[TLS Info - %s] Received Alert Record (Payload: %x)", connKey, recordPayload)
			// Handle alert, maybe close connection
		case TLSRecordTypeApplicationData:
			log.Printf("[TLS Info - %s] Received Application Data Record (Length: %d)", connKey, len(recordPayload))
			if conn.TLSState == TLSStateHandshakeComplete {
				// TODO: Decrypt Application Data payload here in the future.
				log.Printf("[TLS Info - %s] Handshake complete. Processing Application Data as HTTP (Unencrypted).", connKey)
				// Reuse handleHTTPData for now, passing the unencrypted payload.
				// NOTE: handleHTTPData currently sends a raw TCP response, not a TLS record.
				handleHTTPData(ifce, conn, recordPayload)
			} else {
				log.Printf("[TLS Warn - %s] Received Application Data before handshake complete (State: %v). Ignoring.", connKey, conn.TLSState)
			}
		default:
			log.Printf("[TLS Warn - %s] Received unknown TLS Record Type %d", recordHeader.Type, connKey)
		}
	}
	log.Printf("[TLS Debug - %s] Exiting handleTLSBufferedData. Buffer len: %d", connKey, conn.ReceiveBuffer.Len())
}

// handleTLSHandshakeRecord processes a received TLS Handshake record payload.
func handleTLSHandshakeRecord(ifce *water.Interface, conn *TCPConnection, payload []byte) {
	connKey := conn.ConnectionKey()
	log.Printf("[TLS Debug - %s] Entering handleTLSHandshakeRecord. Payload len: %d", connKey, len(payload))
	if len(payload) < 4 { // Need at least handshake type (1) + length (3)
		log.Printf("[TLS Error - %s] Handshake record payload too short (%d bytes)", connKey, len(payload))
		return
	}

	handshakeType := payload[0]
	length := uint32(payload[1])<<16 | uint32(payload[2])<<8 | uint32(payload[3])
	log.Printf("[TLS Debug - %s] Parsed Handshake Header: Type=%d, Length=%d", connKey, handshakeType, length)

	message := payload[4:]
	if uint32(len(message)) < length {
		log.Printf("[TLS Error - %s] Handshake message incomplete. Declared length %d, actual data %d", connKey, length, len(message))
		return
	}
	message = message[:length] // Ensure we only process the declared length

	// log.Printf("Processing Handshake Message for %s: Type=%d, Length=%d", connKey, handshakeType, length)

	switch handshakeType {
	case TLSHandshakeTypeClientHello:
		log.Printf("[TLS Debug - %s] Dispatching to handleClientHello.", connKey)
		if conn.TLSState == TLSStateExpectingClientHello {
			handleClientHello(ifce, conn, message)
		} else {
			log.Printf("[TLS Warn - %s] Unexpected ClientHello received in state %v", connKey, conn.TLSState)
		}
	case TLSHandshakeTypeClientKeyExchange:
		log.Printf("[TLS Info - %s] Received ClientKeyExchange Message (Length: %d)", connKey, len(message))
		if conn.TLSState == TLSStateExpectingClientKeyExchange {
			// Parse the ClientKeyExchange message to get the client's public key
			// Expected format: 1 byte length prefix, followed by the public key bytes
			if len(message) < 1 {
				log.Printf("[TLS Error - %s] ClientKeyExchange message too short (no length byte)", connKey)
				// TODO: Send Alert
				return
			}
			clientPubKeyLen := int(message[0])
			if len(message) != 1+clientPubKeyLen {
				log.Printf("[TLS Error - %s] ClientKeyExchange message length mismatch (expected 1+%d, got %d)", connKey, clientPubKeyLen, len(message))
				// TODO: Send Alert
				return
			}
			conn.ClientECDHPublicKeyBytes = make([]byte, clientPubKeyLen)
			copy(conn.ClientECDHPublicKeyBytes, message[1:])
			log.Printf("[TLS Debug - %s] Parsed Client ECDHE Public Key (%d bytes): %x", connKey, clientPubKeyLen, conn.ClientECDHPublicKeyBytes)

			// --- Key Derivation --- Start
			var err error // Declare err variable
			err = deriveKeys(conn)
			if err != nil {
				log.Printf("[TLS Error - %s] Key derivation failed: %v", connKey, err)
				// TODO: Send Alert (handshake_failure)
				return
			}
			log.Printf("[TLS Info - %s] Key derivation successful.", connKey)
			// --- Key Derivation --- End

			log.Printf("[TLS Info - %s] ClientKeyExchange processed. TLS State -> TLSStateExpectingChangeCipherSpec", connKey)

			// Original state transition:
			conn.TLSState = TLSStateExpectingChangeCipherSpec
		} else {
			log.Printf("[TLS Warn - %s] Unexpected ClientKeyExchange received in state %v", connKey, conn.TLSState)
			// Consider sending an alert?
		}
	case TLSHandshakeTypeFinished:
		log.Printf("[TLS Info - %s] Received Finished Message (Length: %d, Content/Verification Ignored)", connKey, len(message))
		if conn.TLSState == TLSStateExpectingFinished {
			// Here, we would normally verify the Finished message
			log.Printf("[TLS Info - %s] Processing Finished. TLS Handshake Potentially Complete (Verification Skipped). Triggering Server Finished soon.", connKey)
			// conn.TLSState = TLSStateHandshakeComplete // Mark handshake as complete for now -> Moved to sendServerCCSAndFinished
			// Trigger sending server ChangeCipherSpec and Finished
			sendServerCCSAndFinished(ifce, conn)
		} else {
			log.Printf("[TLS Warn - %s] Unexpected Finished received in state %v", connKey, conn.TLSState)
			// Consider sending an alert?
		}
	default:
		log.Printf("[TLS Info - %s] Unhandled Handshake Message Type %d", connKey, handshakeType)
	}
	log.Printf("[TLS Debug - %s] Exiting handleTLSHandshakeRecord.", connKey)
}

// handleClientHello parses ClientHello and sends ServerHello, Certificate, SKE, ServerHelloDone, **and then immediately CCS and Finished**.
func handleClientHello(ifce *water.Interface, conn *TCPConnection, message []byte) {
	connKey := conn.ConnectionKey()
	log.Printf("[TLS Debug - %s] Entering handleClientHello. Message len: %d", connKey, len(message))
	info, err := parseClientHello(message)
	if err != nil {
		log.Printf("[TLS Error - %s] Error parsing ClientHello: %v", connKey, err)
		// TODO: Send Alert Handshake Failure?
		return
	}

	log.Printf("[TLS Info - %s] Parsed ClientHello:", connKey)
	log.Printf("  [TLS Info - %s]   Version: 0x%04x", connKey, info.Version)
	log.Printf("  [TLS Info - %s]   Random: %x", connKey, info.Random)
	log.Printf("  [TLS Info - %s]   SessionID Length: %d", connKey, len(info.SessionID))
	log.Printf("  [TLS Info - %s]   Cipher Suites Count: %d", connKey, len(info.CipherSuites))
	// Only log a few cipher suites to avoid excessive logging
	numSuitesToShow := 5
	if len(info.CipherSuites) < numSuitesToShow {
		numSuitesToShow = len(info.CipherSuites)
	}
	log.Printf("  [TLS Info - %s]   Cipher Suites (first %d): %v", connKey, numSuitesToShow, info.CipherSuites[:numSuitesToShow])
	log.Printf("  [TLS Info - %s]   ALPN Protocols Offered: %v", connKey, info.ALPNProtocols)

	// --- Server Parameter Selection ---
	// Choose Cipher Suite (Simple example: prefer ECDHE_RSA_AES_128_GCM_SHA256 if offered)
	chosenSuite := uint16(0)
	serverSupportedSuites := []uint16{TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256} // Example
	for _, serverSuite := range serverSupportedSuites {
		for _, clientSuite := range info.CipherSuites {
			if serverSuite == clientSuite {
				chosenSuite = serverSuite
				break
			}
		}
		if chosenSuite != 0 {
			break
		}
	}
	if chosenSuite == 0 {
		log.Printf("[TLS Error - %s] No supported cipher suite found.", connKey)
		// TODO: Send Alert Handshake Failure (illegal_parameter or handshake_failure)
		return
	}
	log.Printf("[TLS Info - %s] Chosen Cipher Suite: 0x%04x", connKey, chosenSuite)

	// Choose ALPN Protocol (Prefer "h2" if offered)
	chosenALPN := "" // Default to no ALPN
	clientOfferedH2 := false
	for _, proto := range info.ALPNProtocols {
		if proto == "h2" {
			clientOfferedH2 = true
			break
		}
	}
	if clientOfferedH2 {
		chosenALPN = "h2"
		log.Printf("[TLS Info - %s] ALPN: Client offered h2, selecting h2.", connKey)
	} else {
		log.Printf("[TLS Info - %s] ALPN: Client did not offer h2, or no ALPN extension found.", connKey)
	}

	// --- Generate ServerHello ---
	serverRandom := make([]byte, 32)
	_, err = rand.Read(serverRandom) // Use crypto/rand directly
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to generate server random: %v", connKey, err)
		return
	}

	// Store randoms and chosen suite in connection state
	conn.ClientRandom = make([]byte, len(info.Random))
	copy(conn.ClientRandom, info.Random)
	conn.ServerRandom = serverRandom // Already allocated
	conn.CipherSuite = chosenSuite

	serverHelloMsg, err := buildServerHello(info.Version, serverRandom, nil, chosenSuite, 0, chosenALPN)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ServerHello message: %v", connKey, err)
		return
	}

	// --- Send ServerHello Record ---
	log.Printf("[TLS Debug - %s] Sending ServerHello record (%d bytes).", connKey, len(serverHelloMsg))
	// Use FIXED 0x0303 for the RECORD layer version, regardless of client offer
	serverHelloRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, serverHelloMsg)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ServerHello record: %v", connKey, err)
		return
	}

	// Send the TLS record containing the ServerHello message
	err = sendRawTLSRecord(ifce, conn, serverHelloRecord)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to send ServerHello record: %v", connKey, err)
		return
	}

	// Update TLS State
	conn.TLSState = TLSStateSentServerHello
	log.Printf("[TLS Info - %s] ServerHello sent. TLS State -> %v", connKey, conn.TLSState)

	// --- Send Certificate Message (Dummy) ---
	log.Printf("[TLS Debug - %s] Preparing dummy Certificate message.", connKey)
	certMsg, err := buildCertificateMessage()
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build Certificate message: %v", connKey, err)
		// Handle error appropriately, maybe close connection or send alert
		return
	}
	// Wrap certMsg in a TLS record before sending
	certRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, certMsg) // Use TLS 1.2 version
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build Certificate record: %v", connKey, err)
		return
	}
	log.Printf("[TLS Debug - %s] Sending Certificate record (%d bytes).", connKey, len(certRecord))
	err = sendRawTLSRecord(ifce, conn, certRecord)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to send Certificate record: %v", connKey, err)
		return // Certificate送信エラーならここで終了
	}
	conn.TLSState = TLSStateSentCertificate
	log.Printf("[TLS Info - %s] Certificate sent. TLS State -> %v", connKey, conn.TLSState)

	// ★★★ このログを追加 ★★★
	log.Printf("[TLS Debug - %s] Reached point before SKE generation.", connKey)

	// --- Build and Send ServerKeyExchange (ECDHE + Signature) ---
	log.Printf("[TLS Debug - %s] Preparing REAL ServerKeyExchange message.", connKey)

	// 1. Generate ECDHE keys using P-256
	curve := ecdh.P256()
	serverECDHPrivateKey, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to generate ECDHE private key: %v", connKey, err)
		return
	}
	serverECDHPublicKeyBytes := serverECDHPrivateKey.PublicKey().Bytes()
	log.Printf("[TLS Debug - %s] Generated ECDHE Public Key (%d bytes): %x", connKey, len(serverECDHPublicKeyBytes), serverECDHPublicKeyBytes)

	// Store server's private key in connection state
	conn.ServerECDHPrivateKey = serverECDHPrivateKey

	// 2. Build the SKE parameters part
	// struct {
	//    ECParameters curve_params;
	//    ECPoint      public;
	// } ServerECDHParams;
	// struct {
	//    ECCurveType curve_type;          // 1 byte (named_curve = 3)
	//    NamedCurve  namedcurve;        // 2 bytes (secp256r1 = 23)
	// } ECParameters;
	// struct {
	//    opaque point <1..2^8-1>; // length (1 byte) + point data
	// } ECPoint;
	skeParams := new(bytes.Buffer)
	skeParams.WriteByte(3)                                   // curve_type = named_curve
	binary.Write(skeParams, binary.BigEndian, uint16(23))    // namedcurve = secp256r1 (0x0017)
	skeParams.WriteByte(byte(len(serverECDHPublicKeyBytes))) // public key length
	skeParams.Write(serverECDHPublicKeyBytes)                // public key
	skeParamsBytes := skeParams.Bytes()
	log.Printf("[TLS Debug - %s] Constructed SKE Params (%d bytes): %x", connKey, len(skeParamsBytes), skeParamsBytes)

	// 3. Prepare data for signature (Client Random + Server Random + SKE Params)
	dataToSign := append(info.Random, serverRandom...)
	dataToSign = append(dataToSign, skeParamsBytes...)
	log.Printf("[TLS Debug - %s] Data to Sign (%d bytes) constructed.", connKey, len(dataToSign))

	// 4. Build the full SKE message (including signature)
	// Ensure serverCert.PrivateKey is available and is the correct type for buildServerKeyExchange
	if serverCert.PrivateKey == nil {
		log.Printf("[TLS Error - %s] Server private key is nil, cannot sign SKE.", connKey)
		return
	}
	skeMsg, err := buildServerKeyExchange(dataToSign, skeParamsBytes, serverCert.PrivateKey)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ServerKeyExchange message with signature: %v", connKey, err)
		return
	}
	log.Printf("[TLS Debug - %s] Built full SKE message (%d bytes).", connKey, len(skeMsg))

	// 5. Build and Send the SKE Record
	// Wrap skeMsg in a TLS record before sending
	skeRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, skeMsg)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ServerKeyExchange record: %v", connKey, err)
		return
	}
	log.Printf("[TLS Debug - %s] Sending REAL ServerKeyExchange record (%d bytes).", connKey, len(skeRecord))
	err = sendRawTLSRecord(ifce, conn, skeRecord)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to send ServerKeyExchange record: %v", connKey, err)
		return
	}
	conn.TLSState = TLSStateSentServerKeyExchange
	log.Printf("[TLS Info - %s] REAL ServerKeyExchange sent. TLS State -> %v", connKey, conn.TLSState)

	// --- Send ServerHelloDone Message ---
	log.Printf("[TLS Debug - %s] Preparing ServerHelloDone message.", connKey)
	helloDoneMsg, err := buildServerHelloDoneMessage()
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ServerHelloDone message: %v", connKey, err)
		return
	}
	// Wrap helloDoneMsg in a TLS record before sending
	helloDoneRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, helloDoneMsg) // Use TLS 1.2 version
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ServerHelloDone record: %v", connKey, err)
		return
	}
	log.Printf("[TLS Debug - %s] Sending ServerHelloDone record (%d bytes).", connKey, len(helloDoneRecord))
	err = sendRawTLSRecord(ifce, conn, helloDoneRecord)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to send ServerHelloDone record: %v", connKey, err)
		return
	}

	conn.TLSState = TLSStateSentServerHelloDone
	log.Printf("[TLS Info - %s] ServerHelloDone sent. TLS State -> %v", connKey, conn.TLSState)

	// Update final state after server messages are sent
	conn.TLSState = TLSStateExpectingClientKeyExchange
	log.Printf("[TLS Info - %s] Server finished sending handshake messages. Waiting for ClientKeyExchange. TLS State -> %v", connKey, conn.TLSState)

	// --- REMOVED: Immediately send Server CCS and Finished (Step 3) ---
	// sendServerCCSAndFinished(ifce, conn)

	log.Printf("[TLS Debug - %s] Exiting handleClientHello successfully.", connKey)
}

// parseClientHello parses the ClientHello handshake message body, including ALPN.
func parseClientHello(message []byte) (*ClientHelloInfo, error) {
	log.Printf("[TLS Debug] Entering parseClientHello. Message len: %d", len(message))
	if len(message) < 38 {
		return nil, fmt.Errorf("message too short (got %d, expected min 38)", len(message))
	}
	info := &ClientHelloInfo{}
	offset := 0
	info.Version = binary.BigEndian.Uint16(message[offset : offset+2])
	offset += 2
	log.Printf("[TLS Debug] Parsed Version: 0x%04x, Offset: %d", info.Version, offset)
	info.Random = make([]byte, 32)
	copy(info.Random, message[offset:offset+32])
	offset += 32
	log.Printf("[TLS Debug] Parsed Random (%d bytes), Offset: %d", len(info.Random), offset)
	sessionIDLen := int(message[offset])
	offset += 1
	log.Printf("[TLS Debug] Parsed SessionIDLen: %d, Offset: %d", sessionIDLen, offset)
	if offset+sessionIDLen > len(message) {
		return nil, fmt.Errorf("message too short for Session ID (need %d, have %d)", offset+sessionIDLen, len(message))
	}
	info.SessionID = message[offset : offset+sessionIDLen]
	offset += sessionIDLen
	log.Printf("[TLS Debug] Parsed SessionID (%d bytes), Offset: %d", len(info.SessionID), offset)
	if offset+2 > len(message) {
		return nil, fmt.Errorf("message too short for Cipher Suites Length (need %d, have %d)", offset+2, len(message))
	}
	cipherSuitesLen := int(binary.BigEndian.Uint16(message[offset : offset+2]))
	offset += 2
	log.Printf("[TLS Debug] Parsed CipherSuitesLen: %d, Offset: %d", cipherSuitesLen, offset)
	if offset+cipherSuitesLen > len(message) {
		return nil, fmt.Errorf("message too short for Cipher Suites (need %d, have %d)", offset+cipherSuitesLen, len(message))
	}
	if cipherSuitesLen%2 != 0 {
		return nil, fmt.Errorf("invalid Cipher Suites length (%d), must be even", cipherSuitesLen)
	}
	numCipherSuites := cipherSuitesLen / 2
	info.CipherSuites = make([]uint16, numCipherSuites)
	for i := 0; i < numCipherSuites; i++ {
		info.CipherSuites[i] = binary.BigEndian.Uint16(message[offset : offset+2])
		offset += 2
	}
	log.Printf("[TLS Debug] Parsed %d Cipher Suites, Offset: %d", numCipherSuites, offset)
	if offset+1 > len(message) {
		return nil, fmt.Errorf("message too short for Compression Methods Length (need %d, have %d)", offset+1, len(message))
	}
	compressionMethodsLen := int(message[offset])
	offset += 1
	log.Printf("[TLS Debug] Parsed CompressionMethodsLen: %d, Offset: %d", compressionMethodsLen, offset)
	if offset+compressionMethodsLen > len(message) {
		return nil, fmt.Errorf("message too short for Compression Methods (need %d, have %d)", offset+compressionMethodsLen, len(message))
	}
	info.CompressionMethods = message[offset : offset+compressionMethodsLen] // Store it even if ignored
	offset += compressionMethodsLen

	// Extensions Parsing
	if offset+2 <= len(message) {
		extensionsTotalLen := int(binary.BigEndian.Uint16(message[offset : offset+2]))
		offset += 2
		log.Printf("[TLS Debug] Extensions total length: %d. Current offset: %d, Message Length: %d", extensionsTotalLen, offset, len(message))
		if offset+extensionsTotalLen > len(message) {
			return nil, fmt.Errorf("message too short for declared Extensions length (need %d, have %d)", offset+extensionsTotalLen, len(message))
		}

		extensionsEnd := offset + extensionsTotalLen
		for offset < extensionsEnd {
			if offset+4 > extensionsEnd { // Need 2 bytes for type, 2 bytes for length
				return nil, fmt.Errorf("malformed extensions block: not enough data for next extension header (offset %d, end %d)", offset, extensionsEnd)
			}
			extType := binary.BigEndian.Uint16(message[offset : offset+2])
			offset += 2
			extLen := int(binary.BigEndian.Uint16(message[offset : offset+2]))
			offset += 2
			log.Printf("[TLS Debug]   Parsing Extension Type: %d, Length: %d. Current offset: %d", extType, extLen, offset)

			if offset+extLen > extensionsEnd {
				return nil, fmt.Errorf("malformed extension (Type %d): declared length %d exceeds remaining data (%d)", extType, extLen, extensionsEnd-offset)
			}
			extData := message[offset : offset+extLen]
			offset += extLen

			// Parse specific extensions (ALPN)
			if extType == TLSExtensionTypeALPN {
				log.Printf("[TLS Debug]   Found ALPN Extension (Data: %x)", extData)
				parsedALPN, err := parseALPNExtension(extData)
				if err != nil {
					log.Printf("[TLS Warn] Failed to parse ALPN extension data: %v", err)
					// Continue parsing other extensions even if ALPN is malformed?
				} else {
					info.ALPNProtocols = parsedALPN
					log.Printf("[TLS Debug]   Parsed ALPN Protocols: %v", info.ALPNProtocols)
				}
			}
			// Add parsing for other extensions if needed (SNI, etc.)
		}
		if offset != extensionsEnd {
			log.Printf("[TLS Warn] Extensions parsing finished at offset %d, but expected end was %d", offset, extensionsEnd)
			// This might indicate a malformed extensions block
		}
	} else {
		log.Printf("[TLS Debug] No Extensions present.")
	}

	log.Printf("[TLS Debug] Exiting parseClientHello successfully.")
	return info, nil
}

// parseALPNExtension parses the Application-Layer Protocol Negotiation extension data.
func parseALPNExtension(data []byte) ([]string, error) {
	if len(data) < 2 {
		return nil, errors.New("ALPN data too short for list length")
	}
	listLen := int(binary.BigEndian.Uint16(data[0:2]))
	if listLen != len(data)-2 {
		return nil, fmt.Errorf("ALPN list length mismatch: header says %d, actual data is %d bytes", listLen, len(data)-2)
	}

	var protocols []string
	offset := 2
	for offset < len(data) {
		if offset+1 > len(data) {
			return nil, errors.New("ALPN data truncated before protocol length byte")
		}
		protoLen := int(data[offset])
		offset += 1
		if offset+protoLen > len(data) {
			return nil, fmt.Errorf("ALPN data truncated: need %d bytes for protocol, only %d remain", protoLen, len(data)-offset)
		}
		protocols = append(protocols, string(data[offset:offset+protoLen]))
		offset += protoLen
	}
	return protocols, nil
}

// buildServerHello constructs the ServerHello message body.
func buildServerHello(clientVersion uint16, serverRandom []byte, sessionID []byte, cipherSuite uint16, compressionMethod uint8, alpnProtocol string) ([]byte, error) {
	if len(serverRandom) != 32 {
		return nil, errors.New("server random must be 32 bytes")
	}

	// Basic structure: Version(2) + Random(32) + SessionIDLen(1) + SessionID(var) + CipherSuite(2) + CompressionMethod(1)
	baseLength := 2 + 32 + 1 + len(sessionID) + 2 + 1
	var extensionsBytes []byte

	// Build ALPN extension if needed
	if alpnProtocol != "" {
		// ALPN Extension structure: Type(2) + Length(2) + ListLength(2) + ProtocolLen(1) + Protocol(var)
		protoLen := len(alpnProtocol)
		listLen := 1 + protoLen    // 1 byte for length + protocol bytes
		extLen := 2 + 1 + protoLen // 2 bytes for list length + 1 for proto len + proto bytes

		alpnExt := make([]byte, 4+extLen) // 4 bytes for Type + Length
		binary.BigEndian.PutUint16(alpnExt[0:2], TLSExtensionTypeALPN)
		binary.BigEndian.PutUint16(alpnExt[2:4], uint16(extLen))
		binary.BigEndian.PutUint16(alpnExt[4:6], uint16(listLen))
		alpnExt[6] = byte(protoLen)
		copy(alpnExt[7:], []byte(alpnProtocol))
		extensionsBytes = alpnExt
	}

	extensionsTotalLength := len(extensionsBytes)
	messageLength := baseLength
	if extensionsTotalLength > 0 {
		messageLength += 2 + extensionsTotalLength // 2 bytes for total extensions length field
	}

	// Handshake header: Type (1) + Length (3)
	handshakeMsg := make([]byte, 4+messageLength)
	handshakeMsg[0] = TLSHandshakeTypeServerHello
	handshakeMsg[1] = byte(messageLength >> 16)
	handshakeMsg[2] = byte(messageLength >> 8)
	handshakeMsg[3] = byte(messageLength)

	// ServerHello body
	offset := 4
	// Use client version or fixed server version (e.g., TLS 1.2 = 0x0303)
	binary.BigEndian.PutUint16(handshakeMsg[offset:offset+2], 0x0303) // Fix to TLS 1.2 for now
	offset += 2
	copy(handshakeMsg[offset:offset+32], serverRandom)
	offset += 32
	handshakeMsg[offset] = byte(len(sessionID))
	offset += 1
	if len(sessionID) > 0 {
		copy(handshakeMsg[offset:offset+len(sessionID)], sessionID)
		offset += len(sessionID)
	}
	binary.BigEndian.PutUint16(handshakeMsg[offset:offset+2], cipherSuite)
	offset += 2
	handshakeMsg[offset] = compressionMethod
	offset += 1

	// Add Extensions block if needed
	if extensionsTotalLength > 0 {
		binary.BigEndian.PutUint16(handshakeMsg[offset:offset+2], uint16(extensionsTotalLength))
		offset += 2
		copy(handshakeMsg[offset:offset+extensionsTotalLength], extensionsBytes)
		offset += extensionsTotalLength
	}

	// Final check of constructed length vs calculated offset
	if offset != len(handshakeMsg) {
		return nil, fmt.Errorf("internal error building ServerHello: length mismatch (offset %d, total %d)", offset, len(handshakeMsg))
	}

	return handshakeMsg, nil
}

// buildTLSRecord creates a TLS record byte slice.
func buildTLSRecord(recordType uint8, version uint16, payload []byte) ([]byte, error) {
	recordLen := len(payload)
	if recordLen > 1<<14 { // Max payload size for TLS records (approx)
		return nil, fmt.Errorf("TLS payload too large: %d bytes", recordLen)
	}
	record := make([]byte, TLSRecordHeaderLength+recordLen)
	record[0] = recordType
	binary.BigEndian.PutUint16(record[1:3], version) // Use provided version (e.g., from ClientHello or fixed)
	binary.BigEndian.PutUint16(record[3:5], uint16(recordLen))
	copy(record[TLSRecordHeaderLength:], payload)
	return record, nil
}

// sendRawTLSRecord sends a raw TLS record over the TCP connection.
// Assumes the record bytes are fully formed *before* potential encryption.
func sendRawTLSRecord(ifce *water.Interface, conn *TCPConnection, record []byte) error {
	// This function needs modification to handle encryption.
	// It currently sends the record as raw TCP payload.

	// 1. Parse the input record to get type, version, and plaintext payload for potential encryption
	if len(record) < TLSRecordHeaderLength {
		return errors.New("sendRawTLSRecord: input record too short for header")
	}
	// // These are from the *inner* message header (e.g., Handshake Type and its potential version)
	// innerRecordType := record[0] // Unused
	// innerVersion := binary.BigEndian.Uint16(record[1:3]) // Unused
	// plaintextPayload := record[TLSRecordHeaderLength:] // Defined later

	// Determine the *outer* record layer type based on the inner type (simple mapping for now)
	// outerRecordType := uint8(0)
	// switch innerRecordType {
	// case TLSHandshakeTypeClientHello, TLSHandshakeTypeServerHello,
	// 	TLSHandshakeTypeCertificate, TLSHandshakeTypeServerKeyExchange,
	// 	TLSHandshakeTypeServerHelloDone, TLSHandshakeTypeClientKeyExchange,
	// 	TLSHandshakeTypeFinished:
	// 	outerRecordType = TLSRecordTypeHandshake // 22
	// 	// Add cases for Alert (21), ChangeCipherSpec (20), ApplicationData (23) if needed
	// 	// For now, assume this function is only called for Handshake types from buildXXX functions
	// 	// or ApplicationData from handleHTTPData (which will be handled later)
	// 	// Let's refine this: The record passed in should already have the correct *outer* type.
	// 	// buildTLSRecord should handle this.
	// 	// Let's revert the logic slightly and rely on the passed-in record[0] for the outer type,
	// 	// but *fix* the version and ensure buildTLSRecord sets the correct outer type.
	// }

	// --- Revised Logic ---
	// Assume the 'record' passed in has the correct OUTER record type in record[0]
	// and the correct PLAINTEXT payload (e.g., a full Handshake message).
	// We need to ensure the functions calling this (buildTLSRecord) do this correctly.

	outerRecordType := record[0]                       // Use the type from the pre-built record header
	recordVersion := uint16(0x0303)                    // Use TLS 1.2 for the outer record layer
	plaintextPayload := record[TLSRecordHeaderLength:] // Payload remains the same

	// 2. Encrypt the payload if needed
	// Pass the OUTER record type and the fixed record version for AAD calculation
	payloadToSend, err := encryptRecord(conn, plaintextPayload, outerRecordType, recordVersion)
	if err != nil {
		return fmt.Errorf("failed to encrypt record payload (Type: %d): %w", outerRecordType, err)
	}

	// Log values just before building the final record header
	log.Printf("[Send Raw Debug - %s] Building final record. OuterType: %d, OuterVersion: 0x%04x, PayloadLen: %d",
		conn.ConnectionKey(), outerRecordType, recordVersion, len(payloadToSend))

	// 3. Build the final TLS record with the (potentially encrypted) payload
	// The length in the header must be the length of the *payloadToSend*
	finalRecord := make([]byte, TLSRecordHeaderLength+len(payloadToSend))
	finalRecord[0] = outerRecordType                                         // Use the correct outer type
	binary.BigEndian.PutUint16(finalRecord[1:3], recordVersion)              // Use fixed TLS 1.2 version
	binary.BigEndian.PutUint16(finalRecord[3:5], uint16(len(payloadToSend))) // Length of payloadToSend
	copy(finalRecord[TLSRecordHeaderLength:], payloadToSend)

	// 4. Send the final record over TCP
	flags := uint8(TCPFlagPSH | TCPFlagACK)
	// Use the *current* ServerNextSeq for the TCP header, as the TLS sequence number
	// is managed internally for encryption/decryption.
	// Note: sendTCPPacket updates conn.ServerNextSeq based on TCP payload length, which is fine.
	err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
		conn.ServerNextSeq, conn.ClientNextSeq, flags, finalRecord)
	if err != nil {
		// Don't increment TLS sequence number if send fails
		return fmt.Errorf("sendTCPPacket failed for TLS record (Type: %d): %w", outerRecordType, err)
	}

	// If encryption occurred, the TLS sequence number was already incremented in encryptRecord.
	// If not, it wasn't. This seems correct.
	log.Printf("[Send Raw OK - %s] Sent TLS record. Type: %d, Final Len: %d, Encrypted: %t",
		conn.ConnectionKey(), outerRecordType, len(finalRecord), len(payloadToSend) != len(plaintextPayload))
	return nil
}

func handleTLSData(ifce *water.Interface, conn *TCPConnection, payload []byte) {
	connKey := conn.ConnectionKey()
	log.Printf("[TLS Debug - %s] Entering handleTLSData with %d bytes payload.", connKey, len(payload))
	n, err := conn.ReceiveBuffer.Write(payload)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to write payload to buffer: %v", connKey, err)
		return
	}
	if n != len(payload) {
		log.Printf("[TLS Warn - %s] Short write to buffer? Wrote %d, expected %d", connKey, n, len(payload))
	}
	// Add log to check buffer length immediately after write
	log.Printf("[TLS Debug - %s] Payload written to buffer. Buffer length now: %d. Calling handleTLSBufferedData.", connKey, conn.ReceiveBuffer.Len())
	handleTLSBufferedData(ifce, conn)
	log.Printf("[TLS Debug - %s] Exiting handleTLSData.", connKey)
}

// buildCertificateMessage constructs the Certificate handshake message using the loaded certificate.
func buildCertificateMessage() ([]byte, error) {
	if len(serverCertDER) == 0 {
		return nil, errors.New("server certificate not loaded")
	}

	// Calculate lengths for the TLS Certificate message structure
	// struct {
	//    ASN.1Cert certificate_list<0..2^24-1>;
	// } Certificate;
	// where certificate_list is a sequence of:
	// struct {
	//    opaque ASN.1Cert<1..2^24-1>; // length (3 bytes) + cert data
	// }

	var certListBytes bytes.Buffer
	for _, certDER := range serverCertDER {
		certLen := uint32(len(certDER))
		if certLen == 0 || certLen >= 1<<24 {
			return nil, fmt.Errorf("invalid certificate DER length: %d", certLen)
		}
		// Write length (3 bytes)
		lenBytes := make([]byte, 3)
		lenBytes[0] = byte(certLen >> 16)
		lenBytes[1] = byte(certLen >> 8)
		lenBytes[2] = byte(certLen)
		certListBytes.Write(lenBytes)
		// Write certificate data
		certListBytes.Write(certDER)
	}

	certificateListPayload := certListBytes.Bytes()
	certificateListLength := uint32(len(certificateListPayload))

	// Message body length calculation:
	// 3 bytes for certificate_list length field + length of the list itself
	messageBodyLen := 3 + certificateListLength

	// Handshake header: Type (1) + Length (3)
	message := make([]byte, 4+messageBodyLen)
	message[0] = TLSHandshakeTypeCertificate
	message[1] = byte(messageBodyLen >> 16)
	message[2] = byte(messageBodyLen >> 8)
	message[3] = byte(messageBodyLen)

	offset := 4
	// Certificate list length field (3 bytes)
	message[offset] = byte(certificateListLength >> 16)
	message[offset+1] = byte(certificateListLength >> 8)
	message[offset+2] = byte(certificateListLength)
	offset += 3

	// Certificate list data
	copy(message[offset:], certificateListPayload)
	offset += int(certificateListLength)

	// Sanity check
	if offset != len(message) {
		return nil, fmt.Errorf("internal error building Certificate message: length mismatch (offset %d, total %d)", offset, len(message))
	}

	return message, nil
}

// buildServerHelloDoneMessage constructs the ServerHelloDone handshake message.
func buildServerHelloDoneMessage() ([]byte, error) {
	// Handshake header: Type (1) + Length (3) = 0
	message := make([]byte, 4)
	message[0] = TLSHandshakeTypeServerHelloDone
	// Length is 0, so bytes 1-3 are 0
	return message, nil
}

// buildServerKeyExchange constructs the ServerKeyExchange message.
// It includes ECDHE parameters and a signature over those parameters (and client/server randoms).
// MODIFIED: Re-enabled signature generation.
func buildServerKeyExchange(dataToSign []byte, skeParamsBytes []byte, privateKey crypto.PrivateKey) ([]byte, error) {

	// Determine signature algorithm based on key type and potentially cipher suite (hardcoded for now)
	// For TLS_ECDHE_RSA_*, we need an RSA signature.
	// TODO: Select algorithm based on cipher suite/cert type more robustly
	sigAlgo := tls.PKCS1WithSHA256 // 0x0401

	// Ensure the private key is RSA for signing
	rsaKey, ok := privateKey.(*rsa.PrivateKey)
	if !ok {
		// TODO: Handle other key types if supported (e.g., ECDSA)
		return nil, errors.New("server key is not an RSA private key, cannot sign SKE")
	}

	// Hash the data to be signed (ClientHello.random + ServerHello.random + ServerKeyExchange.params)
	// The caller (e.g., handleClientHello) must construct dataToSign correctly.
	hash := sha256.Sum256(dataToSign)

	// Sign the hash using PKCS#1 v1.5 padding
	signature, err := rsa.SignPKCS1v15(rand.Reader, rsaKey, crypto.SHA256, hash[:]) // Use crypto/rand.Reader
	if err != nil {
		return nil, fmt.Errorf("failed to sign SKE data: %w", err)
	}

	// Construct the message body: params + signature info
	body := new(bytes.Buffer)
	body.Write(skeParamsBytes)                                   // Write the ECDHE params first
	binary.Write(body, binary.BigEndian, uint16(sigAlgo))        // Write the SignatureAndHashAlgorithm
	binary.Write(body, binary.BigEndian, uint16(len(signature))) // Write signature length
	body.Write(signature)                                        // Write the signature

	messageBody := body.Bytes()
	messageBodyLen := uint32(len(messageBody))

	// Handshake header: Type (1) + Length (3)
	message := make([]byte, 4+messageBodyLen)
	message[0] = TLSHandshakeTypeServerKeyExchange
	message[1] = byte(messageBodyLen >> 16)
	message[2] = byte(messageBodyLen >> 8)
	message[3] = byte(messageBodyLen)
	copy(message[4:], messageBody)

	return message, nil
}

// --- Step 3: Send Server ChangeCipherSpec and Finished --- Function Implementation ---
func sendServerCCSAndFinished(ifce *water.Interface, conn *TCPConnection) {
	connKey := conn.ConnectionKey()
	log.Printf("[TLS Info - %s] Sending Server ChangeCipherSpec and Finished.", connKey)

	// 1. Send ChangeCipherSpec Record
	// Manually construct the record: Type(1) + Version(2) + Length(2) + Payload(1)
	ccsPayload := []byte{0x01}
	ccsRecord, err := buildTLSRecord(TLSRecordTypeChangeCipherSpec, 0x0303, ccsPayload)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ChangeCipherSpec record: %v", connKey, err)
		return
	}
	log.Printf("[TLS Debug - %s] Sending ChangeCipherSpec record (%d bytes).", connKey, len(ccsRecord))
	err = sendRawTLSRecord(ifce, conn, ccsRecord)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to send ChangeCipherSpec record: %v", connKey, err)
		// Decide how to handle this error (e.g., close connection)
		return
	}
	// Note: We don't actually change cipher state in this dummy implementation
	log.Printf("[TLS Info - %s] ChangeCipherSpec sent.", connKey)

	// Enable encryption for sending *before* sending the Finished message
	log.Printf("[TLS Info - %s] Enabling encryption for sending.", connKey)
	conn.EncryptionEnabled = true
	conn.ServerSequenceNum = 0 // Reset sequence number for sending

	// 2. Build and Send Finished Message (Dummy - will be encrypted later)
	finishedMsg, err := buildDummyFinishedMessage()
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build dummy Finished message: %v", connKey, err)
		return
	}

	finishedRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, finishedMsg) // Type=22
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build Finished record: %v", connKey, err)
		return
	}

	log.Printf("[TLS Debug - %s] Sending Finished record (%d bytes).", connKey, len(finishedRecord))
	err = sendRawTLSRecord(ifce, conn, finishedRecord)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to send Finished record: %v", connKey, err)
		return
	}

	// 3. Update State to Handshake Complete
	conn.TLSState = TLSStateHandshakeComplete
	log.Printf("[TLS Info - %s] Server Finished sent. TLS Handshake considered complete (dummy). TLS State -> %v", connKey, conn.TLSState)
}

// buildDummyFinishedMessage constructs a plausible but fake Finished message.
// Real Finished message content depends on handshake hash and master secret.
// MODIFIED: Send 0-length VerifyData to test client reaction.
func buildDummyFinishedMessage() ([]byte, error) {
	// Sending empty VerifyData (incorrect by spec, but for testing)
	dummyVerifyData := []byte{}
	messageBodyLen := uint32(len(dummyVerifyData))

	// Handshake header: Type (1) + Length (3)
	message := make([]byte, 4+messageBodyLen)
	message[0] = TLSHandshakeTypeFinished
	message[1] = byte(messageBodyLen >> 16)
	message[2] = byte(messageBodyLen >> 8)
	message[3] = byte(messageBodyLen)
	if messageBodyLen > 0 { // Only copy if length > 0
		copy(message[4:], dummyVerifyData)
	}

	return message, nil
}
