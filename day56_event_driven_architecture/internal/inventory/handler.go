package inventory

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event"
	"github.com/nats-io/nats.go"
)

// HandleOrderCreatedEvent processes OrderCreatedEvent messages from NATS.
func HandleOrderCreatedEvent(msg *nats.Msg) {
	log.Printf("Received OrderCreatedEvent for subject: %s", msg.Subject)
	var orderEvent event.OrderCreatedEvent
	if err := json.Unmarshal(msg.Data, &orderEvent); err != nil {
		log.Printf("Error unmarshalling OrderCreatedEvent: %v. Message data: %s", err, string(msg.Data))
		// Consider sending to a dead-letter queue or logging more robustly
		return
	}

	log.Printf("Processing order %s for user %s with %d item types", orderEvent.OrderID, orderEvent.UserID, len(orderEvent.Items))

	reservedItems, failedItems, allSucceeded, err := AttemptReservation(orderEvent.OrderID, orderEvent.Items)
	if err != nil {
		// This indicates a problem with the reservation process itself (e.g., DB error), not just stock issues.
		log.Printf("CRITICAL: Error attempting stock reservation for order %s: %v", orderEvent.OrderID, err)
		// Potentially publish a generic failure event or retry with backoff if applicable.
		// For now, we won't publish a specific stock event if the process itself failed.
		return
	}

	if allSucceeded {
		stockReservedEv := event.StockReservedEvent{
			OrderID:   orderEvent.OrderID,
			Items:     reservedItems,
			Timestamp: time.Now(),
		}
		if pubErr := event.PublishEvent(event.StockReservedSubject, stockReservedEv); pubErr != nil {
			log.Printf("CRITICAL: Failed to publish StockReservedEvent for order %s: %v", orderEvent.OrderID, pubErr)
			// Outbox pattern or other retry mechanism needed for robust systems.
		}
		log.Printf("StockReservedEvent published for order %s", orderEvent.OrderID)
	} else {
		// Partial or total failure to reserve stock
		var reason string
		if len(failedItems) > 0 {
			reason = fmt.Sprintf("Insufficient stock for some items. First failed: %s", failedItems[0].ProductID)
		} else {
			reason = "Stock reservation failed for unknown reasons (no specific item failures reported but not all succeeded)" // Should not happen if logic is correct
		}

		stockReservationFailedEv := event.StockReservationFailedEvent{
			OrderID:     orderEvent.OrderID,
			Reason:      reason,
			FailedItems: failedItems,
			Timestamp:   time.Now(),
		}
		if pubErr := event.PublishEvent(event.StockReservationFailedSubject, stockReservationFailedEv); pubErr != nil {
			log.Printf("CRITICAL: Failed to publish StockReservationFailedEvent for order %s: %v", orderEvent.OrderID, pubErr)
		}
		log.Printf("StockReservationFailedEvent published for order %s. Reason: %s", orderEvent.OrderID, reason)
	}
}

// TODO: Add a handler for ShipmentFailedEvent to release stock (compensating transaction).
// This will be subscribed to when ShipmentService publishes this event.

// HandleShipmentFailedEvent processes ShipmentFailedEvent to release previously reserved stock.
func HandleShipmentFailedEvent(msg *nats.Msg) {
	log.Printf("InventoryService: Received ShipmentFailedEvent")
	var ev event.ShipmentFailedEvent
	if err := json.Unmarshal(msg.Data, &ev); err != nil {
		log.Printf("InventoryService: Error unmarshalling ShipmentFailedEvent: %v", err)
		return
	}

	log.Printf("InventoryService: Processing stock release for order %s due to shipment failure (shipment ID: %s, reason: %s)", ev.OrderID, ev.ShipmentID, ev.Reason)

	if len(ev.Items) == 0 {
		log.Printf("InventoryService: No items found in ShipmentFailedEvent for order %s. Cannot release stock.", ev.OrderID)
		return
	}

	if err := ReleaseStock(ev.OrderID, ev.Items); err != nil {
		log.Printf("InventoryService: CRITICAL: Failed to release stock for order %s after shipment failure: %v", ev.OrderID, err)
		// This is a critical failure in a compensating transaction. Manual intervention might be needed.
		// Consider an alert or a retry mechanism with idempotency.
	}
	log.Printf("InventoryService: Stock released successfully for order %s following shipment failure.", ev.OrderID)
}
