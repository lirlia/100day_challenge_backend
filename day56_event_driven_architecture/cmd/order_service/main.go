package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event"
	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/order"
	"github.com/nats-io/nats.go"
)

const defaultNatsURL = "nats://localhost:4222"
const defaultPort = "8080"

func main() {
	natsURL := os.Getenv("NATS_URL")
	if natsURL == "" {
		natsURL = defaultNatsURL
	}

	if err := event.ConnectNATS(natsURL); err != nil {
		log.Fatalf("Failed to connect to NATS: %v", err)
	}

	if err := order.InitOrderDB(); err != nil {
		log.Fatalf("Failed to initialize order database: %v", err)
	}

	// Setup subscriptions
	subscriptions := make([]*nats.Subscription, 0)
	var subErr error

	subStockReserved, subErr := event.SubscribeToEvent(event.StockReservedSubject, order.HandleStockReservedEvent)
	if subErr != nil {
		log.Fatalf("OrderService: Failed to subscribe to %s: %v", event.StockReservedSubject, subErr)
	}
	subscriptions = append(subscriptions, subStockReserved)
	log.Printf("OrderService: Subscribed to %s", event.StockReservedSubject)

	subStockFailed, subErr := event.SubscribeToEvent(event.StockReservationFailedSubject, order.HandleStockReservationFailedEvent)
	if subErr != nil {
		log.Fatalf("OrderService: Failed to subscribe to %s: %v", event.StockReservationFailedSubject, subErr)
	}
	subscriptions = append(subscriptions, subStockFailed)
	log.Printf("OrderService: Subscribed to %s", event.StockReservationFailedSubject)

	subShipmentCompleted, subErr := event.SubscribeToEvent(event.ShipmentCompletedSubject, order.HandleShipmentCompletedEvent)
	if subErr != nil {
		log.Fatalf("OrderService: Failed to subscribe to %s: %v", event.ShipmentCompletedSubject, subErr)
	}
	subscriptions = append(subscriptions, subShipmentCompleted)
	log.Printf("OrderService: Subscribed to %s", event.ShipmentCompletedSubject)

	subShipmentFailed, subErr := event.SubscribeToEvent(event.ShipmentFailedSubject, order.HandleShipmentFailedEvent)
	if subErr != nil {
		log.Fatalf("OrderService: Failed to subscribe to %s: %v", event.ShipmentFailedSubject, subErr)
	}
	subscriptions = append(subscriptions, subShipmentFailed)
	log.Printf("OrderService: Subscribed to %s", event.ShipmentFailedSubject)

	// Basic router
	http.HandleFunc("/api/orders", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			order.CreateOrderHandler(w, r)
		} else if r.Method == http.MethodGet {
			order.GetOrdersHandler(w, r)
		} else {
			w.Header().Set("Allow", "GET, POST")
			http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		}
	})
	http.HandleFunc("/api/orders/", order.GetOrderHandler)   // Handles GET /api/orders/{id}

	port := os.Getenv("ORDER_SERVICE_PORT")
	if port == "" {
		port = defaultPort
	}

	// Start HTTP server in a goroutine so it doesn't block shutdown handling
	go func() {
		log.Printf("Order Service starting HTTP server on port %s...", port)
		if err := http.ListenAndServe(fmt.Sprintf(":%s", port), nil); err != nil && err != http.ErrServerClosed {
			log.Fatalf("Failed to start Order Service HTTP server: %v", err)
		}
	}()

	// Keep the service running and wait for signals to gracefully shutdown
	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)

	<-c // Block until a signal is received

	log.Println("Shutdown signal received. Unsubscribing and closing NATS connection...")
	var wg sync.WaitGroup
	for _, sub := range subscriptions {
		if sub != nil && sub.IsValid() {
			wg.Add(1)
			go func(s *nats.Subscription) {
				defer wg.Done()
				if err := s.Unsubscribe(); err != nil {
					log.Printf("Error unsubscribing from %s: %v", s.Subject, err)
				} else {
					log.Printf("Unsubscribed from NATS subject %s", s.Subject)
				}
			}(sub)
		}
	}
	wg.Wait()    // Wait for all unsubscriptions to complete
	event.CloseNATS() // Close NATS connection after all subscriptions are drained/closed
	log.Println("Order Service shut down gracefully.")
	os.Exit(0)
}
