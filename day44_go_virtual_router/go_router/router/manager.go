package router

import (
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/google/uuid" // For connection IDs
)

// ConnectionInfo defines the structure for a connection between two routers
type ConnectionInfo struct {
	ID        string `json:"id"`
	Router1ID string `json:"router1Id"`
	Router2ID string `json:"router2Id"`
	// Interface1 string `json:"interface1,omitempty"` // Optional: specific interface on Router1
	// Interface2 string `json:"interface2,omitempty"` // Optional: specific interface on Router2
	CreatedAt time.Time `json:"createdAt"`
}

// RouterManager は複数の仮想ルーターを管理します。
type RouterManager struct {
	routers          map[string]*Router          // Key: Router ID
	connections      map[string]ConnectionInfo   // Key: Connection ID
	mutex            sync.RWMutex                // Protects routers map
	connMutex        sync.RWMutex                // Protects connections map
	BroadcastOutChan chan map[string]interface{} // Channel to send messages for WebSocket broadcast
	routerCounter    int                         // For generating default IDs and IPs
	// TODO: ルーター間接続の情報 (どのルーターのどのインターフェースが、どの他のルーターに接続しているか)
	// connections map[string]string // 例: key "router1-tun0" value "router2-tun0"
}

func NewRouterManager(broadcastChan chan map[string]interface{}) *RouterManager {
	return &RouterManager{
		routers:          make(map[string]*Router),
		connections:      make(map[string]ConnectionInfo),
		BroadcastOutChan: broadcastChan,
		routerCounter:    0, // Initialize counter
		// connections: make(map[string]string),
	}
}

// AddConnection creates a new connection between two routers
func (m *RouterManager) AddConnection(router1ID string, router2ID string) (ConnectionInfo, error) {
	m.mutex.RLock() // Lock router map for reading
	_, r1Exists := m.routers[router1ID]
	_, r2Exists := m.routers[router2ID]
	m.mutex.RUnlock()

	if !r1Exists {
		return ConnectionInfo{}, fmt.Errorf("router with ID %s not found", router1ID)
	}
	if !r2Exists {
		return ConnectionInfo{}, fmt.Errorf("router with ID %s not found", router2ID)
	}

	if router1ID == router2ID {
		return ConnectionInfo{}, fmt.Errorf("cannot connect a router to itself")
	}

	// Check for existing connection (simple check, could be more sophisticated)
	m.connMutex.RLock()
	for _, conn := range m.connections {
		if (conn.Router1ID == router1ID && conn.Router2ID == router2ID) || (conn.Router1ID == router2ID && conn.Router2ID == router1ID) {
			m.connMutex.RUnlock()
			return ConnectionInfo{}, fmt.Errorf("connection between %s and %s already exists", router1ID, router2ID)
		}
	}
	m.connMutex.RUnlock()

	// Get router instances to call AddPeer
	m.mutex.RLock()
	r1, r1Exists := m.routers[router1ID]
	r2, r2Exists := m.routers[router2ID]
	m.mutex.RUnlock()

	// This check should ideally be redundant due to earlier checks, but good for safety
	if !r1Exists || !r2Exists {
		return ConnectionInfo{}, fmt.Errorf("one or both routers not found after initial check (concurrent modification?)")
	}
	if r1.TunDevice == nil || r2.TunDevice == nil {
		return ConnectionInfo{}, fmt.Errorf("one or both routers do not have a TUN device initialized")
	}

	// Notify each router about the other peer
	r1.AddPeer(r2.ID, r2.TunDevice.GetIP())
	r2.AddPeer(r1.ID, r1.TunDevice.GetIP())

	connID := uuid.New().String()
	newConn := ConnectionInfo{
		ID:        connID,
		Router1ID: router1ID,
		Router2ID: router2ID,
		CreatedAt: time.Now(),
	}

	m.connMutex.Lock()
	m.connections[connID] = newConn
	m.connMutex.Unlock()

	log.Printf("RouterManager: Added connection %s between %s and %s", connID, router1ID, router2ID)

	// Broadcast connection creation event
	m.BroadcastOutChan <- map[string]interface{}{
		"event":      "CONNECTION_CREATED",
		"connection": newConn,
	}

	return newConn, nil
}

