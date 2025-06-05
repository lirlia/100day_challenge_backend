package shipping

import "time"

const (
	StatusShipmentPending     ShipmentStatus = "PENDING"      // Waiting to be processed
	StatusShipmentProcessing  ShipmentStatus = "PROCESSING"    // Shipment is being prepared
	StatusShipmentShipped     ShipmentStatus = "SHIPPED"      // Handed over to carrier
	StatusShipmentDelivered   ShipmentStatus = "DELIVERED"    // Successfully delivered
	StatusShipmentFailed      ShipmentStatus = "FAILED"       // Delivery failed
	StatusShipmentCancelled   ShipmentStatus = "CANCELLED"    // Shipment was cancelled before processing
)

type ShipmentStatus string

// Shipment represents a shipment in the system.
type Shipment struct {
	ID              string         `json:"id"`
	OrderID         string         `json:"orderId"`
	UserID          string         `json:"userId,omitempty"`      // Copied from OrderCreatedEvent for context, if needed
	Items           []ShipmentItem `json:"items,omitempty"`       // Copied from StockReservedEvent
	Status          ShipmentStatus `json:"status"`
	ShippingAddress string         `json:"shippingAddress"` // Simplified address
	TrackingNumber  string         `json:"trackingNumber,omitempty"`
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
}

// ShipmentItem represents an item within a shipment.
// Based on event.OrderItem but might evolve independently.
type ShipmentItem struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
}
