package order

import (
	"time"

	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event" // For event.OrderItem
)

const (
	StatusPending          OrderStatus = "PENDING"
	StatusAwaitingShipment OrderStatus = "AWAITING_SHIPMENT"
	StatusShipped          OrderStatus = "SHIPPED"
	StatusCompleted        OrderStatus = "COMPLETED"
	StatusCancelledNoStock OrderStatus = "CANCELLED_NO_STOCK"
	StatusShipmentFailed   OrderStatus = "SHIPMENT_FAILED"
)

type OrderStatus string

// Order represents an order in the system.
type Order struct {
	ID          string        `json:"id"`
	UserID      string        `json:"userId"`
	Items       []OrderItem   `json:"items"` // For API response, not directly stored in orders table this way
	TotalAmount int           `json:"totalAmount"`
	Status      OrderStatus   `json:"status"`
	CreatedAt   time.Time     `json:"createdAt"`
	UpdatedAt   time.Time     `json:"updatedAt"`
}

// OrderItem represents an item within an order for storage.
// It references event.OrderItem for consistency in product/quantity structure.
type OrderItem struct {
	ID                int    `json:"id"` // DB auto-increment ID
	OrderID           string `json:"orderId"`
	ProductID         string `json:"productId"`
	Quantity          int    `json:"quantity"`
	PriceAtPurchase   int    `json:"priceAtPurchase"` // Price at the time of purchase
}

// CreateOrderRequest is the expected request body for creating a new order.
type CreateOrderRequest struct {
	UserID string            `json:"userId"`
	Items  []event.OrderItem `json:"items"` // Uses event.OrderItem for request structure
}
