package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/lirlia/100day_challenge_backend/day44_go_virtual_router/go_router/router"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for simplicity
	},
}

// global router manager instance
var manager *router.RouterManager

// WebSocket client management
var (
	clients   = make(map[*websocket.Conn]bool)
	clientsMu sync.Mutex
	// broadcast channel is now part of RouterManager, this can be removed or repurposed if needed
	// broadcast = make(chan []byte) // Channel for broadcasting messages to clients
)

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer conn.Close()

	clientsMu.Lock()
	clients[conn] = true
	clientsMu.Unlock()
	log.Println("WebSocket client connected. Total clients:", len(clients))

	defer func() {
		clientsMu.Lock()
		delete(clients, conn)
		clientsMu.Unlock()
		log.Println("WebSocket client disconnected. Total clients:", len(clients))
	}()

	// Send initial data or welcome message if needed
	// conn.WriteMessage(websocket.TextMessage, []byte("Welcome to Go Virtual Router WebSocket API"))

	for {
		messageType, p, err := conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket read error: %v", err)
			}
			break
		}
		log.Printf("Received WebSocket message type %d: %s\n", messageType, p)

		// Handle incoming messages from client (e.g., requests for data)
		// For now, just echo back
		if err := conn.WriteMessage(messageType, append([]byte("Echo: "), p...)); err != nil {
			log.Println("WebSocket write error:", err)
			break
		}
	}
}

func handleBroadcastMessages(broadcastInChan <-chan map[string]interface{}) {
	for {
		msgMap := <-broadcastInChan           // Receive map from RouterManager
		msgBytes, err := json.Marshal(msgMap) // Marshal to JSON bytes
		if err != nil {
			log.Printf("Error marshaling broadcast message: %v. Message: %+v", err, msgMap)
			continue
		}

		clientsMu.Lock()
		for client := range clients {
			if err := client.WriteMessage(websocket.TextMessage, msgBytes); err != nil {
				log.Printf("Broadcast error to client %s: %v", client.RemoteAddr(), err)
				// Optionally remove unresponsive client
				// client.Close()
				// delete(clients, client)
			}
		}
		clientsMu.Unlock()
	}
}

type CreateRouterRequest struct {
	ID      string `json:"id"`
	TunName string `json:"tunName"` // e.g., "tun0"
	IpCIDR  string `json:"ipCIDR"`  // e.g., "10.0.1.1/24"
	Mtu     int    `json:"mtu"`
}

func handleRoutersAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodGet:
		infos := manager.GetAllRoutersInfo() // Use new method from manager
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(infos)

	case http.MethodPost:
		var req CreateRouterRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
			return
		}
		// if req.ID == "" || req.IpCIDR == "" { // バリデーションを削除またはコメントアウト
		// 	http.Error(w, "Router ID and IpCIDR are required", http.StatusBadRequest)
		// 	return
		// }

		createdRouter, err := manager.CreateAndStartRouter(req.ID, req.TunName, req.IpCIDR, req.Mtu)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create router: %v", err), http.StatusInternalServerError)
			return
		}
		log.Printf("API: Router %s created successfully", createdRouter.ID)
		// Notify WebSocket clients (example) - This is now handled by RouterManager
		// broadcastMsg, _ := json.Marshal(map[string]string{"event": "ROUTER_CREATED", "routerId": createdRouter.ID})
		// broadcast <- broadcastMsg

		// For the response, use the simpler RouterInfo struct for consistency
		createdRouterInfo := router.RouterInfo{
			ID:        createdRouter.ID,
			TunName:   createdRouter.TunDevice.GetName(),
			IPAddress: createdRouter.TunDevice.GetIP().String(),
			NumRoutes: len(createdRouter.GetRoutingTable()),
		}
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(createdRouterInfo)

	default:
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
	}
}

func handleSpecificRouterAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	// Path: /api/routers/{routerId}
	routerId := r.URL.Path[len("/api/routers/"):]
	if routerId == "" {
		http.Error(w, "Router ID is missing in path", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		err := manager.StopAndRemoveRouter(routerId)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete router %s: %v", routerId, err), http.StatusInternalServerError)
			return
		}
		log.Printf("API: Router %s deleted successfully", routerId)
		// Notify WebSocket clients (example) - This is now handled by RouterManager
		// broadcastMsg, _ := json.Marshal(map[string]string{"event": "ROUTER_DELETED", "routerId": routerId})
		// broadcast <- broadcastMsg
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "Router %s deleted successfully", routerId)

	case http.MethodPut:
		// TODO: Implement router configuration update
		var reqBody map[string]interface{} // Define a proper struct for update request
		if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
			return
		}
		log.Printf("API: Received PUT request for router %s with body: %+v", routerId, reqBody)
		// _, exists := manager.GetRouter(routerId)
		// if !exists {
		// 	http.Error(w, fmt.Sprintf("Router with ID %s not found", routerId), http.StatusNotFound)
		// 	return
		// }
		// Actual update logic in manager or router itself would go here.
		// manager.UpdateRouterConfig(routerId, reqBody) ...

		w.WriteHeader(http.StatusNotImplemented) // Or http.StatusOK if partially implemented
		json.NewEncoder(w).Encode(map[string]string{"message": "Router configuration update not yet fully implemented.", "routerId": routerId})

	default:
		http.Error(w, "Method not allowed for specific router", http.StatusMethodNotAllowed)
	}
}

// handleConnectionsAPI handles requests for managing router connections
type CreateConnectionRequest struct {
	Router1ID string `json:"router1Id"`
	Router2ID string `json:"router2Id"`
}

func handleConnectionsAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch r.Method {
	case http.MethodGet:
		connections := manager.GetConnections()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(connections)

	case http.MethodPost:
		var req CreateConnectionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
			return
		}
		if req.Router1ID == "" || req.Router2ID == "" {
			http.Error(w, "Router1ID and Router2ID are required", http.StatusBadRequest)
			return
		}

		createdConn, err := manager.AddConnection(req.Router1ID, req.Router2ID)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to create connection: %v", err), http.StatusInternalServerError)
			return
		}
		log.Printf("API: Connection %s created successfully between %s and %s", createdConn.ID, createdConn.Router1ID, createdConn.Router2ID)
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(createdConn)

	default:
		http.Error(w, "Method not allowed for connections", http.StatusMethodNotAllowed)
	}
}

func handleSpecificConnectionAPI(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

	if r.Method == http.MethodOptions {
		w.WriteHeader(http.StatusOK)
		return
	}

	connectionId := r.URL.Path[len("/api/connections/"):]
	if connectionId == "" {
		http.Error(w, "Connection ID is missing in path", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodDelete:
		err := manager.RemoveConnection(connectionId)
		if err != nil {
			http.Error(w, fmt.Sprintf("Failed to delete connection %s: %v", connectionId, err), http.StatusInternalServerError)
			return
		}
		log.Printf("API: Connection %s deleted successfully", connectionId)
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "Connection %s deleted successfully", connectionId)
	default:
		http.Error(w, "Method not allowed for specific connection", http.StatusMethodNotAllowed)
	}
}

func main() {
	// Create the broadcast channel that RouterManager will use
	managerBroadcastChan := make(chan map[string]interface{}, 100) // Buffered channel
	manager = router.NewRouterManager(managerBroadcastChan)

	// ★ 起動時にルータ2台を自動生成し接続
	r1, err := manager.CreateAndStartRouter("router1", "utun10", "10.0.1.1/24", 1500)
	if err != nil {
		log.Fatal("Failed to create router1: ", err)
	}
	r2, err := manager.CreateAndStartRouter("router2", "utun11", "10.0.2.1/24", 1500)
	if err != nil {
		log.Fatal("Failed to create router2: ", err)
	}
	_, err = manager.AddConnection(r1.ID, r2.ID)
	if err != nil {
		log.Fatal("Failed to connect router1 and router2: ", err)
	}

	// Start broadcast handler for WebSockets, passing the manager's output channel
	go handleBroadcastMessages(managerBroadcastChan)

	http.HandleFunc("/ws", handleWebSocket)
	http.HandleFunc("/api/routers", handleRoutersAPI)
	http.HandleFunc("/api/routers/", handleSpecificRouterAPI) // Trailing slash to catch /api/routers/{id}
	http.HandleFunc("/api/connections", handleConnectionsAPI)
	http.HandleFunc("/api/connections/", handleSpecificConnectionAPI) // Trailing slash for /api/connections/{id}

	port := ":8080"
	log.Printf("Go virtual router server starting on port %s", port)
	if err := http.ListenAndServe(port, nil); err != nil {
		log.Fatal("ListenAndServe: ", err)
	}
}
