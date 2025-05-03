package main

import (
	"bytes"
	"crypto/ecdh"
	"encoding/binary"
	"fmt"
	"log"
	mrand "math/rand"
	"net"
	"sync"

	"github.com/songgao/water"
)

// TCPHeader represents the TCP header structure.
// Reference: RFC 793
type TCPHeader struct {
	SrcPort    uint16 // Source Port
	DstPort    uint16 // Destination Port
	SeqNum     uint32 // Sequence Number
	AckNum     uint32 // Acknowledgment Number
	DataOffset uint8  // 4 bits: Data Offset (header length in 32-bit words)
	Reserved   uint8  // 3 bits: Reserved
	Flags      uint8  // 9 bits: NS, CWR, ECE, URG, ACK, PSH, RST, SYN, FIN (lower 8 used here for simplicity)
	WindowSize uint16 // Window Size
	Checksum   uint16 // Checksum
	UrgentPtr  uint16 // Urgent Pointer
	Options    []byte // Options (if DataOffset > 5)
}

// TCPConnection represents the state of a TCP connection
type TCPConnection struct {
	State         TCPState
	ClientIP      net.IP
	ClientPort    uint16
	ServerIP      net.IP
	ServerPort    uint16
	ClientISN     uint32 // Initial Sequence Number from client
	ServerISN     uint32 // Initial Sequence Number from server
	ClientNextSeq uint32 // Next expected sequence number from client
	ServerNextSeq uint32 // Next sequence number to send from server
	// Add more fields as needed (e.g., window sizes, timers)

	// TLS specific state (References TLSState which will be in tls.go)
	TLSState      TLSHandshakeState // <<< Defined in tls.go later
	ReceiveBuffer bytes.Buffer      // Buffer for incoming TLS data

	// Key derivation and encryption state (References TLS constants/types)
	ClientRandom             []byte
	ServerRandom             []byte
	ServerECDHPrivateKey     *ecdh.PrivateKey // Server's ephemeral ECDHE private key
	ClientECDHPublicKeyBytes []byte           // Client's ephemeral ECDHE public key
	PreMasterSecret          []byte
	MasterSecret             []byte
	ClientWriteKey           []byte // AES-GCM key
	ServerWriteKey           []byte // AES-GCM key
	ClientWriteIV            []byte // AES-GCM explicit IV part
	ServerWriteIV            []byte // AES-GCM explicit IV part
	CipherSuite              uint16 // Chosen cipher suite (e.g., TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256) <<< Defined in tls.go later
	EncryptionEnabled        bool   // Flag to enable record encryption/decryption after CCS
	ClientSequenceNum        uint64 // Sequence number for receiving records (for AEAD)
	ServerSequenceNum        uint64 // Sequence number for sending records (for AEAD)
}

// TCPState represents the state of a TCP connection
type TCPState int

const (
	TCPStateListen TCPState = iota
	TCPStateSynReceived
	TCPStateEstablished
	TCPStateFinWait1
	TCPStateFinWait2
	TCPStateCloseWait
	TCPStateClosing
	TCPStateLastAck
	TCPStateTimeWait
	TCPStateClosed
)

const (
	TCPProtocolNumber       = 6
	TCPHeaderMinLengthBytes = 20 // Minimum header length (DataOffset=5)

	// TCP Flags (use lower 8 bits of the 9 defined flags for simplicity)
	TCPFlagFIN = 1 << 0
	TCPFlagSYN = 1 << 1
	TCPFlagRST = 1 << 2
	TCPFlagPSH = 1 << 3
	TCPFlagACK = 1 << 4
	TCPFlagURG = 1 << 5
	TCPFlagECE = 1 << 6
	TCPFlagCWR = 1 << 7
	// TCPFlagNS = 1 << 8 // (Not easily accessible in standard 8-bit flag field)

	ListenPort = 80 // Hardcoded listening port for this example
)

// Global map to store active TCP connections
// Key format: "clientIP:clientPort-serverIP:serverPort"
var (
	tcpConnections = make(map[string]*TCPConnection)
	connMutex      sync.Mutex
)

