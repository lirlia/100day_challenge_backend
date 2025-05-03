package main

import (
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"os/exec"
	"strings"

	"github.com/songgao/water"
)

// setupTUN creates and configures the TUN device.
// Returns the water.Interface and error.
func setupTUN(devName, localIP, remoteIP, subnetMask string, mtu int) (*water.Interface, error) {
	// TODO: Implement TUN device creation using water
	// TODO: Implement device configuration using os/exec (ifconfig, route)
	log.Printf("Attempting to setup TUN device '%s'...", devName) // Temporary log

	// 1. Create TUN interface with water
	config := water.Config{
		DeviceType: water.TUN,
	}
	if devName != "" {
		config.Name = devName
	}

	ifce, err := water.New(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create TUN device: %w", err)
	}
	actualDevName := ifce.Name() // Get the actual device name assigned by the OS
	log.Printf("TUN device '%s' created by water.", actualDevName)

	// 2. Configure the interface using os/exec
	log.Printf("Configuring device '%s' with IP %s, Peer %s, Mask %s, MTU %d", actualDevName, localIP, remoteIP, subnetMask, mtu)

	// Command 1: ifconfig <dev> <local_ip> <remote_ip> netmask <subnet_mask> mtu <mtu> up
	cmdIfconfig := exec.Command("ifconfig", actualDevName, localIP, remoteIP, "netmask", subnetMask, "mtu", fmt.Sprintf("%d", mtu), "up")
	output, err := cmdIfconfig.CombinedOutput()
	if err != nil {
		ifce.Close() // Close the interface if config fails
		return nil, fmt.Errorf("ifconfig failed: %w Output: %s", err, string(output))
	}
	log.Printf("ifconfig output: %s", string(output))

	// 3. Configure routing (Optional but usually necessary)
	// Calculate network address
	localIPNet := net.ParseIP(localIP)
	mask := net.IPMask(net.ParseIP(subnetMask).To4())
	network := localIPNet.Mask(mask)
	networkCIDR := fmt.Sprintf("%s/%d", network.String(), maskSize(mask))

	log.Printf("Adding route for network %s via %s", networkCIDR, remoteIP)
	// Command 2: route add -net <network_cidr> <remote_ip>
	// Note: macOS route command syntax might differ slightly. '-net' is common.
	cmdRoute := exec.Command("route", "add", "-net", networkCIDR, remoteIP)
	output, err = cmdRoute.CombinedOutput()
	if err != nil {
		// Ignore "file exists" errors which can happen if route already exists
		if !strings.Contains(string(output), "File exists") {
			// Attempt cleanup before failing
			// exec.Command("ifconfig", actualDevName, "down").Run() // Best effort
			ifce.Close()
			return nil, fmt.Errorf("route add failed: %w Output: %s", err, string(output))
		}
		log.Printf("Route add output (ignored existing route error): %s", string(output))
	} else {
		log.Printf("Route add output: %s", string(output))
	}

	return ifce, nil
}

// processPackets reads packets from the TUN device and parses them.
func processPackets(ifce *water.Interface) {
	packet := make([]byte, *mtu+4) // Buffer needs to be large enough for MTU + potential headers (like macOS loopback header)
	for {
		// macOS TUN devices might prepend a 4-byte header indicating the protocol family (AF_INET = 0x00000002)
		// We need to read this header first, then the actual IP packet.
		n, err := ifce.Read(packet)
		if err != nil {
			// Check if the error is due to the interface being closed during shutdown
			if opErr, ok := err.(*net.OpError); ok && opErr.Err.Error() == "file already closed" {
				log.Println("TUN interface closed, stopping packet processing.")
				break
			}
			// Handle other potential errors like "invalid argument" which might occur on close
			if err.Error() == "invalid argument" {
				log.Println("TUN interface error (invalid argument), stopping packet processing.")
				break
			}
			log.Printf("Error reading from TUN device: %v", err)
			continue
		}

		if n == 0 {
			continue
		}

		var ipPacketData []byte
		// Check for macOS TUN header (AF_INET = 0x00000002, Big Endian)
		if n > 4 && binary.BigEndian.Uint32(packet[:4]) == 2 {
			ipPacketData = packet[4:n]
		} else {
			// Assume no prefix header (might be needed for other OS or configurations)
			ipPacketData = packet[:n]
		}

		if len(ipPacketData) == 0 {
			continue
		}

		// Try parsing the packet as IPv4
		ipHeader, payload, err := parseIPv4Header(ipPacketData)
		if err != nil {
			log.Printf("Error parsing IPv4 header: %v (Packet length: %d)", err, len(ipPacketData))
			continue
		}

		// Print parsed header information
		printHeaderInfo(ipHeader, len(ipPacketData))

		// Handle based on protocol
		switch ipHeader.Protocol {
		case ICMPProtocolNumber:
			handleICMPPacket(ifce, ipHeader, payload)
		case TCPProtocolNumber:
			handleTCPPacket(ifce, ipHeader, payload)
		// case 17: // UDP
		//  log.Println("UDP Packet received (not handled)")
		default:
			// log.Printf("Unhandled IP protocol: %d", ipHeader.Protocol)
		}
	}
}

// printHeaderInfo prints formatted IP header information.
func printHeaderInfo(ipHeader *IPv4Header, packetLen int) {
	// Build flags string inline
	var flagsStr string
	if ipHeader.Flags&0x04 != 0 {
		flagsStr += "R"
	} // Reserved bit
	if ipHeader.Flags&0x02 != 0 {
		flagsStr += "DF"
	} // Don't Fragment
	if ipHeader.Flags&0x01 != 0 {
		flagsStr += "MF"
	} // More Fragments
	if flagsStr == "" {
		flagsStr = "-"
	}

	protoStr := ipProtocolToString(ipHeader.Protocol) // Defined in ip.go
	hdrLen := int(ipHeader.IHL) * 4
	log.Printf("IP RCV: %s -> %s Proto: %d(%s) TTL: %d Len: %d/%d ID: %x Flags: [%s] HdrLen: %d",
		ipHeader.SrcIP,
		ipHeader.DstIP,
		ipHeader.Protocol,
		protoStr,
		ipHeader.TTL,
		ipHeader.TotalLength, // IP Total Length
		packetLen,            // Received packet length (including header)
		ipHeader.ID,
		flagsStr,
		hdrLen)
}

// calculateChecksum is defined in ip.go

// maskSize calculates the prefix size from an IPv4 mask.
// This helper function can remain in tun.go as it's specific to setupTUN
func maskSize(mask net.IPMask) int {
	ones, _ := mask.Size()
	return ones
}
