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
	"time"

	"github.com/google/gopacket/layers"
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

// Add HTTP2State definition
type HTTP2State int

const (
	H2StateExpectPreface HTTP2State = iota
	H2StateExpectSettings
	H2StateReady
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

	// ListenPort is now defined via flag in main.go
	// ListenPort = 443
)

// Global map to store active TCP connections
// Key format: "clientIP:clientPort-serverIP:serverPort"
var (
	tcpConnections = make(map[string]*TCPConnection)
	connMutex      sync.Mutex // Mutex for the global connection map
)

// TCPConnection represents the state of a TCP connection
type TCPConnection struct {
	State         TCPState
	ClientIP      net.IP
	ClientPort    layers.TCPPort
	ServerIP      net.IP
	ServerPort    layers.TCPPort
	ClientISN     uint32 // Initial Sequence Number from client
	ServerISN     uint32 // Initial Sequence Number from server
	ClientNextSeq uint32 // Next expected sequence number from client
	ServerNextSeq uint32 // Next sequence number to send from server
	// Add more fields as needed (e.g., window sizes, timers)

	// Mode-specific connection info
	TunIFCE *water.Interface // Interface for TUN mode
	TCPConn net.Conn         // Underlying connection for TCP mode

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

	// Handshake message buffering
	HandshakeMessages bytes.Buffer // Buffer to store handshake messages for Finished hash

	// Negotiated ALPN Protocol
	NegotiatedProtocol string // Stores the ALPN protocol negotiated ("h2", "http/1.1", or "")

	// HTTP/2 State
	h2SettingsSent bool // Flag indicating if the initial server SETTINGS frame has been sent

	// State protection
	Mutex sync.Mutex // Mutex to protect access to connection state

	// --- HTTP/2 Specific State ---
	H2State            HTTP2State    // Current state of H2 processing
	HTTP2ReceiveBuffer *bytes.Buffer // Buffer for decrypted HTTP/2 frames

	LastPacketTime time.Time
}

// ConnectionKey generates a standard key for the connection map.
func (c *TCPConnection) ConnectionKey() string {
	c.Mutex.Lock()
	defer c.Mutex.Unlock()

	if c.TCPConn != nil { // TCP Mode
		localAddr := c.TCPConn.LocalAddr().String()        // e.g., "127.0.0.1:443"
		remoteAddr := c.TCPConn.RemoteAddr().String()      // e.g., "192.168.1.100:54321"
		return fmt.Sprintf("%s-%s", remoteAddr, localAddr) // Use remote-local for consistency?
	} else if c.ClientIP != nil { // TUN Mode
		return fmt.Sprintf("%s:%d-%s:%d", c.ClientIP, c.ClientPort, c.ServerIP, c.ServerPort)
	} else {
		log.Println("Warning: ConnectionKey called on connection with no valid identifiers")
		return ""
	}
}

// runTCPMode starts listening on the specified port for TCP connections.
func runTCPMode(port int) {
	listenAddr := fmt.Sprintf(":%d", port)
	listener, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Fatalf("Failed to listen on port %d: %v", port, err)
	}
	defer listener.Close()
	log.Printf("TCP server listening on %s", listenAddr)

	for {
		conn, err := listener.Accept()
		if err != nil {
			log.Printf("Error accepting connection: %v", err)
			continue
		}
		log.Printf("Accepted TCP connection from %s", conn.RemoteAddr())
		go handleTCPConnection(conn)
	}
}