// ConnectionKey generates a standard key for the connection map.
// Added as a helper method for TCPConnection.
func (c *TCPConnection) ConnectionKey() string {
	if c == nil {
		return ""
	}
	return fmt.Sprintf("%s:%d-%s:%d", c.ClientIP, c.ClientPort, c.ServerIP, c.ServerPort)
}

// handleTCPPacket parses TCP header and manages TCP state transitions based on port.
func handleTCPPacket(ifce *water.Interface, ipHeader *IPv4Header, tcpSegment []byte) {
	tcpHeader, tcpPayload, err := parseTCPHeader(tcpSegment)
	if err != nil {
		log.Printf("Error parsing TCP header: %v", err)
		return
	}

	flagsStr := tcpFlagsToString(tcpHeader.Flags)
	log.Printf("TCP RCV: %s:%d -> %s:%d Seq: %d Ack: %d Flags: [%s] Win: %d Len: %d",
		ipHeader.SrcIP, tcpHeader.SrcPort,
		ipHeader.DstIP, tcpHeader.DstPort,
		tcpHeader.SeqNum,
		tcpHeader.AckNum,
		flagsStr,
		tcpHeader.WindowSize,
		len(tcpPayload),
	)

	connMutex.Lock()
	defer connMutex.Unlock()

	connKey := fmt.Sprintf("%s:%d-%s:%d", ipHeader.SrcIP, tcpHeader.SrcPort, ipHeader.DstIP, tcpHeader.DstPort)
	conn, exists := tcpConnections[connKey]

	switch {
	// Case 1: New SYN (Listen state is implicit)
	case !exists && tcpHeader.Flags&TCPFlagSYN != 0 && tcpHeader.Flags&TCPFlagACK == 0:
		// Check if it's for a port we listen on (80 for HTTP, 443 for TLS)
		if tcpHeader.DstPort == 80 || tcpHeader.DstPort == 443 {
			log.Printf("Handling SYN for new connection %s on port %d", connKey, tcpHeader.DstPort)
			// ... (Basic SYN flood protection) ...

			serverISN := mrand.Uint32() // Use mrand
			newConn := &TCPConnection{
				State:         TCPStateSynReceived,
				ClientIP:      ipHeader.SrcIP,
				ClientPort:    tcpHeader.SrcPort,
				ServerIP:      ipHeader.DstIP,
				ServerPort:    tcpHeader.DstPort, // Store the actual destination port
				ClientISN:     tcpHeader.SeqNum,
				ServerISN:     serverISN,
				ClientNextSeq: tcpHeader.SeqNum + 1,
				ServerNextSeq: serverISN + 1,
				TLSState:      TLSStateNone, // Default to None <<< Defined in tls.go later
			}
			if tcpHeader.DstPort == 443 {
				newConn.TLSState = TLSStateExpectingClientHello // Set initial TLS state for port 443 <<< Defined in tls.go later
			}
			tcpConnections[connKey] = newConn

			// Send SYN-ACK
			err = sendTCPPacket(ifce, newConn.ServerIP, newConn.ClientIP, newConn.ServerPort, newConn.ClientPort,
				newConn.ServerISN, newConn.ClientNextSeq, TCPFlagSYN|TCPFlagACK, nil)
			if err != nil {
				log.Printf("Error sending SYN-ACK for %s: %v", connKey, err)
				delete(tcpConnections, connKey)
			}
		} else {
			log.Printf("Ignoring SYN for unhandled port %d from %s:%d", tcpHeader.DstPort, ipHeader.SrcIP, tcpHeader.SrcPort)
			// Optionally send RST
		}

	// Case 2: ACK for SYN-ACK
	case exists && conn.State == TCPStateSynReceived && tcpHeader.Flags&TCPFlagACK != 0:
		// ... (Existing ACK handling for handshake completion) ...
		if tcpHeader.AckNum == conn.ServerNextSeq {
			log.Printf("Connection %s ESTABLISHED. Port: %d, TLS State: %v", connKey, conn.ServerPort, conn.TLSState)
			conn.State = TCPStateEstablished
			conn.ClientNextSeq = tcpHeader.SeqNum
		} else {
			// ... (Handle invalid ACK) ...
		}

	// Case 3: Packets on established connection
	case exists && conn.State == TCPStateEstablished:
		// Basic sequence number check (common for both HTTP and TLS data)
		if !(len(tcpPayload) == 0 && tcpHeader.Flags&TCPFlagACK != 0) && tcpHeader.SeqNum != conn.ClientNextSeq {
			log.Printf("Unexpected sequence number for ESTABLISHED %s. Expected %d, got %d. Ignoring.", connKey, conn.ClientNextSeq, tcpHeader.SeqNum)
			return
		}

		// Handle FIN first (common for both)
		if tcpHeader.Flags&TCPFlagFIN != 0 {
			handleFIN(ifce, conn, tcpHeader)
			return
		}

		// Handle ACK only packets (common for both)
		if len(tcpPayload) == 0 && tcpHeader.Flags&TCPFlagACK != 0 {
			handlePureACK(conn, tcpHeader)
			return
		}

		// Handle data payload based on port
		if len(tcpPayload) > 0 {
			// Send ACK for received data (common for both)
			expectedClientNextSeq := conn.ClientNextSeq + uint32(len(tcpPayload))
			ackFlags := uint8(TCPFlagACK)
			err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
				conn.ServerNextSeq, expectedClientNextSeq, ackFlags, nil)
			if err != nil {
				log.Printf("Error sending ACK for received data on %s (Port %d): %v", connKey, conn.ServerPort, err)
				// Still update sequence number to avoid re-processing?
				conn.ClientNextSeq = expectedClientNextSeq
				return
			}

			// Dispatch data handling based on port
			if conn.ServerPort == 80 {
				handleHTTPData(ifce, conn, tcpPayload) // <<< Defined in main.go for now
			} else if conn.ServerPort == 443 {
				handleTLSData(ifce, conn, tcpPayload) // <<< Defined in main.go for now
			} else {
				log.Printf("Received data on unexpected established port %d for %s", conn.ServerPort, connKey)
			}

			// Update client sequence number after successful ACK and dispatch
			conn.ClientNextSeq = expectedClientNextSeq
		}

	// Case 4: ACK for our FIN (closing connection)
	case exists && conn.State == TCPStateLastAck:
		handleFINACK(conn, tcpHeader)

	default:
		// ... (Existing default case for RST) ...
	}
}

