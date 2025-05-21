package router

import (
	"fmt"
	"log"
	"net"
	"os/exec"
	"runtime"

	"github.com/songgao/water"
)

const (
	DefaultMTU = 1500
)

// TUNDevice はTUNインターフェースをラップします。
type TUNDevice struct {
	Name     string
	IP       net.IP
	Mask     net.IPMask
	MTU      int
	ifce     *water.Interface
	stopCh   chan struct{}
	packetCh chan []byte
}

// NewTUNDevice は新しいTUNデバイスを作成し、設定します。
// name: e.g., "tun0"
// ipAddressCIDR: e.g., "10.0.0.1/24"
// mtu: e.g., 1500
func NewTUNDevice(name string, ipAddressCIDR string, mtu int) (*TUNDevice, error) {
	ip, ipNet, err := net.ParseCIDR(ipAddressCIDR)
	if err != nil {
		return nil, fmt.Errorf("failed to parse IP address %s: %w", ipAddressCIDR, err)
	}

	if mtu <= 0 {
		mtu = DefaultMTU
	}

	config := water.Config{
		DeviceType: water.TUN,
	}
	if name != "" {
		config.Name = name
	}

	ifce, err := water.New(config)
	if err != nil {
		logName := name
		if logName == "" {
			logName = "[dynamic]"
		}
		return nil, fmt.Errorf("failed to create TUN device %s: %w", logName, err)
	}

	actualIfceName := ifce.Name()
	log.Printf("TUN device %s (requested: '%s') created successfully.", actualIfceName, name)

	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "linux":
		cmd = exec.Command("sudo", "ip", "addr", "add", ipAddressCIDR, "dev", actualIfceName)
		if err := cmd.Run(); err != nil {
			_ = ifce.Close()
			return nil, fmt.Errorf("linux: failed to set IP for %s: %w", actualIfceName, err)
		}
		cmd = exec.Command("sudo", "ip", "link", "set", "dev", actualIfceName, "mtu", fmt.Sprintf("%d", mtu))
		if err := cmd.Run(); err != nil {
			_ = ifce.Close()
			return nil, fmt.Errorf("linux: failed to set MTU for %s: %w", actualIfceName, err)
		}
		cmd = exec.Command("sudo", "ip", "link", "set", "dev", actualIfceName, "up")
		if err := cmd.Run(); err != nil {
			_ = ifce.Close()
			return nil, fmt.Errorf("linux: failed to bring up %s: %w", actualIfceName, err)
		}
	case "darwin":
		maskDotDecimal := fmt.Sprintf("%d.%d.%d.%d", ipNet.Mask[0], ipNet.Mask[1], ipNet.Mask[2], ipNet.Mask[3])
		cmd = exec.Command("sudo", "ifconfig", actualIfceName, "inet", ip.String(), "netmask", maskDotDecimal)
		if err := cmd.Run(); err != nil {
			_ = ifce.Close()
			return nil, fmt.Errorf("darwin: failed to set IP/netmask for %s: %w. Command: %s", actualIfceName, err, cmd.String())
		}
		cmd = exec.Command("sudo", "ifconfig", actualIfceName, "mtu", fmt.Sprintf("%d", mtu))
		if err := cmd.Run(); err != nil {
			_ = ifce.Close()
			return nil, fmt.Errorf("darwin: failed to set MTU for %s: %w. Command: %s", actualIfceName, err, cmd.String())
		}
		cmd = exec.Command("sudo", "ifconfig", actualIfceName, "up")
		if err := cmd.Run(); err != nil {
			_ = ifce.Close()
			return nil, fmt.Errorf("darwin: failed to bring up %s: %w. Command: %s", actualIfceName, err, cmd.String())
		}
	default:
		_ = ifce.Close()
		return nil, fmt.Errorf("unsupported OS for TUN IP configuration: %s", runtime.GOOS)
	}
	log.Printf("IP address %s, MTU %d set for %s, and device is up.", ipAddressCIDR, mtu, actualIfceName)

	dev := &TUNDevice{
		Name:     actualIfceName,
		IP:       ip,
		Mask:     ipNet.Mask,
		MTU:      mtu,
		ifce:     ifce,
		stopCh:   make(chan struct{}),
		packetCh: make(chan []byte, 100), // バッファ付きチャネル
	}

	go dev.readLoop()

	return dev, nil
}

