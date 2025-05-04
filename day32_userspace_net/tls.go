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
	if isDebug {
		log.Printf("%s%sBuffer len: %d", ColorGray, PrefixTLS, conn.ReceiveBuffer.Len())
	}
	for conn.ReceiveBuffer.Len() >= TLSRecordHeaderLength {
		if isDebug {
			log.Printf("%s%sLoop start. Buffer len: %d", ColorGray, PrefixTLS, conn.ReceiveBuffer.Len())
		}
		// Peek at the header without consuming it yet
		headerBytes := conn.ReceiveBuffer.Bytes()[:TLSRecordHeaderLength]
		if isDebug {
			log.Printf("%s%sPeeked header bytes: %x", ColorGray, PrefixTLS, headerBytes)
		}
		recordHeader, err := parseTLSRecordHeader(headerBytes)
		if err != nil {
			log.Printf("%s%sError parsing TLS record header: %v. Buffer len: %d", ColorRed, PrefixError, err, conn.ReceiveBuffer.Len())
			conn.ReceiveBuffer.Reset()
			return
		}
		if isDebug {
			log.Printf("%s%sParsed Record Header: Type=%d, Version=0x%04x, Length=%d", ColorGray, PrefixTLS, recordHeader.Type, recordHeader.Version, recordHeader.Length)
		}

		// Check if the full record payload is in the buffer
		fullRecordLength := TLSRecordHeaderLength + int(recordHeader.Length)
		if conn.ReceiveBuffer.Len() < fullRecordLength {
			if isDebug {
				log.Printf("%s%sPartial TLS record. Need %d bytes, have %d. Waiting.", ColorGray, PrefixTLS, fullRecordLength, conn.ReceiveBuffer.Len())
			}
			return // Need more data
		}

		// Consume the full record from the buffer
		if isDebug {
			log.Printf("%s%sConsuming full record (%d bytes) from buffer.", ColorGray, PrefixTLS, fullRecordLength)
		}
		fullRecordBytes := make([]byte, fullRecordLength)
		n, err := conn.ReceiveBuffer.Read(fullRecordBytes)
		if err != nil || n != fullRecordLength { // Should not happen if length check above is correct, but be safe
			log.Printf("%s%sError consuming record from buffer: read %d bytes, err %v. Expected %d", ColorRed, PrefixError, n, err, fullRecordLength)
			conn.ReceiveBuffer.Reset()
			return
		}
		recordPayload := fullRecordBytes[TLSRecordHeaderLength:]
		if isDebug {
			log.Printf("%s%sConsumed record. Payload length: %d. Remaining buffer: %d", ColorGray, PrefixTLS, len(recordPayload), conn.ReceiveBuffer.Len())
		}

		// Decrypt payload if encryption is enabled
		decryptedPayload, err := decryptRecord(conn, recordPayload, recordHeader.Type, recordHeader.Version)
		if err != nil {
			log.Printf("%s%sFailed to decrypt record: %v. Closing connection.", ColorRed, PrefixError, err)
			// TODO: Send Alert (decode_error or decrypt_error)
			// TODO: Close connection gracefully
			conn.ReceiveBuffer.Reset()                   // Clear buffer
			delete(tcpConnections, conn.ConnectionKey()) // Remove connection (simplified closure)
			return                                       // Stop processing this connection
		}
		// Use decryptedPayload for subsequent processing
		recordPayload = decryptedPayload // Replace original payload with decrypted one

		// Handle based on record type and current TLS state
		switch recordHeader.Type {
		case TLSRecordTypeHandshake:
			if isDebug {
				log.Printf("%s%sDispatching to handleTLSHandshakeRecord with decrypted payload (%d bytes).", ColorGray, PrefixTLS, len(recordPayload))
			}
			handleTLSHandshakeRecord(ifce, conn, recordPayload)
		case TLSRecordTypeChangeCipherSpec:
			log.Printf("%s%sReceived ChangeCipherSpec Record (Payload: %x)%s", ColorOrange, PrefixTLS, recordPayload, ColorReset)
			if conn.TLSState == TLSStateExpectingChangeCipherSpec {
				log.Printf("%s%sProcessing ChangeCipherSpec. Enabling encryption for receiving. TLS State -> TLSStateExpectingFinished%s", ColorOrange, PrefixTLS, ColorReset)
				conn.TLSState = TLSStateExpectingFinished
				conn.EncryptionEnabled = true // Enable encryption for incoming records
				conn.ClientSequenceNum = 0    // Reset sequence number for receiving
			} else {
				log.Printf("%s%sUnexpected ChangeCipherSpec received in state %v", ColorYellow, PrefixWarn, conn.TLSState)
				// Consider sending an alert?
			}
		case TLSRecordTypeApplicationData:
			// log.Printf("%s%sReceived Application Data Record (Length: %d)", ColorOrange, PrefixInfo, len(recordPayload))
			// Check negotiated protocol AFTER handshake is complete
			conn.Mutex.Lock()
			negotiatedProto := conn.NegotiatedProtocol
			tlsState := conn.TLSState
			conn.Mutex.Unlock()

			if tlsState == TLSStateHandshakeComplete {
				if negotiatedProto == "h2" {
					// log.Printf("%s%sHandshake complete. Dispatching %d bytes to HTTP/2 handler.", ColorOrange, PrefixInfo, len(recordPayload))
					// Initialize H2 buffer if it's the first AppData for H2
					// No longer needed here as handleHTTP2Data initializes on first use
					handleHTTP2Data(conn, recordPayload) // Pass conn and the decrypted payload

				} else {
					log.Printf("%s%sHandshake complete. Dispatching %d bytes to HTTP/1.1 handler.%s", ColorOrange, PrefixTLS, len(recordPayload), ColorReset)
					handleHTTPData(ifce, conn, recordPayload) // Existing function for HTTP/1.1
				}
			} else {
				log.Printf("%s%sReceived Application Data before handshake complete (State: %v). Ignoring.", ColorYellow, PrefixWarn, tlsState)
			}
		default:
			// log.Printf("%s%sReceived unknown TLS Record Type %d", ColorYellow, PrefixWarn, recordHeader.Type)
		}
	}
	if isDebug {
		log.Printf("%s%sExiting handleTLSBufferedData. Buffer len: %d", ColorGray, PrefixTLS, conn.ReceiveBuffer.Len())
	}
}