// --- Helper functions for specific TCP packet handling ---

func handleFIN(ifce *water.Interface, conn *TCPConnection, tcpHeader *TCPHeader) {
	log.Printf("Received FIN for connection %s. Entering CLOSE_WAIT.", conn.ConnectionKey())
	conn.State = TCPStateCloseWait
	conn.ClientNextSeq = tcpHeader.SeqNum + 1

	// Send ACK for the FIN
	ackFlags := uint8(TCPFlagACK)
	err := sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
		conn.ServerNextSeq, conn.ClientNextSeq, ackFlags, nil)
	if err != nil {
		log.Printf("Error sending ACK for FIN on %s: %v", conn.ConnectionKey(), err)
	}

	// Immediately send our FIN (since we are a simple server)
	log.Printf("Sending FIN for connection %s. Entering LAST_ACK.", conn.ConnectionKey())
	finAckFlags := uint8(TCPFlagFIN | TCPFlagACK)
	err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
		conn.ServerNextSeq, conn.ClientNextSeq, finAckFlags, nil)
	if err != nil {
		log.Printf("Error sending FIN+ACK on %s: %v", conn.ConnectionKey(), err)
	}
	conn.ServerNextSeq++
	conn.State = TCPStateLastAck
}

func handlePureACK(conn *TCPConnection, tcpHeader *TCPHeader) {
	if tcpHeader.AckNum > conn.ServerNextSeq {
		log.Printf("Received ACK for future data for %s. AckNum: %d, ServerNextSeq: %d", conn.ConnectionKey(), tcpHeader.AckNum, conn.ServerNextSeq)
		conn.ServerNextSeq = tcpHeader.AckNum
	} else if tcpHeader.AckNum < conn.ServerNextSeq {
		log.Printf("Received duplicate ACK for %s. AckNum: %d, ServerNextSeq: %d", conn.ConnectionKey(), tcpHeader.AckNum, conn.ServerNextSeq)
	} else {
		log.Printf("Received valid ACK for %s. AckNum: %d", conn.ConnectionKey(), tcpHeader.AckNum)
	}
}

