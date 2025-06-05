package inventory

import "time"

// Product represents a product in the inventory.
type Product struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	StockQuantity  int       `json:"stockQuantity"`
	ReservedQuantity int     `json:"reservedQuantity"` // For more robust stock management
	UpdatedAt      time.Time `json:"updatedAt"`
}
