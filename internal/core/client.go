package core

import (
	"encoding/hex"
	"fmt"
	"io"
	"net"
	"os"
	"sync"
	"time"

	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/config"
	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/network"
	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/utils"
	"github.com/songgao/water"
)

type VPNClient struct {
	config     *config.ClientConfig
	ifce       *water.Interface
	udpConn    *net.UDPConn
	serverAddr *net.UDPAddr
	stopChan   chan struct{}
	wg         sync.WaitGroup // Added WaitGroup
}

func NewVPNClient(cfg *config.ClientConfig) (*VPNClient, error) {
	serverAddr, err := net.ResolveUDPAddr("udp", cfg.ServerAddress)
	if err != nil {
		return nil, fmt.Errorf("failed to resolve server address %s: %w", cfg.ServerAddress, err)
	}
	return &VPNClient{
		config:     cfg,
		serverAddr: serverAddr,
		stopChan:   make(chan struct{}),
	}, nil
}

func (c *VPNClient) Start() error {
	utils.InfoLogger.Printf("Starting VPN client, connecting to %s...", c.config.ServerAddress)
	utils.InfoLogger.Printf("TUN Interface Name: %s, IP: %s, MTU: %d", c.config.Tunnel.Name, c.config.Tunnel.IP, c.config.Tunnel.MTU)
	if c.config.Tunnel.PeerAddress != "" { // macOS
		utils.InfoLogger.Printf("TUN Interface Peer IP (for macOS ifconfig): %s", c.config.Tunnel.PeerAddress)
	}

	var err error
	c.ifce, err = network.NewTUN(&c.config.Tunnel)
	if err != nil {
		return fmt.Errorf("failed to create TUN interface: %w", err)
	}
	defer func() {
		if err != nil && c.ifce != nil {
			c.ifce.Close()
		}
	}()
	utils.InfoLogger.Printf("TUN interface %s created successfully.", c.ifce.Name())

	// For client, we typically don't bind to a specific local port unless necessary.
	// A local address of ":0" lets the OS pick an available port.
	// However, for consistency or specific needs, one might use c.config.LocalAddress if defined.
	// For now, let OS pick.
	c.udpConn, err = net.DialUDP("udp", nil, c.serverAddr) // Using DialUDP for a connected UDP socket
	if err != nil {
		return fmt.Errorf("failed to dial UDP to server %s: %w", c.serverAddr.String(), err)
	}
	utils.InfoLogger.Printf("UDP connection established to server %s from %s", c.udpConn.RemoteAddr(), c.udpConn.LocalAddr())

	c.wg.Add(2) // Increment WaitGroup for two goroutines
	go c.tunToUDP()
	go c.udpToTun()

	utils.InfoLogger.Println("VPN client started successfully.")
	// Send an initial packet to "register" with the server (if server logic requires it)
	// This could be a keep-alive or an empty, authenticated packet.
	// For now, we'll rely on the first data packet from TUN to do this.
	return nil
}

func (c *VPNClient) Stop() {
	utils.InfoLogger.Println("Stopping VPN client...")
	close(c.stopChan) // Signal goroutines to stop

	// Close resources early to interrupt blocking calls
	if c.ifce != nil {
		utils.InfoLogger.Println("Closing TUN interface...")
		if err := c.ifce.Close(); err != nil {
			utils.ErrorLogger.Printf("Error closing TUN interface: %v", err)
		} else {
			utils.InfoLogger.Println("TUN interface closed.")
		}
	}
	if c.udpConn != nil {
		utils.InfoLogger.Println("Closing UDP connection...")
		if err := c.udpConn.Close(); err != nil {
			utils.ErrorLogger.Printf("Error closing UDP connection: %v", err)
		} else {
			utils.InfoLogger.Println("UDP connection closed.")
		}
	}

	c.wg.Wait() // Wait for all goroutines to finish
	utils.InfoLogger.Println("VPN client stopped gracefully.")
}

