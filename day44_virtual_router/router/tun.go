package router

import (
	"fmt"
	"log"
	"net"
	"os/exec"
	"runtime"
	"strings"

	"github.com/songgao/water"
)

const (
	DefaultMTU = 1500
)

// CreateTUN creates a new TUN device.
// water.Interface.Name() will give the actual device name (e.g., utunX on macOS).
func CreateTUN() (*water.Interface, error) {
	config := water.Config{
		DeviceType: water.TUN,
	}
	// config.Name = "tun0" // Optional: suggest a name, system might override.
	// For macOS, utun device names are utun0, utun1, etc.
	// For Linux, you can often specify tun0, tun1, etc. but it's better to let the system assign.

	ifce, err := water.New(config)
	if err != nil {
		return nil, fmt.Errorf("failed to create TUN device: %w", err)
	}
	log.Printf("TUN device created: %s", ifce.Name())
	return ifce, nil
}

// ConfigureTUN sets the IP address and MTU for the TUN device, and brings it up.
// This uses os commands (ifconfig for macOS, ip for Linux).
// ipNetStr should be in "ip/mask_length" format, e.g., "10.0.0.1/24".
func ConfigureTUN(ifName string, ipNetStr string, mtu int) error {
	ip, ipNet, err := net.ParseCIDR(ipNetStr)
	if err != nil {
		return fmt.Errorf("invalid IP network format %s: %w", ipNetStr, err)
	}
	ipNet.IP = ip // Ensure IP in IPNet is the specific IP, not network addr

	var cmds [][]*exec.Cmd // For Linux, multiple commands might be needed

	switch runtime.GOOS {
	case "darwin":
		maskStr := IPMaskToString(ipNet.Mask)
		// macOS: sudo ifconfig utunX 10.0.0.1 10.0.0.1 netmask 255.255.255.0 mtu 1400 up
		// The second IP is the destination for point-to-point.
		cmds = [][]*exec.Cmd{{
			exec.Command("sudo", "ifconfig", ifName, ipNet.IP.String(), ipNet.IP.String(), "netmask", maskStr, "mtu", fmt.Sprintf("%d", mtu), "up"),
		}}
		log.Printf("Preparing to configure TUN device %s (macOS) with IP %s, Netmask %s, MTU %d", ifName, ipNet.IP.String(), maskStr, mtu)
	case "linux":
		// Linux:
		// sudo ip addr add 10.0.0.1/24 dev tun0
		// sudo ip link set dev tun0 mtu 1400
		// sudo ip link set dev tun0 up
		cmds = [][]*exec.Cmd{
			{exec.Command("sudo", "ip", "addr", "add", ipNet.String(), "dev", ifName)},
			{exec.Command("sudo", "ip", "link", "set", "dev", ifName, "mtu", fmt.Sprintf("%d", mtu))},
			{exec.Command("sudo", "ip", "link", "set", "dev", ifName, "up")},
		}
		log.Printf("Preparing to configure TUN device %s (Linux) with IP %s, MTU %d", ifName, ipNet.String(), mtu)
	default:
		return fmt.Errorf("unsupported OS for TUN configuration: %s", runtime.GOOS)
	}

	for i, stepCmds := range cmds {
		for _, cmd := range stepCmds {
			log.Printf("Executing command (step %d): %s", i+1, cmd.String())
			output, err := cmd.CombinedOutput()
			if err != nil {
				return fmt.Errorf("failed to configure TUN device %s (command: %s): %w. Output: %s", ifName, cmd.String(), err, string(output))
			}
			log.Printf("Command successful. Output: %s", string(output))
		}
	}

	log.Printf("TUN device %s configured successfully.", ifName)
	return nil
}

// IPMaskToString converts an IP mask to a string "255.255.255.0".
func IPMaskToString(mask net.IPMask) string {
	parts := make([]string, 4)
	for i := 0; i < 4; i++ {
		parts[i] = fmt.Sprintf("%d", mask[i])
	}
	return strings.Join(parts, ".")
}

// DeleteTUN brings down the TUN device.
// Closing the water.Interface should handle resource cleanup by the library.
// This function primarily handles OS-level "down" command.
func DeleteTUN(ifName string) error {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("sudo", "ifconfig", ifName, "down")
	case "linux":
		cmd = exec.Command("sudo", "ip", "link", "set", "dev", ifName, "down")
	default:
		log.Printf("DeleteTUN: unsupported OS: %s, skipping OS command for bringing down interface %s.", runtime.GOOS, ifName)
		return nil // Not an error, just can't perform OS-level takedown.
	}

	log.Printf("Attempting to bring down TUN device %s with command: %s", ifName, cmd.String())
	output, err := cmd.CombinedOutput()
	if err != nil {
		// Log as warning, device might be already down or gone, or permissions issue.
		log.Printf("Warning: Failed to execute command to bring down TUN device %s: %v. Output: %s", ifName, err, string(output))
		// Don't return error here, as primary cleanup is ifce.Close()
		return nil
	}
	log.Printf("TUN device %s OS-level takedown command executed. Output: %s", ifName, string(output))
	return nil
}

// ReadPacket reads a single IP packet from the TUN interface.
// buffer should be appropriately sized (e.g., MTU + headers).
func ReadPacket(ifce *water.Interface, buffer []byte) (int, error) {
	n, err := ifce.Read(buffer)
	if err != nil {
		// EOF might mean interface is closed, handle non-critically if expected.
		// water library might return io.EOF
		if err.Error() == "EOF" || err.Error() == "read /dev/utunX: file already closed" { // Example error strings
			log.Printf("TUN %s: Read returned EOF or file closed, interface likely shutting down.", ifce.Name())
			return 0, err // Propagate EOF or similar sentinel error
		}
		return 0, fmt.Errorf("failed to read packet from TUN %s: %w", ifce.Name(), err)
	}
	return n, nil
}

// WritePacket writes a single IP packet to the TUN interface.
func WritePacket(ifce *water.Interface, packet []byte) (int, error) {
	n, err := ifce.Write(packet)
	if err != nil {
		return 0, fmt.Errorf("failed to write packet to TUN %s: %w", ifce.Name(), err)
	}
	return n, nil
}
