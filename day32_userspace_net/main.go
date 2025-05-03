package main

import (
	"flag"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"crypto/tls" // Added for loading key/cert
)

// Global variables for loaded certificate and key
var (
	serverCert    tls.Certificate
	serverCertDER [][]byte // Store DER encoded certificates
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
)

func main() {
	flag.Parse()

	// --- Load Certificate and Key ---
	var err error
	serverCert, err = tls.LoadX509KeyPair("cert.pem", "key.pem")
	if err != nil {
		log.Fatalf("Failed to load server certificate and key: %v", err)
	}
	log.Println("Server certificate and key loaded successfully.")
	serverCertDER = serverCert.Certificate
	// --- End Load Certificate and Key ---

	switch *mode {
	case "tun":
		log.Println("Starting in TUN mode...")
		if *localIP == "" || *remoteIP == "" || *subnetMask == "" {
			log.Fatal("localIP, remoteIP, and subnet flags are required for tun mode")
		}
		localIPAddr := net.ParseIP(*localIP)
		remoteIPAddr := net.ParseIP(*remoteIP)
		if localIPAddr == nil || remoteIPAddr == nil {
			log.Fatal("Invalid localIP or remoteIP address format")
		}

		// Setup TUN device
		ifce, err := setupTUN(*devName, localIPAddr.String(), remoteIPAddr.String(), *subnetMask, *mtu)
		if err != nil {
			log.Fatalf("Failed to setup TUN device: %v", err)
		}
		defer func() {
			log.Println("Closing TUN device...")
			ifce.Close()
		}()

		log.Printf("TUN device '%s' configured successfully.", ifce.Name())
		log.Printf(" Interface IP: %s, Peer IP: %s, Subnet Mask: %s", localIPAddr, remoteIPAddr, *subnetMask)
		log.Printf("Listening for packets...")

		go processPackets(ifce)

	case "tcp":
		log.Printf("Starting in TCP mode, listening on port %d...", *listenPort)
		runTCPMode(*listenPort) // Call the TCP mode function (defined in tcp.go)

	default:
		log.Fatalf("Invalid mode: %s. Choose 'tun' or 'tcp'.", *mode)
	}

	// Setup signal handling for graceful shutdown (common to both modes)
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	// Wait for termination signal
	<-sigChan
	log.Println("Shutting down signal received...")
	// Cleanup (like closing TUN) is handled by defer or specific mode logic
}
