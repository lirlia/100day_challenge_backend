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
	configFile := flag.String("config", "./configs/server.example.json", "Path to the server configuration file")
	flag.Parse()

	cfg, err := config.LoadServerConfig(*configFile)
	if err != nil {
		utils.Error("Failed to load server config: %v", err)
		os.Exit(1)
	}

	utils.Info("Starting VPN server with config: %+v", *cfg)

	vpnServer, err := core.NewVPNServer(cfg)
	if err != nil {
		utils.Error("Failed to create VPN server: %v", err)
		os.Exit(1)
	}

	go func() {
		if err := vpnServer.Start(); err != nil {
			utils.Error("VPN server error: %v", err)
			// TODO: サーバーが停止した場合の処理。main goroutineに通知するなど。
			os.Exit(1) // ここで os.Exit すると、graceful shutdown ができない可能性
		}
	}()

	utils.Info("VPN server started. Press Ctrl+C to stop.")

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	<-sigCh

	utils.Info("Shutting down VPN server...")
	if err := vpnServer.Stop(); err != nil {
		utils.Error("Failed to stop VPN server gracefully: %v", err)
	}
	utils.Info("VPN server stopped.")
}