// handleTCPConnection handles a single accepted TCP connection.
func handleTCPConnection(netConn net.Conn) {
	defer netConn.Close()

	// Create a TCPConnection state object for this connection
	// Note: IPs/Ports are derived from net.Conn
	remoteAddr, ok := netConn.RemoteAddr().(*net.TCPAddr)
	if !ok {
		log.Printf("Could not get remote TCP address from %s", netConn.RemoteAddr())
		return
	}
	localAddr, ok := netConn.LocalAddr().(*net.TCPAddr)
	if !ok {
		log.Printf("Could not get local TCP address from %s", netConn.LocalAddr())
		return
	}

	conn := &TCPConnection{
		State:      TCPStateEstablished, // Assume established for TCP mode start
		ClientIP:   remoteAddr.IP,
		ClientPort: layers.TCPPort(remoteAddr.Port),
		ServerIP:   localAddr.IP,
		ServerPort: layers.TCPPort(localAddr.Port),
		TCPConn:    netConn,
		TLSState:   TLSStateExpectingClientHello, // Start TLS handshake
		// Other fields (ISN, SeqNums) are less relevant in standard TCP mode
		// but initialize buffer
		ReceiveBuffer:      *bytes.NewBuffer([]byte{}),
		H2State:            H2StateExpectPreface, // Initialize H2 state
		HTTP2ReceiveBuffer: new(bytes.Buffer),    // Initialize H2 buffer
	}

	connKey := conn.ConnectionKey() // Use the method to get the key
	connMutex.Lock()
	tcpConnections[connKey] = conn
	connMutex.Unlock()

	log.Printf("Handling TCP connection: %s", connKey)

	// Start the TLS handshake process for this connection
	// This function will read from conn.TCPConn and process TLS records
	// Note: startTLSHandshake function needs to be implemented, likely in tls.go
	err := startTLSHandshake(conn)
	if err != nil {
		log.Printf("TLS handshake error for %s: %v", connKey, err)
	} else {
		log.Printf("TLS handshake successful for %s. Ready for application data.", connKey)
		// TODO: Transition to application data handling phase for TCP mode
		// This might involve reading TLS application data records and passing
		// the decrypted payload to handleHTTPData or similar.
		// For now, we just log success.
	}

	// Cleanup connection from map when done
	connMutex.Lock()
	delete(tcpConnections, connKey)
	connMutex.Unlock()
	log.Printf("Finished handling TCP connection: %s", connKey)
}

