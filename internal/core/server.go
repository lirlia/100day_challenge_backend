package core

import (
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"os"
	"sync"

	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/config"
	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/network"
	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/utils"
	"github.com/songgao/water"
)

type ClientSession struct {
	publicKey  []byte // Placeholder for actual key
	remoteAddr *net.UDPAddr
	// lastSeen   time.Time
}

type VPNServer struct {
	config         *config.ServerConfig
	ifce           *water.Interface
	udpConn        *net.UDPConn
	clientSessions map[string]*ClientSession // Key: client virtual IP
	stopChan       chan struct{}
	mutex          sync.RWMutex
	wg             sync.WaitGroup
}

func NewVPNServer(cfg *config.ServerConfig) (*VPNServer, error) {
	return &VPNServer{
		config:         cfg,
		clientSessions: make(map[string]*ClientSession),
		stopChan:       make(chan struct{}),
	}, nil
}

func (s *VPNServer) Start() error {
	utils.InfoLogger.Printf("Starting VPN server on %s...", s.config.ListenAddress)
	utils.InfoLogger.Printf("TUN Interface Name: %s, IP: %s, MTU: %d", s.config.Tunnel.Name, s.config.Tunnel.IP, s.config.Tunnel.MTU)
	if s.config.Tunnel.PeerAddress != "" { // macOS
		utils.InfoLogger.Printf("TUN Interface Peer IP (for macOS ifconfig): %s", s.config.Tunnel.PeerAddress)
	}

	var err error
	s.ifce, err = network.NewTUN(&s.config.Tunnel)
	if err != nil {
		return fmt.Errorf("failed to create TUN interface: %w", err)
	}
	defer func() {
		if err != nil && s.ifce != nil {
			s.ifce.Close()
		}
	}()
	utils.InfoLogger.Printf("TUN interface %s created successfully.", s.ifce.Name())

	s.udpConn, err = network.ListenUDP(s.config.ListenAddress)
	if err != nil {
		return fmt.Errorf("failed to listen on UDP: %w", err)
	}
	defer func() {
		if err != nil && s.udpConn != nil {
			s.udpConn.Close()
		}
	}()
	utils.InfoLogger.Printf("Listening on UDP %s", s.udpConn.LocalAddr())

	s.wg.Add(2)
	go s.tunToUDP()
	go s.udpToTun()

	utils.InfoLogger.Println("VPN server started successfully.")
	return nil
}

func (s *VPNServer) Stop() {
	utils.InfoLogger.Println("Stopping VPN server...")
	close(s.stopChan)

	if s.ifce != nil {
		utils.InfoLogger.Println("Closing TUN interface...")
		if err := s.ifce.Close(); err != nil {
			utils.ErrorLogger.Printf("Error closing TUN interface: %v", err)
		} else {
			utils.InfoLogger.Println("TUN interface closed.")
		}
	}
	if s.udpConn != nil {
		utils.InfoLogger.Println("Closing UDP connection...")
		if err := s.udpConn.Close(); err != nil {
			utils.ErrorLogger.Printf("Error closing UDP connection: %v", err)
		} else {
			utils.InfoLogger.Println("UDP connection closed.")
		}
	}

	s.wg.Wait()
	utils.InfoLogger.Println("VPN server stopped gracefully.")
}

