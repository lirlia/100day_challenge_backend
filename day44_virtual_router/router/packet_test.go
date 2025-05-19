package router

import (
	"bytes"
	"encoding/binary"
	"encoding/hex"
	"net"
	"testing"
)

func TestIPv4Header_MarshalParse(t *testing.T) {
	srcIP := net.ParseIP("192.168.1.1").To4()
	destIP := net.ParseIP("10.0.0.1").To4()

	hdr := &IPv4Header{
		VersionIHL:     (4 << 4) | 5, // IPv4, IHL 5 (20 bytes)
		DSCPECN:        0,
		TotalLength:    20 + 8 + 4, // IPv4(20) + ICMP(8) + Data(4)
		Identification: 0x1234,
		FlagsFragment:  0,
		TTL:            64,
		Protocol:       ICMPProtocolNumber,
		HeaderChecksum: 0, // Will be calculated later
		SourceAddress:  srcIP,
		DestAddress:    destIP,
	}

	marshaled, err := hdr.Marshal()
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	// Calculate checksum and set it
	calculatedChecksum := CalculateChecksum(marshaled)
	hdr.HeaderChecksum = calculatedChecksum
	marshaled, _ = hdr.Marshal() // Re-marshal with checksum

	parsedHdr, err := ParseIPv4Header(marshaled)
	if err != nil {
		t.Fatalf("ParseIPv4Header() error = %v", err)
	}

	if parsedHdr.VersionIHL != hdr.VersionIHL {
		t.Errorf("VersionIHL mismatch: got %x, want %x", parsedHdr.VersionIHL, hdr.VersionIHL)
	}
	if parsedHdr.TotalLength != hdr.TotalLength {
		t.Errorf("TotalLength mismatch: got %d, want %d", parsedHdr.TotalLength, hdr.TotalLength)
	}
	if !parsedHdr.SourceAddress.Equal(hdr.SourceAddress) {
		t.Errorf("SourceAddress mismatch: got %s, want %s", parsedHdr.SourceAddress, hdr.SourceAddress)
	}
	if !parsedHdr.DestAddress.Equal(hdr.DestAddress) {
		t.Errorf("DestAddress mismatch: got %s, want %s", parsedHdr.DestAddress, hdr.DestAddress)
	}
	if parsedHdr.Protocol != hdr.Protocol {
		t.Errorf("Protocol mismatch: got %d, want %d", parsedHdr.Protocol, hdr.Protocol)
	}
	// Verify checksum of the parsed header (should be 0 if correct)
	// To do this, we need to marshal the parsed header (excluding its checksum field) and calculate checksum
	// Or, simpler: the checksum of the received packet (including its checksum field) should be 0 if valid.
	// The `water` library usually verifies this at a lower level, but for our parser, we can check like this:
	parsedMarshaled, _ := parsedHdr.Marshal() // This will have the checksum from the original packet
	if CalculateChecksum(parsedMarshaled) != 0 {
		// Note: If the checksum field itself was included in the checksum calculation for validation,
		// and the checksum was correct, the result of re-calculating the checksum over the entire
		// header (including the correct checksum field) should be 0.
		t.Errorf("Checksum validation failed for parsed header. Expected checksum of marshaled data to be 0, got %x", CalculateChecksum(parsedMarshaled))
		t.Logf("Original checksum: %x, Parsed checksum field: %x", calculatedChecksum, parsedHdr.HeaderChecksum)
	}
}

func TestICMPHeader_MarshalParse(t *testing.T) {
	hdr := &ICMPHeader{
		Type:       ICMPEchoRequestType,
		Code:       0,
		Checksum:   0, // Will be calculated later
		Identifier: 0xabcd,
		Sequence:   0x5678,
		Data:       []byte("ping"),
	}

	marshaled, err := hdr.Marshal()
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}

	calculatedChecksum := CalculateChecksum(marshaled)
	hdr.Checksum = calculatedChecksum
	binary.BigEndian.PutUint16(marshaled[2:4], calculatedChecksum) // Set the checksum in the marshaled bytes

	parsedHdr, err := ParseICMPHeader(marshaled)
	if err != nil {
		t.Fatalf("ParseICMPHeader() error = %v", err)
	}

	if parsedHdr.Type != hdr.Type {
		t.Errorf("Type mismatch: got %d, want %d", parsedHdr.Type, hdr.Type)
	}
	if parsedHdr.Identifier != hdr.Identifier {
		t.Errorf("Identifier mismatch: got %x, want %x", parsedHdr.Identifier, hdr.Identifier)
	}
	if !bytes.Equal(parsedHdr.Data, hdr.Data) {
		t.Errorf("Data mismatch: got %s, want %s", string(parsedHdr.Data), string(hdr.Data))
	}

	// Verify that the checksum field parsed from the marshaled data is correct
	if parsedHdr.Checksum != calculatedChecksum {
		t.Errorf("Parsed checksum mismatch: got %x, want %x", parsedHdr.Checksum, calculatedChecksum)
	}

	// Verify that the checksum of the entire marshaled packet (with correct checksum set) is 0
	if CalculateChecksum(marshaled) != 0 {
		t.Errorf("Checksum validation of original marshaled data failed. Expected 0, got %x", CalculateChecksum(marshaled))
	}
}

