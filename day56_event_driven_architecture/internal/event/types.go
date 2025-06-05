package event

import "time"

// OrderItem represents an item in an order
type OrderItem struct {
	ProductID string `json:"productId"`
	Quantity  int    `json:"quantity"`
	Price     int    `json:"price,omitempty"` // 購入サービスから発行される時のみ使用
}

// OrderCreatedEvent is published when an order is created
type OrderCreatedEvent struct {
	OrderID     string      `json:"orderId"`
	UserID      string      `json:"userId"`
	Items       []OrderItem `json:"items"`
	TotalAmount int         `json:"totalAmount"`
	Timestamp   time.Time   `json:"timestamp"`
}

// StockReservedEvent is published when stock is successfully reserved
type StockReservedEvent struct {
	OrderID          string      `json:"orderId"`
	Items            []OrderItem `json:"items"` // quantityReserved が入る想定
	Timestamp        time.Time   `json:"timestamp"`
}

// FailedItemDetail shows details about a failed item in stock reservation
type FailedItemDetail struct {
	ProductID         string `json:"productId"`
	RequestedQuantity int    `json:"requestedQuantity"`
	AvailableQuantity int    `json:"availableQuantity"`
}

// StockReservationFailedEvent is published when stock reservation fails
type StockReservationFailedEvent struct {
	OrderID     string             `json:"orderId"`
	Reason      string             `json:"reason"`
	FailedItems []FailedItemDetail `json:"failedItems"`
	Timestamp   time.Time          `json:"timestamp"`
}

// ShipmentInitiatedEvent is published when a shipment is initiated
type ShipmentInitiatedEvent struct {
	ShipmentID      string    `json:"shipmentId"`
	OrderID         string    `json:"orderId"`
	ShippingAddress string    `json:"shippingAddress"` // 実際のシステムではもっと複雑な構造
	Timestamp       time.Time `json:"timestamp"`
}

// ShipmentCompletedEvent is published when a shipment is completed
type ShipmentCompletedEvent struct {
	ShipmentID     string    `json:"shipmentId"`
	OrderID        string    `json:"orderId"`
	TrackingNumber string    `json:"trackingNumber"`
	Timestamp      time.Time `json:"timestamp"`
}

// ShipmentFailedEvent is published when a shipment fails
type ShipmentFailedEvent struct {
	ShipmentID string      `json:"shipmentId"`
	OrderID    string      `json:"orderId"`
	Reason     string      `json:"reason"`
	Items      []OrderItem `json:"items"` // 在庫サービスが補償処理できるよう商品情報を含む
	Timestamp  time.Time   `json:"timestamp"`
}

// Event subjects (topics)
const (
	OrderCreatedSubject             = "orders.created"
	StockReservedSubject            = "inventory.reserved"
	StockReservationFailedSubject = "inventory.reservation_failed"
	ShipmentInitiatedSubject        = "shipping.initiated"
	ShipmentCompletedSubject        = "shipping.completed"
	ShipmentFailedSubject           = "shipping.failed"
)
