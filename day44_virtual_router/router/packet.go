package router

import (
	"encoding/binary"
	"fmt"
	"net"
)

// IPv4Header はIPv4ヘッダを表します。
// 参考: https://en.wikipedia.org/wiki/IPv4_header
type IPv4Header struct {
	VersionIHL     uint8  // Version (4 bits) + IHL (4 bits)
	DSCPECN        uint8  // Differentiated Services Code Point (6 bits) + Explicit Congestion Notification (2 bits)
	TotalLength    uint16 // Total Length
	Identification uint16 // Identification
	FlagsFragment  uint16 // Flags (3 bits) + Fragment Offset (13 bits)
	TTL            uint8  // Time To Live
	Protocol       uint8  // Protocol (e.g., 1 for ICMP, 6 for TCP, 17 for UDP)
	HeaderChecksum uint16 // Header Checksum
	SourceAddress  net.IP // Source IP Address (IPv4)
	DestAddress    net.IP // Destination IP Address (IPv4)
	Options        []byte // Options (if IHL > 5)
}

// ICMPHeader はICMPヘッダを表します。
// 参考: https://en.wikipedia.org/wiki/Internet_Control_Message_Protocol#Packet_structure
type ICMPHeader struct {
	Type     uint8
	Code     uint8
	Checksum uint16
	// Body depends on Type and Code. For Echo/Echo Reply, it contains:
	Identifier uint16 // Identifier (Echo/Echo Reply)
	Sequence   uint16 // Sequence Number (Echo/Echo Reply)
	Data       []byte // Payload
}

const (
	ICMPProtocolNumber  = 1
	ICMPEchoRequestType = 8
	ICMPEchoReplyType   = 0
)

// ParseIPv4Header はバイトスライスからIPv4ヘッダをパースします。
func ParseIPv4Header(data []byte) (*IPv4Header, error) {
	if len(data) < 20 { // Minimum IPv4 header size
		return nil, fmt.Errorf("packet too short for IPv4 header: %d bytes", len(data))
	}

	hdr := &IPv4Header{}
	hdr.VersionIHL = data[0]
	hdr.DSCPECN = data[1]
	hdr.TotalLength = binary.BigEndian.Uint16(data[2:4])
	hdr.Identification = binary.BigEndian.Uint16(data[4:6])
	hdr.FlagsFragment = binary.BigEndian.Uint16(data[6:8])
	hdr.TTL = data[8]
	hdr.Protocol = data[9]
	hdr.HeaderChecksum = binary.BigEndian.Uint16(data[10:12])
	hdr.SourceAddress = net.IP(data[12:16])
	hdr.DestAddress = net.IP(data[16:20])

	ihl := hdr.VersionIHL & 0x0F
	if ihl < 5 {
		return nil, fmt.Errorf("invalid IHL value: %d", ihl)
	}
	headerLen := int(ihl * 4)
	if len(data) < headerLen {
		return nil, fmt.Errorf("packet too short for IHL %d: %d bytes, expected %d", ihl, len(data), headerLen)
	}

	if ihl > 5 {
		hdr.Options = make([]byte, headerLen-20)
		copy(hdr.Options, data[20:headerLen])
	}

	return hdr, nil
}

// Marshal はIPv4Headerをバイトスライスにマーシャリングします。
// チェックサムは計算しません。
func (h *IPv4Header) Marshal() ([]byte, error) {
	ihl := (h.VersionIHL & 0x0F)
	if ihl == 0 { // If not set, assume 5 (no options)
		ihl = 5
		h.VersionIHL = (h.VersionIHL & 0xF0) | ihl
	}
	headerLen := int(ihl * 4)
	if headerLen < 20 {
		return nil, fmt.Errorf("invalid IHL, header length less than 20: %d", headerLen)
	}

	buf := make([]byte, headerLen)
	buf[0] = h.VersionIHL
	buf[1] = h.DSCPECN
	binary.BigEndian.PutUint16(buf[2:4], h.TotalLength)
	binary.BigEndian.PutUint16(buf[4:6], h.Identification)
	binary.BigEndian.PutUint16(buf[6:8], h.FlagsFragment)
	buf[8] = h.TTL
	buf[9] = h.Protocol
	binary.BigEndian.PutUint16(buf[10:12], h.HeaderChecksum) // Checksum will be calculated later

	if len(h.SourceAddress.To4()) != 4 || len(h.DestAddress.To4()) != 4 {
		return nil, fmt.Errorf("source or destination address is not a valid IPv4 address")
	}
	copy(buf[12:16], h.SourceAddress.To4())
	copy(buf[16:20], h.DestAddress.To4())

	if ihl > 5 {
		if len(h.Options) != headerLen-20 {
			return nil, fmt.Errorf("options length mismatch: expected %d, got %d", headerLen-20, len(h.Options))
		}
		copy(buf[20:], h.Options)
	}
	return buf, nil
}