// handleTLSHandshakeRecord processes a received TLS Handshake record payload.
func handleTLSHandshakeRecord(ifce *water.Interface, conn *TCPConnection, payload []byte) {
	if isDebug {
		log.Printf("%s%sEntering handleTLSHandshakeRecord. Payload len: %d", ColorGray, PrefixTLS, len(payload))
	}
	if len(payload) < 4 { // Need at least handshake type (1) + length (3)
		log.Printf("%s%sHandshake record payload too short (%d bytes)", ColorRed, PrefixError, len(payload))
		return
	}

	handshakeType := payload[0]
	length := uint32(payload[1])<<16 | uint32(payload[2])<<8 | uint32(payload[3])
	if isDebug {
		log.Printf("%s%sParsed Handshake Header: Type=%d, Length=%d", ColorGray, PrefixTLS, handshakeType, length)
	}

	// Record the raw handshake message (Type(1) + Length(3) + Body(length))
	fullHandshakeMessage := payload[:4+length]
	conn.Mutex.Lock()
	conn.HandshakeMessages.Write(fullHandshakeMessage)
	conn.Mutex.Unlock()
	if isDebug {
		log.Printf("%s%sAdded Received Handshake Msg Type %d (%d bytes). Total len: %d", ColorGray, PrefixTLS, handshakeType, len(fullHandshakeMessage), conn.HandshakeMessages.Len())
	}

	message := payload[4:]
	if uint32(len(message)) < length {
		log.Printf("%s%sHandshake message incomplete. Declared length %d, actual data %d", ColorRed, PrefixError, length, len(message))
		return
	}
	message = message[:length] // Ensure we only process the declared length

	switch handshakeType {
	case TLSHandshakeTypeClientHello:
		if isDebug {
			log.Printf("%s%sDispatching to handleClientHello.", ColorGray, PrefixTLS)
		}
		if conn.TLSState == TLSStateExpectingClientHello {
			handleClientHello(ifce, conn, message)
		} else {
			log.Printf("%s%sUnexpected ClientHello received in state %v", ColorYellow, PrefixWarn, conn.TLSState)
		}
	case TLSHandshakeTypeClientKeyExchange:
		log.Printf("%s%sReceived ClientKeyExchange Message (Length: %d)%s", ColorOrange, PrefixTLS, len(message), ColorReset)
		if conn.TLSState == TLSStateExpectingClientKeyExchange {
			// Parse the ClientKeyExchange message to get the client's public key
			if len(message) < 1 {
				log.Printf("%s%sClientKeyExchange message too short (no length byte)", ColorRed, PrefixError)
				// TODO: Send Alert
				return
			}
			clientPubKeyLen := int(message[0])
			if len(message) != 1+clientPubKeyLen {
				log.Printf("%s%sClientKeyExchange message length mismatch (expected 1+%d, got %d)", ColorRed, PrefixError, clientPubKeyLen, len(message))
				// TODO: Send Alert
				return
			}
			conn.ClientECDHPublicKeyBytes = make([]byte, clientPubKeyLen)
			copy(conn.ClientECDHPublicKeyBytes, message[1:])
			if isDebug {
				log.Printf("%s%sParsed Client ECDHE Public Key (%d bytes): %x", ColorGray, PrefixTLS, clientPubKeyLen, conn.ClientECDHPublicKeyBytes)
			}

			// --- Key Derivation --- Start
			err := deriveKeys(conn)
			if err != nil {
				log.Printf("%s%sKey derivation failed: %v", ColorRed, PrefixError, err)
				// TODO: Send Alert (handshake_failure)
				return
			}
			log.Printf("%s%sKey derivation successful.%s", ColorOrange, PrefixTLS, ColorReset)
			// --- Key Derivation --- End

			log.Printf("%s%sClientKeyExchange processed. TLS State -> TLSStateExpectingChangeCipherSpec%s", ColorOrange, PrefixTLS, ColorReset)

			conn.TLSState = TLSStateExpectingChangeCipherSpec
		} else {
			log.Printf("%s%sUnexpected ClientKeyExchange received in state %v", ColorYellow, PrefixWarn, conn.TLSState)
		}
	case TLSHandshakeTypeFinished:
		log.Printf("%s%sReceived Finished Message (Length: %d)%s", ColorOrange, PrefixTLS, len(message), ColorReset)
		if conn.TLSState == TLSStateExpectingFinished {
			// Verify the Finished message
			conn.Mutex.Lock() // Lock for reading handshake messages and master secret
			currentHandshakeBytes := conn.HandshakeMessages.Bytes()
			if len(currentHandshakeBytes) < len(fullHandshakeMessage) { // Sanity check
				conn.Mutex.Unlock()
				log.Printf("%s%sHandshake buffer inconsistency during Finished verification.", ColorRed, PrefixError)
				// TODO: Send Alert
				return
			}
			hshakeMessagesForClientVerify := currentHandshakeBytes[:len(currentHandshakeBytes)-len(fullHandshakeMessage)]
			hshakeHash := sha256.Sum256(hshakeMessagesForClientVerify)
			if isDebug {
				log.Printf("%s%sCalculated Handshake Hash for Client Verify (%d bytes msgs): %x", ColorGray, PrefixTLS, len(hshakeMessagesForClientVerify), hshakeHash[:])
			}

			// Compute expected client verify_data
			expectedClientVerifyData, err := computeFinishedHash(conn.MasterSecret, "client finished", hshakeHash[:])
			if err != nil {
				conn.Mutex.Unlock()
				log.Printf("%s%sFailed to compute expected client Finished verify_data: %v", ColorRed, PrefixError, err)
				// TODO: Send Alert (handshake_failure)
				return
			}
			if isDebug {
				log.Printf("%s%sComputed Expected Client Verify Data (%d bytes): %x", ColorGray, PrefixTLS, len(expectedClientVerifyData), expectedClientVerifyData)
			}
			conn.Mutex.Unlock() // Unlock after reading state

			// Extract received verify_data (message = payload[4:4+length])
			receivedVerifyData := message
			if isDebug {
				log.Printf("%s%sReceived Client Verify Data (%d bytes): %x", ColorGray, PrefixTLS, len(receivedVerifyData), receivedVerifyData)
			}

			// Compare expected and received verify_data
			if !bytes.Equal(expectedClientVerifyData, receivedVerifyData) {
				log.Printf("%s%sClient Finished verification failed! Hash mismatch.", ColorRed, PrefixError)
				// TODO: Send Alert (decrypt_error or handshake_failure)
				// TODO: Close connection
				return
			}

			log.Printf("%s%sClient Finished verification successful.%s", ColorOrange, PrefixTLS, ColorReset)

			// If verification is successful, proceed to send server CCS and Finished
			if isDebug {
				log.Printf("%s%sClient Finished verified. Sending Server CCS & Finished.", ColorGray, PrefixTLS)
			}
			sendServerCCSAndFinished(ifce, conn)
		} else {
			log.Printf("%s%sUnexpected Finished received in state %v", ColorYellow, PrefixWarn, conn.TLSState)
		}
	default:
		log.Printf("%s%sUnhandled Handshake Message Type %d", ColorYellow, PrefixWarn, handshakeType)
	}
	if isDebug {
		log.Printf("%s%sExiting handleTLSHandshakeRecord.", ColorGray, PrefixTLS)
	}
}

