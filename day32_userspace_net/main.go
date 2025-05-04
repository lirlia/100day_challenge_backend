package main

import (
	"bufio"
	"crypto"     // crypto needed for PrivateKey type in global var
	"crypto/tls" // Added for loading key/cert
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"strings"
	"syscall"
	// For accessing packet layers
	// For defining layers (IP, TCP)
	// For TUN interface interaction
)

// ANSI Color Codes
const (
	ColorReset   = "\033[0m"
	ColorRed     = "\033[31m"
	ColorYellow  = "\033[33m"
	ColorBlue    = "\033[34m"
	ColorPurple  = "\033[35m" // Purple for sending
	ColorCyan    = "\033[36m" // Cyan for IP layer
	ColorGray    = "\033[90m" // Gray for less important info / debug
	ColorWhite   = ""
	ColorOrange  = "\033[38;5;214m" // Orange for TLS
	ColorMagenta = "\033[95m"       // Magenta for H2 App Data
	ColorGreen   = "\033[32m"       // Green for established/OK
)

// Log Prefixes
const (
	PrefixIP    = "[IP] " // Keep original padding for alignment
	PrefixTCP   = "  [TCP] "
	PrefixTLS   = "    [TLS] "
	PrefixHTTP  = "      [HTTP]"
	PrefixH2    = "      [H2]  "
	PrefixError = "[ERROR] "
	PrefixWarn  = "[WARN]  "
	PrefixInfo  = "[INFO]  "
	PrefixState = "    [STATE] " // For TCP/TLS/H2 state changes
)

// Global variables for loaded certificate and key
var (
	serverCert             tls.Certificate
	serverCertDER          [][]byte // Store DER encoded certificates
	serverPrivateKeyGlobal crypto.PrivateKey
	isDebug                bool

	// Map to store active TCP connections, keyed by a string identifier.
	pauseLayers map[string]bool
)

// Command-line flags
var (
	devName    = flag.String("dev", "", "TUN device name (e.g., utun4)")
	localIP    = flag.String("localIP", "10.0.0.1", "Local IP address for the TUN device")
	remoteIP   = flag.String("remoteIP", "10.0.0.2", "Remote IP address (peer) for the TUN device")
	subnetMask = flag.String("subnet", "255.255.255.0", "Subnet mask for the TUN device")
	mtu        = flag.Int("mtu", 1500, "MTU for the TUN device")
	mode       = flag.String("mode", "tun", "Operating mode: 'tun' or 'tcp'")
	listenPort = flag.Int("port", 443, "Port to listen on in tcp mode")
	debug      = flag.Bool("debug", false, "Enable detailed debug logging")
)

// --- HTTP2State definitions moved to tcp.go ---

// --- TCPConnection definition moved to tcp.go ---

func init() {
	pauseLayers = make(map[string]bool)
	if v := os.Getenv("PAUSE_LAYER"); v != "" {
		for _, layer := range strings.Split(v, ",") {
			pauseLayers[strings.TrimSpace(strings.ToLower(layer))] = true
		}
	}
}

// 指定レイヤーで一時停止
func pauseIfNeeded(layer string) {
	if pauseLayers[strings.ToLower(layer)] {
		fmt.Printf("\n--- [%s] Enterで進行 ---\n", strings.ToUpper(layer))
		bufio.NewReader(os.Stdin).ReadBytes('\n')
	}
}

func main() {
	flag.Parse()
	isDebug = *debug // Set global debug flag

	// --- Load Certificate and Key ---
	var err error
	log.Printf("%s%sLoading server certificate and key...%s", ColorWhite, PrefixInfo, ColorReset)
	serverCert, err = tls.LoadX509KeyPair("cert.pem", "key.pem")
	if err != nil {
		log.Fatalf("%s%sFailed to load server certificate and key: %v%s", ColorRed, PrefixError, err, ColorReset)
	}
	log.Printf("%s%sServer certificate and key loaded successfully.%s", ColorWhite, PrefixInfo, ColorReset)
	serverCertDER = serverCert.Certificate
	// --- End Load Certificate and Key ---

	switch *mode {
	case "tun":
		log.Printf("%s%sStarting in TUN mode...%s", ColorWhite, PrefixInfo, ColorReset)
		if *localIP == "" || *remoteIP == "" || *subnetMask == "" {
			log.Fatalf("%s%slocalIP, remoteIP, and subnet flags are required for tun mode%s", ColorRed, PrefixError, ColorReset)
		}
		localIPAddr := net.ParseIP(*localIP)
		remoteIPAddr := net.ParseIP(*remoteIP)
		if localIPAddr == nil || remoteIPAddr == nil {
			log.Fatalf("%s%sInvalid localIP or remoteIP address format%s", ColorRed, PrefixError, ColorReset)
		}

		// Setup TUN device
		log.Printf("%s%sSetting up TUN device '%s'...%s", ColorWhite, PrefixInfo, *devName, ColorReset)
		ifce, err := setupTUN(*devName, localIPAddr.String(), remoteIPAddr.String(), *subnetMask, *mtu)
		if err != nil {
			log.Fatalf("%s%sFailed to setup TUN device: %v%s", ColorRed, PrefixError, err, ColorReset)
		}
		defer func() {
			log.Printf("%s%sClosing TUN device '%s'...%s", ColorYellow, PrefixInfo, ifce.Name(), ColorReset)
			ifce.Close()
		}()

		log.Printf("%s%sTUN device '%s' configured successfully.%s", ColorWhite, PrefixInfo, ifce.Name(), ColorReset)
		log.Printf("%s%s Interface IP: %s, Peer IP: %s, Subnet Mask: %s%s", ColorWhite, PrefixInfo, localIPAddr, remoteIPAddr, *subnetMask, ColorReset)
		log.Printf("%s%sListening for packets...%s", ColorWhite, PrefixInfo, ColorReset)

		go processPackets(ifce)

	case "tcp":
		log.Printf("%s%sStarting in TCP mode, listening on port %d...%s", ColorWhite, PrefixInfo, *listenPort, ColorReset)
		runTCPMode(*listenPort) // Call the TCP mode function (defined in tcp.go)

	default:
		log.Fatalf("%s%sInvalid mode: %s. Choose 'tun' or 'tcp'.%s", ColorRed, PrefixError, *mode, ColorReset)
	}

	// Setup signal handling for graceful shutdown (common to both modes)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Wait for termination signal
	log.Printf("%s%sWaiting for shutdown signal (Ctrl+C)...%s", ColorWhite, PrefixInfo, ColorReset)
	<-sigChan
	log.Printf("\n%s%sShutting down signal received...%s", ColorYellow, PrefixInfo, ColorReset) // Add newline for clarity
	// Cleanup (like closing TUN) is handled by defer or specific mode logic
}