func (s *VPNServer) tunToUDP() {
	defer s.wg.Done()
	buffer := make([]byte, s.config.Tunnel.MTU+4)

	for {
		select {
		case <-s.stopChan:
			utils.InfoLogger.Println("tunToUDP: stopping...")
			return
		default:
			n, err := s.ifce.Read(buffer)
			if err != nil {
				if ope, ok := err.(*os.PathError); ok && ope.Op == "read" && ope.Err.Error() == "file already closed" {
					utils.InfoLogger.Println("tunToUDP: TUN interface closed, stopping.")
					return
				}
				if err == io.EOF {
					utils.InfoLogger.Println("tunToUDP: TUN interface EOF, stopping.")
					return
				}
				utils.ErrorLogger.Printf("tunToUDP: Error reading from TUN: %v", err)
				continue
			}
			if n == 0 {
				continue
			}

			packet := buffer[:n]
			utils.DebugLogger.Printf("tunToUDP: Read %d bytes from TUN %s: %s", n, s.ifce.Name(), hex.EncodeToString(packet[:min(n, 32)]))

			if len(packet) < 20 {
				utils.WarningLogger.Printf("tunToUDP: Packet too short to be IPv4: %d bytes", len(packet))
				continue
			}
			destIP := net.IP(packet[16:20]).String()

			s.mutex.RLock()
			clientSession, ok := s.clientSessions[destIP]
			s.mutex.RUnlock()

			if !ok {
				utils.WarningLogger.Printf("tunToUDP: No client session found for destination IP %s. Packet dropped.", destIP)
				if s.config.IsClientVirtIP(destIP) {
					utils.InfoLogger.Printf("tunToUDP: Destination IP %s is a configured client virtual IP, but no active session (physical address unknown).", destIP)
				}
				continue
			}

			_, err = s.udpConn.WriteToUDP(packet, clientSession.remoteAddr)
			if err != nil {
				utils.ErrorLogger.Printf("tunToUDP: Error writing to UDP for client %s (%s): %v", destIP, clientSession.remoteAddr, err)
				continue
			}
			utils.DebugLogger.Printf("tunToUDP: Forwarded %d bytes to client %s (%s) via UDP.", n, destIP, clientSession.remoteAddr)
		}
	}
}

func (s *VPNServer) udpToTun() {
	defer s.wg.Done()
	buffer := make([]byte, s.config.Tunnel.MTU+200)

	for {
		select {
		case <-s.stopChan:
			utils.InfoLogger.Println("udpToTun: stopping...")
			return
		default:
			n, remoteAddr, err := s.udpConn.ReadFromUDP(buffer)
			if err != nil {
				if ne, ok := err.(*net.OpError); ok && (ne.Err.Error() == "use of closed network connection" || ne.Err.Error() == "invalid argument") {
					utils.InfoLogger.Println("udpToTun: UDP connection closed, stopping.")
					return
				}
				utils.ErrorLogger.Printf("udpToTun: Error reading from UDP: %v", err)
				continue
			}
			if n == 0 {
				continue
			}

			packet := buffer[:n]
			utils.DebugLogger.Printf("udpToTun: Received %d bytes from UDP %s: %s", n, remoteAddr, hex.EncodeToString(packet[:min(n, 32)]))

			if len(packet) < 20 {
				utils.WarningLogger.Printf("udpToTun: Packet from %s too short to be IPv4: %d bytes", remoteAddr, len(packet))
				continue
			}
			srcVirtualIP := net.IP(packet[12:16]).String()

			s.mutex.Lock()
			if _, exists := s.clientSessions[srcVirtualIP]; !exists {
				if !s.config.IsClientVirtIP(srcVirtualIP) {
					s.mutex.Unlock()
					utils.WarningLogger.Printf("udpToTun: Received packet from %s with unknown/unconfigured source virtual IP %s. Packet dropped.", remoteAddr, srcVirtualIP)
					continue
				}
				utils.InfoLogger.Printf("udpToTun: New client session for virtual IP %s from physical address %s", srcVirtualIP, remoteAddr)
			}
			s.clientSessions[srcVirtualIP] = &ClientSession{
				remoteAddr: remoteAddr,
			}
			s.mutex.Unlock()

			_, err = s.ifce.Write(packet)
			if err != nil {
				utils.ErrorLogger.Printf("udpToTun: Error writing to TUN interface: %v", err)
				continue
			}
			utils.DebugLogger.Printf("udpToTun: Wrote %d bytes to TUN interface %s (from %s)", n, s.ifce.Name(), remoteAddr)
		}
	}
}