// handleClientHello parses ClientHello and sends ServerHello, Certificate, SKE, ServerHelloDone.
func handleClientHello(ifce *water.Interface, conn *TCPConnection, message []byte) {
	if isDebug {
		log.Printf("%s%sEntering handleClientHello. Message len: %d", ColorGray, PrefixTLS, len(message))
	}
	info, err := parseClientHello(message)
	if err != nil {
		log.Printf("%s%sError parsing ClientHello: %v", ColorRed, PrefixError, err)
		// TODO: Send Alert Handshake Failure?
		return
	}

	log.Printf("%s%sParsed ClientHello:%s", ColorOrange, PrefixTLS, ColorReset)
	log.Printf("%s%sVersion: 0x%04x%s", ColorOrange, PrefixTLS, info.Version, ColorReset)
	log.Printf("%s%sSessionID Length: %d%s", ColorOrange, PrefixTLS, len(info.SessionID), ColorReset)
	log.Printf("%s%sCipher Suites Count: %d%s", ColorOrange, PrefixTLS, len(info.CipherSuites), ColorReset)
	// Only log a few cipher suites to avoid excessive logging
	numSuitesToShow := 5
	if len(info.CipherSuites) < numSuitesToShow {
		numSuitesToShow = len(info.CipherSuites)
	}
	log.Printf("%s%sCipher Suites (first %d): %v%s", ColorOrange, PrefixTLS, numSuitesToShow, info.CipherSuites[:numSuitesToShow], ColorReset)
	log.Printf("%s%sALPN Protocols Offered: %v%s", ColorOrange, PrefixTLS, info.ALPNProtocols, ColorReset)

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
		log.Printf("%s%sNo supported cipher suite found.", ColorRed, PrefixError)
		// TODO: Send Alert Handshake Failure (illegal_parameter or handshake_failure)
		return
	}
	log.Printf("%s%sChosen Cipher Suite: 0x%04x%s", ColorOrange, PrefixTLS, chosenSuite, ColorReset)

	// Choose ALPN Protocol
	chosenALPN := "" // Default to HTTP/1.1 (no ALPN response)
	clientOfferedH2 := false
	for _, proto := range info.ALPNProtocols {
		if proto == "h2" {
			clientOfferedH2 = true
			break
		}
	}

	if clientOfferedH2 {
		// Server supports and prefers H2 when offered
		chosenALPN = "h2"
		conn.NegotiatedProtocol = "h2"
		log.Printf("%s%sALPN: Client offered 'h2', server selected 'h2'.%s", ColorOrange, PrefixTLS, ColorReset)
	} else if len(info.ALPNProtocols) > 0 {
		log.Printf("%s%sALPN: Client offered %v, but not 'h2'. Server selects no protocol (implies HTTP/1.1).%s", ColorOrange, PrefixTLS, info.ALPNProtocols, ColorReset)
		conn.NegotiatedProtocol = "" // Explicitly set to empty for non-h2 offers
	} else {
		log.Printf("%s%sALPN: No ALPN extension offered by client.%s", ColorOrange, PrefixTLS, ColorReset)
		conn.NegotiatedProtocol = "" // Explicitly set to empty
	}

	// --- Generate ServerHello ---
	serverRandom := make([]byte, 32)
	_, err = rand.Read(serverRandom) // Use crypto/rand directly
	if err != nil {
		log.Printf("%s%sFailed to generate server random: %v", ColorRed, PrefixError, err)
		return
	}

	// Store randoms and chosen suite in connection state
	conn.ClientRandom = make([]byte, len(info.Random))
	copy(conn.ClientRandom, info.Random)
	conn.ServerRandom = serverRandom // Already allocated
	conn.CipherSuite = chosenSuite

	serverHelloMsg, err := buildServerHello(info.Version, serverRandom, nil, chosenSuite, 0, chosenALPN)
	if err != nil {
		log.Printf("%s%sFailed to build ServerHello message: %v", ColorRed, PrefixError, err)
		return
	}

	// --- Send ServerHello Record ---
	if isDebug {
		log.Printf("%s%sSending ServerHello record (%d bytes).", ColorGray, PrefixTLS, len(serverHelloMsg))
	}
	serverHelloRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, serverHelloMsg)
	if err != nil {
		log.Printf("%s%sFailed to build ServerHello record: %v", ColorRed, PrefixError, err)
		return
	}

	// Record the handshake message BEFORE sending
	conn.Mutex.Lock()
	conn.HandshakeMessages.Write(serverHelloMsg)
	conn.Mutex.Unlock()
	if isDebug {
		log.Printf("%s%sAdded ServerHello (%d bytes). Total len: %d", ColorGray, PrefixTLS, len(serverHelloMsg), conn.HandshakeMessages.Len())
	}

	// Send the TLS record containing the ServerHello message
	sentBytes, err := sendRawTLSRecord(ifce, conn, serverHelloRecord)
	if err != nil {
		log.Printf("%s%sFailed to send ServerHello record: %v", ColorRed, PrefixError, err)
		return
	}
	// Update ServerNextSeq based on sent payload bytes (TUN mode)
	conn.Mutex.Lock()
	conn.ServerNextSeq += uint32(sentBytes)
	if isDebug {
		log.Printf("%s%sAfter ServerHello: ServerNextSeq = %d (added %d)", ColorGray, PrefixTLS, conn.ServerNextSeq, sentBytes)
	}
	conn.Mutex.Unlock()

	// Update TLS State
	conn.TLSState = TLSStateSentServerHello
	log.Printf("%s%sServerHello sent. TLS State -> %v%s", ColorOrange, PrefixTLS, conn.TLSState, ColorReset)

	// --- Send Certificate Message (Dummy) ---
	if isDebug {
		log.Printf("%s%sPreparing dummy Certificate message.", ColorGray, PrefixTLS)
	}
	certMsg, err := buildCertificateMessage()
	if err != nil {
		log.Printf("%s%sFailed to build Certificate message: %v", ColorRed, PrefixError, err)
		return
	}
	certRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, certMsg)
	if err != nil {
		log.Printf("%s%sFailed to build Certificate record: %v", ColorRed, PrefixError, err)
		return
	}
	if isDebug {
		log.Printf("%s%sSending Certificate record (%d bytes).", ColorGray, PrefixTLS, len(certRecord))
	}

	// Record the handshake message BEFORE sending
	conn.Mutex.Lock()
	conn.HandshakeMessages.Write(certMsg)
	conn.Mutex.Unlock()
	if isDebug {
		log.Printf("%s%sAdded Certificate (%d bytes). Total len: %d", ColorGray, PrefixTLS, len(certMsg), conn.HandshakeMessages.Len())
	}

	sentBytes, err = sendRawTLSRecord(ifce, conn, certRecord)
	if err != nil {
		log.Printf("%s%sFailed to send Certificate record: %v", ColorRed, PrefixError, err)
		return // Certificate送信エラーならここで終了
	}
	// Update ServerNextSeq based on sent payload bytes (TUN mode)
	conn.Mutex.Lock()
	conn.ServerNextSeq += uint32(sentBytes)
	if isDebug {
		log.Printf("%s%sAfter Certificate: ServerNextSeq = %d (added %d)", ColorGray, PrefixTLS, conn.ServerNextSeq, sentBytes)
	}
	conn.Mutex.Unlock()

	conn.TLSState = TLSStateSentCertificate
	log.Printf("%s%sCertificate sent. TLS State -> %v%s", ColorOrange, PrefixTLS, conn.TLSState, ColorReset)

	if isDebug {
		log.Printf("%s%sReached point before SKE generation.", ColorGray, PrefixTLS)
	}

	// --- Build and Send ServerKeyExchange (ECDHE + Signature) ---
	if isDebug {
		log.Printf("%s%sPreparing REAL ServerKeyExchange message.", ColorGray, PrefixTLS)
	}

	// 1. Generate ECDHE keys using P-256
	curve := ecdh.P256()
	serverECDHPrivateKey, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		log.Printf("%s%sFailed to generate ECDHE private key: %v", ColorRed, PrefixError, err)
		return
	}
	serverECDHPublicKeyBytes := serverECDHPrivateKey.PublicKey().Bytes()
	if isDebug {
		log.Printf("%s%sGenerated ECDHE Public Key (%d bytes): %x", ColorGray, PrefixTLS, len(serverECDHPublicKeyBytes), serverECDHPublicKeyBytes)
	}

	// Store server's private key in connection state
	conn.ServerECDHPrivateKey = serverECDHPrivateKey

	// 2. Build the SKE parameters part
	skeParams := new(bytes.Buffer)
	skeParams.WriteByte(3)
	binary.Write(skeParams, binary.BigEndian, uint16(23))
	skeParams.WriteByte(byte(len(serverECDHPublicKeyBytes)))
	skeParams.Write(serverECDHPublicKeyBytes)
	skeParamsBytes := skeParams.Bytes()
	if isDebug {
		log.Printf("%s%sConstructed SKE Params (%d bytes): %x", ColorGray, PrefixTLS, len(skeParamsBytes), skeParamsBytes)
	}

	// 3. Prepare data for signature (Client Random + Server Random + SKE Params)
	dataToSign := append(info.Random, serverRandom...)
	dataToSign = append(dataToSign, skeParamsBytes...)
	if isDebug {
		log.Printf("%s%sData to Sign (%d bytes) constructed.", ColorGray, PrefixTLS, len(dataToSign))
	}

	// 4. Build the full SKE message (including signature)
	if serverCert.PrivateKey == nil {
		log.Printf("%s%sServer private key is nil, cannot sign SKE.", ColorRed, PrefixError)
		return
	}
	skeMsg, err := buildServerKeyExchange(dataToSign, skeParamsBytes, serverCert.PrivateKey)
	if err != nil {
		log.Printf("%s%sFailed to build ServerKeyExchange message with signature: %v", ColorRed, PrefixError, err)
		return
	}
	if isDebug {
		log.Printf("%s%sBuilt full SKE message (%d bytes).", ColorGray, PrefixTLS, len(skeMsg))
	}

	// 5. Build and Send the SKE Record
	skeRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, skeMsg)
	if err != nil {
		log.Printf("%s%sFailed to build ServerKeyExchange record: %v", ColorRed, PrefixError, err)
		return
	}

	// Record the handshake message BEFORE sending
	conn.Mutex.Lock()
	conn.HandshakeMessages.Write(skeMsg)
	conn.Mutex.Unlock()
	if isDebug {
		log.Printf("%s%sAdded ServerKeyExchange (%d bytes). Total len: %d", ColorGray, PrefixTLS, len(skeMsg), conn.HandshakeMessages.Len())
	}

	if isDebug {
		log.Printf("%s%sSending REAL ServerKeyExchange record (%d bytes).", ColorGray, PrefixTLS, len(skeRecord))
	}
	sentBytes, err = sendRawTLSRecord(ifce, conn, skeRecord)
	if err != nil {
		log.Printf("%s%sFailed to send ServerKeyExchange record: %v", ColorRed, PrefixError, err)
		return
	}
	// Update ServerNextSeq based on sent payload bytes (TUN mode)
	conn.Mutex.Lock()
	conn.ServerNextSeq += uint32(sentBytes)
	if isDebug {
		log.Printf("%s%sAfter SKE: ServerNextSeq = %d (added %d)", ColorGray, PrefixTLS, conn.ServerNextSeq, sentBytes)
	}
	conn.Mutex.Unlock()

	conn.TLSState = TLSStateSentServerKeyExchange
	log.Printf("%s%sREAL ServerKeyExchange sent. TLS State -> %v%s", ColorOrange, PrefixTLS, conn.TLSState, ColorReset)

	// --- Send ServerHelloDone Message ---
	if isDebug {
		log.Printf("%s%sPreparing ServerHelloDone message.", ColorGray, PrefixTLS)
	}
	helloDoneMsg, err := buildServerHelloDoneMessage()
	if err != nil {
		log.Printf("%s%sFailed to build ServerHelloDone message: %v", ColorRed, PrefixError, err)
		return
	}
	helloDoneRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, helloDoneMsg)
	if err != nil {
		log.Printf("%s%sFailed to build ServerHelloDone record: %v", ColorRed, PrefixError, err)
		return
	}

	// Record the handshake message BEFORE sending
	conn.Mutex.Lock()
	conn.HandshakeMessages.Write(helloDoneMsg)
	conn.Mutex.Unlock()
	if isDebug {
		log.Printf("%s%sAdded ServerHelloDone (%d bytes). Total len: %d", ColorGray, PrefixTLS, len(helloDoneMsg), conn.HandshakeMessages.Len())
	}

	if isDebug {
		log.Printf("%s%sSending ServerHelloDone record (%d bytes).", ColorGray, PrefixTLS, len(helloDoneRecord))
	}
	sentBytes, err = sendRawTLSRecord(ifce, conn, helloDoneRecord)
	if err != nil {
		log.Printf("%s%sFailed to send ServerHelloDone record: %v", ColorRed, PrefixError, err)
		return
	}
	// Update ServerNextSeq based on sent payload bytes (TUN mode)
	conn.Mutex.Lock()
	conn.ServerNextSeq += uint32(sentBytes)
	if isDebug {
		log.Printf("%s%sAfter ServerHelloDone: ServerNextSeq = %d (added %d)", ColorGray, PrefixTLS, conn.ServerNextSeq, sentBytes)
	}
	conn.Mutex.Unlock()

	conn.TLSState = TLSStateSentServerHelloDone
	log.Printf("%s%sServerHelloDone sent. TLS State -> %v%s", ColorOrange, PrefixTLS, conn.TLSState, ColorReset)

	// Update final state after server messages are sent
	conn.TLSState = TLSStateExpectingClientKeyExchange
	log.Printf("%s%sServer finished sending handshake messages. Waiting for ClientKeyExchange. TLS State -> %v%s", ColorOrange, PrefixTLS, conn.TLSState, ColorReset)

	if isDebug {
		log.Printf("%s%sExiting handleClientHello successfully.", ColorGray, PrefixTLS)
	}
}