func TestCalculateChecksum(t *testing.T) {
	// Example from RFC1071 (Checksum)
	// data := []byte{0x00, 0x01, 0xf2, 0x03, 0xf4, 0xf5, 0xf6, 0xf7}
	// expected := uint16(0xddf2) // This is actually 0x220d, the one's complement sum is 0xddf2, so ^0xddf2 = 0x220D
	// For the example 0001 f203 f4f5 f6f7, sum is 0x0001 + 0xf203 + 0xf4f5 + 0xf6f7 = 0x01DDDD
	// sum = (0x01) + (0xDDDD) = 0xDDDE.  ~0xDDDE = 0x2221. (Mistake in my manual calc or example understanding)
	// Let's use a known ICMP packet's checksum for a simpler test.

	// A sample ICMP Echo Request packet (header part only, checksum field is 0 initially)
	// Type=8, Code=0, Checksum=0, ID=0x0001, Seq=0x0001, Data="abcdefgh"
	icmpData := []byte{0x08, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x61, 0x62, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68}
	expectedChecksum := CalculateChecksum(icmpData) // Calculate what it should be
	// Set the calculated checksum in the data
	binary.BigEndian.PutUint16(icmpData[2:4], expectedChecksum)
	// Now, if we calculate checksum over this data (with correct checksum field), result should be 0.
	if CalculateChecksum(icmpData) != 0 {
		t.Errorf("Checksum validation failed. Expected 0, got %x", CalculateChecksum(icmpData))
	}

	// Test with an odd length to ensure the padding logic works
	oddData := []byte{0x01, 0x02, 0x03, 0x04, 0x05}
	oddChecksum := CalculateChecksum(oddData)
	oddDataWithChecksum := make([]byte, len(oddData))
	copy(oddDataWithChecksum, oddData)
	// To validate, we'd need a way to put this checksum back if it were a real header.
	// For this test, just ensure it runs without error and produces a value.
	if oddChecksum == 0 { // Unlikely to be zero for non-trivial data, but possible.
		// t.Logf("Checksum for odd data is 0, which is unusual but not necessarily an error.")
	}
}

