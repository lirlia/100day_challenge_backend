package main

import (
	// For HTTP parsing
	"bufio"
	"bytes"           // For HTTP parsing
	"encoding/binary" // For custom errors
	"errors"
	"flag"
	"fmt"
	"log"
	mrand "math/rand" // For generating IP ID, Renamed import
	"net"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync" // For mutex
	"syscall"
	"time" // For seeding random number generator

	"crypto/rand"

	"github.com/songgao/water"
)

// IPv4Header represents the IPv4 header structure.
// Reference: RFC 791
type IPv4Header struct {
	Version        uint8  // 4 bits
	IHL            uint8  // 4 bits, Header Length in 32-bit words
	TOS            uint8  // Type of Service
	TotalLength    uint16 // Total Length (header + data)
	ID             uint16 // Identification
	Flags          uint8  // 3 bits (Reserved, DF, MF) + 13 bits Fragment Offset -> upper 3 bits
	FragmentOffset uint16 // 3 bits flags + 13 bits Fragment Offset -> lower 13 bits
	TTL            uint8  // Time to Live
	Protocol       uint8  // Protocol (e.g., 6 for TCP, 17 for UDP)
	Checksum       uint16 // Header Checksum
	SrcIP          net.IP // Source IP Address (4 bytes)
	DstIP          net.IP // Destination IP Address (4 bytes)
	Options        []byte // Options (if IHL > 5)
}

// ICMPHeader represents the ICMP header structure.
// Reference: RFC 792
type ICMPHeader struct {
	Type     uint8  // Type (e.g., 8 for Echo Request, 0 for Echo Reply)
	Code     uint8  // Code
	Checksum uint16 // Checksum
	ID       uint16 // Identifier (for Echo Request/Reply)
	Seq      uint16 // Sequence Number (for Echo Request/Reply)
	// Data follows
}

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

	// TLS specific state
	TLSState      TLSHandshakeState
	ReceiveBuffer bytes.Buffer // Buffer for incoming TLS data
	// Add fields for crypto state later (keys, etc.)
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
	IPv4Version              = 4
	IPv4HeaderMinLengthBytes = 20 // Minimum header length (IHL=5)
	ICMPProtocolNumber       = 1
	ICMPEchoRequestType      = 8
	ICMPEchoReplyType        = 0
	ICMPHeaderLengthBytes    = 8
	TCPProtocolNumber        = 6
	TCPHeaderMinLengthBytes  = 20 // Minimum header length (DataOffset=5)

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

// Command-line flags
var (
	devName    = flag.String("dev", "", "TUN device name (e.g., utun4)")
	localIP    = flag.String("localIP", "10.0.0.1", "Local IP address for the TUN device")
	remoteIP   = flag.String("remoteIP", "10.0.0.2", "Remote IP address (peer) for the TUN device")
	subnetMask = flag.String("subnet", "255.255.255.0", "Subnet mask for the TUN device")
	mtu        = flag.Int("mtu", 1500, "MTU for the TUN device")
)

// --- TLS Structures and Constants ---

// TLS Handshake State
type TLSHandshakeState int