// handleTCPPacket parses TCP header and manages TCP state transitions based on port.
func handleTCPPacket(ifce *water.Interface, ipHeader *IPv4Header, tcpSegment []byte) {
	tcpHeader, tcpPayload, err := parseTCPHeader(tcpSegment)
	if err != nil {
		log.Printf("%s%sError parsing TCP header: %v%s", ColorRed, PrefixError, err, ColorReset)
		return
	}

	flagsStr := tcpFlagsToString(tcpHeader.Flags)
	log.Printf("%s%sRCV: %s:%d -> %s:%d Seq: %d Ack: %d Flags: [%s] Win: %d Len: %d%s",
		ColorBlue, PrefixTCP,
		ipHeader.SrcIP, tcpHeader.SrcPort,
		ipHeader.DstIP, tcpHeader.DstPort,
		tcpHeader.SeqNum, tcpHeader.AckNum,
		flagsStr,
		tcpHeader.WindowSize, len(tcpPayload),
		ColorReset,
	)

	connMutex.Lock()
	defer connMutex.Unlock()

	connKey := fmt.Sprintf("%s:%d-%s:%d", ipHeader.SrcIP, tcpHeader.SrcPort, ipHeader.DstIP, tcpHeader.DstPort)
	conn, exists := tcpConnections[connKey]

	switch {
	// Case 1: New SYN (Listen state is implicit)
	case !exists && tcpHeader.Flags&TCPFlagSYN != 0 && tcpHeader.Flags&TCPFlagACK == 0:
		if tcpHeader.DstPort == 80 || tcpHeader.DstPort == 443 {
			log.Printf("%s%sHandling SYN for new connection %s on port %d%s", ColorYellow, PrefixState, connKey, tcpHeader.DstPort, ColorReset)

			serverISN := mrand.Uint32() // Use mrand
			newConn := &TCPConnection{
				State:              TCPStateSynReceived,
				ClientIP:           ipHeader.SrcIP,
				ClientPort:         layers.TCPPort(tcpHeader.SrcPort),
				ServerIP:           ipHeader.DstIP,
				ServerPort:         layers.TCPPort(tcpHeader.DstPort),
				ClientISN:          tcpHeader.SeqNum,
				ServerISN:          serverISN,
				ClientNextSeq:      tcpHeader.SeqNum + 1,
				ServerNextSeq:      serverISN + 1,
				TunIFCE:            ifce, // Store interface for TUN mode replies
				TLSState:           TLSStateNone,
				ReceiveBuffer:      *bytes.NewBuffer([]byte{}),
				H2State:            H2StateExpectPreface, // Initialize H2 state
				HTTP2ReceiveBuffer: new(bytes.Buffer),    // Initialize H2 buffer
			}
			if tcpHeader.DstPort == 443 {
				newConn.TLSState = TLSStateExpectingClientHello
			}
			tcpConnections[connKey] = newConn

			// Send SYN-ACK
			_, err = sendTCPPacket(newConn.TunIFCE, newConn.ServerIP, newConn.ClientIP, uint16(newConn.ServerPort), uint16(newConn.ClientPort),
				newConn.ServerISN, newConn.ClientNextSeq, TCPFlagSYN|TCPFlagACK, nil)
			if err != nil {
				log.Printf("Error sending SYN-ACK for %s: %v", connKey, err)
				delete(tcpConnections, connKey)
			}
		} else {
			log.Printf("%s%sIgnoring SYN for unhandled port %d from %s:%d%s", ColorGray, PrefixWarn, tcpHeader.DstPort, ipHeader.SrcIP, tcpHeader.SrcPort, ColorReset)
		}

	// Case 2: ACK for SYN-ACK
	case exists && conn.State == TCPStateSynReceived && tcpHeader.Flags&TCPFlagACK != 0:
		if tcpHeader.AckNum == conn.ServerNextSeq {
			log.Printf("%s%sConnection %s ESTABLISHED. Port: %d, TLS State: %v%s", ColorYellow, PrefixState, connKey, conn.ServerPort, conn.TLSState, ColorReset)
			conn.State = TCPStateEstablished
			conn.ClientNextSeq = tcpHeader.SeqNum
		} else {
			log.Printf("%s%sInvalid ACK for SYN-ACK on %s. AckNum: %d, Expected: %d%s", ColorYellow, PrefixWarn, connKey, tcpHeader.AckNum, conn.ServerNextSeq, ColorReset)
		}

	// Case 3: Packets on established connection
	case exists && conn.State == TCPStateEstablished:
		// Basic sequence number check (common for both HTTP and TLS data)
		if !(len(tcpPayload) == 0 && tcpHeader.Flags&TCPFlagACK != 0) && tcpHeader.SeqNum != conn.ClientNextSeq {
			log.Printf("%s%sUnexpected sequence number for ESTABLISHED %s. Expected %d, got %d. Flags [%s]. Ignoring.%s", ColorYellow, PrefixWarn, connKey, conn.ClientNextSeq, tcpHeader.SeqNum, tcpFlagsToString(tcpHeader.Flags), ColorReset)
			// Optionally send ACK with expected SeqNum? For now, ignore.
			return
		}

		// Handle FIN first (common for both)
		if tcpHeader.Flags&TCPFlagFIN != 0 {
			handleFIN(conn, tcpHeader)
			return
		}

		// Handle ACK only packets (common for both)
		if len(tcpPayload) == 0 && tcpHeader.Flags&TCPFlagACK != 0 {
			handlePureACK(conn, tcpHeader)
			return
		}

		// Handle data payload based on port
		if len(tcpPayload) > 0 {
			expectedClientNextSeq := conn.ClientNextSeq + uint32(len(tcpPayload))
			ackFlags := uint8(TCPFlagACK)
			// Send ACK for received data (common for both)
			_, err = sendTCPPacket(conn.TunIFCE, conn.ServerIP, conn.ClientIP, uint16(conn.ServerPort), uint16(conn.ClientPort),
				conn.ServerNextSeq, expectedClientNextSeq, ackFlags, nil)
			if err != nil {
				log.Printf("%s%sError sending ACK for received data on %s (Port %d): %v%s", ColorRed, PrefixError, connKey, conn.ServerPort, err, ColorReset)
				// Don't update ClientNextSeq if ACK fails?
				return
			}

			// Dispatch data handling based on port
			if conn.ServerPort == 80 {
				handleHTTPData(conn.TunIFCE, conn, tcpPayload) // Pass TUN interface
			} else if conn.ServerPort == 443 {
				handleTLSData(conn.TunIFCE, conn, tcpPayload) // Pass TUN interface
			} else {
				log.Printf("%s%sReceived data on unexpected established port %d for %s%s", ColorYellow, PrefixWarn, conn.ServerPort, connKey, ColorReset)
			}

			// Update client sequence number after successful ACK and dispatch
			conn.ClientNextSeq = expectedClientNextSeq
		}

	// Case 4: ACK for our FIN (closing connection)
	case exists && conn.State == TCPStateLastAck:
		handleFINACK(conn, tcpHeader)

	// === NEW CASE: Handle packets when we are waiting for client's ACK/FIN ===
	case exists && conn.State == TCPStateFinWait1:
		log.Printf("%s%s[TCP State - %s] Received packet in FIN_WAIT_1. Flags: [%s], Seq: %d, Ack: %d%s", ColorYellow, PrefixState, connKey, tcpFlagsToString(tcpHeader.Flags), tcpHeader.SeqNum, tcpHeader.AckNum, ColorReset)

		// Update client's next expected sequence number based on this packet
		// (Important even if it's just an ACK)
		// FIN counts as 1 sequence number if present
		payloadLen := uint32(len(tcpPayload))
		finIncrement := uint32(0)
		if tcpHeader.Flags&TCPFlagFIN != 0 {
			finIncrement = 1
		}
		expectedClientNextSeqAfterThis := tcpHeader.SeqNum + payloadLen + finIncrement
		if tcpHeader.AckNum != conn.ServerNextSeq {
			log.Printf("%s%s[Warning - %s] ACK number mismatch in FIN_WAIT_1. Expected %d, got %d. Continuing...%s", ColorYellow, PrefixWarn, connKey, conn.ServerNextSeq, tcpHeader.AckNum, ColorReset)
		}

		// Scenario A: Client sends only ACK for our FIN
		if tcpHeader.Flags == TCPFlagACK {
			log.Printf("%s%s[TCP State - %s] Received ACK for our FIN. Transitioning to FIN_WAIT_2.%s", ColorYellow, PrefixState, connKey, ColorReset)
			conn.State = TCPStateFinWait2
			// Update sequence numbers based on ACK received
			conn.ClientNextSeq = expectedClientNextSeqAfterThis // Only update if ACK is valid? For now, assume valid.

			// Scenario B: Client sends FIN (+ACK) while we are in FIN_WAIT_1 (Simultaneous Close or FIN after ACK)
		} else if tcpHeader.Flags&(TCPFlagFIN|TCPFlagACK) != 0 {
			log.Printf("%s%s[TCP State - %s] Received FIN+ACK (or just FIN) in FIN_WAIT_1. Sending ACK. Transitioning to CLOSING/TIME_WAIT.%s", ColorYellow, PrefixState, connKey, ColorReset)

			// Update sequence numbers based on received FIN
			conn.ClientNextSeq = expectedClientNextSeqAfterThis

			// Send ACK for their FIN
			ackFlags := uint8(TCPFlagACK)
			_, err = sendTCPPacket(conn.TunIFCE, conn.ServerIP, conn.ClientIP, uint16(conn.ServerPort), uint16(conn.ClientPort),
				conn.ServerNextSeq, conn.ClientNextSeq, ackFlags, nil)
			if err != nil {
				log.Printf("%s%s[TCP Close Error - %s] Failed to send ACK for client's FIN in FIN_WAIT_1: %v%s", ColorRed, PrefixError, connKey, err, ColorReset)
				// Problematic state, maybe just delete?
				delete(tcpConnections, connKey)
			} else {
				// Transition to TIME_WAIT (simplified, directly closing after ACK)
				// A proper TIME_WAIT state would involve a timer.
				log.Printf("%s%s[TCP State - %s] Sent ACK for client's FIN. Transitioning to TIME_WAIT (and deleting connection).%s", ColorYellow, PrefixState, connKey, ColorReset)
				conn.State = TCPStateTimeWait // Mark as TimeWait just before delete for clarity
				delete(tcpConnections, connKey)
			}

		} else {
			log.Printf("%s%s[Warning - %s] Unexpected flags [%s] received in FIN_WAIT_1. Ignoring.%s", ColorYellow, PrefixWarn, connKey, tcpFlagsToString(tcpHeader.Flags), ColorReset)
		}

	// === NEW CASE: Handle packets when we are waiting for client's FIN ===
	case exists && conn.State == TCPStateFinWait2:
		log.Printf("%s%s[TCP State - %s] Received packet in FIN_WAIT_2. Flags: [%s], Seq: %d, Ack: %d%s", ColorYellow, PrefixState, connKey, tcpFlagsToString(tcpHeader.Flags), tcpHeader.SeqNum, tcpHeader.AckNum, ColorReset)

		// Update client's next expected sequence number based on this packet
		payloadLen := uint32(len(tcpPayload))
		finIncrement := uint32(0)
		if tcpHeader.Flags&TCPFlagFIN != 0 {
			finIncrement = 1
		}
		expectedClientNextSeqAfterThis := tcpHeader.SeqNum + payloadLen + finIncrement

		if tcpHeader.Flags&TCPFlagFIN != 0 {
			log.Printf("%s%s[TCP State - %s] Received FIN from client in FIN_WAIT_2. Sending ACK and closing.%s", ColorYellow, PrefixState, connKey, ColorReset)
			conn.ClientNextSeq = expectedClientNextSeqAfterThis

			// Send ACK for their FIN
			ackFlags := uint8(TCPFlagACK)
			_, err = sendTCPPacket(conn.TunIFCE, conn.ServerIP, conn.ClientIP, uint16(conn.ServerPort), uint16(conn.ClientPort),
				conn.ServerNextSeq, conn.ClientNextSeq, ackFlags, nil)
			if err != nil {
				log.Printf("%s%s[TCP Close Error - %s] Failed to send ACK for client's FIN in FIN_WAIT_2: %v%s", ColorRed, PrefixError, connKey, err, ColorReset)
			} else {
				log.Printf("%s%s[TCP State - %s] Sent ACK for client's FIN. Connection CLOSED.%s", ColorYellow, PrefixState, connKey, ColorReset)
			}
			// Transition to TIME_WAIT (simplified, directly closing after ACK)
			conn.State = TCPStateTimeWait // Mark as TimeWait just before delete
			delete(tcpConnections, connKey)

		} else {
			// Might receive other data or just ACKs, usually ignore in FIN_WAIT_2 for simplicity here
			log.Printf("%s%s[Warning - %s] Received non-FIN packet [%s] in FIN_WAIT_2. Ignoring.%s", ColorYellow, PrefixWarn, connKey, tcpFlagsToString(tcpHeader.Flags), ColorReset)
		}

	default:
		// if exists {
		// log.Printf("%s%sUnhandled TCP packet for %s. State: %v, Flags: [%s]%s", ColorYellow, PrefixWarn, connKey, conn.State, tcpFlagsToString(tcpHeader.Flags), ColorReset)
		// } else {
		// log.Printf("%s%sUnhandled TCP packet for non-existent connection %s. Flags: [%s]%s", ColorYellow, PrefixWarn, connKey, tcpFlagsToString(tcpHeader.Flags), ColorReset)
		// }
		// Optionally send RST if the packet was unexpected for a non-existent connection?
		// For now, just log.
	}
}