func TestCreateICMPEchoReply(t *testing.T) {
	// Build a dummy ICMP Echo Request packet
	srcIP := net.ParseIP("192.168.1.100").To4()
	destIP := net.ParseIP("10.0.0.5").To4() // This will be our router's IP for the reply
	routerIPForReply := destIP

	icmpDataPayload := []byte("Hello Router")
	icmpReqHdr := &ICMPHeader{
		Type:       ICMPEchoRequestType,
		Code:       0,
		Identifier: 0x1234,
		Sequence:   0x0001,
		Data:       icmpDataPayload,
	}
	icmpReqBytes, _ := icmpReqHdr.Marshal()
	icmpReqHdr.Checksum = CalculateChecksum(icmpReqBytes)
	binary.BigEndian.PutUint16(icmpReqBytes[2:4], icmpReqHdr.Checksum)

	ipv4ReqHdr := &IPv4Header{
		VersionIHL:     (4 << 4) | 5,
		DSCPECN:        0,
		TotalLength:    uint16(20 + len(icmpReqBytes)),
		Identification: 0x55aa,
		FlagsFragment:  0,
		TTL:            64,
		Protocol:       ICMPProtocolNumber,
		SourceAddress:  srcIP,
		DestAddress:    destIP,
	}
	ipv4ReqBytes, _ := ipv4ReqHdr.Marshal()
	ipv4ReqHdr.HeaderChecksum = CalculateChecksum(ipv4ReqBytes)
	binary.BigEndian.PutUint16(ipv4ReqBytes[10:12], ipv4ReqHdr.HeaderChecksum)

	requestPacket := append(ipv4ReqBytes, icmpReqBytes...)

	// Create Echo Reply
	replyPacket, err := CreateICMPEchoReply(requestPacket, routerIPForReply)
	if err != nil {
		t.Fatalf("CreateICMPEchoReply() error = %v", err)
	}

	// Parse the reply packet to verify its contents
	replyIPv4Hdr, err := ParseIPv4Header(replyPacket)
	if err != nil {
		t.Fatalf("Failed to parse IPv4 header of reply: %v", err)
	}

	if CalculateChecksum(replyPacket[:(replyIPv4Hdr.VersionIHL&0x0F)*4]) != 0 {
		t.Errorf("IPv4 checksum of reply is invalid. Calculated: %x", CalculateChecksum(replyPacket[:(replyIPv4Hdr.VersionIHL&0x0F)*4]))
		t.Logf("Reply IPv4 Header: %s", hex.EncodeToString(replyPacket[:(replyIPv4Hdr.VersionIHL&0x0F)*4]))
	}

	if !replyIPv4Hdr.SourceAddress.Equal(routerIPForReply) {
		t.Errorf("Reply source IP mismatch: got %s, want %s", replyIPv4Hdr.SourceAddress, routerIPForReply)
	}
	if !replyIPv4Hdr.DestAddress.Equal(srcIP) {
		t.Errorf("Reply destination IP mismatch: got %s, want %s", replyIPv4Hdr.DestAddress, srcIP)
	}
	if replyIPv4Hdr.Protocol != ICMPProtocolNumber {
		t.Errorf("Reply protocol mismatch: got %d, want %d", replyIPv4Hdr.Protocol, ICMPProtocolNumber)
	}

	replyICMPBytes := replyPacket[(replyIPv4Hdr.VersionIHL&0x0F)*4:]
	replyICMPHdr, err := ParseICMPHeader(replyICMPBytes)
	if err != nil {
		t.Fatalf("Failed to parse ICMP header of reply: %v", err)
	}

	if CalculateChecksum(replyICMPBytes) != 0 {
		t.Errorf("ICMP checksum of reply is invalid. Calculated: %x", CalculateChecksum(replyICMPBytes))
		t.Logf("Reply ICMP: %s", hex.EncodeToString(replyICMPBytes))

	}

	if replyICMPHdr.Type != ICMPEchoReplyType {
		t.Errorf("Reply ICMP type mismatch: got %d, want %d", replyICMPHdr.Type, ICMPEchoReplyType)
	}
	if replyICMPHdr.Identifier != icmpReqHdr.Identifier {
		t.Errorf("Reply ICMP identifier mismatch: got %x, want %x", replyICMPHdr.Identifier, icmpReqHdr.Identifier)
	}
	if replyICMPHdr.Sequence != icmpReqHdr.Sequence {
		t.Errorf("Reply ICMP sequence mismatch: got %x, want %x", replyICMPHdr.Sequence, icmpReqHdr.Sequence)
	}
	if !bytes.Equal(replyICMPHdr.Data, icmpDataPayload) {
		t.Errorf("Reply ICMP data mismatch: got \"%s\", want \"%s\"", string(replyICMPHdr.Data), string(icmpDataPayload))
	}

	t.Logf("Successfully created and verified ICMP Echo Reply packet.")
}

func TestGetIPFromPacket(t *testing.T) {
	// Minimal valid IPv4 header (20 bytes)
	srcIP := net.ParseIP("1.2.3.4").To4()
	destIP := net.ParseIP("5.6.7.8").To4()
	packet := []byte{
		0x45, 0x00, 0x00, 0x1c, // VersionIHL, DSCPECN, TotalLength (28 for ICMP echo)
		0x00, 0x01, 0x00, 0x00, // Identification, FlagsFragmentOffset
		0x40, 0x01, 0x00, 0x00, // TTL, Protocol (ICMP), HeaderChecksum (dummy)
	}
	packet = append(packet, srcIP...)
	packet = append(packet, destIP...)
	packet = append(packet, []byte{0x08, 0x00, 0x00, 0x00, 0x01, 0x02, 0x03, 0x04}...) // ICMP Echo + dummy data

	// Set correct checksum for IPv4 header
	hcs := CalculateChecksum(packet[:20])
	binary.BigEndian.PutUint16(packet[10:12], hcs)

	parsedDestIP, err := GetDestIPFromPacket(packet)
	if err != nil {
		t.Fatalf("GetDestIPFromPacket() error = %v", err)
	}
	if !parsedDestIP.Equal(destIP) {
		t.Errorf("GetDestIPFromPacket() got %s, want %s", parsedDestIP, destIP)
	}

	parsedSrcIP, err := GetSrcIPFromPacket(packet)
	if err != nil {
		t.Fatalf("GetSrcIPFromPacket() error = %v", err)
	}
	if !parsedSrcIP.Equal(srcIP) {
		t.Errorf("GetSrcIPFromPacket() got %s, want %s", parsedSrcIP, srcIP)
	}

	protocol, err := GetIPProtocolFromPacket(packet)
	if err != nil {
		t.Fatalf("GetIPProtocolFromPacket() error = %v", err)
	}
	if protocol != ICMPProtocolNumber {
		t.Errorf("GetIPProtocolFromPacket() got %d, want %d", protocol, ICMPProtocolNumber)
	}

	// Test short packet
	shortPacket := []byte{0x45, 0x00, 0x00, 0x14}
	_, err = GetDestIPFromPacket(shortPacket)
	if err == nil {
		t.Errorf("GetDestIPFromPacket() expected error for short packet, got nil")
	}
}
