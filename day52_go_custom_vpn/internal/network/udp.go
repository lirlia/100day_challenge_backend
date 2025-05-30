package network

import (
	"fmt"
	"net"
)

// UDPConfig はUDPリスナーの設定を保持します。
type UDPConfig struct {
	Address string // 例: "0.0.0.0:12345"
	// BufferSize int    // 読み取りバッファサイズ (MTUに基づいて動的にすることも検討)
}

// ListenUDP は指定されたアドレスでUDPリッスンを開始します。
func ListenUDP(address string) (*net.UDPConn, error) {
	udpAddr, err := net.ResolveUDPAddr("udp", address)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve UDP address %s: %w", address, err)
	}

	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		return nil, fmt.Errorf("failed to listen on UDP address %s: %w", address, err)
	}
	fmt.Printf("Listening on UDP %s\n", address)
	return conn, nil
}

// ReadFromUDP はUDPコネクションからデータを読み取ります。
// MTUサイズ程度のバッファを渡すことを想定しています。
func ReadFromUDP(conn *net.UDPConn, buffer []byte) (int, *net.UDPAddr, error) {
	n, remoteAddr, err := conn.ReadFromUDP(buffer)
	if err != nil {
		return 0, nil, fmt.Errorf("failed to read from UDP: %w", err)
	}
	return n, remoteAddr, nil
}

// WriteToUDP はUDPコネクションにデータを書き込みます。
func WriteToUDP(conn *net.UDPConn, data []byte, remoteAddr *net.UDPAddr) (int, error) {
	n, err := conn.WriteToUDP(data, remoteAddr)
	if err != nil {
		return 0, fmt.Errorf("failed to write to UDP addr %s: %w", remoteAddr.String(), err)
	}
	return n, nil
}