func handleFINACK(conn *TCPConnection, tcpHeader *TCPHeader) {
	log.Printf("Handling ACK for FIN for connection %s", conn.ConnectionKey())
	if tcpHeader.Flags&TCPFlagACK != 0 && tcpHeader.AckNum == conn.ServerNextSeq {
		log.Printf("Connection %s CLOSED normally.", conn.ConnectionKey())
		delete(tcpConnections, conn.ConnectionKey())
	} else {
		log.Printf("Unexpected packet in LAST_ACK state for %s. Flags: [%s], AckNum: %d (expected %d)",
			conn.ConnectionKey(), tcpFlagsToString(tcpHeader.Flags), tcpHeader.AckNum, conn.ServerNextSeq)
	}
}

// --- Shared TCP/IP Helper Functions ---

// parseTCPHeader parses the byte slice into a TCPHeader struct.
func parseTCPHeader(segment []byte) (*TCPHeader, []byte, error) {
	if len(segment) < TCPHeaderMinLengthBytes {
		return nil, nil, fmt.Errorf("TCP segment too short for header: %d bytes", len(segment))
	}
	header := &TCPHeader{}
	header.SrcPort = binary.BigEndian.Uint16(segment[0:2])
	header.DstPort = binary.BigEndian.Uint16(segment[2:4])
	header.SeqNum = binary.BigEndian.Uint32(segment[4:8])
	header.AckNum = binary.BigEndian.Uint32(segment[8:12])
	header.DataOffset = segment[12] >> 4
	header.Flags = segment[13]
	header.WindowSize = binary.BigEndian.Uint16(segment[14:16])
	header.Checksum = binary.BigEndian.Uint16(segment[16:18])
	header.UrgentPtr = binary.BigEndian.Uint16(segment[18:20])
	headerLengthBytes := int(header.DataOffset) * 4
	if len(segment) < headerLengthBytes {
		return nil, nil, fmt.Errorf("TCP segment too short for declared header length (DataOffset): %d bytes required, got %d", headerLengthBytes, len(segment))
	}
	if headerLengthBytes > TCPHeaderMinLengthBytes {
		header.Options = segment[TCPHeaderMinLengthBytes:headerLengthBytes]
	}
	payload := segment[headerLengthBytes:]
	return header, payload, nil
}

// tcpFlagsToString converts TCP flags byte to a readable string.
func tcpFlagsToString(flags uint8) string {
	var parts []string
	if flags&TCPFlagFIN != 0 {
		parts = append(parts, "FIN")
	}
	if flags&TCPFlagSYN != 0 {
		parts = append(parts, "SYN")
	}
	if flags&TCPFlagRST != 0 {
		parts = append(parts, "RST")
	}
	if flags&TCPFlagPSH != 0 {
		parts = append(parts, "PSH")
	}
	if flags&TCPFlagACK != 0 {
		parts = append(parts, "ACK")
	}
	if flags&TCPFlagURG != 0 {
		parts = append(parts, "URG")
	}
	if flags&TCPFlagECE != 0 {
		parts = append(parts, "ECE")
	}
	if flags&TCPFlagCWR != 0 {
		parts = append(parts, "CWR")
	}
	if len(parts) == 0 {
		return "-"
	}
	// Note: Need to import "strings" for this to work
	// return strings.Join(parts, ",") // <<< Temporarily commented out until imports are fixed
	return fmt.Sprintf("%v", parts) // Use fmt for now
}

