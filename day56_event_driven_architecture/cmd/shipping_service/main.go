package main

import (
	"log"
	"math/rand"
	"os"
	"os/signal"
	"runtime"
	"syscall"
	"time"

	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event"
	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/shipping"
)

const defaultNatsURL = "nats://localhost:4222"

func main() {
	rand.Seed(time.Now().UnixNano()) // Initialize random seed for dummy processing

	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = defaultNatsURL
	}

	if err := event.ConnectNATS(natsURL); err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}

	if err := shipping.InitShippingDB(); err != nil {
		log.Fatalf("Failed to initialize shipping database: %v", err)
	}

	sub, err := event.SubscribeToEvent(event.StockReservedSubject, shipping.HandleStockReservedEvent)
	if err != nil {
		log.Fatalf("Failed to subscribe to StockReservedEvent: %v", err)
	}
	log.Printf("Shipping Service subscribed to %s", event.StockReservedSubject)

	// Keep the service running and wait for signals to gracefully shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-c
		log.Println("Shutdown signal received. Unsubscribing and closing NATS connection...")
		if sub != nil {
			sub.Unsubscribe()
			log.Println("Unsubscribed from NATS subject", event.StockReservedSubject)
		}
		event.CloseNATS()
		os.Exit(0)
	}()

	log.Println("Shipping Service is running. Waiting for events or shutdown signal...")
	runtime.Goexit()
}
