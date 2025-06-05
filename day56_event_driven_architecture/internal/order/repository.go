package order

import (
	"database/sql"
	"fmt"
	"log"
	"time"

	"github.com/google/uuid"
	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/database"
	"github.com/lirlia/100day_challenge_backend/day56_event_driven_architecture/internal/event"
)

const OrderDBPath = "./db/orders.db"

const schemaCreationQuery = `
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    total_amount INTEGER NOT NULL,
    status TEXT NOT NULL,
    created_at DATETIME NOT NULL,
    updated_at DATETIME NOT NULL
);

CREATE TABLE IF NOT EXISTS order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    price_at_purchase INTEGER NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id)
);
`

var db *sql.DB

// InitOrderDB initializes the database for the order service.
func InitOrderDB() error {
	var err error
	db, err = database.InitDB(OrderDBPath, schemaCreationQuery)
	if err != nil {
		return fmt.Errorf("failed to initialize order database: %w", err)
	}
	return nil
}

// CreateOrder creates a new order and its items in the database.
func CreateOrder(userID string, items []event.OrderItem, totalAmount int) (*Order, error) {
	orderID := uuid.New().String()
	now := time.Now()
	orderStatus := StatusPending

	tx, err := db.Begin()
	if err != nil {
		return nil, fmt.Errorf("failed to begin transaction: %w", err)
	}

	_, err = tx.Exec("INSERT INTO orders (id, user_id, total_amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
		orderID, userID, totalAmount, orderStatus, now, now)
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to insert order: %w", err)
	}

	stmt, err := tx.Prepare("INSERT INTO order_items (order_id, product_id, quantity, price_at_purchase) VALUES (?, ?, ?, ?)")
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to prepare order item statement: %w", err)
	}
	defer stmt.Close()

	createdOrderItems := make([]OrderItem, len(items))
	for i, item := range items {
		_, err = stmt.Exec(orderID, item.ProductID, item.Quantity, item.Price)
		if err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to insert order item %s: %w", item.ProductID, err)
		}
		// Note: DB auto-increment ID for order_items is not retrieved here for simplicity
		createdOrderItems[i] = OrderItem{
			OrderID:         orderID,
			ProductID:       item.ProductID,
			Quantity:        item.Quantity,
			PriceAtPurchase: item.Price,
		}
	}

	if err = tx.Commit(); err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	return &Order{
		ID:          orderID,
		UserID:      userID,
		Items:       createdOrderItems, // For the returned object, fill with created items
		TotalAmount: totalAmount,
		Status:      orderStatus,
		CreatedAt:   now,
		UpdatedAt:   now,
	}, nil
}

// GetOrderByID retrieves an order and its items by ID.
func GetOrderByID(orderID string) (*Order, error) {
	row := db.QueryRow("SELECT user_id, total_amount, status, created_at, updated_at FROM orders WHERE id = ?", orderID)

	order := &Order{ID: orderID}
	err := row.Scan(&order.UserID, &order.TotalAmount, &order.Status, &order.CreatedAt, &order.UpdatedAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Not found
		}
		return nil, fmt.Errorf("failed to scan order: %w", err)
	}

	rows, err := db.Query("SELECT id, product_id, quantity, price_at_purchase FROM order_items WHERE order_id = ?", orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to query order items: %w", err)
	}
	defer rows.Close()

	items := []OrderItem{}
	for rows.Next() {
		item := OrderItem{OrderID: orderID}
		if err := rows.Scan(&item.ID, &item.ProductID, &item.Quantity, &item.PriceAtPurchase); err != nil {
			return nil, fmt.Errorf("failed to scan order item: %w", err)
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error for order items: %w", err)
	}
	order.Items = items

	return order, nil
}

// UpdateOrderStatus updates the status of an existing order.
func UpdateOrderStatus(orderID string, status OrderStatus) error {
	now := time.Now()
	result, err := db.Exec("UPDATE orders SET status = ?, updated_at = ? WHERE id = ?", status, now, orderID)
	if err != nil {
		return fmt.Errorf("failed to update order status for order %s: %w", orderID, err)
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Failed to get rows affected for order status update %s: %v", orderID, err) // Log but don't fail hard
	}
	if rowsAffected == 0 {
		return fmt.Errorf("order with ID %s not found for status update", orderID)
	}
	log.Printf("Order %s status updated to %s", orderID, status)
	return nil
}

// GetAllOrders retrieves all orders from the database.
func GetAllOrders() ([]*Order, error) {
	rows, err := db.Query("SELECT id, user_id, total_amount, status, created_at, updated_at FROM orders ORDER BY created_at DESC")
	if err != nil {
		return nil, fmt.Errorf("failed to query orders: %w", err)
	}
	defer rows.Close()

	orders := []*Order{}
	for rows.Next() {
		order := &Order{}
		if err := rows.Scan(&order.ID, &order.UserID, &order.TotalAmount, &order.Status, &order.CreatedAt, &order.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan order: %w", err)
		}

		// Load order items
		items, err := getOrderItems(order.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to load items for order %s: %w", order.ID, err)
		}
		order.Items = items

		orders = append(orders, order)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error for orders: %w", err)
	}

	return orders, nil
}

// GetOrdersByUserID retrieves all orders for a specific user.
func GetOrdersByUserID(userID string) ([]*Order, error) {
	rows, err := db.Query("SELECT id, user_id, total_amount, status, created_at, updated_at FROM orders WHERE user_id = ? ORDER BY created_at DESC", userID)
	if err != nil {
		return nil, fmt.Errorf("failed to query orders for user %s: %w", userID, err)
	}
	defer rows.Close()

	orders := []*Order{}
	for rows.Next() {
		order := &Order{}
		if err := rows.Scan(&order.ID, &order.UserID, &order.TotalAmount, &order.Status, &order.CreatedAt, &order.UpdatedAt); err != nil {
			return nil, fmt.Errorf("failed to scan order: %w", err)
		}

		// Load order items
		items, err := getOrderItems(order.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to load items for order %s: %w", order.ID, err)
		}
		order.Items = items

		orders = append(orders, order)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error for orders: %w", err)
	}

	return orders, nil
}

// getOrderItems is a helper function to retrieve order items for a given order ID.
func getOrderItems(orderID string) ([]OrderItem, error) {
	rows, err := db.Query("SELECT id, product_id, quantity, price_at_purchase FROM order_items WHERE order_id = ?", orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to query order items: %w", err)
	}
	defer rows.Close()

	items := []OrderItem{}
	for rows.Next() {
		item := OrderItem{OrderID: orderID}
		if err := rows.Scan(&item.ID, &item.ProductID, &item.Quantity, &item.PriceAtPurchase); err != nil {
			return nil, fmt.Errorf("failed to scan order item: %w", err)
		}
		items = append(items, item)
	}
	if err = rows.Err(); err != nil {
		return nil, fmt.Errorf("row iteration error for order items: %w", err)
	}

	return items, nil
}