// ParseICMPHeader はバイトスライスからICMPヘッダとペイロードをパースします。
// Echo/Echo Reply 形式を仮定してIdentifierとSequence Numberもパースします。
func ParseICMPHeader(data []byte) (*ICMPHeader, error) {
	if len(data) < 8 { // Minimum ICMP Echo/Echo Reply header size
		return nil, fmt.Errorf("packet too short for ICMP header: %d bytes", len(data))
	}
	hdr := &ICMPHeader{}
	hdr.Type = data[0]
	hdr.Code = data[1]
	hdr.Checksum = binary.BigEndian.Uint16(data[2:4])
	hdr.Identifier = binary.BigEndian.Uint16(data[4:6])
	hdr.Sequence = binary.BigEndian.Uint16(data[6:8])
	if len(data) > 8 {
		hdr.Data = make([]byte, len(data)-8)
		copy(hdr.Data, data[8:])
	}
	return hdr, nil
}

// Marshal はICMPHeader (Echo/Echo Reply形式) をバイトスライスにマーシャリングします。
// チェックサムは計算しません。
func (h *ICMPHeader) Marshal() ([]byte, error) {
	headerLen := 8
	buf := make([]byte, headerLen+len(h.Data))
	buf[0] = h.Type
	buf[1] = h.Code
	binary.BigEndian.PutUint16(buf[2:4], 0) // Checksum placeholder
	binary.BigEndian.PutUint16(buf[4:6], h.Identifier)
	binary.BigEndian.PutUint16(buf[6:8], h.Sequence)
	if len(h.Data) > 0 {
		copy(buf[8:], h.Data)
	}
	return buf, nil
}

// CalculateChecksum は与えられたバイトスライスのチェックサムを計算します (IP/ICMP用)。
func CalculateChecksum(data []byte) uint16 {
	var sum uint32
	length := len(data)
	idx := 0

	// 2バイトずつ加算
	for length > 1 {
		sum += uint32(binary.BigEndian.Uint16(data[idx : idx+2]))
		idx += 2
		length -= 2
	}

	// 最後の1バイトが残っている場合 (奇数長の場合)
	if length > 0 {
		sum += uint32(data[idx]) << 8 // BigEndianとして扱うため8ビット左シフト
	}

	// キャリーを加算
	for (sum >> 16) > 0 {
		sum = (sum & 0xFFFF) + (sum >> 16)
	}

	return uint16(^sum)
}

