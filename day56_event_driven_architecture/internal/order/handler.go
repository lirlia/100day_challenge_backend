package order

import (
	"encoding/json"
	"log"
	"net/http"
	"time"

	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event"
	"github.com/nats-io/nats.go"
)

// CreateOrderHandler handles requests to create a new order.
func CreateOrderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", http.MethodPost)
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if req.UserID == "" || len(req.Items) == 0 {
		http.Error(w, "User ID and items are required", http.StatusBadRequest)
		return
	}

	// Calculate total amount (simple calculation, real scenario might involve more checks)
	totalAmount := 0
	for _, item := range req.Items {
		if item.Quantity <= 0 || item.Price <= 0 {
			http.Error(w, "Item quantity and price must be positive", http.StatusBadRequest)
			return
		}
		totalAmount += item.Price * item.Quantity
	}

	order, err := CreateOrder(req.UserID, req.Items, totalAmount)
	if err != nil {
		log.Printf("Error creating order: %v", err)
		http.Error(w, "Failed to create order", http.StatusInternalServerError)
		return
	}

	// Publish OrderCreatedEvent
	orderCreatedEvent := event.OrderCreatedEvent{
		OrderID:     order.ID,
		UserID:      order.UserID,
		Items:       req.Items, // Use items from request as they contain price for this event
		TotalAmount: order.TotalAmount,
		Timestamp:   time.Now(),
	}
	if err := event.PublishEvent(event.OrderCreatedSubject, orderCreatedEvent); err != nil {
		// This is a critical part. In a real system, you might need a retry mechanism or
		// an outbox pattern if event publishing fails, to ensure data consistency.
		log.Printf("CRITICAL: Failed to publish OrderCreatedEvent for order %s: %v", order.ID, err)
		// Depending on policy, you might want to roll back the DB transaction or mark order as needing reconciliation.
		// For this example, we log it and proceed, but this is a simplification.
		// http.Error(w, "Failed to publish order event, order created but may not be processed", http.StatusInternalServerError)
		// return
	}
	log.Printf("OrderCreatedEvent published for order %s", order.ID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(order) // Return the created order object
}

// GetOrderHandler handles requests to get an order by ID.
func GetOrderHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", http.MethodGet)
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	orderID := r.URL.Path[len("/orders/"):] // Basic routing, assumes path like /orders/{id}
	if orderID == "" {
		http.Error(w, "Order ID is required", http.StatusBadRequest)
		return
	}

	order, err := GetOrderByID(orderID)
	if err != nil {
		log.Printf("Error getting order %s: %v", orderID, err)
		http.Error(w, "Failed to retrieve order", http.StatusInternalServerError)
		return
	}
	if order == nil {
		http.Error(w, "Order not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(order)
}

// TODO: Add a handler that listens to StockReservedEvent and StockReservationFailedEvent
// to update order status. This will be implemented when those events are published by InventoryService.

// HandleStockReservedEvent updates the order status to AWAITING_SHIPMENT.
func HandleStockReservedEvent(msg *nats.Msg) {
	log.Printf("OrderService: Received StockReservedEvent")
	var ev event.StockReservedEvent
	if err := json.Unmarshal(msg.Data, &ev); err != nil {
		log.Printf("OrderService: Error unmarshalling StockReservedEvent: %v", err)
		return
	}
	if err := UpdateOrderStatus(ev.OrderID, StatusAwaitingShipment); err != nil {
		log.Printf("OrderService: Failed to update order %s status to AWAITING_SHIPMENT: %v", ev.OrderID, err)
	}
}

// HandleStockReservationFailedEvent updates the order status to CANCELLED_NO_STOCK.
func HandleStockReservationFailedEvent(msg *nats.Msg) {
	log.Printf("OrderService: Received StockReservationFailedEvent")
	var ev event.StockReservationFailedEvent
	if err := json.Unmarshal(msg.Data, &ev); err != nil {
		log.Printf("OrderService: Error unmarshalling StockReservationFailedEvent: %v", err)
		return
	}
	if err := UpdateOrderStatus(ev.OrderID, StatusCancelledNoStock); err != nil {
		log.Printf("OrderService: Failed to update order %s status to CANCELLED_NO_STOCK: %v", ev.OrderID, err)
	}
}

// HandleShipmentCompletedEvent updates the order status to COMPLETED.
func HandleShipmentCompletedEvent(msg *nats.Msg) {
	log.Printf("OrderService: Received ShipmentCompletedEvent")
	var ev event.ShipmentCompletedEvent
	if err := json.Unmarshal(msg.Data, &ev); err != nil {
		log.Printf("OrderService: Error unmarshalling ShipmentCompletedEvent: %v", err)
		return
	}
	if err := UpdateOrderStatus(ev.OrderID, StatusCompleted); err != nil {
		log.Printf("OrderService: Failed to update order %s status to COMPLETED: %v", ev.OrderID, err)
	}
}

// HandleShipmentFailedEvent updates the order status to SHIPMENT_FAILED.
func HandleShipmentFailedEvent(msg *nats.Msg) {
	log.Printf("OrderService: Received ShipmentFailedEvent")
	var ev event.ShipmentFailedEvent
	if err := json.Unmarshal(msg.Data, &ev); err != nil {
		log.Printf("OrderService: Error unmarshalling ShipmentFailedEvent: %v", err)
		return
	}
	if err := UpdateOrderStatus(ev.OrderID, StatusShipmentFailed); err != nil {
		log.Printf("OrderService: Failed to update order %s status to SHIPMENT_FAILED: %v", ev.OrderID, err)
	}
}