// RemoveConnection removes an existing connection
func (m *RouterManager) RemoveConnection(connectionID string) error {
	m.connMutex.Lock()
	conn, exists := m.connections[connectionID]
	if !exists {
		m.connMutex.Unlock()
		return fmt.Errorf("connection with ID %s not found", connectionID)
	}
	delete(m.connections, connectionID)
	m.connMutex.Unlock()

	log.Printf("RouterManager: Removed connection %s between %s and %s", conn.ID, conn.Router1ID, conn.Router2ID)

	// Broadcast connection deletion event
	m.BroadcastOutChan <- map[string]interface{}{
		"event":        "CONNECTION_DELETED",
		"connectionId": connectionID,
	}
	return nil
}

// GetConnections returns all current connections
func (m *RouterManager) GetConnections() []ConnectionInfo {
	m.connMutex.RLock()
	defer m.connMutex.RUnlock()
	list := make([]ConnectionInfo, 0, len(m.connections))
	for _, conn := range m.connections {
		list = append(list, conn)
	}
	return list
}

// CreateAndStartRouter は新しいルーターを作成し、設定して起動します。
func (m *RouterManager) CreateAndStartRouter(id string, tunName string, ipCIDR string, mtu int) (*Router, error) {
	m.mutex.Lock() // Lock for routerCounter and routers map modification

	m.routerCounter++ // Increment counter for every attempt to create a router, ensuring uniqueness for defaults
	actualID := id
	if actualID == "" {
		actualID = fmt.Sprintf("router%d", m.routerCounter)
	}

	if _, exists := m.routers[actualID]; exists {
		m.mutex.Unlock()
		// Decrement counter if it was incremented for an ID that we didn't use due to conflict.
		// This helps keep the counter more aligned with actual number of routers if many conflicts happen.
		// However, simple erroring out and keeping counter incremented is also fine.
		// For now, let's not decrement to keep it simple. The next default ID will just be higher.
		return nil, fmt.Errorf("router with ID %s already exists", actualID)
	}

	actualTunName := tunName
	if actualTunName == "" {
		// Let the OS pick the TUN device name by passing an empty string to NewTUNDevice
		actualTunName = ""
		log.Printf("RouterManager: tunName was empty for router %s, will let OS assign TUN name", actualID)
	}

	actualIpCIDR := ipCIDR
	if actualIpCIDR == "" {
		actualIpCIDR = fmt.Sprintf("10.0.%d.1/24", m.routerCounter) // Use unique subnet based on counter
		log.Printf("RouterManager: ipCIDR was empty for router %s, defaulted to %s", actualID, actualIpCIDR)
	}

	config := RouterConfig{
		TunInterfaceName: actualTunName,
		TunIPAddress:     actualIpCIDR,
		// MTU is handled by NewRouter/NewTUNDevice if 0
	}

	r, err := NewRouter(actualID, config, m)
	if err != nil {
		m.mutex.Unlock()
		return nil, fmt.Errorf("failed to create router instance %s: %w", actualID, err)
	}

	m.routers[actualID] = r
	m.mutex.Unlock() // Unlock before starting router

	if err := r.Start(); err != nil {
		m.mutex.Lock()
		delete(m.routers, actualID)
		m.mutex.Unlock()
		if r.TunDevice != nil {
			r.TunDevice.Close()
		}
		return nil, fmt.Errorf("failed to start router %s: %w", actualID, err)
	}

	log.Printf("RouterManager: Router %s (TUN: %s, IP: %s) created and started.", actualID, r.TunDevice.GetName(), r.TunDevice.GetIP().String())

	m.BroadcastOutChan <- map[string]interface{}{
		"event":    "ROUTER_CREATED",
		"routerId": actualID,
		"tunName":  r.TunDevice.GetName(),
		"ip":       r.TunDevice.GetIP().String(),
	}

	go func(router *Router) {
		for {
			select {
			case <-router.shutdown:
				log.Printf("RouterManager: Stopping routing table update listener for router %s", router.ID)
				return
			case table, ok := <-router.RoutingTableUpdateChan:
				if !ok {
					log.Printf("RouterManager: RoutingTableUpdateChan closed for router %s", router.ID)
					return
				}
				log.Printf("RouterManager: Received routing table update from router %s (%d entries)", router.ID, len(table))
				m.BroadcastOutChan <- map[string]interface{}{
					"event":    "ROUTING_TABLE_UPDATED",
					"routerId": router.ID,
					"table":    table,
				}
			}
		}
	}(r)

	return r, nil
}