// CreateICMPEchoReply は受信したEcho RequestパケットからEcho Replyパケットを作成します。
// IPv4ヘッダとICMPヘッダを含みます。
func CreateICMPEchoReply(requestPacket []byte, routerIP net.IP) ([]byte, error) {
	reqIPv4Hdr, err := ParseIPv4Header(requestPacket)
	if err != nil {
		return nil, fmt.Errorf("failed to parse request IPv4 header: %w", err)
	}

	// IHL (Internet Header Length) は4バイト単位のヘッダ長
	ihl := int(reqIPv4Hdr.VersionIHL & 0x0F)
	if ihl < 5 {
		return nil, fmt.Errorf("invalid IHL in request: %d", ihl)
	}
	reqIPv4HeaderLen := ihl * 4
	if len(requestPacket) < reqIPv4HeaderLen+8 { // IPv4ヘッダ + 최소 ICMPヘッダ
		return nil, fmt.Errorf("request packet too short for ICMP processing")
	}

	reqICMPHdrBytes := requestPacket[reqIPv4HeaderLen:]
	reqICMPHdr, err := ParseICMPHeader(reqICMPHdrBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to parse request ICMP header: %w", err)
	}

	if reqICMPHdr.Type != ICMPEchoRequestType {
		return nil, fmt.Errorf("not an ICMP Echo Request (type %d)", reqICMPHdr.Type)
	}

	// ICMP Echo Replyヘッダ作成
	replyICMPHdr := ICMPHeader{
		Type:       ICMPEchoReplyType,
		Code:       0, // Echo ReplyはCode 0
		Identifier: reqICMPHdr.Identifier,
		Sequence:   reqICMPHdr.Sequence,
		Data:       reqICMPHdr.Data, // Echo Requestのデータをそのまま返す
	}
	replyICMPHdrBytes, err := replyICMPHdr.Marshal()
	if err != nil {
		return nil, fmt.Errorf("failed to marshal ICMP reply header: %w", err)
	}
	replyICMPHdr.Checksum = CalculateChecksum(replyICMPHdrBytes)              // チェックサム計算
	binary.BigEndian.PutUint16(replyICMPHdrBytes[2:4], replyICMPHdr.Checksum) // マーシャル済みのバイト列にチェックサムをセット

	// IPv4ヘッダ作成
	replyIPv4Hdr := IPv4Header{
		VersionIHL:     (4 << 4) | 5,                        // IPv4, IHL 5 (20 bytes)
		DSCPECN:        reqIPv4Hdr.DSCPECN,                  // 元のDSCP/ECNをコピー
		TotalLength:    uint16(20 + len(replyICMPHdrBytes)), // IPv4ヘッダ長 + ICMPヘッダ長 + ICMPデータ長
		Identification: reqIPv4Hdr.Identification,           // Echo RequestのIDをそのまま使うか、新しく生成するか (ここではそのまま)
		FlagsFragment:  0,                                   // No fragmentation
		TTL:            64,                                  // 一般的なTTL値
		Protocol:       ICMPProtocolNumber,
		SourceAddress:  routerIP,                 // ルーター自身のIPアドレス
		DestAddress:    reqIPv4Hdr.SourceAddress, // Echo Requestの送信元が宛先
		// HeaderChecksum は後で計算
	}
	replyIPv4HdrBytes, err := replyIPv4Hdr.Marshal()
	if err != nil {
		return nil, fmt.Errorf("failed to marshal IPv4 reply header: %w", err)
	}
	replyIPv4Hdr.HeaderChecksum = CalculateChecksum(replyIPv4HdrBytes)                // チェックサム計算
	binary.BigEndian.PutUint16(replyIPv4HdrBytes[10:12], replyIPv4Hdr.HeaderChecksum) // マーシャル済みのバイト列にチェックサムをセット

	// IPv4ヘッダとICMPヘッダを結合
	replyPacket := append(replyIPv4HdrBytes, replyICMPHdrBytes...)

	return replyPacket, nil
}

// GetDestIPFromPacket はIPパケットから宛先IPアドレスを抽出します（簡易版）。
func GetDestIPFromPacket(packet []byte) (net.IP, error) {
	if len(packet) < 20 {
		return nil, fmt.Errorf("packet too short for IPv4 header")
	}
	// IPv4ヘッダの16-19バイト目が宛先IP
	return net.IP(packet[16:20]), nil
}

// GetSrcIPFromPacket はIPパケットから送信元IPアドレスを抽出します（簡易版）。
func GetSrcIPFromPacket(packet []byte) (net.IP, error) {
	if len(packet) < 20 {
		return nil, fmt.Errorf("packet too short for IPv4 header")
	}
	// IPv4ヘッダの12-15バイト目が送信元IP
	return net.IP(packet[12:16]), nil
}

// GetIPProtocolFromPacket はIPパケットからプロトコル番号を抽出します（簡易版）。
func GetIPProtocolFromPacket(packet []byte) (uint8, error) {
	if len(packet) < 10 { // Protocol field is at offset 9
		return 0, fmt.Errorf("packet too short to get protocol")
	}
	return packet[9], nil
}
