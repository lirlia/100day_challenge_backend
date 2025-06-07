package inventory

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/database"
	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event" // For OrderItem
)

const InventoryDBPath = "./db/inventory.db"

const schemaCreationQuery = `
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stock_quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    updated_at DATETIME NOT NULL
);
`

var db *sql.DB

// InitInventoryDB initializes the database for the inventory service.
func InitInventoryDB() error {
	var err error
	db, err = database.InitDB(InventoryDBPath, schemaCreationQuery)
	if err != nil {
		return fmt.Errorf("failed to initialize inventory database: %w", err)
	}
	// Add initial products for testing
	SeedInitialProducts()
	return nil
}

// SeedInitialProducts adds some sample products to the database if they don't exist.
// This is useful for testing purposes.
func SeedInitialProducts() {
	products := []Product{
		{ID: "keyboard", Name: "キーボード", StockQuantity: 10, ReservedQuantity: 0, UpdatedAt: time.Now()},
		{ID: "mouse", Name: "マウス", StockQuantity: 5, ReservedQuantity: 0, UpdatedAt: time.Now()},
		{ID: "monitor", Name: "モニター", StockQuantity: 3, ReservedQuantity: 0, UpdatedAt: time.Now()},
		{ID: "headset", Name: "ヘッドセット", StockQuantity: 7, ReservedQuantity: 0, UpdatedAt: time.Now()},
		// 互換性のため、古い商品IDも保持
		{ID: "prod001", Name: "Super Keyboard", StockQuantity: 10, ReservedQuantity: 0, UpdatedAt: time.Now()},
		{ID: "prod002", Name: "Ergonomic Mouse", StockQuantity: 5, ReservedQuantity: 0, UpdatedAt: time.Now()},
		{ID: "prod003", Name: "4K Monitor", StockQuantity: 3, ReservedQuantity: 0, UpdatedAt: time.Now()},
	}

	for _, p := range products {
		var existingId string
		err := db.QueryRow("SELECT id FROM products WHERE id = ?", p.ID).Scan(&existingId)
		if err != nil && err != sql.ErrNoRows {
			log.Printf("Error checking if product %s exists: %v", p.ID, err)
			continue
		}
		if err == sql.ErrNoRows {
			_, err := db.Exec("INSERT INTO products (id, name, stock_quantity, reserved_quantity, updated_at) VALUES (?, ?, ?, ?, ?)",
				p.ID, p.Name, p.StockQuantity, p.ReservedQuantity, p.UpdatedAt)
			if err != nil {
				log.Printf("Error seeding product %s: %v", p.ID, err)
			} else {
				log.Printf("Seeded product: %s", p.Name)
			}
		}
	}
}

// GetProductByID retrieves a product by its ID.
func GetProductByID(productID string) (*Product, error) {
	row := db.QueryRow("SELECT id, name, stock_quantity, reserved_quantity, updated_at FROM products WHERE id = ?", productID)
	product := &Product{}
	err := row.Scan(&product.ID, &product.Name, &product.StockQuantity, &product.ReservedQuantity, &product.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("failed to scan product %s: %w", productID, err)
	}
	return product, nil
}

// AttemptReservation tries to reserve stock for a list of items.
// It returns the list of successfully reserved items, failed items, and an overall success status.
// This function handles the core logic of checking and reserving stock in a transaction.
func AttemptReservation(orderID string, itemsToReserve []event.OrderItem) (reservedItems []event.OrderItem, failedItems []event.FailedItemDetail, allSucceeded bool, err error) {
	tx, err := db.Begin()
	if err != nil {
		return nil, nil, false, fmt.Errorf("failed to begin transaction for order %s: %w", orderID, err)
	}
	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p) // re-throw panic after Rollback
		} else if err != nil {
			tx.Rollback() // err is non-nil; don't change it
		} else {
			err = tx.Commit() // err is nil; if Commit returns error update err
		}
	}()

	allSucceeded = true
	for _, item := range itemsToReserve {
		var currentStock, currentReserved int
		row := tx.QueryRow("SELECT stock_quantity, reserved_quantity FROM products WHERE id = ?", item.ProductID)
		err = row.Scan(&currentStock, &currentReserved)
		if err != nil {
			if err == sql.ErrNoRows {
				failedItems = append(failedItems, event.FailedItemDetail{ProductID: item.ProductID, RequestedQuantity: item.Quantity, AvailableQuantity: 0})
				allSucceeded = false
				log.Printf("Product %s not found for order %s", item.ProductID, orderID)
				continue // continue to process other items, this one failed
			}
			return nil, nil, false, fmt.Errorf("failed to get stock for product %s for order %s: %w", item.ProductID, orderID, err)
		}

		availableToReserve := currentStock - currentReserved
		if item.Quantity > availableToReserve {
			failedItems = append(failedItems, event.FailedItemDetail{ProductID: item.ProductID, RequestedQuantity: item.Quantity, AvailableQuantity: availableToReserve})
			allSucceeded = false
			log.Printf("Insufficient stock for product %s (requested: %d, available: %d) for order %s", item.ProductID, item.Quantity, availableToReserve, orderID)
			continue
		}

		// Reserve stock
		newReservedQuantity := currentReserved + item.Quantity
		_, err = tx.Exec("UPDATE products SET reserved_quantity = ?, updated_at = ? WHERE id = ?", newReservedQuantity, time.Now(), item.ProductID)
		if err != nil {
			return nil, nil, false, fmt.Errorf("failed to update reserved stock for product %s for order %s: %w", item.ProductID, orderID, err)
		}
		reservedItems = append(reservedItems, event.OrderItem{ProductID: item.ProductID, Quantity: item.Quantity}) // Price not relevant here
		log.Printf("Successfully reserved %d of product %s for order %s", item.Quantity, item.ProductID, orderID)
	}

	return reservedItems, failedItems, allSucceeded, nil
}

