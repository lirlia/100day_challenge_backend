package main

import (
	"flag"
	"os"
	"os/signal"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/config"
	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/core"
	"github.com/lirlia/100day_challenge_backend/day52_go_custom_vpn/internal/utils"
)

func main() {
	configFile := flag.String("config", "./configs/client.example.json", "Path to the client configuration file")
	flag.Parse()

	cfg, err := config.LoadClientConfig(*configFile)
	if err != nil {
		utils.Error("Failed to load client config: %v", err)
		os.Exit(1)
	}

	utils.Info("Starting VPN client with config: %+v", *cfg)

	vpnClient, err := core.NewVPNClient(cfg)
	if err != nil {
		utils.Error("Failed to create VPN client: %v", err)
		os.Exit(1)
	}

	go func() {
		if err := vpnClient.Start(); err != nil {
			utils.Error("VPN client error: %v", err)
			os.Exit(1)
		}
	}()

	utils.Info("VPN client started. Press Ctrl+C to stop.")

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	utils.Info("Shutting down VPN client...")
	if err := vpnClient.Stop(); err != nil {
		utils.Error("Failed to stop VPN client gracefully: %v", err)
	}
	utils.Info("VPN client stopped.")
}
