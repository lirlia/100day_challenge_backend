package main

import (
	"encoding/binary"
	"fmt"
	"log"

	"github.com/songgao/water"
)

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

const (
	ICMPProtocolNumber    = 1
	ICMPEchoRequestType   = 8
	ICMPEchoReplyType     = 0
	ICMPHeaderLengthBytes = 8
)

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