// StopAndRemoveRouter は指定されたIDのルーターを停止し、管理下から削除します。
func (m *RouterManager) StopAndRemoveRouter(id string) error {
	m.mutex.Lock()
	// Defer unlock can be problematic if Stop() itself deadlocks or takes too long.
	// Let's manage unlock manually.

	r, exists := m.routers[id]
	if !exists {
		m.mutex.Unlock()
		return fmt.Errorf("router with ID %s not found", id)
	}

	delete(m.routers, id) // Remove from map first
	m.mutex.Unlock()      // Unlock before calling Stop()

	r.Stop() // This will close the router's shutdown channel, stopping its goroutines including RoutingTableUpdateChan listener feed
	log.Printf("RouterManager: Router %s stopped and removed.", id)

	// Broadcast router deletion event
	m.BroadcastOutChan <- map[string]interface{}{
		"event":    "ROUTER_DELETED",
		"routerId": id,
	}
	return nil
}

// GetRouter は指定されたIDのルーターインスタンスを取得します。
func (m *RouterManager) GetRouter(id string) (*Router, bool) {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	r, exists := m.routers[id]
	return r, exists
}

// GetAllRoutersInfo は管理下のすべてのルーターのリストを返します。
// This now returns a slice of a simple struct for API safety, not direct *Router pointers.
type RouterInfo struct {
	ID        string `json:"id"`
	TunName   string `json:"tunName"`
	IPAddress string `json:"ip"`
	NumRoutes int    `json:"numRoutes"`
	// Potentially add neighbors or other brief status here
}

func (m *RouterManager) GetAllRoutersInfo() []RouterInfo {
	m.mutex.RLock()
	defer m.mutex.RUnlock()
	list := make([]RouterInfo, 0, len(m.routers))
	for _, r := range m.routers {
		info := RouterInfo{
			ID:        r.ID,
			TunName:   r.TunDevice.GetName(),
			IPAddress: r.TunDevice.GetIP().String(),
			NumRoutes: len(r.GetRoutingTable()), // Access routing table via method
		}
		list = append(list, info)
	}
	return list
}

// RelayPacket attempts to relay a packet to a target router identified by its nextHopIP.
// The packet is written to the target router's TUN device as if it arrived from the network.
func (m *RouterManager) RelayPacket(sourceRouterID string, nextHopIP net.IP, packet []byte) bool {
	m.mutex.RLock()
	var targetRouter *Router
	var targetRouterID string

	// Find the router whose TUN device IP matches the nextHopIP
	for id, r := range m.routers {
		if r.TunDevice != nil && r.TunDevice.GetIP() != nil && r.TunDevice.GetIP().Equal(nextHopIP) {
			targetRouter = r
			targetRouterID = id
			break
		}
	}
	m.mutex.RUnlock()

	if targetRouter != nil {
		// Prevent relaying to self, though routing logic should prevent this.
		if sourceRouterID == targetRouterID {
			log.Printf("RouterManager: Attempted to relay packet from %s to itself (%s). Dropping.", sourceRouterID, targetRouterID)
			return false
		}

		log.Printf("RouterManager: Relaying packet from %s to router %s (NextHop IP: %s) %d bytes, via its TUN %s",
			sourceRouterID, targetRouterID, nextHopIP, len(packet), targetRouter.TunDevice.GetName())

		// Write the packet to the target router's TUN device.
		// This simulates the packet arriving on that TUN from the network.
		// _, err := targetRouter.TunDevice.WritePacket(packet)
		// if err != nil {
		// 	log.Printf("RouterManager: Error writing packet to TUN %s of router %s: %v", targetRouter.TunDevice.GetName(), targetRouterID, err)
		// 	return false
		// }
		// log.Printf("RouterManager: Packet successfully relayed to TUN %s of router %s.", targetRouter.TunDevice.GetName(), targetRouterID)
		targetRouter.InjectPacket(packet, sourceRouterID) // Inject the packet directly
		return true
	} else {
		log.Printf("RouterManager: No router found with TUN IP %s to relay packet from %s. Packet dropped.", nextHopIP, sourceRouterID)
		return false
	}
}