// --- Helper functions for specific TCP packet handling (Modified to use conn.TunIFCE) ---

func handleFIN(conn *TCPConnection, tcpHeader *TCPHeader) {
	connKey := conn.ConnectionKey()
	log.Printf("%s%sReceived FIN for connection %s. Entering CLOSE_WAIT.%s", ColorYellow, PrefixState, connKey, ColorReset)
	conn.State = TCPStateCloseWait
	conn.ClientNextSeq = tcpHeader.SeqNum + 1

	// Send ACK for the FIN
	ackFlags := uint8(TCPFlagACK)
	_, err := sendTCPPacket(conn.TunIFCE, conn.ServerIP, conn.ClientIP, uint16(conn.ServerPort), uint16(conn.ClientPort),
		conn.ServerNextSeq, conn.ClientNextSeq, ackFlags, nil)
	if err != nil {
		log.Printf("%s%sError sending ACK for FIN on %s: %v%s", ColorRed, PrefixError, connKey, err, ColorReset)
	}

	// Immediately send our FIN (since we are a simple server)
	log.Printf("%s%sSending FIN for connection %s. Entering LAST_ACK.%s", ColorYellow, PrefixState, connKey, ColorReset)
	finAckFlags := uint8(TCPFlagFIN | TCPFlagACK)
	_, err = sendTCPPacket(conn.TunIFCE, conn.ServerIP, conn.ClientIP, uint16(conn.ServerPort), uint16(conn.ClientPort),
		conn.ServerNextSeq, conn.ClientNextSeq, finAckFlags, nil)
	if err != nil {
		log.Printf("%s%sError sending FIN+ACK on %s: %v%s", ColorRed, PrefixError, connKey, err, ColorReset)
	}
	conn.ServerNextSeq++ // Increment seq for FIN
	conn.State = TCPStateLastAck
}