const (
	TLSStateNone TLSHandshakeState = iota
	TLSStateExpectingClientHello
	TLSStateSentServerHello
	TLSStateSentCertificate
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
	TLSHandshakeTypeClientHello uint8 = 1
	TLSHandshakeTypeServerHello uint8 = 2
	TLSHandshakeTypeCertificate uint8 = 11 // Added
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

// ConnectionKey generates a standard key for the connection map.
// Added as a helper method for TCPConnection.
func (c *TCPConnection) ConnectionKey() string {
	if c == nil {
		return ""
	}
	return fmt.Sprintf("%s:%d-%s:%d", c.ClientIP, c.ClientPort, c.ServerIP, c.ServerPort)
}

func main() {
	flag.Parse()
	mrand.Seed(time.Now().UnixNano()) // Seed random number generator for IP IDs, Use mrand

	if *localIP == "" || *remoteIP == "" || *subnetMask == "" {
		log.Fatal("localIP, remoteIP, and subnet flags are required")
	}

	// Setup TUN device (create and configure)
	ifce, err := setupTUN(*devName, *localIP, *remoteIP, *subnetMask, *mtu)
	if err != nil {
		log.Fatalf("Failed to setup TUN device: %v", err)
	}
	// Defer closing the interface first, then potentially cleaning up routes/addresses
	defer func() {
		log.Println("Closing TUN device...")
		ifce.Close()
		// Optional: Add cleanup for route and ifconfig if needed
		// cleanupTUN(ifce.Name(), *localIP, *remoteIP, *subnetMask)
	}()

	log.Printf("TUN device '%s' created and configured successfully.", ifce.Name())
	log.Printf(" Interface IP: %s, Peer IP: %s, Subnet Mask: %s", *localIP, *remoteIP, *subnetMask)
	log.Printf("Listening for packets...")

	// Setup signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go processPackets(ifce)

	// Wait for termination signal
	<-sigChan
	log.Println("Shutting down signal received...")
	// The deferred ifce.Close() will handle cleanup
}

// setupTUN creates and configures the TUN device.
// Returns the water.Interface and error.
func setupTUN(devName, localIP, remoteIP, subnetMask string, mtu int) (*water.Interface, error) {
	// TODO: Implement TUN device creation using water
	// TODO: Implement device configuration using os/exec (ifconfig, route)
	log.Printf("Attempting to setup TUN device '%s'...", devName) // Temporary log

	// 1. Create TUN interface with water
	config := water.Config{
		DeviceType: water.TUN,
	}
	if devName != "" {
		config.Name = devName
	}

	ifce, err := water.New(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create TUN device: %w", err)
	}
	actualDevName := ifce.Name() // Get the actual device name assigned by the OS
	log.Printf("TUN device '%s' created by water.", actualDevName)

	// 2. Configure the interface using os/exec
	log.Printf("Configuring device '%s' with IP %s, Peer %s, Mask %s, MTU %d", actualDevName, localIP, remoteIP, subnetMask, mtu)

	// Command 1: ifconfig <dev> <local_ip> <remote_ip> netmask <subnet_mask> mtu <mtu> up
	cmdIfconfig := exec.Command("ifconfig", actualDevName, localIP, remoteIP, "netmask", subnetMask, "mtu", fmt.Sprintf("%d", mtu), "up")
	output, err := cmdIfconfig.CombinedOutput()
	if err != nil {
		ifce.Close() // Close the interface if config fails
		return nil, fmt.Errorf("ifconfig failed: %w Output: %s", err, string(output))
	}
	log.Printf("ifconfig output: %s", string(output))

	// 3. Configure routing (Optional but usually necessary)
	// Calculate network address
	localIPNet := net.ParseIP(localIP)
	mask := net.IPMask(net.ParseIP(subnetMask).To4())
	network := localIPNet.Mask(mask)
	networkCIDR := fmt.Sprintf("%s/%d", network.String(), maskSize(mask))

	log.Printf("Adding route for network %s via %s", networkCIDR, remoteIP)
	// Command 2: route add -net <network_cidr> <remote_ip>
	// Note: macOS route command syntax might differ slightly. '-net' is common.
	cmdRoute := exec.Command("route", "add", "-net", networkCIDR, remoteIP)
	output, err = cmdRoute.CombinedOutput()
	if err != nil {
		// Ignore "file exists" errors which can happen if route already exists
		if !strings.Contains(string(output), "File exists") {
			// Attempt cleanup before failing
			// exec.Command("ifconfig", actualDevName, "down").Run() // Best effort
			ifce.Close()
			return nil, fmt.Errorf("route add failed: %w Output: %s", err, string(output))
		}
		log.Printf("Route add output (ignored existing route error): %s", string(output))
	} else {
		log.Printf("Route add output: %s", string(output))
	}

	return ifce, nil
}

// processPackets reads packets from the TUN device and parses them.
func processPackets(ifce *water.Interface) {
	packet := make([]byte, *mtu+4) // Buffer needs to be large enough for MTU + potential headers (like macOS loopback header)
	for {
		// macOS TUN devices might prepend a 4-byte header indicating the protocol family (AF_INET = 0x00000002)
		// We need to read this header first, then the actual IP packet.
		n, err := ifce.Read(packet)
		if err != nil {
			// Check if the error is due to the interface being closed during shutdown
			if opErr, ok := err.(*net.OpError); ok && opErr.Err.Error() == "file already closed" {
				log.Println("TUN interface closed, stopping packet processing.")
				break
			}
			// Handle other potential errors like "invalid argument" which might occur on close
			if err.Error() == "invalid argument" {
				log.Println("TUN interface error (invalid argument), stopping packet processing.")
				break
			}
			log.Printf("Error reading from TUN device: %v", err)
			continue
		}

		if n == 0 {
			continue
		}

		var ipPacketData []byte
		// Check for macOS TUN header (AF_INET = 0x00000002, Big Endian)
		if n > 4 && binary.BigEndian.Uint32(packet[:4]) == 2 {
			ipPacketData = packet[4:n]
		} else {
			// Assume no prefix header (might be needed for other OS or configurations)
			ipPacketData = packet[:n]
		}

		if len(ipPacketData) == 0 {
			continue
		}

		// Try parsing the packet as IPv4
		ipHeader, payload, err := parseIPv4Header(ipPacketData)
		if err != nil {
			log.Printf("Error parsing IPv4 header: %v (Packet length: %d)", err, len(ipPacketData))
			continue
		}

		// Print parsed header information
		printHeaderInfo(ipHeader, len(ipPacketData))

		// Handle based on protocol
		switch ipHeader.Protocol {
		case ICMPProtocolNumber:
			handleICMPPacket(ifce, ipHeader, payload)
		case TCPProtocolNumber:
			handleTCPPacket(ifce, ipHeader, payload)
		// case 17: // UDP
		//  log.Println("UDP Packet received (not handled)")
		default:
			// log.Printf("Unhandled IP protocol: %d", ipHeader.Protocol)
		}
	}
}

// handleICMPPacket parses ICMP header and handles Echo Requests.
func handleICMPPacket(ifce *water.Interface, ipHeader *IPv4Header, icmpPayload []byte) {
	if len(icmpPayload) < ICMPHeaderLengthBytes {
		log.Printf("ICMP payload too short: %d bytes", len(icmpPayload))
		return
	}

	icmpHeader := &ICMPHeader{}
	icmpHeader.Type = icmpPayload[0]
	icmpHeader.Code = icmpPayload[1]
	icmpHeader.Checksum = binary.BigEndian.Uint16(icmpPayload[2:4])
	icmpHeader.ID = binary.BigEndian.Uint16(icmpPayload[4:6])
	icmpHeader.Seq = binary.BigEndian.Uint16(icmpPayload[6:8])
	icmpData := icmpPayload[ICMPHeaderLengthBytes:]

	// Optional: Verify ICMP checksum
	// calculatedIcmpChecksum := calculateChecksum(icmpPayload)
	// if calculatedIcmpChecksum != 0 { // Valid checksum should be 0 when checksum field itself is included
	//     log.Printf("Invalid ICMP checksum (calculated: 0x%04x, header: 0x%04x)", calculatedIcmpChecksum, icmpHeader.Checksum)
	//     return
	// }

	// Handle Echo Request
	if icmpHeader.Type == ICMPEchoRequestType {
		log.Printf("Received ICMP Echo Request (ID: %d, Seq: %d) from %s", icmpHeader.ID, icmpHeader.Seq, ipHeader.SrcIP)
		err := sendICMPEchoReply(ifce, ipHeader, icmpHeader, icmpData)
		if err != nil {
			log.Printf("Failed to send ICMP Echo Reply: %v", err)
		}
	}
	// Add handlers for other ICMP types if needed
}

// sendICMPEchoReply constructs and sends an ICMP Echo Reply packet.
func sendICMPEchoReply(ifce *water.Interface, reqIPHeader *IPv4Header, reqICMPHeader *ICMPHeader, reqICMPData []byte) error {
	log.Printf("Sending ICMP Echo Reply (ID: %d, Seq: %d) to %s", reqICMPHeader.ID, reqICMPHeader.Seq, reqIPHeader.SrcIP)

	// 1. Build ICMP Echo Reply Header and Payload
	replyICMPPayload := buildICMPPacket(ICMPEchoReplyType, 0, reqICMPHeader.ID, reqICMPHeader.Seq, reqICMPData)

	// 2. Build IP Header for the reply
	replyIPHeaderBytes, err := buildIPv4Header(reqIPHeader.DstIP, reqIPHeader.SrcIP, ICMPProtocolNumber, len(replyICMPPayload))
	if err != nil {
		return fmt.Errorf("failed to build reply IP header: %w", err)
	}

	// 3. Combine IP Header and ICMP Payload
	replyPacket := append(replyIPHeaderBytes, replyICMPPayload...)

	// 4. Write the packet to the TUN device
	// macOS TUN expects the 4-byte protocol family header (AF_INET)
	// afInetBytes := make([]byte, 4)
	// binary.BigEndian.PutUint32(afInetBytes, 2) // AF_INET
	// fullPacket := append(afInetBytes, replyPacket...)

	n, err := ifce.Write(replyPacket) // Write the IP packet directly
	if err != nil {
		return fmt.Errorf("failed to write packet to TUN device: %w", err)
	}
	// if n != len(fullPacket) { // Adjust length check
	if n != len(replyPacket) {
		return fmt.Errorf("short write to TUN device: wrote %d bytes, expected %d", n, len(replyPacket))
	}

	log.Printf("Successfully sent %d bytes (IP Header + ICMP Reply)", len(replyPacket))
	return nil
}

// buildICMPPacket creates an ICMP packet byte slice including the checksum.
func buildICMPPacket(icmpType, icmpCode uint8, id, seq uint16, data []byte) []byte {
	header := ICMPHeader{
		Type:     icmpType,
		Code:     icmpCode,
		Checksum: 0, // Calculate later
		ID:       id,
		Seq:      seq,
	}

	headerBytes := make([]byte, ICMPHeaderLengthBytes)
	headerBytes[0] = header.Type
	headerBytes[1] = header.Code
	// Checksum (bytes 2-3) is initially 0
	binary.BigEndian.PutUint16(headerBytes[4:6], header.ID)
	binary.BigEndian.PutUint16(headerBytes[6:8], header.Seq)

	// Combine header and data
	packet := append(headerBytes, data...)

	// Calculate and set checksum
	checksum := calculateChecksum(packet)
	binary.BigEndian.PutUint16(packet[2:4], checksum)

	return packet
}

// buildIPv4Header creates an IPv4 header byte slice including the checksum.
func buildIPv4Header(srcIP, dstIP net.IP, protocol uint8, payloadLength int) ([]byte, error) {
	if srcIP == nil || dstIP == nil {
		return nil, fmt.Errorf("source or destination IP is nil")
	}
	srcIPv4 := srcIP.To4()
	dstIPv4 := dstIP.To4()
	if srcIPv4 == nil || dstIPv4 == nil {
		return nil, fmt.Errorf("source or destination IP is not IPv4")
	}

	header := IPv4Header{
		Version:        IPv4Version,
		IHL:            5, // Assuming no options
		TOS:            0,
		TotalLength:    uint16(IPv4HeaderMinLengthBytes + payloadLength),
		ID:             uint16(mrand.Intn(65536)), // Random ID, Use mrand
		Flags:          0,                         // Assuming no fragmentation needed (DF=0, MF=0)
		FragmentOffset: 0,
		TTL:            64, // Common default TTL
		Protocol:       protocol,
		Checksum:       0, // Calculate later
		SrcIP:          srcIPv4,
		DstIP:          dstIPv4,
	}

	headerBytes := make([]byte, IPv4HeaderMinLengthBytes)

	headerBytes[0] = (header.Version << 4) | header.IHL
	headerBytes[1] = header.TOS
	binary.BigEndian.PutUint16(headerBytes[2:4], header.TotalLength)
	binary.BigEndian.PutUint16(headerBytes[4:6], header.ID)
	flagsAndOffset := (uint16(header.Flags) << 13) | (header.FragmentOffset & 0x1FFF)
	binary.BigEndian.PutUint16(headerBytes[6:8], flagsAndOffset)
	headerBytes[8] = header.TTL
	headerBytes[9] = header.Protocol
	// Checksum (bytes 10-11) is initially 0
	copy(headerBytes[12:16], header.SrcIP)
	copy(headerBytes[16:20], header.DstIP)

	// Calculate and set checksum
	checksum := calculateChecksum(headerBytes)
	binary.BigEndian.PutUint16(headerBytes[10:12], checksum)

	return headerBytes, nil
}

// calculateChecksum computes the internet checksum (RFC 1071).
func calculateChecksum(data []byte) uint16 {
	var sum uint32
	length := len(data)
	index := 0

	// Sum 16-bit words
	for length > 1 {
		sum += uint32(binary.BigEndian.Uint16(data[index : index+2]))
		index += 2
		length -= 2
	}

	// Add remaining byte if any (pad with 0)
	if length > 0 {
		sum += uint32(data[index]) << 8 // Treat as big-endian
	}

	// Fold 32-bit sum to 16 bits: add carrier to result
	for (sum >> 16) > 0 {
		sum = (sum & 0xFFFF) + (sum >> 16)
	}

	// One's complement
	return uint16(^sum)
}

// parseIPv4Header parses the byte slice into an IPv4Header struct.
func parseIPv4Header(packet []byte) (*IPv4Header, []byte, error) {
	if len(packet) < IPv4HeaderMinLengthBytes {
		return nil, nil, fmt.Errorf("packet too short for IPv4 header: %d bytes", len(packet))
	}

	header := &IPv4Header{}

	// First byte: Version (4 bits) + IHL (4 bits)
	header.Version = packet[0] >> 4
	header.IHL = packet[0] & 0x0F

	if header.Version != IPv4Version {
		return nil, nil, fmt.Errorf("not an IPv4 packet (Version: %d)", header.Version)
	}

	headerLengthBytes := int(header.IHL) * 4
	if len(packet) < headerLengthBytes {
		return nil, nil, fmt.Errorf("packet too short for declared header length (IHL): %d bytes required, got %d", headerLengthBytes, len(packet))
	}

	// Parse remaining fixed fields
	header.TOS = packet[1]
	header.TotalLength = binary.BigEndian.Uint16(packet[2:4])
	header.ID = binary.BigEndian.Uint16(packet[4:6])

	// Flags (3 bits) and Fragment Offset (13 bits) from bytes 6 and 7
	flagsAndOffset := binary.BigEndian.Uint16(packet[6:8])
	header.Flags = uint8(flagsAndOffset >> 13)      // Extract upper 3 bits
	header.FragmentOffset = flagsAndOffset & 0x1FFF // Extract lower 13 bits

	header.TTL = packet[8]
	header.Protocol = packet[9]
	header.Checksum = binary.BigEndian.Uint16(packet[10:12])

	// Parse IP addresses
	header.SrcIP = net.IP(packet[12:16])
	header.DstIP = net.IP(packet[16:20])

	// Extract options if IHL > 5
	if headerLengthBytes > IPv4HeaderMinLengthBytes {
		header.Options = packet[IPv4HeaderMinLengthBytes:headerLengthBytes]
	}

	// Calculate payload start
	payload := packet[headerLengthBytes:]

	// --- Payload Length Calculation Correction ---
	// The actual payload length should be derived from the IP TotalLength minus the header length.
	// This handles cases where the received packet might contain extra padding beyond the IP TotalLength.
	payloadLen := 0
	if int(header.TotalLength) >= headerLengthBytes {
		payloadLen = int(header.TotalLength) - headerLengthBytes
	} else {
		return nil, nil, fmt.Errorf("invalid header TotalLength (%d) < header length (%d)", header.TotalLength, headerLengthBytes)
	}

	// Ensure we don't slice beyond the actual received packet length
	if payloadLen > len(payload) {
		log.Printf("Warning: Calculated payload length (%d) is greater than available data length (%d). Truncating.", payloadLen, len(payload))
		payloadLen = len(payload) // Use the available data length
	}

	payload = payload[:payloadLen]
	// --- End Correction ---

	// Optional: Verify IP header checksum
	// Re-calculate checksum over the received header with Checksum field zeroed out
	// receivedChecksum := header.Checksum
	// binary.BigEndian.PutUint16(packet[10:12], 0) // Zero out checksum field for calculation
	// calculatedChecksum := calculateChecksum(packet[:headerLengthBytes])
	// binary.BigEndian.PutUint16(packet[10:12], receivedChecksum) // Restore original checksum
	// if calculatedChecksum != receivedChecksum {
	//     log.Printf("Invalid IP header checksum (calculated: 0x%04x, header: 0x%04x)", calculatedChecksum, receivedChecksum)
	//     // Depending on requirements, might return an error here
	// }

	return header, payload, nil
}

// printHeaderInfo prints the parsed IPv4 header information.
func printHeaderInfo(header *IPv4Header, packetLen int) {
	flagsStr := ""
	if header.Flags&0x04 != 0 { // Reserved bit (should be 0)
		flagsStr += "[Reserved!]"
	}
	if header.Flags&0x02 != 0 {
		flagsStr += "[DF]" // Don't Fragment
	}
	if header.Flags&0x01 != 0 {
		flagsStr += "[MF]" // More Fragments
	}
	if flagsStr == "" {
		flagsStr = "None"
	}

	fmt.Printf("--- Packet Received (%d bytes) ---\n", packetLen)
	fmt.Printf("  IPv4 Header (%d bytes):\n", int(header.IHL)*4)
	fmt.Printf("    Version: %d, IHL: %d (%d bytes), TOS: 0x%02x\n", header.Version, header.IHL, int(header.IHL)*4, header.TOS)
	fmt.Printf("    Total Length: %d, ID: 0x%04x\n", header.TotalLength, header.ID)
	fmt.Printf("    Flags: %s, Fragment Offset: %d\n", flagsStr, header.FragmentOffset)
	fmt.Printf("    TTL: %d, Protocol: %d (%s)\n", header.TTL, header.Protocol, ipProtocolToString(header.Protocol))
	fmt.Printf("    Checksum: 0x%04x\n", header.Checksum)
	fmt.Printf("    Source IP: %s\n", header.SrcIP)
	fmt.Printf("    Destination IP: %s\n", header.DstIP)
	if len(header.Options) > 0 {
		fmt.Printf("    Options: %d bytes\n", len(header.Options)) // Simple indication for now
	}
	fmt.Println("----------------------------------")
}

// ipProtocolToString converts common IP protocol numbers to strings.
func ipProtocolToString(protocol uint8) string {
	switch protocol {
	case 1:
		return "ICMP"
	case 6:
		return "TCP"
	case 17:
		return "UDP"
	default:
		return fmt.Sprintf("Unknown (%d)", protocol)
	}
}

// maskSize calculates the prefix length from a net.IPMask.
func maskSize(mask net.IPMask) int {
	ones, _ := mask.Size()
	return ones
}

// Optional cleanup function (example)
// func cleanupTUN(devName, localIP, remoteIP, subnetMask string) {
// 	log.Printf("Cleaning up TUN device '%s' configuration...", devName)
//
// 	localIPNet := net.ParseIP(localIP)
// 	mask := net.IPMask(net.ParseIP(subnetMask).To4())
// 	network := localIPNet.Mask(mask)
// 	networkCIDR := fmt.Sprintf("%s/%d", network.String(), maskSize(mask))
//
// 	// Delete route
// 	cmdRouteDel := exec.Command("route", "delete", "-net", networkCIDR, remoteIP)
// 	output, err := cmdRouteDel.CombinedOutput()
// 	if err != nil {
// 		log.Printf("Failed to delete route: %v Output: %s", err, string(output))
// 	} else {
// 		log.Printf("Route delete output: %s", string(output))
// 	}
//
// 	// Bring interface down
// 	cmdIfconfigDown := exec.Command("ifconfig", devName, "down")
// 	output, err = cmdIfconfigDown.CombinedOutput()
// 	if err != nil {
// 		log.Printf("Failed to bring interface down: %v Output: %s", err, string(output))
// 	} else {
// 		log.Printf("Ifconfig down output: %s", string(output))
// 	}
// }

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
				TLSState:      TLSStateNone, // Default to None
			}
			if tcpHeader.DstPort == 443 {
				newConn.TLSState = TLSStateExpectingClientHello // Set initial TLS state for port 443
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
				handleHTTPData(ifce, conn, tcpPayload)
			} else if conn.ServerPort == 443 {
				handleTLSData(ifce, conn, tcpPayload)
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

// --- HTTP Handling (Port 80) ---

// parseHTTPRequest parses a simple HTTP/1.x request.
func parseHTTPRequest(payload []byte) (method, uri, version string, headers map[string]string, err error) {
	headers = make(map[string]string)
	reader := bufio.NewReader(bytes.NewReader(payload))
	reqLine, err := reader.ReadString('\n')
	if err != nil {
		err = fmt.Errorf("failed to read request line: %w", err)
		return
	}
	reqLine = strings.TrimSpace(reqLine)
	parts := strings.Fields(reqLine)
	if len(parts) != 3 {
		err = fmt.Errorf("invalid request line format: %q", reqLine)
		return
	}
	method, uri, version = parts[0], parts[1], parts[2]
	if !strings.HasPrefix(version, "HTTP/1.") {
		err = fmt.Errorf("unsupported HTTP version: %s", version)
		return
	}
	for {
		line, errRead := reader.ReadString('\n')
		if errRead != nil {
			if errRead.Error() == "EOF" || line == "\r\n" || line == "\n" {
				err = nil
				break
			}
			err = fmt.Errorf("failed to read header line: %w", errRead)
			return
		}
		line = strings.TrimSpace(line)
		if line == "" {
			break
		}
		headerParts := strings.SplitN(line, ":", 2)
		if len(headerParts) != 2 {
			log.Printf("Skipping malformed header line: %q", line)
			continue
		}
		headerName := strings.TrimSpace(headerParts[0])
		headerValue := strings.TrimSpace(headerParts[1])
		headers[headerName] = headerValue
	}
	return
}

func handleHTTPData(ifce *water.Interface, conn *TCPConnection, payload []byte) {
	log.Printf("Handling HTTP data (%d bytes) for %s", len(payload), conn.ConnectionKey())
	// NOTE: This simplified version parses the first segment as a full request.
	// Proper implementation requires buffering similar to TLS.
	method, uri, _, headers, err := parseHTTPRequest(payload)
	if err != nil {
		log.Printf("Failed to parse HTTP request for %s: %v", conn.ConnectionKey(), err)
		// TODO: Send HTTP 400 Bad Request response
		return
	}

	log.Printf("HTTP Request Parsed: [%s %s ...] from %s:%d", method, uri, conn.ClientIP, conn.ClientPort)
	for k, v := range headers {
		log.Printf("  HTTP Header: %s: %s", k, v)
	}

	// Send simple HTTP 200 OK response
	body := "<html><body><h1>Hello from userspace HTTP/1.1! (Port 80)</h1></body></html>"
	responseHeaders := map[string]string{
		"Content-Type":   "text/html; charset=utf-8",
		"Content-Length": fmt.Sprintf("%d", len(body)),
		"Connection":     "close", // Close connection after response for simplicity
	}
	statusLine := "HTTP/1.1 200 OK"
	var respBuilder strings.Builder
	respBuilder.WriteString(statusLine + "\r\n")
	for k, v := range responseHeaders {
		respBuilder.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	respBuilder.WriteString("\r\n")
	respBuilder.WriteString(body)
	httpResp := respBuilder.String()

	respFlags := uint8(TCPFlagPSH | TCPFlagACK | TCPFlagFIN) // Send FIN with response
	err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
		conn.ServerNextSeq, conn.ClientNextSeq, respFlags, []byte(httpResp))

	if err != nil {
		log.Printf("Error sending HTTP 200 response: %v", err)
	} else {
		conn.ServerNextSeq += uint32(len(httpResp)) + 1 // +1 for FIN
		conn.State = TCPStateFinWait1                   // We sent FIN
		log.Printf("Sent HTTP 200 Response and FIN, entering FIN_WAIT_1 for %s", conn.ConnectionKey())
	}
}

// --- TLS Handling (Port 443) ---

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

		// Handle based on record type and current TLS state
		switch recordHeader.Type {
		case TLSRecordTypeHandshake:
			log.Printf("[TLS Debug - %s] Dispatching to handleTLSHandshakeRecord.", connKey)
			handleTLSHandshakeRecord(ifce, conn, recordPayload)
		case TLSRecordTypeChangeCipherSpec:
			log.Printf("[TLS Info - %s] Received ChangeCipherSpec (Handling TBD)", connKey)
		case TLSRecordTypeAlert:
			log.Printf("[TLS Info - %s] Received Alert Record (Payload: %x)", connKey, recordPayload)
		case TLSRecordTypeApplicationData:
			log.Printf("[TLS Info - %s] Received Application Data Record (Length: %d, Decryption TBD)", connKey, len(recordPayload))
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
			log.Printf("[TLS Warn - %s] Unexpected ClientHello received in state %v", conn.TLSState, connKey)
		}
	default:
		log.Printf("[TLS Info - %s] Unhandled Handshake Message Type %d", handshakeType, connKey)
	}
	log.Printf("[TLS Debug - %s] Exiting handleTLSHandshakeRecord.", connKey)
}

