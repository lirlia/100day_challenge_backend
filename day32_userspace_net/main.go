package main

import (
	"encoding/binary"
	"flag"
	"fmt"
	"log"
	"math/rand" // For generating IP ID
	"net"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync" // For mutex
	"syscall"
	"time" // For seeding random number generator

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

func main() {
	flag.Parse()
	rand.Seed(time.Now().UnixNano()) // Seed random number generator for IP IDs

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
		ID:             uint16(rand.Intn(65536)), // Random ID
		Flags:          0,                        // Assuming no fragmentation needed (DF=0, MF=0)
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

// handleTCPPacket parses TCP header and manages TCP state transitions for handshake.
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

	// Connection key from the client's perspective
	connKey := fmt.Sprintf("%s:%d-%s:%d", ipHeader.SrcIP, tcpHeader.SrcPort, ipHeader.DstIP, tcpHeader.DstPort)
	conn, exists := tcpConnections[connKey]

	switch {
	// Case 1: New connection attempt (SYN received)
	case !exists && tcpHeader.Flags&TCPFlagSYN != 0 && tcpHeader.Flags&TCPFlagACK == 0 && tcpHeader.DstPort == ListenPort:
		log.Printf("Handling SYN for new connection %s", connKey)
		// Basic SYN flood protection (very rudimentary)
		if len(tcpConnections) > 1000 {
			log.Println("Too many connections, ignoring SYN")
			return
		}

		serverISN := rand.Uint32() // Generate server's initial sequence number
		newConn := &TCPConnection{
			State:         TCPStateSynReceived,
			ClientIP:      ipHeader.SrcIP,
			ClientPort:    tcpHeader.SrcPort,
			ServerIP:      ipHeader.DstIP,    // Our IP
			ServerPort:    tcpHeader.DstPort, // Our Port (ListenPort)
			ClientISN:     tcpHeader.SeqNum,
			ServerISN:     serverISN,
			ClientNextSeq: tcpHeader.SeqNum + 1, // Expect client's ISN + 1 next
			ServerNextSeq: serverISN + 1,        // We send ISN, next will be ISN + 1
		}
		tcpConnections[connKey] = newConn

		// Send SYN-ACK
		err = sendTCPPacket(ifce, newConn.ServerIP, newConn.ClientIP, newConn.ServerPort, newConn.ClientPort,
			newConn.ServerISN, newConn.ClientNextSeq, TCPFlagSYN|TCPFlagACK, nil)
		if err != nil {
			log.Printf("Error sending SYN-ACK for %s: %v", connKey, err)
			delete(tcpConnections, connKey) // Clean up on error
		}

	// Case 2: ACK received for our SYN-ACK (completing handshake)
	case exists && conn.State == TCPStateSynReceived && tcpHeader.Flags&TCPFlagACK != 0:
		log.Printf("Handling ACK for SYN-ACK for connection %s", connKey)
		// Validate ACK number
		if tcpHeader.AckNum == conn.ServerNextSeq {
			log.Printf("Connection %s ESTABLISHED", connKey)
			conn.State = TCPStateEstablished
			conn.ClientNextSeq = tcpHeader.SeqNum // Update expected sequence from client
			// Now we can start receiving/sending data (not implemented)
		} else {
			log.Printf("Invalid ACK number for %s. Expected %d, got %d. Sending RST.", connKey, conn.ServerNextSeq, tcpHeader.AckNum)
			// Send RST
			sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
				tcpHeader.AckNum, 0, TCPFlagRST|TCPFlagACK, nil) // Send RST with received AckNum as SeqNum
			delete(tcpConnections, connKey)
		}

	// Case 3: Data or other packets on established connection (placeholder)
	case exists && conn.State == TCPStateEstablished:
		log.Printf("Received packet for established connection %s", connKey)

		// --- Check for FIN first ---
		if tcpHeader.Flags&TCPFlagFIN != 0 {
			log.Printf("Received FIN for connection %s. Entering CLOSE_WAIT.", connKey)
			conn.State = TCPStateCloseWait
			// FIN consumes 1 sequence number
			conn.ClientNextSeq = tcpHeader.SeqNum + 1

			// Send ACK for the FIN
			ackFlags := uint8(TCPFlagACK)
			err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
				conn.ServerNextSeq, conn.ClientNextSeq, ackFlags, nil)
			if err != nil {
				log.Printf("Error sending ACK for FIN on %s: %v", connKey, err)
				// Don't necessarily close here, maybe just log
			}

			// In a real server, we'd wait for the application to close.
			// Here, we immediately send our FIN since we are just an echo server.
			log.Printf("Sending FIN for connection %s. Entering LAST_ACK.", connKey)
			finAckFlags := uint8(TCPFlagFIN | TCPFlagACK)
			err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
				conn.ServerNextSeq, conn.ClientNextSeq, finAckFlags, nil)
			if err != nil {
				log.Printf("Error sending FIN+ACK on %s: %v", connKey, err)
				// Consider closing connection or other error handling
			}
			conn.ServerNextSeq++ // Our FIN consumes 1 sequence number
			conn.State = TCPStateLastAck
			return // Don't process data if FIN was received
		}
		// --- End FIN Check ---

		// --- Begin Data Echo Logic ---
		payloadLen := len(tcpPayload)
		ackOnly := payloadLen == 0 && tcpHeader.Flags&TCPFlagACK != 0 && tcpHeader.Flags&TCPFlagFIN == 0 // Exclude FIN ACKs

		// Basic Sequence Number Check (ignoring windowing for simplicity)
		if !ackOnly && tcpHeader.SeqNum != conn.ClientNextSeq {
			log.Printf("Unexpected sequence number for %s. Expected %d, got %d. Ignoring.", connKey, conn.ClientNextSeq, tcpHeader.SeqNum)
			// In a real implementation, might send duplicate ACK or handle out-of-order
			return
		}

		// If it's just an ACK for data we sent, check the AckNum
		if ackOnly {
			if tcpHeader.AckNum > conn.ServerNextSeq {
				log.Printf("Received ACK for future data for %s. AckNum: %d, ServerNextSeq: %d", connKey, tcpHeader.AckNum, conn.ServerNextSeq)
				// Update ServerNextSeq if it's a valid cumulative ACK (simplification: just update if greater)
				conn.ServerNextSeq = tcpHeader.AckNum
			} else if tcpHeader.AckNum < conn.ServerNextSeq {
				log.Printf("Received duplicate ACK for %s. AckNum: %d, ServerNextSeq: %d", connKey, tcpHeader.AckNum, conn.ServerNextSeq)
			} else {
				// AckNum == conn.ServerNextSeq, valid ACK
				log.Printf("Received valid ACK for %s. AckNum: %d", connKey, tcpHeader.AckNum)
			}
			// No data to echo back on pure ACK
			return
		}

		// Handle received data (Echo it back)
		if payloadLen > 0 {
			log.Printf("Received %d bytes of data for %s. Echoing back.", payloadLen, connKey)

			// 1. Update expected client sequence number
			conn.ClientNextSeq += uint32(payloadLen)

			// 2. Send ACK for the received data immediately
			ackFlags := uint8(TCPFlagACK)
			err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
				conn.ServerNextSeq, conn.ClientNextSeq, ackFlags, nil)
			if err != nil {
				log.Printf("Error sending ACK for received data on %s: %v", connKey, err)
				// Consider closing connection or other error handling
				return
			}

			// 3. Send the echo data
			echoFlags := uint8(TCPFlagPSH | TCPFlagACK) // PSH to indicate data push
			echoPayload := tcpPayload                   // Use the received payload
			err = sendTCPPacket(ifce, conn.ServerIP, conn.ClientIP, conn.ServerPort, conn.ClientPort,
				conn.ServerNextSeq, conn.ClientNextSeq, echoFlags, echoPayload)
			if err != nil {
				log.Printf("Error sending echo data on %s: %v", connKey, err)
				// Consider closing connection or other error handling
				return
			}

			// 4. Update server sequence number
			conn.ServerNextSeq += uint32(payloadLen)
		}

		// TODO: Handle FIN, RST flags received on established connection
		// --- End Data Echo Logic ---

	// Case 4: ACK for our FIN (closing connection)
	case exists && conn.State == TCPStateLastAck:
		log.Printf("Handling ACK for FIN for connection %s", connKey)
		if tcpHeader.Flags&TCPFlagACK != 0 && tcpHeader.AckNum == conn.ServerNextSeq {
			log.Printf("Connection %s CLOSED normally.", connKey)
			delete(tcpConnections, connKey)
		} else {
			log.Printf("Unexpected packet in LAST_ACK state for %s. Flags: [%s], AckNum: %d (expected %d)",
				connKey, flagsStr, tcpHeader.AckNum, conn.ServerNextSeq)
			// Optional: Send RST? Or just ignore.
		}

	// TODO: Add handling for FIN, RST, other states
	default:
		// Handle packets for unknown connections or unexpected states (e.g., send RST)
		if tcpHeader.Flags&TCPFlagRST == 0 { // Don't send RST in response to an RST
			log.Printf("Unexpected packet or state for %s / %s:%d -> %s:%d. Flags: [%s]. Sending RST.",
				connKey, ipHeader.SrcIP, tcpHeader.SrcPort, ipHeader.DstIP, tcpHeader.DstPort, flagsStr)
			seqNum := uint32(0)
			ackNum := tcpHeader.SeqNum + uint32(len(tcpPayload)) // Basic ACK calculation
			if tcpHeader.Flags&TCPFlagSYN != 0 {                 // SYN counts as 1 byte in seq space
				ackNum = tcpHeader.SeqNum + 1
			}
			// If no ACK in incoming, Seqnum is 0. If ACK is set, use incoming AckNum as Seqnum
			if tcpHeader.Flags&TCPFlagACK != 0 {
				seqNum = tcpHeader.AckNum
			}

			sendTCPPacket(ifce, ipHeader.DstIP, ipHeader.SrcIP, tcpHeader.DstPort, tcpHeader.SrcPort,
				seqNum, ackNum, TCPFlagRST|TCPFlagACK, nil)
		}
	}
}

