package network

import (
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"

	"github.com/songgao/water"
)

// TunConfig はTUNデバイスの設定を保持します。
type TunConfig struct {
	Name    string // 例: "tun0"
	Address string // 例: "10.0.1.1/24" (サーバー側) or "10.0.1.2/24" (クライアント側)
	MTU     int    // 例: 1400
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
		PlatformSpecificParams: water.PlatformSpecificParams{
			Name:    cfg.Name,
			Persist: false, // アプリケーション終了時にデバイスを削除
		},
	}

	// songgao/water は config.Name を設定しても Linux では無視されることがあるため、
	// インターフェース名は ifce.Name() で取得するのが確実。
	// IPアドレスとMTUの設定はOS依存の方法で行う必要がある場合がある。
	// macOSではPlatformSpecificParamsでIPとMTUを設定できる。
	// Linuxではnetlinkまたはipコマンドを使用する必要がある。

	ifce, err := water.New(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create TUN device: %w", err)
	}

	// IPアドレス、ネットマスク、MTUを設定
	// songgao/water はこれらの設定を直接行う標準的なクロスプラットフォームAPIを提供していない。
	// そのため、os/exec を使って ip コマンド (Linux) や ifconfig コマンド (macOS) を呼び出す。
	// ただし、macOSではPlatformSpecificParamsでIPとMTUをある程度設定できるはずだが、
	// 確実性を期すためにコマンドも用意する。
	// songgao/water の v0.0.0-20200317203138-2b4b6d7c09d8 時点では、
	// macOS での Name, LinkAddress, Network, MTU の設定は機能する。
	// Linux では Name は無視され、他は netlink で設定する必要がある。

	var actualName string
	if cfg.Name != "" {
		actualName = cfg.Name // macOSでは名前指定が効く
	} else {
		actualName = ifce.Name() // Linuxでは自動生成された名前を使う
	}

	switch runtime.GOOS {
	case "linux":
		// Linux では netlink を使うのが理想だが、ここでは ip コマンドで代替
		// 1. IPアドレスとサブネットマスクを設定
		cmd := exec.Command("ip", "addr", "add", cfg.Address, "dev", actualName)
		if output, err := cmd.CombinedOutput(); err != nil {
			return nil, fmt.Errorf("failed to set IP for %s to %s: %w, output: %s", actualName, cfg.Address, err, string(output))
		}
		// 2. MTUを設定
		cmd = exec.Command("ip", "link", "set", "dev", actualName, "mtu", strconv.Itoa(cfg.MTU))
		if output, err := cmd.CombinedOutput(); err != nil {
			return nil, fmt.Errorf("failed to set MTU for %s to %d: %w, output: %s", actualName, cfg.MTU, err, string(output))
		}
		// 3. インターフェースをUP
		cmd = exec.Command("ip", "link", "set", "dev", actualName, "up")
		if output, err := cmd.CombinedOutput(); err != nil {
			return nil, fmt.Errorf("failed to bring up TUN device %s: %w, output: %s", actualName, err, string(output))
		}
	case "darwin":
		// macOS では ifconfig を使用
		// songgao/water の PlatformSpecificParams が機能するため、ここでのコマンド実行は補助的または不要な場合がある。
		// net.ParseCIDR で得られた IP と Netmask を使う
		mask := ipNet.Mask
		maskAddr := fmt.Sprintf("%d.%d.%d.%d", mask[0], mask[1], mask[2], mask[3])

		// 1. IPアドレスとネットマスクを設定
		// ifconfig <name> <ip> <netmask_ip_form_not_cidr>
		// ifconfig tun0 10.0.1.1 255.255.255.0
		cmd := exec.Command("ifconfig", actualName, ip.String(), "netmask", maskAddr)
		if output, err := cmd.CombinedOutput(); err != nil {
			// すでに設定されている場合など、エラーを許容することも検討
			// return nil, fmt.Errorf("failed to set IP for %s to %s netmask %s: %w, output: %s", actualName, ip.String(), maskAddr, err, string(output))
			fmt.Printf("Note: ifconfig set IP for %s might have failed (possibly already set): %s, output: %s\n", actualName, err, string(output))
		}

		// 2. MTUを設定
		cmd = exec.Command("ifconfig", actualName, "mtu", strconv.Itoa(cfg.MTU))
		if output, err := cmd.CombinedOutput(); err != nil {
			// return nil, fmt.Errorf("failed to set MTU for %s to %d: %w, output: %s", actualName, cfg.MTU, err, string(output))
			fmt.Printf("Note: ifconfig set MTU for %s might have failed: %s, output: %s\n", actualName, err, string(output))
		}

		// 3. インターフェースをUP (ifconfig ... up は通常不要、IP設定時に自動でupになることが多い)
		// ただし、明示的に行う場合
		cmd = exec.Command("ifconfig", actualName, "up")
		if output, err := cmd.CombinedOutput(); err != nil {
			// return nil, fmt.Errorf("failed to bring up TUN device %s: %w, output: %s", actualName, err, string(output))
			fmt.Printf("Note: ifconfig up for %s might have failed: %s, output: %s\n", actualName, err, string(output))
		}
	default:
		return nil, fmt.Errorf("unsupported platform: %s", runtime.GOOS)
	}

	fmt.Printf("TUN device %s created and configured: IP %s, MTU %d\n", actualName, cfg.Address, cfg.MTU)
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
		// ip route add <destination> via <gateway> dev <ifaceName>
		if gateway == "" { // gatewayが空ならdev経由の直接ルーティング
			cmd = exec.Command("ip", "route", "add", destination, "dev", ifaceName)
		} else {
			cmd = exec.Command("ip", "route", "add", destination, "via", gateway, "dev", ifaceName)
		}
	case "darwin":
		// route add -net <destination_network> -netmask <destination_mask> <gateway>
		// route add -net <destination_network> <gateway> (netmaskはCIDRから計算)
		// または -ifp <interface>
		_, nw, err := net.ParseCIDR(destination)
		if err != nil {
			return fmt.Errorf("invalid destination CIDR %s: %w", destination, err)
		}
		mask := nw.Mask
		maskAddr := fmt.Sprintf("%d.%d.%d.%d", mask[0], mask[1], mask[2], mask[3])
		networkAddr := nw.IP.String()

		if gateway == "" {
			cmd = exec.Command("route", "-n", "add", "-net", networkAddr, "-ifp", ifaceName, "-netmask", maskAddr)
		} else {
			cmd = exec.Command("route", "-n", "add", "-net", networkAddr, "-netmask", maskAddr, gateway)
		}
	default:
		return fmt.Errorf("AddRoute unsupported on %s", runtime.GOOS)
	}

	output, err := cmd.CombinedOutput()
	if err != nil {
		// エラーメッセージに "already in table" などが含まれる場合は無視することも検討
		if strings.Contains(string(output), "exists") || strings.Contains(string(output), "already in table") {
			fmt.Printf("Route for %s already exists, skipping: %s\n", destination, string(output))
			return nil
		}
		return fmt.Errorf("failed to add route for %s: %w, output: %s", destination, err, string(output))
	}
	fmt.Printf("Route added: %s via %s dev %s\n", destination, gateway, ifaceName)
	return nil
}