// handleClientHello parses ClientHello and sends ServerHello.
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

	serverHelloMsg, err := buildServerHello(info.Version, serverRandom, nil, chosenSuite, 0, chosenALPN)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ServerHello message: %v", connKey, err)
		return
	}

	serverHelloRecord, err := buildTLSRecord(TLSRecordTypeHandshake, info.Version, serverHelloMsg)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build ServerHello record: %v", connKey, err)
		return
	}

	// --- Send ServerHello Record ---
	log.Printf("[TLS Debug - %s] Sending ServerHello record (%d bytes).", connKey, len(serverHelloRecord))
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

	certRecord, err := buildTLSRecord(TLSRecordTypeHandshake, 0x0303, certMsg) // Use TLS 1.2 version
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to build Certificate record: %v", connKey, err)
		return
	}

	log.Printf("[TLS Debug - %s] Sending Certificate record (%d bytes).", connKey, len(certRecord))
	err = sendRawTLSRecord(ifce, conn, certRecord)
	if err != nil {
		log.Printf("[TLS Error - %s] Failed to send Certificate record: %v", connKey, err)
		return
	}

	conn.TLSState = TLSStateSentCertificate
	log.Printf("[TLS Info - %s] Dummy Certificate sent. TLS State -> %v", connKey, conn.TLSState)

	// TODO: Send ServerKeyExchange, ServerHelloDone

	log.Printf("[TLS Debug - %s] Exiting handleClientHello successfully (after sending ServerHello and Certificate).", connKey)
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
// Assumes the record bytes are fully formed.
func sendRawTLSRecord(ifce *water.Interface, conn *TCPConnection, record []byte) error {
	// This function is essentially sending application data from TCP's perspective.
	// We need to wrap this in TCP segment(s) and IP packet(s).
	// We can reuse sendTCPPacket, but need to be careful with sequence numbers.

	// We are sending data, so ACK flag should be set, AckNum should acknowledge client's next expected seq.
	flags := uint8(TCPFlagPSH | TCPFlagACK) // PSH to indicate data push
	payload := record

	log.Printf("[TLS Debug - %s] Preparing to send TLS record (%d bytes) via sendTCPPacket.", conn.ConnectionKey(), len(payload))

	err := sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
		conn.ServerNextSeq, conn.ClientNextSeq, flags, payload)
	if err != nil {
		return fmt.Errorf("sendTCPPacket failed for TLS record: %w", err)
	}

	// If sendTCPPacket is successful, update the server sequence number
	conn.ServerNextSeq += uint32(len(payload))
	log.Printf("[TLS Debug - %s] Updated ServerNextSeq to %d after sending TLS record.", conn.ConnectionKey(), conn.ServerNextSeq)

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
	return strings.Join(parts, ",")
}