// sendTCPPacket constructs and sends a TCP packet.
func sendTCPPacket(ifce *water.Interface, srcIP, dstIP net.IP, srcPort, dstPort uint16, seqNum, ackNum uint32, flags uint8, payload []byte) error {
	log.Printf("TCP SEND: %s:%d -> %s:%d Seq: %d Ack: %d Flags: [%s] Len: %d",
		srcIP, srcPort, dstIP, dstPort, seqNum, ackNum, tcpFlagsToString(flags), len(payload))

	// 1. Build TCP Header
	tcpHeaderBytes, err := buildTCPHeader(srcIP, dstIP, srcPort, dstPort, seqNum, ackNum, flags, payload)
	if err != nil {
		return fmt.Errorf("failed to build TCP header: %w", err)
	}

	// 2. Build IP Header
	ipHeaderBytes, err := buildIPv4Header(srcIP, dstIP, TCPProtocolNumber, len(tcpHeaderBytes)+len(payload))
	if err != nil {
		return fmt.Errorf("failed to build IP header: %w", err)
	}

	// 3. Combine IP Header and TCP Segment
	fullPacket := append(ipHeaderBytes, tcpHeaderBytes...)
	fullPacket = append(fullPacket, payload...)

	// 4. Write to TUN device (library handles AF_INET header on macOS)
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
		DataOffset: 5, // Assuming no options, header length = 5 * 4 = 20 bytes
		Reserved:   0,
		Flags:      flags,
		WindowSize: 65535, // Fixed window size for simplicity
		Checksum:   0,     // Calculate later
		UrgentPtr:  0,
	}
	headerLengthBytes := int(header.DataOffset) * 4
	headerBytes := make([]byte, headerLengthBytes)

	binary.BigEndian.PutUint16(headerBytes[0:2], header.SrcPort)
	binary.BigEndian.PutUint16(headerBytes[2:4], header.DstPort)
	binary.BigEndian.PutUint32(headerBytes[4:8], header.SeqNum)
	binary.BigEndian.PutUint32(headerBytes[8:12], header.AckNum)
	headerBytes[12] = (header.DataOffset << 4) // Reserved and NS are 0
	headerBytes[13] = header.Flags
	binary.BigEndian.PutUint16(headerBytes[14:16], header.WindowSize)
	// Checksum (16-17) is initially 0
	binary.BigEndian.PutUint16(headerBytes[18:20], header.UrgentPtr)

	// Calculate Checksum
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
		return 0, fmt.Errorf("source or destination IP is not IPv4 for TCP checksum")
	}

	pseudoHeader := make([]byte, 12)
	copy(pseudoHeader[0:4], srcIPv4)
	copy(pseudoHeader[4:8], dstIPv4)
	pseudoHeader[8] = 0 // Reserved
	pseudoHeader[9] = TCPProtocolNumber
	tcpLength := uint16(len(tcpHeader) + len(tcpPayload))
	binary.BigEndian.PutUint16(pseudoHeader[10:12], tcpLength)

	// Combine pseudo-header, TCP header, and payload for checksum calculation
	dataForChecksum := append(pseudoHeader, tcpHeader...)
	dataForChecksum = append(dataForChecksum, tcpPayload...)

	// Ensure checksum field in header is 0 for calculation
	if len(tcpHeader) >= 18 {
		binary.BigEndian.PutUint16(dataForChecksum[12+16:12+18], 0)
	}

	checksum := calculateChecksum(dataForChecksum) // Reuse the internet checksum func
	return checksum, nil
}

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

	// Data Offset (4 bits), Reserved (3 bits), NS flag (1 bit) in byte 12
	header.DataOffset = segment[12] >> 4
	// header.Reserved = (segment[12] & 0x0E) >> 1 // If needed
	// NS flag = segment[12] & 0x01 // If needed

	// Flags (CWR, ECE, URG, ACK, PSH, RST, SYN, FIN) in byte 13
	header.Flags = segment[13]

	header.WindowSize = binary.BigEndian.Uint16(segment[14:16])
	header.Checksum = binary.BigEndian.Uint16(segment[16:18])
	header.UrgentPtr = binary.BigEndian.Uint16(segment[18:20])

	headerLengthBytes := int(header.DataOffset) * 4
	if len(segment) < headerLengthBytes {
		return nil, nil, fmt.Errorf("TCP segment too short for declared header length (DataOffset): %d bytes required, got %d", headerLengthBytes, len(segment))
	}

	// Extract options if DataOffset > 5
	if headerLengthBytes > TCPHeaderMinLengthBytes {
		header.Options = segment[TCPHeaderMinLengthBytes:headerLengthBytes]
	}

	payload := segment[headerLengthBytes:]

	// Note: TCP checksum calculation requires pseudo-header (parts of IP header + TCP segment)
	// Verification is more complex than IP/ICMP and often offloaded, skipped here for simplicity.

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