// ForwardPacketToRouter は、あるルーターから別のルーターへパケットを「中継」します。
// これはシミュレーションであり、実際にはルーター間の物理的または仮想的なリンクを介して行われます。
// sourceRouterID: 送信元ルーターのID (ログ用)
// targetInterfaceIP: 宛先ルーターのインターフェースIPアドレス (このIPを持つルーターを探す)
// packet: 転送するIPパケット
// returns: true if packet was successfully queued to the target router, false otherwise
func (m *RouterManager) ForwardPacketToRouter(sourceRouterID string, targetInterfaceIP net.IP, packet []byte) bool {
	m.mutex.RLock()
	var targetRouter *Router
	for _, r := range m.routers {
		// Ensure TunDevice and its IP are not nil before comparing
		if r.TunDevice != nil && r.TunDevice.GetIP() != nil && r.TunDevice.GetIP().Equal(targetInterfaceIP) {
			targetRouter = r
			break
		}
	}
	m.mutex.RUnlock()

	if targetRouter != nil {
		// targetRouter.TunDevice.WritePacket(packet) // This is one way if direct L2 link assumed
		// A better way for internal simulation is to feed it to the router's input processing.
		// Let's assume Router has an input channel for packets not coming from its own TUN.
		// For now, we will use the existing TunDevice.WritePacket as if Manager is acting as L2 switch.
		// This implies the packet's L2 destination is already set for targetRouter's TUN.
		// This part of the simulation is simplified.
		// A more robust way: have an input channel on Router struct for packets from manager
		// For now, we need to ensure the packet is correctly processed by the target router.
		// If targetRouter.processIncomingPacket is used, it needs to be thread-safe
		// and it expects raw packet as read from *its* TUN.
		// The simplest for now is writing to its TUN, as if it arrived over the network.
		// This is problematic if source and target are same router.

		log.Printf("RouterManager: Forwarding packet from %s to router %s (IP: %s) %d bytes via its TUN device %s", sourceRouterID, targetRouter.ID, targetInterfaceIP, len(packet), targetRouter.TunDevice.GetName())

		// Simulating packet arrival on targetRouter's TUN device
		// This bypasses targetRouter's ReadPacket() loop and directly calls its processing.
		// To make this cleaner, Router could have a dedicated method like `InjectPacket(packet []byte)`
		// which then calls `processIncomingPacket`.
		// For now, writing to its TUN is the closest simulation without adding such a method.
		// However, this assumes the manager is on the same "L2" as all TUNs.
		// And it assumes `packet` is a full L2 frame ready for that TUN (which it might not be).

		// The packet coming from another router's TUN (via processIncomingPacket -> forwardPacket -> Manager)
		// is already an IP packet. The target router's `processIncomingPacket` expects this.
		// So, we are essentially simulating an L2 fabric that delivers the IP packet to the target's TUN.

		// Let's assume the Router's packet processing can handle packets as if read from its TUN.
		// This still needs a way to inject the packet. The current router.go doesn't have
		// a direct `packetInputCh` that manager.go assumed previously.
		// The TUNDevice has `packetCh` which is for packets *read* by `readLoop`.
		// We should not write to that.

		// Let's stick to the `router.TunDevice.WritePacket` for simulation, assuming the packet
		// is correctly addressed at L2 (which is an abstraction here) for the target TUN.
		// This is only if `sourceRouterID != targetRouter.ID`.
		if sourceRouterID == targetRouter.ID {
			log.Printf("RouterManager: Dropping packet from %s to itself (%s). Loop detected or misconfiguration.", sourceRouterID, targetRouter.ID)
			return false
		}

		_, err := targetRouter.TunDevice.WritePacket(packet)
		if err != nil {
			log.Printf("RouterManager: Error writing packet to TUN %s of router %s: %v", targetRouter.TunDevice.GetName(), targetRouter.ID, err)
			return false
		}
		log.Printf("RouterManager: Packet successfully written to TUN %s of router %s.", targetRouter.TunDevice.GetName(), targetRouter.ID)
		return true

	} else {
		log.Printf("RouterManager: No router found with interface IP %s to forward packet from %s. Packet dropped.", targetInterfaceIP, sourceRouterID)
		return false
	}
}

// TODO: ルーター間接続の管理 (AddConnection, RemoveConnection)
// これにより、どのルーターがどのルーターに「隣接」しているかを定義し、
// OSPF風プロトコルがHelloパケットの送信先を決定したり、LSUのフラッディングパスを制御したりするのに役立つ。
// 簡単な実装としては、Managerが接続情報を持ち、各ルーターに「このIPアドレスを持つルーターにパケットを送りたい場合はManager経由で」と教える。