// readLoop はTUNデバイスからパケットを読み込み、packetChに送信します。
func (t *TUNDevice) readLoop() {
	buffer := make([]byte, t.MTU+100) // MTUより少し大きめのバッファ
	for {
		select {
		case <-t.stopCh:
			log.Printf("Stopping read loop for %s", t.Name)
			return
		default:
			n, err := t.ifce.Read(buffer)
			if err != nil {
				if netErr, ok := err.(net.Error); ok && netErr.Timeout() {
					continue // タイムアウトは無視
				}
				if t.isClosed() {
					log.Printf("Read loop for %s: device closed.", t.Name)
					return
				}
				log.Printf("Error reading from TUN device %s: %v", t.Name, err)
				// TODO: エラー処理。場合によってはループを抜けるか、再試行
				continue
			}
			if n > 0 {
				pkt := make([]byte, n)
				copy(pkt, buffer[:n])
				select {
				case t.packetCh <- pkt:
					// log.Printf("Packet received on %s (%d bytes)", t.Name, n)
				default:
					log.Printf("Packet buffer full on %s, discarding packet (%d bytes)", t.Name, n)
				}
			}
		}
	}
}

// ReadPacket は受信したIPパケットをチャネルから読み込みます。
// ブロッキング呼び出しです。Closeされるとnil, falseを返します。
func (t *TUNDevice) ReadPacket() ([]byte, bool) {
	select {
	case pkt, ok := <-t.packetCh:
		return pkt, ok
	case <-t.stopCh: // デバイスが閉じられた場合
		return nil, false
	}
}

// WritePacket はIPパケットをTUNデバイスに書き込みます。
func (t *TUNDevice) WritePacket(packet []byte) (int, error) {
	if t.isClosed() {
		return 0, fmt.Errorf("device %s is closed", t.Name)
	}
	n, err := t.ifce.Write(packet)
	if err != nil {
		return 0, fmt.Errorf("failed to write to TUN device %s: %w", t.Name, err)
	}
	// log.Printf("Packet sent on %s (%d bytes)", t.Name, n)
	return n, nil
}

// Close はTUNデバイスを閉じ、関連リソースを解放します。
func (t *TUNDevice) Close() error {
	if t.isClosed() {
		return nil // すでに閉じられている
	}
	log.Printf("Closing TUN device %s...", t.Name)
	close(t.stopCh) // readLoopを停止させる
	err := t.ifce.Close()
	if err != nil {
		log.Printf("Error closing TUN interface %s: %v", t.Name, err)
	}

	switch runtime.GOOS {
	case "linux":
		maskBits, _ := t.Mask.Size()
		cmd := exec.Command("sudo", "ip", "addr", "del", fmt.Sprintf("%s/%d", t.IP.String(), maskBits), "dev", t.Name)
		if errDel := cmd.Run(); errDel != nil {
			log.Printf("linux: failed to delete IP address for %s: %v", t.Name, errDel)
		}
	case "darwin":
		cmd := exec.Command("sudo", "ifconfig", t.Name, "down")
		if errDel := cmd.Run(); errDel != nil {
			log.Printf("darwin: failed to bring down interface %s: %v", t.Name, errDel)
		}
	default:
		log.Printf("No specific OS cleanup command for %s on %s", t.Name, runtime.GOOS)
	}

	close(t.packetCh)
	log.Printf("TUN device %s closed.", t.Name)
	return err
}

// isClosed はデバイスが閉じられているかどうかを確認します。
func (t *TUNDevice) isClosed() bool {
	select {
	case <-t.stopCh:
		return true
	default:
		return false
	}
}

// ones はネットマスクのプレフィックス長を計算します。
func ones(mask net.IPMask) int {
	ones, _ := mask.Size()
	return ones
}

// GetInterfaceName はTUNデバイスの実際の名前を返します。
// waterライブラリが自動で名前を決定する場合があるため。
// このメソッドは NetworkDevice インターフェースの GetName() のために GetName にリネーム、もしくは別途 GetName を作成します。
// router.go からは r.TunDevice.Name のように直接フィールドアクセスされている箇所もあるため、
// フィールドアクセスを残しつつ、インターフェース用のメソッドを準備します。
func (t *TUNDevice) GetName() string {
	return t.Name
}

func (t *TUNDevice) GetIP() net.IP {
	return t.IP
}

func (t *TUNDevice) GetIPNet() *net.IPNet {
	return &net.IPNet{IP: t.IP, Mask: t.Mask}
}

// GetInterfaceName は古い名前なので、いずれ削除するか GetName に統一します。
// Deprecated: Use GetName instead.
func (t *TUNDevice) GetInterfaceName() string {
	return t.ifce.Name() // これは water ifce の名前を返す。t.Name と同じはず。
}
