package network

import (
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"

	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/utils"
	"github.com/songgao/water"
)

// TunConfig はTUNデバイスの設定を保持します。
type TunConfig struct {
	Name        string // 例: "tun0" (Linuxで希望する名前、macOSでは無視されutunXになる)
	Address     string // 例: "10.0.1.1/24"
	PeerAddress string // 追加: macOSのutun用 対向のIP 例: "10.0.1.2" (ポイントツーポイント用)
	MTU         int    // 例: 1400
}

// NewTUN は新しいTUNデバイスを作成し、設定します。
// 現状、IPアドレスやMTUの設定は songgao/water の PlatformSpecificParams 経由で行い、
// OSコマンドによる補助的な設定は行いません。
// IPアドレス文字列は "10.0.1.1/24" のようなCIDR形式を期待します。
func NewTUN(cfg TunConfig) (*water.Interface, error) {
	ip, ipNet, err := net.ParseCIDR(cfg.Address)
	if err != nil {
		return nil, fmt.Errorf("failed to parse CIDR address %s: %w", cfg.Address, err)
	}

	config := water.Config{
		DeviceType: water.TUN,
	}

	// macOSではNameを指定しない (utunXが自動割り当て)。
	// Linuxでは指定された名前を試みる (songgao/waterがサポートしていれば)。
	if runtime.GOOS != "darwin" && cfg.Name != "" {
		utils.Debug("Attempting to set TUN device name to '%s' on %s", cfg.Name, runtime.GOOS)
		config.PlatformSpecificParams.Name = cfg.Name
	} else if runtime.GOOS == "darwin" {
		utils.Debug("On macOS, TUN device name will be auto-assigned (e.g., utunX).")
		// config.PlatformSpecificParams.Name は設定しない
	}

	ifce, err := water.New(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create TUN device: %w", err)
	}

	// 実際に割り当てられたインターフェース名を使用する
	actualName := ifce.Name()
	utils.Info("TUN device created with actual name: '%s'", actualName)

	switch runtime.GOOS {
	case "linux":
		utils.Info("Configuring TUN device '%s' on Linux...", actualName)
		cmd := exec.Command("ip", "addr", "add", cfg.Address, "dev", actualName)
		if output, err := cmd.CombinedOutput(); err != nil {
			_ = ifce.Close() // エラー時はデバイスを閉じる試み
			return nil, fmt.Errorf("failed to set IP for %s to %s: %w, output: %s", actualName, cfg.Address, err, string(output))
		}
		cmd = exec.Command("ip", "link", "set", "dev", actualName, "mtu", strconv.Itoa(cfg.MTU))
		if output, err := cmd.CombinedOutput(); err != nil {
			_ = ifce.Close()
			return nil, fmt.Errorf("failed to set MTU for %s to %d: %w, output: %s", actualName, cfg.MTU, err, string(output))
		}
		cmd = exec.Command("ip", "link", "set", "dev", actualName, "up")
		if output, err := cmd.CombinedOutput(); err != nil {
			_ = ifce.Close()
			return nil, fmt.Errorf("failed to bring up TUN device %s: %w, output: %s", actualName, err, string(output))
		}
	case "darwin":
		utils.Info("Configuring TUN device '%s' on macOS...", actualName)
		mask := ipNet.Mask
		maskAddr := fmt.Sprintf("%d.%d.%d.%d", mask[0], mask[1], mask[2], mask[3])

		peerIP := cfg.PeerAddress
		if peerIP == "" {
			// PeerAddressが指定されていない場合、警告を出してローカルIPを使う（以前の挙動）
			// これは通常P2Pインターフェースでは問題を起こす可能性がある
			utils.Warning("PeerAddress is not set for TUN device %s on macOS. Using local IP %s as peer. This might lead to routing issues.", actualName, ip.String())
			peerIP = ip.String()
		}

		// ifconfig utunX <local_ip> <peer_ip> netmask <netmask_val> mtu <mtu_val> up
		cmd := exec.Command("ifconfig", actualName, ip.String(), peerIP, "netmask", maskAddr, "mtu", strconv.Itoa(cfg.MTU), "up")
		utils.Debug("Executing: ifconfig %s %s %s netmask %s mtu %s up", actualName, ip.String(), peerIP, maskAddr, strconv.Itoa(cfg.MTU))
		if output, err := cmd.CombinedOutput(); err != nil {
			_ = ifce.Close()
			// ifconfig コマンドは詳細なエラーを返すことがあるので、エラーメッセージも表示する
			return nil, fmt.Errorf("failed to configure TUN device %s with ifconfig (local: %s, peer: %s, mtu: %d): %w, output: %s", actualName, ip.String(), peerIP, cfg.MTU, err, string(output))
		}
	default:
		_ = ifce.Close()
		return nil, fmt.Errorf("unsupported platform for TUN configuration: %s", runtime.GOOS)
	}

	utils.Info("TUN device '%s' configured: IP %s (Peer: %s for macOS), MTU %d", actualName, cfg.Address, cfg.PeerAddress, cfg.MTU)
	return ifce, nil
}

