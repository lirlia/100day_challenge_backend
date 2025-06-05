package main

import (
	"log"
	"os"
	"os/signal"
	"runtime"
	"sync"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event"
	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/inventory"
	"github.com/nats-io/nats.go"
)

const defaultNatsURL = "nats://localhost:4222"

func main() {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = defaultNatsURL
	}

	if err := event.ConnectNATS(natsURL); err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}
	// Ensure NATS connection is closed on exit
	// This might be more robustly handled with signal trapping if CloseNATS needs to do more complex cleanup
	// but for now, a simple defer is okay for typical exits.
	// defer event.CloseNATS() // defer in main might not run if a goroutine panics or os.Exit is called

	if err := inventory.InitInventoryDB(); err != nil {
		log.Fatalf("Failed to initialize inventory database: %v", err)
	}

	// Seed initial products for testing if the DB was just created or is empty.
	// In a real system, this would be managed differently (e.g., migrations, admin UI).
	inventory.SeedInitialProducts()

	subscriptions := make([]*nats.Subscription, 0)
	var subErr error // Renamed from err to avoid conflict in the same scope

	// Subscribe to OrderCreatedEvent
	subOrderCreated, subErr := event.SubscribeToEvent(event.OrderCreatedSubject, inventory.HandleOrderCreatedEvent)
	if subErr != nil {
		log.Fatalf("InventoryService: Failed to subscribe to %s: %v", event.OrderCreatedSubject, subErr)
	}
	subscriptions = append(subscriptions, subOrderCreated)
	log.Printf("Inventory Service subscribed to %s", event.OrderCreatedSubject)

	// Subscribe to ShipmentFailedEvent for compensation
	subShipmentFailed, subErr := event.SubscribeToEvent(event.ShipmentFailedSubject, inventory.HandleShipmentFailedEvent)
	if subErr != nil {
		log.Fatalf("InventoryService: Failed to subscribe to %s: %v", event.ShipmentFailedSubject, subErr)
	}
	subscriptions = append(subscriptions, subShipmentFailed)
	log.Printf("Inventory Service subscribed to %s", event.ShipmentFailedSubject)

	// Keep the service running and wait for signals to gracefully shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-c
		log.Println("InventoryService: Shutdown signal received. Unsubscribing and closing NATS connection...")
		var wg sync.WaitGroup
		for _, sub := range subscriptions {
			if sub != nil && sub.IsValid() {
				wg.Add(1)
				go func(s *nats.Subscription) {
					defer wg.Done()
					if err := s.Unsubscribe(); err != nil { // Use a different err variable inside this goroutine
						log.Printf("InventoryService: Error unsubscribing from %s: %v", s.Subject, err)
					} else {
						log.Printf("InventoryService: Unsubscribed from NATS subject %s", s.Subject)
					}
				}(sub)
			}
		}
		wg.Wait()
		event.CloseNATS()
		os.Exit(0)
	}()

	log.Println("Inventory Service is running. Waiting for events or shutdown signal...")
	// Keep the main goroutine alive indefinitely, or until a signal is received
	runtime.Goexit() // This will wait for other goroutines to finish before exiting.
	// Or: select{} // blocks forever
}