// tunToUDP reads packets from the TUN interface and forwards them to the server via UDP.
func (c *VPNClient) tunToUDP() {
	defer c.wg.Done()                             // Decrement WaitGroup when goroutine exits
	buffer := make([]byte, c.config.Tunnel.MTU+4) // MTU + IP header

	for {
		select {
		case <-c.stopChan:
			utils.InfoLogger.Println("tunToUDP (client): stopping...")
			return
		default:
			// Attempt to read from TUN. This might block.
			n, err := c.ifce.Read(buffer)
			if err != nil {
				if ope, ok := err.(*os.PathError); ok && ope.Op == "read" && ope.Err.Error() == "file already closed" {
					utils.InfoLogger.Println("tunToUDP (client): TUN interface closed, stopping.")
					return
				}
				if err == io.EOF {
					utils.InfoLogger.Println("tunToUDP (client): TUN interface EOF, stopping.")
					return
				}
				utils.ErrorLogger.Printf("tunToUDP (client): Error reading from TUN: %v", err)
				continue
			}
			if n == 0 {
				continue
			}

			packet := buffer[:n]
			utils.DebugLogger.Printf("tunToUDP (client): Read %d bytes from TUN %s: %s", n, c.ifce.Name(), hex.EncodeToString(packet[:min(n, 32)]))

			// TODO: Encrypt packet
			_, err = c.udpConn.Write(packet) // For connected UDP, use Write
			if err != nil {
				// Check if the error is due to the connection being closed
				if ne, ok := err.(*net.OpError); ok && (ne.Err.Error() == "use of closed network connection" || ne.Err.Error() == "write: broken pipe") {
					utils.InfoLogger.Println("tunToUDP (client): UDP connection closed, stopping write.")
					return // Or continue, depending on desired behavior on send error
				}
				utils.ErrorLogger.Printf("tunToUDP (client): Error writing to UDP: %v", err)
				continue
			}
			utils.DebugLogger.Printf("tunToUDP (client): Sent %d bytes to server %s via UDP.", n, c.serverAddr)
		}
	}
}

// udpToTun reads packets from UDP (from the server) and writes them to the TUN interface.
func (c *VPNClient) udpToTun() {
	defer c.wg.Done() // Decrement WaitGroup when goroutine exits
	// Buffer size should accommodate MTU + potential overheads from server (though usually server sends what it receives from its TUN)
	buffer := make([]byte, c.config.Tunnel.MTU+200)

	for {
		select {
		case <-c.stopChan:
			utils.InfoLogger.Println("udpToTun (client): stopping...")
			return
		default:
			// Set a deadline for the ReadFromUDP operation to prevent indefinite blocking
			if c.udpConn != nil {
				err := c.udpConn.SetReadDeadline(time.Now().Add(1 * time.Second))
				if err != nil {
					utils.ErrorLogger.Printf("udpToTun (client): Failed to set read deadline: %v", err)
					// Depending on the error, you might want to return or break.
				}
			}

			// Attempt to read from UDP. This might block.
			n, _, err := c.udpConn.ReadFromUDP(buffer) // Can also use c.udpConn.Read(buffer) for connected UDP
			if err != nil {
				if ne, ok := err.(net.Error); ok && ne.Timeout() {
					// Read timed out, continue to check stopChan
					continue
				}
				// Check if the error is due to the connection being closed
				if ne, ok := err.(*net.OpError); ok && (ne.Err.Error() == "use of closed network connection" || ne.Err.Error() == "invalid argument") {
					utils.InfoLogger.Println("udpToTun (client): UDP connection closed, stopping.")
					return
				}
				utils.ErrorLogger.Printf("udpToTun (client): Error reading from UDP: %v", err)
				continue
			}
			if n == 0 {
				continue
			}

			packet := buffer[:n]
			utils.DebugLogger.Printf("udpToTun (client): Received %d bytes from server %s via UDP: %s", n, c.serverAddr, hex.EncodeToString(packet[:min(n, 32)]))

			// TODO: Decrypt packet

			// Write to TUN interface
			_, err = c.ifce.Write(packet)
			if err != nil {
				// Check if the error is due to the TUN interface being closed (e.g., during shutdown)
				if ope, ok := err.(*os.PathError); ok && ope.Op == "write" && ope.Err.Error() == "file already closed" {
					utils.InfoLogger.Println("udpToTun (client): TUN interface closed, stopping write.")
					return
				}
				utils.ErrorLogger.Printf("udpToTun (client): Error writing to TUN interface: %v", err)
				continue
			}
			utils.DebugLogger.Printf("udpToTun (client): Wrote %d bytes to TUN interface %s.", n, c.ifce.Name())
		}
	}
}