// ConfigureTUNRoute は指定された宛先CIDRへのルートをTUNデバイス経由で設定します。
// remotePeerPhysicalIP は、VPNサーバー/クライアントの物理IPアドレスです (ネクストホップ)。
// この関数は主にクライアント側で、サーバー側のネットワークへのルートを設定するのに使います。
// サーバー側でクライアントの仮想IPへのルートを設定する場合にも使えるかもしれません。
func ConfigureTUNRoute(tunName string, destinationCIDR string, remotePeerPhysicalIP string) error {
	// この機能はより複雑で、OSごとのルーティングコマンド (route add, ip route add) の詳細な知識が必要です。
	// また、既存のデフォルトゲートウェイとの兼ね合いも考慮する必要があります。
	// 簡単のため、今回は実装を見送り、READMEに手動設定方法を記載する方針とします。
	// TODO: 将来的に実装する可能性あり
	fmt.Printf("Routing for %s via %s (next hop %s) is not automatically configured. Please configure manually if needed.\n", destinationCIDR, tunName, remotePeerPhysicalIP)
	return nil
}

// AddRoute は特定の宛先ネットワークへのルートを追加します。
// destination: "192.168.2.0/24" のようなCIDR形式
// gateway: ネクストホップのIPアドレス
// ifaceName: ルートに使用するインターフェース名
// この関数はクロスプラットフォーム対応が難しい。
func AddRoute(destination, gateway, ifaceName string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		if gateway == "" {
			cmd = exec.Command("ip", "route", "add", destination, "dev", ifaceName)
		} else {
			cmd = exec.Command("ip", "route", "add", destination, "via", gateway, "dev", ifaceName)
		}
	case "darwin":
		_, nw, err := net.ParseCIDR(destination)
		if err != nil {
			return fmt.Errorf("invalid destination CIDR %s: %w", destination, err)
		}
		mask := nw.Mask
		maskAddr := fmt.Sprintf("%d.%d.%d.%d", mask[0], mask[1], mask[2], mask[3])
		networkAddr := nw.IP.String()

		if gateway == "" { // macOSでgatewayなしは通常 -ifp を使う
			cmd = exec.Command("route", "-n", "add", "-net", networkAddr, "-ifp", ifaceName, "-netmask", maskAddr)
		} else {
			cmd = exec.Command("route", "-n", "add", "-net", networkAddr, "-netmask", maskAddr, gateway)
		}
	default:
		return fmt.Errorf("AddRoute unsupported on %s", runtime.GOOS)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		if strings.Contains(string(output), "exists") || strings.Contains(string(output), "already in table") || strings.Contains(string(output), "File exists") {
			utils.Info("Route for %s already exists or similar, skipping: %s", destination, string(output))
			return nil
		}
		return fmt.Errorf("failed to add route for %s: %w, output: %s", destination, err, string(output))
	}
	utils.Info("Route added: %s via %s dev %s", destination, gateway, ifaceName)
	return nil
}
