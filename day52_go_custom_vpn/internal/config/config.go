package config

import (
	"encoding/json"
	"fmt"
	"os"
)

// GeneralConfig はサーバーとクライアントで共通の設定項目です。
// (今回は特に共通項目がないため、空ですが将来的な拡張用)
// type GeneralConfig struct {
// 	LogLevel string `json:"log_level"` //例: "debug", "info", "warn", "error"
// }

// ServerConfig はVPNサーバーの設定です。
// 設定ファイルから読み込まれます。
type ServerConfig struct {
	// GeneralConfig
	ListenAddress      string   `json:"listen_address"`       // 例: "0.0.0.0:12345" (UDP)
	TunnelName         string   `json:"tunnel_name"`          // 例: "tun0"
	TunnelAddress      string   `json:"tunnel_address"`       // 例: "10.0.1.1/24" (サーバーのTUN IP)
	TunnelPeerAddress  string   `json:"tunnel_peer_address"`  // 追加: macOSのutun用 対向のIP 例: "10.0.1.2"
	TunnelMTU          int      `json:"tunnel_mtu"`           // 例: 1400
	AllowedClientPeers []string `json:"allowed_client_peers"` // 接続を許可するクライアントの物理IP:ポートのリスト 例: ["192.168.1.100:0"] (ポート0は任意)
	// 現状、クライアントは1つのみを想定。複数クライアント対応時には、
	// クライアントごとの仮想IPやPSKを設定できるようにする必要がある。
	ClientVirtualIP string `json:"client_virtual_ip"` // クライアントに割り当てる仮想IP 例: "10.0.1.2/24"
	SharedKey       string `json:"shared_key"`        // 事前共有鍵 (PSK)
}

// ClientConfig はVPNクライアントの設定です。
// 設定ファイルから読み込まれます。
type ClientConfig struct {
	// GeneralConfig
	ServerAddress     string `json:"server_address"`      // 例: "vpn.example.com:12345" (VPNサーバーの物理アドレス:ポート)
	TunnelName        string `json:"tunnel_name"`         // 例: "tun0"
	TunnelAddress     string `json:"tunnel_address"`      // 例: "10.0.1.2/24" (クライアントのTUN IP)
	TunnelPeerAddress string `json:"tunnel_peer_address"` // 追加: macOSのutun用 対向のIP 例: "10.0.1.1"
	TunnelMTU         int    `json:"tunnel_mtu"`          // 例: 1400
	ServerVirtualIP   string `json:"server_virtual_ip"`   // サーバーのTUN側IP。このIPへのルートがTUN経由で設定されるべき。例 "10.0.1.1"
	// AllTrafficViaVPN bool   `json:"all_traffic_via_vpn"` // trueの場合、デフォルトルートをVPN経由にする (未実装)
	SharedKey string `json:"shared_key"` // 事前共有鍵 (PSK)
}

// LoadServerConfig は指定されたパスからサーバー設定ファイルを読み込みます。
func LoadServerConfig(path string) (*ServerConfig, error) {
	file, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read server config file %s: %w", path, err)
	}

	var cfg ServerConfig
	if err := json.Unmarshal(file, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse server config file %s: %w", path, err)
	}

	// TODO: 設定値のバリデーション (必須項目、IP形式、ポート範囲など)
	if cfg.ListenAddress == "" || cfg.TunnelAddress == "" || cfg.SharedKey == "" || cfg.ClientVirtualIP == "" {
		return nil, fmt.Errorf("server config validation error: listen_address, tunnel_address, shared_key, client_virtual_ip are required")
	}
	if cfg.TunnelMTU <= 0 {
		cfg.TunnelMTU = 1400 // デフォルト値
	}

	return &cfg, nil
}

// LoadClientConfig は指定されたパスからクライアント設定ファイルを読み込みます。
func LoadClientConfig(path string) (*ClientConfig, error) {
	file, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("failed to read client config file %s: %w", path, err)
	}

	var cfg ClientConfig
	if err := json.Unmarshal(file, &cfg); err != nil {
		return nil, fmt.Errorf("failed to parse client config file %s: %w", path, err)
	}

	// TODO: 設定値のバリデーション
	if cfg.ServerAddress == "" || cfg.TunnelAddress == "" || cfg.SharedKey == "" || cfg.ServerVirtualIP == "" {
		return nil, fmt.Errorf("client config validation error: server_address, tunnel_address, server_virtual_ip, shared_key are required")
	}
	if cfg.TunnelMTU <= 0 {
		cfg.TunnelMTU = 1400 // デフォルト値
	}

	return &cfg, nil
}