// parseClientHello parses the ClientHello handshake message body, including ALPN.
func parseClientHello(message []byte) (*ClientHelloInfo, error) {
	if isDebug {
		log.Printf("%s%sEntering parseClientHello. Message len: %d", ColorGray, PrefixTLS, len(message))
	}
	if len(message) < 38 {
		return nil, fmt.Errorf("message too short (got %d, expected min 38)", len(message))
	}
	info := &ClientHelloInfo{}
	offset := 0
	info.Version = binary.BigEndian.Uint16(message[offset : offset+2])
	offset += 2
	if isDebug {
		log.Printf("%s%sParsed Version: 0x%04x, Offset: %d", ColorGray, PrefixTLS, info.Version, offset)
	}
	info.Random = make([]byte, 32)
	copy(info.Random, message[offset:offset+32])
	offset += 32
	if isDebug {
		log.Printf("%s%sParsed Random (%d bytes), Offset: %d", ColorGray, PrefixTLS, len(info.Random), offset)
	}
	sessionIDLen := int(message[offset])
	offset += 1
	if isDebug {
		log.Printf("%s%sParsed SessionIDLen: %d, Offset: %d", ColorGray, PrefixTLS, sessionIDLen, offset)
	}
	if offset+sessionIDLen > len(message) {
		return nil, fmt.Errorf("message too short for Session ID (need %d, have %d)", offset+sessionIDLen, len(message))
	}
	info.SessionID = message[offset : offset+sessionIDLen]
	offset += sessionIDLen
	if isDebug {
		log.Printf("%s%sParsed SessionID (%d bytes), Offset: %d", ColorGray, PrefixTLS, len(info.SessionID), offset)
	}
	if offset+2 > len(message) {
		return nil, fmt.Errorf("message too short for Cipher Suites Length (need %d, have %d)", offset+2, len(message))
	}
	cipherSuitesLen := int(binary.BigEndian.Uint16(message[offset : offset+2]))
	offset += 2
	if isDebug {
		log.Printf("%s%sParsed CipherSuitesLen: %d, Offset: %d", ColorGray, PrefixTLS, cipherSuitesLen, offset)
	}
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
	if isDebug {
		log.Printf("%s%sParsed %d Cipher Suites, Offset: %d", ColorGray, PrefixTLS, numCipherSuites, offset)
	}
	if offset+1 > len(message) {
		return nil, fmt.Errorf("message too short for Compression Methods Length (need %d, have %d)", offset+1, len(message))
	}
	compressionMethodsLen := int(message[offset])
	offset += 1
	if isDebug {
		log.Printf("%s%sParsed CompressionMethodsLen: %d, Offset: %d", ColorGray, PrefixTLS, compressionMethodsLen, offset)
	}
	if offset+compressionMethodsLen > len(message) {
		return nil, fmt.Errorf("message too short for Compression Methods (need %d, have %d)", offset+compressionMethodsLen, len(message))
	}
	info.CompressionMethods = message[offset : offset+compressionMethodsLen]
	offset += compressionMethodsLen

	// Extensions Parsing
	if offset+2 <= len(message) {
		extensionsTotalLen := int(binary.BigEndian.Uint16(message[offset : offset+2]))
		offset += 2
		if isDebug {
			log.Printf("%s%sExtensions total length: %d. Current offset: %d, Message Length: %d", ColorGray, PrefixTLS, extensionsTotalLen, offset, len(message))
		}
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
			if isDebug {
				log.Printf("%s%s   Parsing Extension Type: %d, Length: %d. Current offset: %d", ColorGray, PrefixTLS, extType, extLen, offset)
			}

			if offset+extLen > extensionsEnd {
				return nil, fmt.Errorf("malformed extension (Type %d): declared length %d exceeds remaining data (%d)", extType, extLen, extensionsEnd-offset)
			}
			extData := message[offset : offset+extLen]
			offset += extLen

			// Parse specific extensions (ALPN)
			if extType == TLSExtensionTypeALPN {
				if isDebug {
					log.Printf("%s%s   Found ALPN Extension (Data: %x)", ColorGray, PrefixTLS, extData)
				}
				parsedALPN, err := parseALPNExtension(extData)
				if err != nil {
					log.Printf("%s%sFailed to parse ALPN extension data: %v", ColorYellow, PrefixWarn, err)
				} else {
					info.ALPNProtocols = parsedALPN
					if isDebug {
						log.Printf("%s%s   Parsed ALPN Protocols: %v", ColorGray, PrefixTLS, info.ALPNProtocols)
					}
				}
			}
		}
		if offset != extensionsEnd {
			log.Printf("%s%sExtensions parsing finished at offset %d, but expected end was %d", ColorYellow, PrefixWarn, offset, extensionsEnd)
		}
	} else {
		if isDebug {
			log.Printf("%s%sNo Extensions present.", ColorGray, PrefixTLS)
		}
	}

	if isDebug {
		log.Printf("%s%sExiting parseClientHello successfully.", ColorGray, PrefixTLS)
	}
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

	baseLength := 2 + 32 + 1 + len(sessionID) + 2 + 1
	var extensionsBytes []byte

	if alpnProtocol != "" {
		protoLen := len(alpnProtocol)
		listLen := 1 + protoLen
		extLen := 2 + listLen

		alpnExt := make([]byte, 4+extLen)
		binary.BigEndian.PutUint16(alpnExt[0:2], TLSExtensionTypeALPN)
		binary.BigEndian.PutUint16(alpnExt[2:4], uint16(extLen))
		binary.BigEndian.PutUint16(alpnExt[4:6], uint16(listLen))
		alpnExt[6] = byte(protoLen)
		copy(alpnExt[7:], []byte(alpnProtocol))
		extensionsBytes = alpnExt
		if isDebug {
			log.Printf("%s%sAdded ALPN extension for protocol: %s (ExtBytes: %x)", ColorGray, PrefixTLS, alpnProtocol, extensionsBytes)
		}
	}

	extensionsTotalLength := len(extensionsBytes)
	messageLength := baseLength
	if extensionsTotalLength > 0 {
		messageLength += 2 + extensionsTotalLength
	}

	handshakeMsg := make([]byte, 4+messageLength)
	handshakeMsg[0] = TLSHandshakeTypeServerHello
	handshakeMsg[1] = byte(messageLength >> 16)
	handshakeMsg[2] = byte(messageLength >> 8)
	handshakeMsg[3] = byte(messageLength)

	offset := 4
	binary.BigEndian.PutUint16(handshakeMsg[offset:offset+2], 0x0303)
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

	if extensionsTotalLength > 0 {
		binary.BigEndian.PutUint16(handshakeMsg[offset:offset+2], uint16(extensionsTotalLength))
		offset += 2
		copy(handshakeMsg[offset:offset+extensionsTotalLength], extensionsBytes)
		offset += extensionsTotalLength
	}

	if offset != len(handshakeMsg) {
		return nil, fmt.Errorf("internal error building ServerHello: length mismatch (offset %d, total %d)", offset, len(handshakeMsg))
	}

	return handshakeMsg, nil
}

