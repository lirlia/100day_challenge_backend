package main

import (
	"flag"
	"log" // For generating IP ID, Renamed import
	"os"
	"os/signal" // For mutex
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
	// Store the DER bytes for sending in the Certificate message
	serverCertDER = serverCert.Certificate
	// --- End Load Certificate and Key ---

	if *localIP == "" || *remoteIP == "" || *subnetMask == "" {
		log.Fatal("localIP, remoteIP, and subnet flags are required")
	}

	// Setup TUN device (create and configure)
	ifce, err := setupTUN(*devName, *localIP, *remoteIP, *subnetMask, *mtu)
	if err != nil {
		log.Fatalf("Failed to setup TUN device: %v", err)
	}
	// Defer closing the interface first, then potentially cleaning up routes/addresses
	defer func() {
		log.Println("Closing TUN device...")
		ifce.Close()
		// Optional: Add cleanup for route and ifconfig if needed
		// cleanupTUN(ifce.Name(), *localIP, *remoteIP, *subnetMask)
	}()

	log.Printf("TUN device '%s' created and configured successfully.", ifce.Name())
	log.Printf(" Interface IP: %s, Peer IP: %s, Subnet Mask: %s", *localIP, *remoteIP, *subnetMask)
	log.Printf("Listening for packets...")

	// Setup signal handling for graceful shutdown
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	go processPackets(ifce)

	// Wait for termination signal
	<-sigChan
	log.Println("Shutting down signal received...")
	// The deferred ifce.Close() will handle cleanup
}