func handlePureACK(conn *TCPConnection, tcpHeader *TCPHeader) {
	connKey := conn.ConnectionKey()
	// Acknowledge received data if ACK number advances
	if tcpHeader.AckNum > conn.ServerNextSeq {
		log.Printf("%s%sReceived ACK for %d bytes of data for %s. AckNum: %d -> %d%s", ColorYellow, PrefixState, tcpHeader.AckNum-conn.ServerNextSeq, connKey, conn.ServerNextSeq, tcpHeader.AckNum, ColorReset)
		conn.ServerNextSeq = tcpHeader.AckNum // Update server sequence number based on client's ACK
	} else if tcpHeader.AckNum < conn.ServerNextSeq {
		// log.Printf("%s%sReceived duplicate/old ACK for %s. AckNum: %d, ServerNextSeq: %d%s", ColorYellow, PrefixWarn, connKey, tcpHeader.AckNum, conn.ServerNextSeq, ColorReset)
	} else {
		log.Printf("%s%sReceived ACK for %s (no new data acked). AckNum: %d%s", ColorYellow, PrefixState, connKey, tcpHeader.AckNum, ColorReset)
	}
	// TODO: Handle window updates, retransmissions based on ACKs
}

func handleFINACK(conn *TCPConnection, tcpHeader *TCPHeader) {
	connKey := conn.ConnectionKey()
	log.Printf("%s%sHandling ACK for FIN for connection %s%s", ColorYellow, PrefixState, connKey, ColorReset)
	if tcpHeader.Flags&TCPFlagACK != 0 && tcpHeader.AckNum == conn.ServerNextSeq {
		log.Printf("%s%sConnection %s CLOSED normally.%s", ColorYellow, PrefixState, connKey, ColorReset)
		delete(tcpConnections, connKey) // Remove from map
	} else {
		log.Printf("%s%sUnexpected packet in LAST_ACK state for %s. Flags: [%s], AckNum: %d (expected %d)%s", ColorYellow, PrefixWarn, connKey, tcpFlagsToString(tcpHeader.Flags), tcpHeader.AckNum, conn.ServerNextSeq, ColorReset)
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
	// NOTE: Need import "strings"
	return fmt.Sprintf("%v", parts) // Use fmt for now, requires import "strings" later
}

// sendTCPPacket constructs and sends a TCP packet via the TUN interface.
// Returns the length of the TCP payload sent on success.
func sendTCPPacket(ifce *water.Interface, srcIP, dstIP net.IP, srcPort, dstPort uint16, seqNum, ackNum uint32, flags uint8, payload []byte) (int, error) {
	if ifce == nil {
		return 0, fmt.Errorf("cannot send TCP packet: TUN interface is nil")
	}
	log.Printf("%s%sTCP SEND (TUN): %s:%d -> %s:%d Seq: %d Ack: %d Flags: [%s] Len: %d%s",
		ColorBlue, PrefixTCP,
		srcIP, srcPort, dstIP, dstPort, seqNum, ackNum, tcpFlagsToString(flags), len(payload),
		ColorReset,
	)
	tcpHeaderBytes, err := buildTCPHeader(srcIP, dstIP, srcPort, dstPort, seqNum, ackNum, flags, payload)
	if err != nil {
		return 0, fmt.Errorf("failed to build TCP header: %w", err)
	}

	ipHeaderBytes, err := buildIPv4Header(srcIP, dstIP, TCPProtocolNumber, len(tcpHeaderBytes)+len(payload))
	if err != nil {
		return 0, fmt.Errorf("failed to build IP header: %w", err)
	}

	fullPacket := append(ipHeaderBytes, tcpHeaderBytes...)
	fullPacket = append(fullPacket, payload...)
	n, err := ifce.Write(fullPacket)
	if err != nil {
		return 0, fmt.Errorf("failed to write TCP packet to TUN device: %w", err)
	}
	if n != len(fullPacket) {
		return 0, fmt.Errorf("short write for TCP packet: wrote %d bytes, expected %d", n, len(fullPacket))
	}

	return len(payload), nil // Return payload length on success
}

// buildTCPHeader creates a TCP header byte slice including the checksum.
func buildTCPHeader(srcIP, dstIP net.IP, srcPort, dstPort uint16, seqNum, ackNum uint32, flags uint8, payload []byte) ([]byte, error) {
	header := TCPHeader{
		SrcPort:    srcPort,
		DstPort:    dstPort,
		SeqNum:     seqNum,
		AckNum:     ackNum,
		DataOffset: 5, // No options
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
	// Checksum (16-18) initially 0
	binary.BigEndian.PutUint16(headerBytes[18:20], header.UrgentPtr)

	checksum, err := calculateTCPChecksum(srcIP, dstIP, headerBytes, payload)
	if err != nil {
		return nil, fmt.Errorf("failed to calculate TCP checksum: %w", err)
	}
	binary.BigEndian.PutUint16(headerBytes[16:18], checksum)

	return headerBytes, nil
}

// calculateTCPChecksum computes the TCP checksum using a pseudo-header.
func calculateTCPChecksum(srcIP, dstIP net.IP, tcpHeader, tcpPayload []byte) (uint16, error) {
	srcIPv4 := srcIP.To4()
	dstIPv4 := dstIP.To4()
	if srcIPv4 == nil || dstIPv4 == nil {
		return 0, fmt.Errorf("not IPv4 addresses for TCP checksum")
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

	// Zero out checksum field within the combined data for calculation
	if len(tcpHeader) >= 18 { // Ensure header is long enough
		checksumOffsetInCombinedData := 12 + 16 // Pseudo header len + checksum offset in TCP header
		binary.BigEndian.PutUint16(dataForChecksum[checksumOffsetInCombinedData:checksumOffsetInCombinedData+2], 0)
	}

	checksum := calculateChecksum(dataForChecksum) // calculateChecksum is in ip.go
	return checksum, nil
}