// buildTLSRecord creates a TLS record byte slice.
func buildTLSRecord(recordType uint8, version uint16, payload []byte) ([]byte, error) {
	recordLen := len(payload)
	if recordLen > 1<<14 {
		return nil, fmt.Errorf("TLS payload too large: %d bytes", recordLen)
	}
	record := make([]byte, TLSRecordHeaderLength+recordLen)
	record[0] = recordType
	binary.BigEndian.PutUint16(record[1:3], version)
	binary.BigEndian.PutUint16(record[3:5], uint16(recordLen))
	copy(record[TLSRecordHeaderLength:], payload)
	return record, nil
}

// sendRawTLSRecord sends a raw TLS record over the connection (TUN or TCP).
func sendRawTLSRecord(ifce *water.Interface, conn *TCPConnection, record []byte) (int, error) {
	outerRecordType := record[0]
	recordVersion := uint16(0x0303)
	plaintextPayload := record[TLSRecordHeaderLength:]

	payloadToSend, err := encryptRecord(conn, plaintextPayload, outerRecordType, recordVersion)
	if err != nil {
		return 0, fmt.Errorf("failed to encrypt record payload (Type: %d) for %s: %w", outerRecordType, conn.ConnectionKey(), err)
	}

	if isDebug {
		log.Printf("%s%sBuilding final record. OuterType: %d, OuterVersion: 0x%04x, PayloadLen: %d", ColorGray, PrefixTLS, outerRecordType, recordVersion, len(payloadToSend))
	}

	finalRecord := make([]byte, TLSRecordHeaderLength+len(payloadToSend))
	finalRecord[0] = outerRecordType
	binary.BigEndian.PutUint16(finalRecord[1:3], recordVersion)
	binary.BigEndian.PutUint16(finalRecord[3:5], uint16(len(payloadToSend)))
	copy(finalRecord[TLSRecordHeaderLength:], payloadToSend)

	conn.Mutex.Lock()
	tcpConn := conn.TCPConn
	tunIFCE := conn.TunIFCE
	serverIP := conn.ServerIP
	clientIP := conn.ClientIP
	serverPort := conn.ServerPort
	clientPort := conn.ClientPort
	serverNextSeq := conn.ServerNextSeq
	clientNextSeq := conn.ClientNextSeq
	conn.Mutex.Unlock()

	var sentPayloadBytes int

	if tcpConn != nil { // TCP Mode
		if isDebug {
			log.Printf("%s%sSending %d bytes via net.Conn.", ColorGray, PrefixTLS, len(finalRecord))
		}
		n, err := tcpConn.Write(finalRecord)
		if err != nil {
			return 0, fmt.Errorf("TCPConn Write failed for TLS record (Type: %d) for %s: %w", outerRecordType, conn.ConnectionKey(), err)
		}
		if n != len(finalRecord) {
			return 0, fmt.Errorf("TCPConn short write for TLS record (Type: %d) for %s: wrote %d, expected %d", outerRecordType, conn.ConnectionKey(), n, len(finalRecord))
		}
		if isDebug {
			log.Printf("%s%sSent TLS record. Type: %d, Final Len: %d", ColorGray, PrefixTLS, outerRecordType, len(finalRecord))
		}
		sentPayloadBytes = 0

	} else if tunIFCE != nil { // TUN Mode
		if isDebug {
			log.Printf("%s%sSending %d bytes via TUN interface.", ColorGray, PrefixTLS, len(finalRecord))
		}
		flags := uint8(TCPFlagPSH | TCPFlagACK)
		sentBytes, err := sendTCPPacket(tunIFCE, serverIP, clientIP, uint16(serverPort), uint16(clientPort),
			serverNextSeq, clientNextSeq, flags, finalRecord)
		if err != nil {
			return 0, fmt.Errorf("sendTCPPacket failed for TLS record (Type: %d) for %s: %w", outerRecordType, conn.ConnectionKey(), err)
		}
		sentPayloadBytes = sentBytes
		if isDebug {
			log.Printf("%s%sSent TLS record. Type: %d, Final Len: %d, PayloadBytes: %d", ColorGray, PrefixTLS, outerRecordType, len(finalRecord), sentPayloadBytes)
		}

	} else {
		return 0, fmt.Errorf("sendRawTLSRecord called with invalid connection state for %s (no TCPConn or TunIFCE)", conn.ConnectionKey())
	}

	return sentPayloadBytes, nil
}

