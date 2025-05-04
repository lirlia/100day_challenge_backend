package main

import (
	"encoding/binary"
	"fmt"
	"log"
	mrand "math/rand" // Renamed import for random ID
	"net"
	"os" // Needed for Getpid in sendIPPacket

	"github.com/songgao/water"
)

// Constants for IP protocol numbers
const (
	IPProtocolICMP = 1
	IPProtocolTCP  = 6
	IPProtocolUDP  = 17
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

const (
	IPv4Version              = 4
	IPv4HeaderMinLengthBytes = 20 // Minimum header length (IHL=5)
)

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
		log.Printf("%s%sWarning: Calculated payload length (%d) is greater than available data length (%d). Truncating.%s", ColorGray, PrefixIP, payloadLen, len(payload), ColorReset)
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

// handleIPPacket parses the IP header and dispatches based on protocol.
func handleIPPacket(ifce *water.Interface, packet []byte) {
	ipHeader, payload, err := parseIPv4Header(packet)
	if err != nil {
		// Use red for errors
		log.Printf("%s%sError parsing IP header: %v%s", ColorRed, PrefixError, err, ColorReset)
		return
	}

	// Use cyan for received IP packets
	log.Printf("%s%s %s -> %s Proto: %d(%s) TTL: %d Len(Payload/Total): %d/%d ID: %d HdrLen: %d%s",
		ColorCyan, PrefixIP,
		ipHeader.SrcIP, ipHeader.DstIP,
		ipHeader.Protocol, ipProtocolToString(ipHeader.Protocol), // Corrected function name
		ipHeader.TTL, len(payload), ipHeader.TotalLength, // Corrected field name and show payload vs total
		ipHeader.ID,
		ipHeader.IHL*4, // Header length in bytes
		ColorReset,
	)

	printHeaderInfo(ipHeader, len(payload))
	pauseIfNeeded("ip")

	switch ipHeader.Protocol {
	case IPProtocolTCP:
		// TCP Handling (assuming handleTCPPacket is defined elsewhere)
		handleTCPPacket(ifce, ipHeader, payload)
	case IPProtocolICMP:
		// ICMP Handling (optional, placeholder)
		log.Printf("%s%sReceived ICMP packet from %s%s", ColorGray, PrefixIP, ipHeader.SrcIP, ColorReset)
		// TODO: Implement basic ICMP handling (e.g., echo reply) if needed
	case IPProtocolUDP:
		// UDP Handling (optional, placeholder)
		log.Printf("%s%sReceived UDP packet from %s%s", ColorGray, PrefixIP, ipHeader.SrcIP, ColorReset)
	default:
		// Use gray for unhandled protocols
		log.Printf("%s%sReceived packet with unhandled protocol %d from %s%s", ColorGray, PrefixIP, ipHeader.Protocol, ipHeader.SrcIP, ColorReset)
	}
}

// sendIPPacket constructs and sends an IPv4 packet over the TUN interface.
func sendIPPacket(ifce *water.Interface, srcIP, dstIP net.IP, protocol uint8, payload []byte) error {
	// Simplified IPv4 header construction
	// More robust implementation would handle options, fragmentation, etc.
	header := IPv4Header{
		Version:     4,
		IHL:         5, // No options
		TOS:         0, // Use TOS field instead of DSCP/ECN
		TotalLength: uint16(20 + len(payload)),
		ID:          uint16(os.Getpid() % 65536), // Simple ID generation
		Flags:       0x02,                        // Don't Fragment (DF) flag often set
		TTL:         64,
		Protocol:    protocol,
		SrcIP:       srcIP,
		DstIP:       dstIP,
		// Checksum is calculated later
	}

	headerBytes := make([]byte, 20)
	headerBytes[0] = (header.Version << 4) | header.IHL
	headerBytes[1] = header.TOS // Assign TOS field directly
	binary.BigEndian.PutUint16(headerBytes[2:4], header.TotalLength)
	binary.BigEndian.PutUint16(headerBytes[4:6], header.ID)
	binary.BigEndian.PutUint16(headerBytes[6:8], uint16(header.Flags<<13)|header.FragmentOffset)
	headerBytes[8] = header.TTL
	headerBytes[9] = header.Protocol
	copy(headerBytes[12:16], header.SrcIP.To4())
	copy(headerBytes[16:20], header.DstIP.To4())

	// Calculate checksum and put it into the header bytes
	checksum := calculateChecksum(headerBytes)               // Calculate with checksum field zeroed
	binary.BigEndian.PutUint16(headerBytes[10:12], checksum) // Correctly put checksum
	header.Checksum = checksum                               // Store calculated checksum in the struct as well for logging

	// Combine header and payload
	packet := append(headerBytes, payload...)

	// Use purple for sent IP packets (less prominent than TCP/TLS/HTTP)
	log.Printf("%s%sSND: %s -> %s Proto: %d(%s) TTL: %d Len(Payload/Total): %d/%d ID: %d HdrLen: %d Checksum: 0x%x%s",
		ColorPurple, PrefixIP, // Use Purple, could also use Gray
		header.SrcIP, header.DstIP,
		header.Protocol, ipProtocolToString(header.Protocol),
		header.TTL, len(payload), header.TotalLength,
		header.ID,
		header.IHL*4,    // Correctly log header length
		header.Checksum, // Correctly log checksum from the struct
		ColorReset,
	)

	_, err := ifce.Write(packet)
	if err != nil {
		log.Printf("%s%sError sending IP packet: %v%s", ColorRed, PrefixError, err, ColorReset)
		return fmt.Errorf("failed to write packet to TUN device: %w", err)
	}
	return nil
}