// sendTCPPacket constructs and sends a TCP packet.
func sendTCPPacket(ifce *water.Interface, srcIP, dstIP net.IP, srcPort, dstPort uint16, seqNum, ackNum uint32, flags uint8, payload []byte) error {
	log.Printf("TCP SEND: %s:%d -> %s:%d Seq: %d Ack: %d Flags: [%s] Len: %d",
		srcIP, srcPort, dstIP, dstPort, seqNum, ackNum, tcpFlagsToString(flags), len(payload))
	tcpHeaderBytes, err := buildTCPHeader(srcIP, dstIP, srcPort, dstPort, seqNum, ackNum, flags, payload)
	if err != nil {
		return fmt.Errorf("failed to build TCP header: %w", err)
	}
	// buildIPv4Header is in ip.go
	ipHeaderBytes, err := buildIPv4Header(srcIP, dstIP, TCPProtocolNumber, len(tcpHeaderBytes)+len(payload))
	if err != nil {
		return fmt.Errorf("failed to build IP header: %w", err)
	}
	fullPacket := append(ipHeaderBytes, tcpHeaderBytes...)
	fullPacket = append(fullPacket, payload...)
	n, err := ifce.Write(fullPacket)
	if err != nil {
		return fmt.Errorf("failed to write TCP packet to TUN device: %w", err)
	}
	if n != len(fullPacket) {
		return fmt.Errorf("short write for TCP packet: wrote %d bytes, expected %d", n, len(fullPacket))
	}
	return nil
}

// buildTCPHeader creates a TCP header byte slice including the checksum.
func buildTCPHeader(srcIP, dstIP net.IP, srcPort, dstPort uint16, seqNum, ackNum uint32, flags uint8, payload []byte) ([]byte, error) {
	header := TCPHeader{
		SrcPort:    srcPort,
		DstPort:    dstPort,
		SeqNum:     seqNum,
		AckNum:     ackNum,
		DataOffset: 5, // Assuming no options
		Reserved:   0,
		Flags:      flags,
		WindowSize: 65535,
		Checksum:   0, // Calculate later
		UrgentPtr:  0,
	}
	headerLengthBytes := int(header.DataOffset) * 4
	headerBytes := make([]byte, headerLengthBytes)
	binary.BigEndian.PutUint16(headerBytes[0:2], header.SrcPort)
	binary.BigEndian.PutUint16(headerBytes[2:4], header.DstPort)
	binary.BigEndian.PutUint32(headerBytes[4:8], header.SeqNum)
	binary.BigEndian.PutUint32(headerBytes[8:12], header.AckNum)
	headerBytes[12] = (header.DataOffset << 4)
	headerBytes[13] = header.Flags
	binary.BigEndian.PutUint16(headerBytes[14:16], header.WindowSize)
	// Checksum (16-17) is initially 0
	binary.BigEndian.PutUint16(headerBytes[18:20], header.UrgentPtr) // Restore Urgent Pointer setting

	// Calculate Checksum
	checksum, err := calculateTCPChecksum(srcIP, dstIP, headerBytes, payload)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate TCP checksum: %w", err)
	}
	binary.BigEndian.PutUint16(headerBytes[16:18], checksum) // Set calculated checksum

	return headerBytes, nil
}

// calculateTCPChecksum computes the TCP checksum using a pseudo-header.
func calculateTCPChecksum(srcIP, dstIP net.IP, tcpHeader, tcpPayload []byte) (uint16, error) {
	srcIPv4 := srcIP.To4()
	dstIPv4 := dstIP.To4()
	if srcIPv4 == nil || dstIPv4 == nil {
		return 0, fmt.Errorf("source or destination IP is not IPv4 for TCP checksum")
	}
	pseudoHeader := make([]byte, 12)
	copy(pseudoHeader[0:4], srcIPv4)
	copy(pseudoHeader[4:8], dstIPv4)
	pseudoHeader[8] = 0 // Reserved
	pseudoHeader[9] = TCPProtocolNumber
	tcpLength := uint16(len(tcpHeader) + len(tcpPayload))
	binary.BigEndian.PutUint16(pseudoHeader[10:12], tcpLength)
	dataForChecksum := append(pseudoHeader, tcpHeader...)
	dataForChecksum = append(dataForChecksum, tcpPayload...)
	// Zero out the checksum field within the data slice for calculation
	if len(tcpHeader) >= 18 {
		checksumOffsetInCombinedData := 12 + 16 // Offset of checksum within dataForChecksum
		binary.BigEndian.PutUint16(dataForChecksum[checksumOffsetInCombinedData:checksumOffsetInCombinedData+2], 0)
	}
	// calculateChecksum is in ip.go
	checksum := calculateChecksum(dataForChecksum)
	return checksum, nil
}
