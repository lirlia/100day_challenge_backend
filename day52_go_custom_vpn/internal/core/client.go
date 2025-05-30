package core

import (
	"fmt"
	"net"
	"sync"

	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/config"
	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/network"
	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/utils"
	"github.com/songgao/water"
)

// VPNClient はVPNクライアントの状態とロジックを保持します。
type VPNClient struct {
	config        *config.ClientConfig
	tunIfce       *water.Interface
	udpConn       *net.UDPConn
	serverUDPAddr *net.UDPAddr // サーバーの物理UDPアドレス
	stopChan      chan struct{}
	wg            sync.WaitGroup
}

// NewVPNClient は新しいVPNClientインスタンスを作成します。
func NewVPNClient(cfg *config.ClientConfig) (*VPNClient, error) {
	// サーバーの物理アドレスを解決
	serverAddr, err := net.ResolveUDPAddr("udp", cfg.ServerAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve server UDP address %s: %w", cfg.ServerAddress, err)
	}

	c := &VPNClient{
		config:        cfg,
		serverUDPAddr: serverAddr,
		stopChan:      make(chan struct{}),
	}
	return c, nil
}

// Start はVPNクライアントを開始します。
func (c *VPNClient) Start() error {
	utils.Info("Initializing VPN client...")

	// 1. TUNデバイスの初期化
	tunCfg := network.TunConfig{
		Name:        c.config.TunnelName,
		Address:     c.config.TunnelAddress,     // クライアントのTUN IP
		PeerAddress: c.config.TunnelPeerAddress, // サーバーのTUN IP (utun用)
		MTU:         c.config.TunnelMTU,
	}
	var err error
	c.tunIfce, err = network.NewTUN(tunCfg)
	if err != nil {
		return fmt.Errorf("failed to initialize TUN device: %w", err)
	}
	utils.Info("TUN device '%s' initialized.", c.tunIfce.Name())

	// (オプション) サーバーへのルートを追加
	// 全トラフィックをVPN経由にする場合はデフォルトルートの変更が必要 (より複雑)
	// ここでは、サーバーの仮想IPネットワークへのルートをTUN経由で設定することを試みる。
	// 例: `ip route add 10.0.1.0/24 dev tun0` (Linux)
	// ただし、通常これはOSが自動で行うか、手動設定を推奨する。
	// network.AddRoute(c.config.ServerVirtualIP+"/32", "", c.tunIfce.Name()) // 単一ホストルート
	// network.AddRoute( ParentNet(c.config.ServerVirtualIP, c.config.TunnelAddress), "", c.tunIfce.Name()) // サーバーのTUNネットワーク全体

	// 2. UDPソケットの初期化 (特定ポートにバインドせず、OSに任せる)
	// サーバーにパケットを送る際にソケットが作られる。
	// もし特定のローカルポートを使いたい場合は ListenUDP を使う。
	// ここでは、サーバーとの通信専用のコネクションを作成するイメージ。
	// net.DialUDP を使うと、リモートアドレスが固定されたコネクションライクなUDPソケットが得られる。
	c.udpConn, err = net.DialUDP("udp", nil, c.serverUDPAddr) // ローカルアドレスはnilでOSにおまかせ
	if err != nil {
		return fmt.Errorf("failed to dial UDP to server %s: %w", c.serverUDPAddr.String(), err)
	}
	utils.Info("UDP connection to server %s established.", c.serverUDPAddr.String())

	c.wg.Add(2) // tunToUDP と udpToTun の2つのgoroutine
	go c.tunToUDP()
	go c.udpToTun()

	utils.Info("VPN client core started.")
	<-c.stopChan
	utils.Info("VPN client core shutting down...")
	return nil
}

// Stop はVPNクライアントを停止します。
func (c *VPNClient) Stop() error {
	utils.Info("Stopping VPN client...")
	close(c.stopChan)
	c.wg.Wait()

	if c.tunIfce != nil {
		utils.Info("Closing TUN device '%s'", c.tunIfce.Name())
		if err := c.tunIfce.Close(); err != nil {
			utils.Error("Failed to close TUN device: %v", err)
		}
	}
	if c.udpConn != nil {
		utils.Info("Closing UDP connection to server %s", c.serverUDPAddr.String())
		if err := c.udpConn.Close(); err != nil {
			utils.Error("Failed to close UDP connection: %v", err)
		}
	}
	utils.Info("VPN client stopped successfully.")
	return nil
}

// tunToUDP はTUNデバイスから読み取ったパケットをUDPでサーバーに転送します。
func (c *VPNClient) tunToUDP() {
	defer c.wg.Done()
	utils.Debug("Client tunToUDP goroutine started.")

	packet := make([]byte, c.config.TunnelMTU)
	for {
		select {
		case <-c.stopChan:
			utils.Debug("Client tunToUDP goroutine stopping.")
			return
		default:
			n, err := c.tunIfce.Read(packet)
			if err != nil {
				select {
				case <-c.stopChan:
					utils.Debug("Client tunToUDP goroutine stopping after read error.")
					return
				default:
					utils.Error("Client: Failed to read from TUN device: %v", err)
					continue
				}
			}
			utils.Debug("Client: Read %d bytes from TUN %s", n, c.tunIfce.Name())

			// TODO: 暗号化処理
			sentData := packet[:n]

			utils.Debug("Client: Writing %d bytes from TUN to UDP %s", len(sentData), c.serverUDPAddr.String())
			_, err = c.udpConn.Write(sentData) // DialUDPで作ったコネクションなので宛先指定不要
			if err != nil {
				utils.Error("Client: Failed to write to UDP for server %s: %v", c.serverUDPAddr.String(), err)
			}
		}
	}
}

// udpToTun はUDPでサーバーから受信したパケットをTUNデバイスに書き込みます。
func (c *VPNClient) udpToTun() {
	defer c.wg.Done()
	utils.Debug("Client udpToTun goroutine started.")

	buffer := make([]byte, c.config.TunnelMTU+200)
	for {
		select {
		case <-c.stopChan:
			utils.Debug("Client udpToTun goroutine stopping.")
			return
		default:
			// net.DialUDP で作成したコネクションなので ReadFromUDP ではなく Read を使う
			n, err := c.udpConn.Read(buffer)
			if err != nil {
				select {
				case <-c.stopChan:
					utils.Debug("Client udpToTun goroutine stopping after read error.")
					return
				default:
					utils.Error("Client: Failed to read from UDP: %v", err)
					continue
				}
			}
			utils.Debug("Client: Read %d bytes from UDP %s", n, c.serverUDPAddr.String())

			// TODO: 復号処理
			receivedData := buffer[:n]

			utils.Debug("Client: Writing %d bytes from UDP %s to TUN %s", len(receivedData), c.serverUDPAddr.String(), c.tunIfce.Name())
			_, err = c.tunIfce.Write(receivedData)
			if err != nil {
				utils.Error("Client: Failed to write to TUN device %s: %v", c.tunIfce.Name(), err)
			}
		}
	}
}
