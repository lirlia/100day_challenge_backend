run:
	go run cmd/inventory_service/main.go &
	go run cmd/shipping_service/main.go &
	go run cmd/order_service/main.go &

stop:
	ps aux | egrep '(order|shipping|inventory)_service' | awk '{print $$2}' | xargs kill -9