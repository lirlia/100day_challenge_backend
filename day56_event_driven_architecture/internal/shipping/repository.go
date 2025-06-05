package shipping

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/database"
	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event" // For event.OrderItem to convert to ShipmentItem
)

const ShippingDBPath = "./db/shipping.db"

const schemaCreationQuery = `
CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL UNIQUE, -- Assuming one shipment per order for simplicity
    user_id TEXT, -- Store for context, taken from order event
    status TEXT NOT NULL,
    shipping_address TEXT NOT NULL,
    tracking_number TEXT,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS shipment_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    shipment_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    FOREIGN KEY (shipment_id) REFERENCES shipments(id)
);
`

var db *sql.DB

// InitShippingDB initializes the database for the shipping service.
func InitShippingDB() error {
	var err error
	db, err = database.InitDB(ShippingDBPath, schemaCreationQuery)
	if err != nil {
		return fmt.Errorf("failed to initialize shipping database: %w", err)
	}
	return nil
}

// CreateShipment creates a new shipment record in the database.
// It also stores the items associated with the shipment.
func CreateShipment(orderID, userID, shippingAddress string, itemsFromEvent []event.OrderItem) (*Shipment, error) {
	shipmentID := uuid.New().String()
	now := time.Now()
	status := StatusShipmentPending

	tx, err := db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	_, err = tx.Exec("INSERT INTO shipments (id, order_id, user_id, status, shipping_address, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		shipmentID, orderID, userID, status, shippingAddress, now, now)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to insert shipment: %w", err)
	}

	stmt, err := tx.Prepare("INSERT INTO shipment_items (shipment_id, product_id, quantity) VALUES (?, ?, ?)")
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to prepare shipment item statement: %w", err)
	}
	defer stmt.Close()

	shipmentItemsForModel := make([]ShipmentItem, len(itemsFromEvent))
	for i, item := range itemsFromEvent {
		_, err = stmt.Exec(shipmentID, item.ProductID, item.Quantity)
		if err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to insert shipment item %s: %w", item.ProductID, err)
		}
		shipmentItemsForModel[i] = ShipmentItem{ProductID: item.ProductID, Quantity: item.Quantity}
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &Shipment{
		ID:              shipmentID,
		OrderID:         orderID,
		UserID:          userID,
		Items:           shipmentItemsForModel,
		Status:          status,
		ShippingAddress: shippingAddress,
		CreatedAt:       now,
		UpdatedAt:       now,
	}, nil
}

// GetShipmentByID retrieves a shipment and its items by ID.
func GetShipmentByID(shipmentID string) (*Shipment, error) {
	row := db.QueryRow("SELECT order_id, user_id, status, shipping_address, tracking_number, created_at, updated_at FROM shipments WHERE id = ?", shipmentID)

	shipment := &Shipment{ID: shipmentID}
    var trackingNumber sql.NullString
    err := row.Scan(&shipment.OrderID, &shipment.UserID, &shipment.Status, &shipment.ShippingAddress, &trackingNumber, &shipment.CreatedAt, &shipment.UpdatedAt)
    if trackingNumber.Valid {
        shipment.TrackingNumber = trackingNumber.String
    }

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("failed to scan shipment: %w", err)
	}

	itemRows, err := db.Query("SELECT product_id, quantity FROM shipment_items WHERE shipment_id = ?", shipmentID)
	if err != nil {
		return nil, fmt.Errorf("failed to query shipment items for shipment %s: %w", shipmentID, err)
	}
	defer itemRows.Close()

	items := []ShipmentItem{}
	for itemRows.Next() {
		item := ShipmentItem{}
		if err := itemRows.Scan(&item.ProductID, &item.Quantity); err != nil {
			return nil, fmt.Errorf("failed to scan shipment item: %w", err)
		}
		items = append(items, item)
	}
	if err = itemRows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error for shipment items: %w", err)
	}
	shipment.Items = items

	return shipment, nil
}

// UpdateShipmentStatus updates the status of an existing shipment.
// It can also update the tracking number if provided.
func UpdateShipmentStatus(shipmentID string, status ShipmentStatus, trackingNumber *string) error {
	now := time.Now()
	var res sql.Result
	var err error

	if trackingNumber != nil {
		res, err = db.Exec("UPDATE shipments SET status = ?, tracking_number = ?, updated_at = ? WHERE id = ?",
			status, *trackingNumber, now, shipmentID)
	} else {
		res, err = db.Exec("UPDATE shipments SET status = ?, updated_at = ? WHERE id = ?",
			status, now, shipmentID)
	}

	if err != nil {
		return fmt.Errorf("failed to update shipment %s status to %s: %w", shipmentID, status, err)
	}
	rowsAffected, err := res.RowsAffected()
	if err != nil {
		log.Printf("Failed to get rows affected for shipment status update %s: %v", shipmentID, err)
	}
	if rowsAffected == 0 {
		return fmt.Errorf("shipment with ID %s not found for status update", shipmentID)
	}
	log.Printf("Shipment %s status updated to %s", shipmentID, status)
	return nil
}