func handleTLSData(ifce *water.Interface, conn *TCPConnection, payload []byte) {
	if isDebug {
		log.Printf("%s%sEntering handleTLSData with %d bytes payload.", ColorGray, PrefixTLS, len(payload))
	}
	n, err := conn.ReceiveBuffer.Write(payload)
	if err != nil {
		log.Printf("%s%sFailed to write payload to buffer: %v", ColorRed, PrefixError, err)
		return
	}
	if n != len(payload) {
		log.Printf("%s%sShort write to buffer? Wrote %d, expected %d", ColorGray, PrefixTLS, n, len(payload))
	}
	if isDebug {
		log.Printf("%s%sPayload written to buffer. Buffer length now: %d. Calling handleTLSBufferedData.", ColorGray, PrefixTLS, conn.ReceiveBuffer.Len())
	}
	handleTLSBufferedData(ifce, conn)
	if isDebug {
		log.Printf("%s%sExiting handleTLSData.", ColorGray, PrefixTLS)
	}
}

// buildCertificateMessage constructs the Certificate handshake message using the loaded certificate.
func buildCertificateMessage() ([]byte, error) {
	if len(serverCertDER) == 0 {
		return nil, errors.New("server certificate not loaded")
	}

	var certListBytes bytes.Buffer
	for _, certDER := range serverCertDER {
		certLen := uint32(len(certDER))
		if certLen == 0 || certLen >= 1<<24 {
			return nil, fmt.Errorf("invalid certificate DER length: %d", certLen)
		}
		lenBytes := make([]byte, 3)
		lenBytes[0] = byte(certLen >> 16)
		lenBytes[1] = byte(certLen >> 8)
		lenBytes[2] = byte(certLen)
		certListBytes.Write(lenBytes)
		certListBytes.Write(certDER)
	}

	certificateListPayload := certListBytes.Bytes()
	certificateListLength := uint32(len(certificateListPayload))

	messageBodyLen := 3 + certificateListLength

	message := make([]byte, 4+messageBodyLen)
	message[0] = TLSHandshakeTypeCertificate
	message[1] = byte(messageBodyLen >> 16)
	message[2] = byte(messageBodyLen >> 8)
	message[3] = byte(messageBodyLen)

	offset := 4
	message[offset] = byte(certificateListLength >> 16)
	message[offset+1] = byte(certificateListLength >> 8)
	message[offset+2] = byte(certificateListLength)
	offset += 3

	copy(message[offset:], certificateListPayload)
	offset += int(certificateListLength)

	if offset != len(message) {
		return nil, fmt.Errorf("internal error building Certificate message: length mismatch (offset %d, total %d)", offset, len(message))
	}

	return message, nil
}