// sendTCPPacket constructs and sends a TCP packet.
func sendTCPPacket(ifce *water.Interface, srcIP, dstIP net.IP, srcPort, dstPort uint16, seqNum, ackNum uint32, flags uint8, payload []byte) error {
	log.Printf("TCP SEND: %s:%d -> %s:%d Seq: %d Ack: %d Flags: [%s] Len: %d",
		srcIP, srcPort, dstIP, dstPort, seqNum, ackNum, tcpFlagsToString(flags), len(payload))
	tcpHeaderBytes, err := buildTCPHeader(srcIP, dstIP, srcPort, dstPort, seqNum, ackNum, flags, payload)
	if err != nil {
		return fmt.Errorf("failed to build TCP header: %w", err)
	}
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
	if len(tcpHeader) >= 18 {
		binary.BigEndian.PutUint16(dataForChecksum[12+16:12+18], 0)
	}
	checksum := calculateChecksum(dataForChecksum)
	return checksum, nil
}

// buildCertificateMessage constructs a dummy Certificate handshake message.
// In a real implementation, this would load and format actual certificates.
func buildCertificateMessage() ([]byte, error) {
	// Dummy certificate data (just some arbitrary bytes)
	// Structure: TotalCertificatesLength(3 bytes) + Cert1Length(3 bytes) + Cert1Data(...) + ...
	dummyCertData := []byte(`-----BEGIN CERTIFICATE-----
THIS IS A DUMMY CERTIFICATE
-----END CERTIFICATE-----`)
	certLen := uint32(len(dummyCertData))
	totalCertsLen := certLen

	// Message body length calculation:
	// 3 bytes for total certs length + 3 bytes for cert1 length + cert1 data length
	messageBodyLen := 3 + 3 + certLen

	// Handshake header: Type (1) + Length (3)
	message := make([]byte, 4+messageBodyLen)
	message[0] = TLSHandshakeTypeCertificate
	message[1] = byte(messageBodyLen >> 16)
	message[2] = byte(messageBodyLen >> 8)
	message[3] = byte(messageBodyLen)

	offset := 4
	// Total certificates length (3 bytes)
	message[offset] = byte(totalCertsLen >> 16)
	message[offset+1] = byte(totalCertsLen >> 8)
	message[offset+2] = byte(totalCertsLen)
	offset += 3

	// Certificate 1 length (3 bytes)
	message[offset] = byte(certLen >> 16)
	message[offset+1] = byte(certLen >> 8)
	message[offset+2] = byte(certLen)
	offset += 3

	// Certificate 1 data
	copy(message[offset:], dummyCertData)
	offset += int(certLen)

	// Sanity check
	if offset != len(message) {
		return nil, fmt.Errorf("internal error building dummy Certificate message: length mismatch (offset %d, total %d)", offset, len(message))
	}

	return message, nil
}