// ReleaseStock releases previously reserved stock for a list of items (e.g., due to shipment failure).
// This is a compensating transaction.
func ReleaseStock(orderID string, itemsToRelease []event.OrderItem) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction for releasing stock for order %s: %w", orderID, err)
	}
	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		} else if err != nil {
			tx.Rollback()
		} else {
			err = tx.Commit()
		}
	}()

	for _, item := range itemsToRelease {
		var currentReserved int
		row := tx.QueryRow("SELECT reserved_quantity FROM products WHERE id = ?", item.ProductID)
		err = row.Scan(&currentReserved)
		if err != nil {
			log.Printf("Error getting reserved quantity for product %s (order %s) during stock release: %v. Skipping.", item.ProductID, orderID, err)
			// Potentially problematic if product disappears, but we try to proceed
			continue
		}

		newReservedQuantity := currentReserved - item.Quantity
		if newReservedQuantity < 0 {
			log.Printf("Warning: Attempting to release %d of product %s for order %s, but only %d reserved. Setting reserved to 0.", item.Quantity, item.ProductID, orderID, currentReserved)
			newReservedQuantity = 0
		}

		_, err = tx.Exec("UPDATE products SET reserved_quantity = ?, updated_at = ? WHERE id = ?", newReservedQuantity, time.Now(), item.ProductID)
		if err != nil {
			// Don't return immediately, try to release other items
			log.Printf("Failed to release stock for product %s (order %s): %v. Continuing with other items.", item.ProductID, orderID, err)
			// Collect errors if needed, for now just log
		} else {
			log.Printf("Successfully released %d of product %s for order %s", item.Quantity, item.ProductID, orderID)
		}
	}
	return err // Will be nil if commit was successful and no other error was set
}

// ConfirmStockDeduction actually deducts the stock (reduces stock_quantity and reserved_quantity).
// This should be called when the shipment is confirmed or some similar event occurs.
// For this example, we might not use it if shipment directly triggers order completion.
// However, it's a more complete inventory flow.
func ConfirmStockDeduction(orderID string, itemsToDeduct []event.OrderItem) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("failed to begin transaction for stock deduction for order %s: %w", orderID, err)
	}
	defer func() {
		if p := recover(); p != nil {
			tx.Rollback()
			panic(p)
		} else if err != nil {
			tx.Rollback()
		} else {
			err = tx.Commit()
		}
	}()

	for _, item := range itemsToDeduct {
		var currentStock, currentReserved int
		row := tx.QueryRow("SELECT stock_quantity, reserved_quantity FROM products WHERE id = ?", item.ProductID)
		err = row.Scan(&currentStock, &currentReserved)
		if err != nil {
			log.Printf("Error getting stock/reserved for product %s (order %s) during deduction: %v. Skipping.", item.ProductID, orderID, err)
			continue
		}

		// Ensure we don't go negative, though reserved should cover it
		newStockQuantity := currentStock - item.Quantity
		newReservedQuantity := currentReserved - item.Quantity
		if newStockQuantity < 0 {
			newStockQuantity = 0
		}
		if newReservedQuantity < 0 {
			newReservedQuantity = 0
		}

		_, err = tx.Exec("UPDATE products SET stock_quantity = ?, reserved_quantity = ?, updated_at = ? WHERE id = ?",
			newStockQuantity, newReservedQuantity, time.Now(), item.ProductID)
		if err != nil {
			log.Printf("Failed to deduct stock for product %s (order %s): %v. Continuing.", item.ProductID, orderID, err)
		} else {
			log.Printf("Successfully deducted %d of product %s (stock: %d, reserved: %d) for order %s",
				item.Quantity, item.ProductID, newStockQuantity, newReservedQuantity, orderID)
		}
	}
	return err
}
