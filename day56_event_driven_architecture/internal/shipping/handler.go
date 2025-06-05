package shipping

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"time"

	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event"
	"github.com/nats-io/nats.go"
)

// HandleStockReservedEvent processes StockReservedEvent messages from NATS.
func HandleStockReservedEvent(msg *nats.Msg) {
	log.Printf("Received StockReservedEvent for subject: %s", msg.Subject)
	var stockEvent event.StockReservedEvent
	if err := json.Unmarshal(msg.Data, &stockEvent); err != nil {
		log.Printf("Error unmarshalling StockReservedEvent: %v. Message data: %s", err, string(msg.Data))
		return
	}

	log.Printf("Processing shipment for order %s with %d item types", stockEvent.OrderID, len(stockEvent.Items))

	// For simplicity, assume we get UserID and ShippingAddress from the Order event or a shared context.
	// Here, we'll use placeholders or derive them if possible.
	// In a real system, OrderService might include UserID in StockReservedEvent or ShippingService might query OrderService.
	// Let's assume OrderCreatedEvent is also listened to by ShippingService to get UserID and Address, or they are passed through.
	// For now, using placeholders.
	dummyUserID := "user_placeholder"
	dummyShippingAddress := "123 Main St, Anytown, USA"

	// 1. Create Shipment Record
	shipmentItems := make([]event.OrderItem, len(stockEvent.Items))
	for i, item := range stockEvent.Items {
		shipmentItems[i] = event.OrderItem{ProductID: item.ProductID, Quantity: item.Quantity}
	}

	createdShipment, err := CreateShipment(stockEvent.OrderID, dummyUserID, dummyShippingAddress, shipmentItems)
	if err != nil {
		log.Printf("CRITICAL: Failed to create shipment record for order %s: %v", stockEvent.OrderID, err)
		// This is a severe issue. May need to alert or retry.
		// If we can't even create a shipment record, we can't proceed to publish failure for this shipment.
		return
	}
	log.Printf("Shipment record %s created for order %s", createdShipment.ID, stockEvent.OrderID)

	// 2. Publish ShipmentInitiatedEvent
	shipmentInitiatedEv := event.ShipmentInitiatedEvent{
		ShipmentID:      createdShipment.ID,
		OrderID:         createdShipment.OrderID,
		ShippingAddress: createdShipment.ShippingAddress,
		Timestamp:       time.Now(),
	}
	if err := event.PublishEvent(event.ShipmentInitiatedSubject, shipmentInitiatedEv); err != nil {
		log.Printf("CRITICAL: Failed to publish ShipmentInitiatedEvent for shipment %s (order %s): %v", createdShipment.ID, createdShipment.OrderID, err)
		// If this fails, subsequent events won't make sense. Consider a retry or a specific failure state.
		// For now, we will attempt to continue the dummy process and publish a failure if that occurs.
	}
	log.Printf("ShipmentInitiatedEvent published for shipment %s", createdShipment.ID)

	// 3. Simulate Shipment Processing (Dummy Logic)
	go simulateShipmentProcessing(createdShipment, stockEvent.Items) // Run in a goroutine to not block the event handler
}

// simulateShipmentProcessing is a dummy function to simulate the time and outcome of shipping.
func simulateShipmentProcessing(shipment *Shipment, originalItems []event.OrderItem) {
	processingTime := time.Duration(rand.Intn(5)+3) * time.Second // 3-7 seconds processing time
	log.Printf("Shipment %s (Order %s): Simulating processing for %v...", shipment.ID, shipment.OrderID, processingTime)
	time.Sleep(processingTime)

	// Simulate success or failure randomly
	if rand.Float32() < 0.9 { // 90% success rate
		log.Printf("Shipment %s (Order %s): Processing successful.", shipment.ID, shipment.OrderID)
		dummyTrackingNumber := fmt.Sprintf("TRACK-%s%d", shipment.OrderID[:5], rand.Intn(10000))
		err := UpdateShipmentStatus(shipment.ID, StatusShipmentShipped, &dummyTrackingNumber) // Or StatusShipmentDelivered directly
		if err != nil {
			log.Printf("Error updating shipment %s status to SHIPPED: %v", shipment.ID, err)
			// If DB update fails, this is problematic. The event below might be misleading.
		}

		shipmentCompletedEv := event.ShipmentCompletedEvent{
			ShipmentID:     shipment.ID,
			OrderID:        shipment.OrderID,
			TrackingNumber: dummyTrackingNumber,
			Timestamp:      time.Now(),
		}
		if pubErr := event.PublishEvent(event.ShipmentCompletedSubject, shipmentCompletedEv); pubErr != nil {
			log.Printf("CRITICAL: Failed to publish ShipmentCompletedEvent for shipment %s: %v", shipment.ID, pubErr)
		}
		log.Printf("ShipmentCompletedEvent published for shipment %s with tracking %s", shipment.ID, dummyTrackingNumber)
	} else {
		log.Printf("Shipment %s (Order %s): Processing FAILED (simulated).", shipment.ID, shipment.OrderID)
		dummyFailureReason := "Simulated carrier issue"
		err := UpdateShipmentStatus(shipment.ID, StatusShipmentFailed, nil)
		if err != nil {
			log.Printf("Error updating shipment %s status to FAILED: %v", shipment.ID, err)
		}

		// Convert event.OrderItem to our local ShipmentItem for the event payload if needed, or use event.OrderItem directly.
		// The ShipmentFailedEvent expects []event.OrderItem for consistency with inventory service compensation.
		failedShipmentItems := make([]event.OrderItem, len(originalItems))
		for i, item := range originalItems {
			failedShipmentItems[i] = event.OrderItem{ProductID: item.ProductID, Quantity: item.Quantity}
		}

		shipmentFailedEv := event.ShipmentFailedEvent{
			ShipmentID: shipment.ID,
			OrderID:    shipment.OrderID,
			Reason:     dummyFailureReason,
			Items:      failedShipmentItems, // Send original items for potential stock release
			Timestamp:  time.Now(),
		}
		if pubErr := event.PublishEvent(event.ShipmentFailedSubject, shipmentFailedEv); pubErr != nil {
			log.Printf("CRITICAL: Failed to publish ShipmentFailedEvent for shipment %s: %v", shipment.ID, pubErr)
		}
		log.Printf("ShipmentFailedEvent published for shipment %s. Reason: %s", shipment.ID, dummyFailureReason)
	}
}
