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

// VPNServer はVPNサーバーの状態とロジックを保持します。
type VPNServer struct {
	config         *config.ServerConfig
	tunIfce        *water.Interface
	udpConn        *net.UDPConn
	clientSessions sync.Map // client physical addr string -> *ClientSession (今は1クライアントなので単純化)
	stopChan       chan struct{}
	wg             sync.WaitGroup
	// routing も考慮するなら、ここにルーティングテーブルなど
	// clientVirtualIPToPhysicalAddr map[string]*net.UDPAddr // 仮想IPと物理UDPアドレスのマッピング
}

// ClientSession は接続中のクライアントの情報を保持します (今回は簡易的に物理アドレスのみ)。
// 本来は認証状態、仮想IP、最終通信時刻なども保持する。
type ClientSession struct {
	PhysicalAddr *net.UDPAddr
	VirtualIP    net.IP // 将来的に使うかもしれない
}

// NewVPNServer は新しいVPNServerインスタンスを作成します。
func NewVPNServer(cfg *config.ServerConfig) (*VPNServer, error) {
	s := &VPNServer{
		config:   cfg,
		stopChan: make(chan struct{}),
	}
	return s, nil
}

// Start はVPNサーバーを開始します。
func (s *VPNServer) Start() error {
	utils.Info("Initializing VPN server...")

	// 1. TUNデバイスの初期化
	tunCfg := network.TunConfig{
		Name:        s.config.TunnelName,
		Address:     s.config.TunnelAddress,     // サーバーのTUN IP
		PeerAddress: s.config.TunnelPeerAddress, // クライアントのTUN IP (utun用)
		MTU:         s.config.TunnelMTU,
	}
	var err error
	s.tunIfce, err = network.NewTUN(tunCfg)
	if err != nil {
		return fmt.Errorf("failed to initialize TUN device: %w", err)
	}
	utils.Info("TUN device '%s' initialized.", s.tunIfce.Name())

	// 2. UDPリスナーの初期化
	s.udpConn, err = network.ListenUDP(s.config.ListenAddress)
	if err != nil {
		return fmt.Errorf("failed to initialize UDP listener on %s: %w", s.config.ListenAddress, err)
	}
	utils.Info("UDP listener started on %s.", s.config.ListenAddress)

	s.wg.Add(2) // tunToUDP と udpToTun の2つのgoroutine
	go s.tunToUDP()
	go s.udpToTun()

	utils.Info("VPN server core started.")
	<-s.stopChan // Stop()が呼ばれるまでブロック
	utils.Info("VPN server core shutting down...")
	return nil
}

// Stop はVPNサーバーを停止します。
func (s *VPNServer) Stop() error {
	utils.Info("Stopping VPN server...")
	close(s.stopChan)
	s.wg.Wait() // すべてのgoroutineが終了するのを待つ

	if s.tunIfce != nil {
		utils.Info("Closing TUN device '%s'", s.tunIfce.Name())
		if err := s.tunIfce.Close(); err != nil {
			utils.Error("Failed to close TUN device: %v", err)
		}
	}
	if s.udpConn != nil {
		utils.Info("Closing UDP listener on %s", s.config.ListenAddress)
		if err := s.udpConn.Close(); err != nil {
			utils.Error("Failed to close UDP listener: %v", err)
		}
	}
	utils.Info("VPN server stopped successfully.")
	return nil
}

// tunToUDP はTUNデバイスから読み取ったパケットをUDPでクライアントに転送します。
func (s *VPNServer) tunToUDP() {
	defer s.wg.Done()
	utils.Debug("tunToUDP goroutine started.")

	// 現状、クライアントは1つだけ設定されていると仮定する。
	// 設定ファイルからクライアントの物理IPを取得する方法を検討する必要がある。
	// allowed_client_peers から最初のエントリを使うなど。
	// ここでは一旦、最初の接続元をクライアントとして記憶する方式を試みる。
	// より堅牢にするには、認証を経てクライアントの物理アドレスを登録する。
	var currentClientPhyAddr *net.UDPAddr

	packet := make([]byte, s.config.TunnelMTU)
	for {
		select {
		case <-s.stopChan:
			utils.Debug("tunToUDP goroutine stopping.")
			return
		default:
			n, err := s.tunIfce.Read(packet)
			if err != nil {
				select {
				case <-s.stopChan:
					utils.Debug("tunToUDP goroutine stopping after read error.")
					return
				default:
					utils.Error("Failed to read from TUN device: %v", err)
					continue // or return, depending on error type
				}
			}
			utils.Debug("Read %d bytes from TUN %s", n, s.tunIfce.Name())

			// TODO: 暗号化処理をここに挟む
			sentData := packet[:n]

			// 転送先のクライアントを決定する
			// 実際には clientSessions から宛先クライアントの物理UDPアドレスを取得する。
			// 今回は udpToTun で記録された最初のアドレスを使う。
			s.clientSessions.Range(func(key, value interface{}) bool {
				sess, ok := value.(*ClientSession)
				if ok {
					currentClientPhyAddr = sess.PhysicalAddr
					return false // 最初の要素で終了
				}
				return true
			})

			if currentClientPhyAddr == nil {
				utils.Debug("No client connected yet, skipping TUN packet forwarding.")
				continue
			}

			utils.Debug("Writing %d bytes from TUN to UDP %s", len(sentData), currentClientPhyAddr.String())
			_, err = network.WriteToUDP(s.udpConn, sentData, currentClientPhyAddr)
			if err != nil {
				utils.Error("Failed to write to UDP for client %s: %v", currentClientPhyAddr.String(), err)
			}
		}
	}
}

// udpToTun はUDPでクライアントから受信したパケットをTUNデバイスに書き込みます。
func (s *VPNServer) udpToTun() {
	defer s.wg.Done()
	utils.Debug("udpToTun goroutine started.")

	buffer := make([]byte, s.config.TunnelMTU+200) // MTUより少し大きめ
	for {
		select {
		case <-s.stopChan:
			utils.Debug("udpToTun goroutine stopping.")
			return
		default:
			n, remoteAddr, err := network.ReadFromUDP(s.udpConn, buffer)
			if err != nil {
				select {
				case <-s.stopChan:
					utils.Debug("udpToTun goroutine stopping after read error.")
					return
				default:
					utils.Error("Failed to read from UDP: %v", err)
					continue
				}
			}
			utils.Debug("Read %d bytes from UDP %s", n, remoteAddr.String())

			// TODO: 認証処理 (PSKなど)
			// TODO: 復号処理
			receivedData := buffer[:n]

			// クライアントセッションを登録/更新 (今回は1クライアント前提)
			// 実際には認証成功後にセッションを確立する
			if _, loaded := s.clientSessions.LoadOrStore(remoteAddr.String(), &ClientSession{PhysicalAddr: remoteAddr}); !loaded {
				utils.Info("New client connection from %s. Storing session.", remoteAddr.String())
				// ここでクライアントの仮想IPを割り当てる処理などが入る。
				// 今回は設定ファイルの ClientVirtualIP を使う想定だが、複数クライアントの場合は動的割り当てや設定ベースでのマッピングが必要。
			}

			utils.Debug("Writing %d bytes from UDP %s to TUN %s", len(receivedData), remoteAddr.String(), s.tunIfce.Name())
			_, err = s.tunIfce.Write(receivedData)
			if err != nil {
				utils.Error("Failed to write to TUN device %s: %v", s.tunIfce.Name(), err)
			}
		}
	}
}