// buildServerHelloDoneMessage constructs the ServerHelloDone handshake message.
func buildServerHelloDoneMessage() ([]byte, error) {
	message := make([]byte, 4)
	message[0] = TLSHandshakeTypeServerHelloDone
	return message, nil
}

// buildServerKeyExchange constructs the ServerKeyExchange message.
// It includes ECDHE parameters and a signature over those parameters (and client/server randoms).
// MODIFIED: Re-enabled signature generation.
func buildServerKeyExchange(dataToSign []byte, skeParamsBytes []byte, privateKey crypto.PrivateKey) ([]byte, error) {
	sigAlgo := tls.PKCS1WithSHA256

	rsaKey, ok := privateKey.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("server key is not an RSA private key, cannot sign SKE")
	}

	hash := sha256.Sum256(dataToSign)

	signature, err := rsa.SignPKCS1v15(rand.Reader, rsaKey, crypto.SHA256, hash[:])
	if err != nil {
		return nil, fmt.Errorf("failed to sign SKE data: %w", err)
	}

	body := new(bytes.Buffer)
	body.Write(skeParamsBytes)
	binary.Write(body, binary.BigEndian, uint16(sigAlgo))
	binary.Write(body, binary.BigEndian, uint16(len(signature)))
	body.Write(signature)

	messageBody := body.Bytes()
	messageBodyLen := uint32(len(messageBody))

	message := make([]byte, 4+messageBodyLen)
	message[0] = TLSHandshakeTypeServerKeyExchange
	message[1] = byte(messageBodyLen >> 16)
	message[2] = byte(messageBodyLen >> 8)
	message[3] = byte(messageBodyLen)
	copy(message[4:], messageBody)

	return message, nil
}

// sendServerCCSAndFinished sends the Server ChangeCipherSpec and Finished messages.
func sendServerCCSAndFinished(ifce *water.Interface, conn *TCPConnection) {
	log.Printf("%s%sSending Server ChangeCipherSpec and Finished.%s", ColorOrange, PrefixTLS, ColorReset)

	ccsPayload := []byte{0x01}
	ccsRecord, err := buildTLSRecord(TLSRecordTypeChangeCipherSpec, 0x0303, ccsPayload)
	if err != nil {
		log.Printf("%s%sFailed to build ChangeCipherSpec record: %v", ColorRed, PrefixError, err)
		return
	}
	if isDebug {
		log.Printf("%s%sSending ChangeCipherSpec record (%d bytes).", ColorGray, PrefixTLS, len(ccsRecord))
	}
	sentBytes, err := sendRawTLSRecord(ifce, conn, ccsRecord)
	if err != nil {
		log.Printf("%s%sFailed to send ChangeCipherSpec record: %v", ColorRed, PrefixError, err)
		return
	}
	conn.Mutex.Lock()
	conn.ServerNextSeq += uint32(sentBytes)
	if isDebug {
		log.Printf("%s%sAfter CCS: ServerNextSeq = %d (added %d)", ColorGray, PrefixTLS, conn.ServerNextSeq, sentBytes)
	}
	conn.Mutex.Unlock()

	log.Printf("%s%sChangeCipherSpec sent.%s", ColorOrange, PrefixTLS, ColorReset)

	conn.EncryptionEnabled = true
	conn.ServerSequenceNum = 0

	conn.Mutex.Lock()
	hshakeMessages := conn.HandshakeMessages.Bytes()
	hshakeHash := sha256.Sum256(hshakeMessages)
	if isDebug {
		log.Printf("%s%sCalculated Handshake Hash (%d bytes total msgs): %x", ColorGray, PrefixTLS, len(hshakeMessages), hshakeHash[:])
	}

	serverVerifyData, err := computeFinishedHash(conn.MasterSecret, "server finished", hshakeHash[:])
	if err != nil {
		conn.Mutex.Unlock()
		log.Printf("%s%sFailed to compute server Finished verify_data: %v", ColorRed, PrefixError, err)
		return
	}
	if isDebug {
		log.Printf("%s%sComputed Server Verify Data (%d bytes): %x", ColorGray, PrefixTLS, len(serverVerifyData), serverVerifyData)
	}
	conn.Mutex.Unlock()

	finishedMsg, err := buildFinishedMessage(serverVerifyData)
	if err != nil {
		log.Printf("%s%sFailed to build Finished message: %v", ColorRed, PrefixError, err)
		return
	}

	conn.Mutex.Lock()
	conn.HandshakeMessages.Write(finishedMsg)
	conn.Mutex.Unlock()
	if isDebug {
		log.Printf("%s%sAdded Server Finished (%d bytes). Total len: %d", ColorGray, PrefixTLS, len(finishedMsg), conn.HandshakeMessages.Len())
	}

	finishedRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, finishedMsg)
	if err != nil {
		log.Printf("%s%sFailed to build Finished record: %v", ColorRed, PrefixError, err)
		return
	}

	if isDebug {
		log.Printf("%s%sSending Finished record (%d bytes).", ColorGray, PrefixTLS, len(finishedRecord))
	}
	sentBytes, err = sendRawTLSRecord(ifce, conn, finishedRecord)
	if err != nil {
		log.Printf("%s%sFailed to send Finished record: %v", ColorRed, PrefixError, err)
		return
	}
	conn.Mutex.Lock()
	conn.ServerNextSeq += uint32(sentBytes)
	if isDebug {
		log.Printf("%s%sAfter Finished: ServerNextSeq = %d (added %d)", ColorGray, PrefixTLS, conn.ServerNextSeq, sentBytes)
	}
	conn.HandshakeMessages.Write(finishedMsg)
	if isDebug {
		log.Printf("%s%sAdded Sent Finished Msg (%d bytes). Total len: %d", ColorGray, PrefixTLS, len(finishedMsg), conn.HandshakeMessages.Len())
	}
	conn.Mutex.Unlock()

	conn.TLSState = TLSStateHandshakeComplete
	log.Printf("%s%sServer Finished sent. TLS Handshake considered complete (dummy). TLS State -> %v%s", ColorOrange, PrefixTLS, conn.TLSState, ColorReset)
}

// buildFinishedMessage constructs the Finished handshake message with the provided verify_data.
func buildFinishedMessage(verifyData []byte) ([]byte, error) {
	messageBodyLen := uint32(len(verifyData))
	if messageBodyLen == 0 {
		return nil, errors.New("buildFinishedMessage: verifyData cannot be empty for TLS 1.2")
	}

	message := make([]byte, 4+messageBodyLen)
	message[0] = TLSHandshakeTypeFinished
	message[1] = byte(messageBodyLen >> 16)
	message[2] = byte(messageBodyLen >> 8)
	message[3] = byte(messageBodyLen)
	copy(message[4:], verifyData)

	return message, nil
}

// startTLSHandshake initiates the TLS handshake process for a TCP connection.
func startTLSHandshake(conn *TCPConnection) error {
	log.Printf("%s%sInitiating TLS handshake in TCP mode.%s", ColorOrange, PrefixInfo, ColorReset)

	conn.Mutex.Lock()
	if conn.TCPConn == nil {
		conn.Mutex.Unlock()
		return fmt.Errorf("startTLSHandshake called with nil TCPConn for %s", conn.ConnectionKey())
	}
	conn.TLSState = TLSStateExpectingClientHello
	conn.Mutex.Unlock()

	readBuf := make([]byte, 4096)

	for {
		log.Printf("%s%sWaiting to read data from TCP connection...%s", ColorGray, PrefixTLS, ColorReset)
		n, err := conn.TCPConn.Read(readBuf)
		if err != nil {
			log.Printf("%s%sError reading from TCP connection: %v", ColorRed, PrefixError, err)
			return fmt.Errorf("TCP read error during handshake for %s: %w", conn.ConnectionKey(), err)
		}

		if n > 0 {
			log.Printf("%s%sRead %d bytes from TCP connection.%s", ColorGray, PrefixTLS, n, ColorReset)
			handleTLSData(nil, conn, readBuf[:n])

			conn.Mutex.Lock()
			currentState := conn.TLSState
			conn.Mutex.Unlock()
			if currentState == TLSStateHandshakeComplete {
				log.Printf("%s%sHandshake completed successfully in TCP mode.%s", ColorOrange, PrefixInfo, ColorReset)
				break
			}
		}
	}

	log.Printf("%s%sHandshake complete. Entering Application Data phase.%s", ColorOrange, PrefixInfo, ColorReset)
	for {
		log.Printf("%s%sWaiting for Application Data...%s", ColorGray, PrefixTLS, ColorReset)
		n, err := conn.TCPConn.Read(readBuf)
		if err != nil {
			log.Printf("%s%sError reading from TCP connection in AppData phase: %v. Closing connection.%s", ColorRed, PrefixError, err, ColorReset)
			break
		}

		if n > 0 {
			log.Printf("%s%sRead %d bytes (AppData phase).%s", ColorGray, PrefixTLS, n, ColorReset)
			handleTLSData(nil, conn, readBuf[:n])
		}
	}

	return nil
}

// --- Crypto functions removed, moved to crypto.go ---
