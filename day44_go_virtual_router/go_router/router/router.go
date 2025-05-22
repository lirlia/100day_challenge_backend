package router

import (
	"bytes"
	"container/heap"
	"encoding/binary"
	"encoding/gob"
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

// NetworkDevice defines the interface for a network device like TUNDevice or a mock.
type NetworkDevice interface {
	ReadPacket() ([]byte, bool)
	WritePacket(packet []byte) (int, error)
	Close() error
	GetName() string      // Corresponds to TunDevice.Name
	GetIP() net.IP        // Corresponds to TunDevice.IP
	GetIPNet() *net.IPNet // To get the network for directly connected routes, derived from IP and Mask
}

const (
	MaxPacketSize       = 1500
	HelloInterval       = 5 * time.Second
	DeadInterval        = 20 * time.Second
	LSUInterval         = 15 * time.Second
	BroadcastIPv4Str    = "255.255.255.255"
	LinkStateHeaderSize = 20  // Simplified header size for LSU
	OSPFProtocolNumber  = 253 // Experimental protocol number
	ICMPProtocolNumber  = 1   // ICMP protocol number
	enableBroadcastHello = false // Added enableBroadcastHello flag
)

// IPv4Header represents an IPv4 packet header.
type IPv4Header struct {
	Version     byte
	IHL         byte // Internet Header Length in 32-bit words
	TOS         byte // Type of Service
	TotalLength uint16
	ID          uint16
	Flags       uint16 // 3 bits flags, 13 bits fragment offset
	FragOffset  uint16
	TTL         byte
	Protocol    byte
	Checksum    uint16
	SrcIP       net.IP
	DstIP       net.IP
	Options     []byte // Optional, if IHL > 5
}

// ICMPHeader represents an ICMP packet header.
// Make sure this is defined at the package level, similar to IPv4Header.
// Corrected placement for ICMPHeader definition.
type ICMPHeader struct {
	Type     uint8
	Code     uint8
	Checksum uint16
	ID       uint16
	Seq      uint16
	// Data []byte // Echo request/reply data, typically part of payload not fixed header
}

// PacketType defines the type of OSPF-like packet
type PacketType byte

const (
	PacketTypeHello PacketType = iota + 1
	PacketTypeLSU
)

// OSPFHeader represents the common header for our OSPF-like packets
type OSPFHeader struct {
	Type      PacketType
	RouterID  string
	Interface string // Sending interface name (tunX)
}

// HelloPacket defines the structure of a Hello packet
type HelloPacket struct {
	Header OSPFHeader
	// No specific payload for Hello in this simplified version
}

// LinkState represents a link in the network graph
type Link struct {
	NeighborRouterID string
	Cost             int
	Network          string // CIDR notation of the link/network
}

// LinkStateUpdate (LSU) packet structure
type LinkStateUpdate struct {
	Header         OSPFHeader // Includes OriginatorRouterID and sending Interface
	SequenceNumber int64
	TTL            int
	Links          []Link
	Timestamp      time.Time // For tie-breaking if sequence numbers are the same
}

// RoutingEntry defines an entry in the routing table
type RoutingEntry struct {
	Network         string // Destination network CIDR
	NextHop         string // Next hop IP address (for non-directly connected)
	NextHopRouterID string // Next hop Router ID (if known, for forwarding logic)
	Interface       string // Outgoing interface name
	Metric          int    // Cost to reach the destination
	LearnedFrom     string // "Direct", "OSPF"
	LastUpdated     time.Time
}

// Neighbor defines a neighboring router
type Neighbor struct {
	RouterID             string
	IPAddress            string // IP address of the neighbor
	TunInterface         string // Name of the neighbor's TUN interface that we are connected to
	LastHelloTime        time.Time
	AdjacencyEstablished bool
	// Potentially add LSU sequence numbers, state, etc.
}

// Router represents a virtual router instance
type Router struct {
	ID                     string
	TunDevice              *TUNDevice
	RoutingTable           map[string]*RoutingEntry    // Destination CIDR -> Entry
	Neighbors              map[string]*Neighbor        // Neighbor RouterID -> Neighbor Info
	LSUDB                  map[string]*LinkStateUpdate // OriginatingRouterID -> LSU
	shutdown               chan struct{}
	wg                     sync.WaitGroup
	config                 RouterConfig
	lastLSUGenerationTime  time.Time
	RoutingTableUpdateChan chan []RoutingEntry // Added channel

	// Mutexes for concurrent access
	rtMutex       sync.RWMutex
	neighborMutex sync.RWMutex
	lsudbMutex    sync.RWMutex
	peersMutex    sync.RWMutex // Mutex for ConnectedPeers
	ConnectedPeers map[string]net.IP // RouterID -> IP address of connected peer's TUN device

	manager *RouterManager // Reference to the RouterManager for relaying packets
}

// RouterConfig holds configuration for a router
type RouterConfig struct {
	TunInterfaceName string
	TunIPAddress     string // CIDR format, e.g., "10.0.1.1/24"
	// Add other params like AreaID if needed later
}

// NewRouter creates and initializes a new Router instance but does not start it.
func NewRouter(id string, config RouterConfig, mgr *RouterManager) (*Router, error) {
	// Parse TunIPAddress to get IP and Mask for TUNDevice and direct route
	// parsedIP, ipNet, err := net.ParseCIDR(config.TunIPAddress) // These are not directly used here, TunDevice init handles it.
	// if err != nil {
	// 	return nil, fmt.Errorf("failed to parse TunIPAddress CIDR %s for router %s: %w", config.TunIPAddress, id, err)
	// }

	// Pass the full CIDR string to NewTUNDevice
	tun, err := NewTUNDevice(config.TunInterfaceName, config.TunIPAddress, DefaultMTU) // MTU is hardcoded for now
	if err != nil {
		return nil, fmt.Errorf("failed to create TUNDevice for router %s: %w", id, err)
	}

	r := &Router{
		ID:                     id,
		TunDevice:              tun, // tun is already *TUNDevice
		RoutingTable:           make(map[string]*RoutingEntry),
		Neighbors:              make(map[string]*Neighbor),
		LSUDB:                  make(map[string]*LinkStateUpdate),
		shutdown:               make(chan struct{}),
		config:                 config,
		lastLSUGenerationTime:  time.Now(),
		RoutingTableUpdateChan: make(chan []RoutingEntry, 10), // Initialize channel
		ConnectedPeers:         make(map[string]net.IP),
		manager:                mgr, // Store the manager reference
	}
	// Use the Name field directly, and IP.String() for IP
	log.Printf("Router %s initialized with TUN %s (%s)", r.ID, r.TunDevice.Name, r.TunDevice.IP.String())
	return r, nil
}

// AddPeer adds a connected peer router's information.
func (r *Router) AddPeer(peerID string, peerIP net.IP) {
	r.peersMutex.Lock()
	defer r.peersMutex.Unlock()
	if r.ConnectedPeers == nil {
		r.ConnectedPeers = make(map[string]net.IP)
	}
	r.ConnectedPeers[peerID] = peerIP
	log.Printf("Router %s: Added peer %s (%s)", r.ID, peerID, peerIP.String())
}

// Start begins the router's packet processing and routing protocol loops.
func (r *Router) Start() error {
	log.Printf("Starting router %s...", r.ID)
	r.wg.Add(3) // packetProcessingLoop, routingProtocolLoop, lsuGenerationLoop
	go r.packetProcessingLoop()
	go r.routingProtocolLoop()
	go r.lsuGenerationLoop()

	// Add directly connected route
	r.AddDirectlyConnectedRoute()
	log.Printf("Router %s started.", r.ID)
	return nil
}

// Stop はルーターを停止します。
func (r *Router) Stop() {
	log.Printf("Router [%s] stopping...", r.ID)
	close(r.shutdown)
	if r.TunDevice != nil {
		if err := r.TunDevice.Close(); err != nil {
			log.Printf("Router [%s] error closing TUN device: %v", r.ID, err)
		}
	}
	log.Printf("Router [%s] stopped.", r.ID)
}

// packetProcessingLoop reads packets from the TUN device and processes them.
func (r *Router) packetProcessingLoop() {
	defer r.wg.Done()
	log.Printf("Router %s: Packet processing loop started for TUN %s.", r.ID, r.TunDevice.Name)

	for {
		select {
		case <-r.shutdown:
			log.Printf("Router %s: Shutting down packet processing loop.", r.ID)
			return
		default:
			// ReadPacket should be a method of TUNDevice that returns the raw packet bytes
			packet, ok := r.TunDevice.ReadPacket() // Assuming ReadPacket is blocking with a way to be interrupted by close
			if !ok {
				log.Printf("Router %s: TUN device %s closed or read error, exiting packet processing loop.", r.ID, r.TunDevice.Name)
				return
			}
			if len(packet) > 0 {
				// log.Printf("Router %s: Received packet of length %d from TUN %s", r.ID, len(packet), r.TunDevice.Name())
				r.processIncomingPacket(packet)
			}
		}
	}
}

// GetRoutingTable は現在のルーティングテーブルのコピーを返します。
func (r *Router) GetRoutingTable() []RoutingEntry {
	r.rtMutex.RLock()
	defer r.rtMutex.RUnlock()
	tableCopy := make([]RoutingEntry, 0, len(r.RoutingTable))
	for _, entry := range r.RoutingTable {
		tableCopy = append(tableCopy, *entry)
	}
	return tableCopy
}

// ForwardPacket はパケットを適切なインターフェースに転送します。
// (この関数はhandleIncomingPacketから呼ばれる想定)
func (r *Router) forwardPacket(packet []byte, nextHopIP net.IP, outInterface string) error {
	// 実際の転送ロジックは、対応するTunDevice (または物理NIC) への書き込みになる
	// ここでは、デモのため、どのルーターのどのインターフェースに送るかログ表示に留める
	log.Printf("Router [%s] would forward packet to %s via interface %s", r.ID, nextHopIP, outInterface)

	// if outInterface == r.TunDevice.Name {
	// 	_, err := r.TunDevice.WritePacket(packet)
	// 	return err
	// } else {
	// 	// 他のインターフェースへの転送 (別のTUNDeviceや物理NICなど)
	// 	// 今回の設計では、ルーターは1つのTUNデバイスしか持たないので、
	// 	// 外部への転送は、NextHopのIPアドレスを持つ別のルーターにパケットを「渡す」処理になる。
	// 	// これは、WebSocketやGoチャネルなどを通じて、そのルーターインスタンスにパケットを送信することを意味する。
	// 	// この部分は RouterManager が担当する方が適切かもしれない。
	// 	return fmt.Errorf("forwarding to other interfaces (%s) not yet fully implemented in Router struct", outInterface)
	// }
	// 仮実装: 現時点では何もしない（またはエラーを返す）
	return fmt.Errorf("packet forwarding logic not fully implemented for router %s", r.ID)
}

// routingProtocolLoop handles sending Hellos, checking neighbor liveness, and SPF calculation triggers.
func (r *Router) routingProtocolLoop() {
	defer r.wg.Done()
	helloTicker := time.NewTicker(HelloInterval)
	spfTrigger := make(chan struct{}, 1)                    // Buffered channel to trigger SPF
	neighborCheckTicker := time.NewTicker(DeadInterval / 2) // Check more frequently than DeadInterval

	defer helloTicker.Stop()
	defer neighborCheckTicker.Stop()

	log.Printf("Router %s: Routing protocol loop started.", r.ID)

	for {
		select {
		case <-r.shutdown:
			log.Printf("Router %s: Shutting down routing protocol loop.", r.ID)
			return
		case <-helloTicker.C:
			r.sendHelloPacket()
		case <-neighborCheckTicker.C:
			if r.checkNeighborLiveness() {
				select { // Non-blocking send
				case spfTrigger <- struct{}{}:
				default:
				}
				r.triggerLSUGeneration() // Also trigger LSU if neighbors changed
			}
		case <-spfTrigger: // This case might be triggered by LSU processing or neighbor changes
			log.Printf("Router %s: SPF calculation triggered.", r.ID)
			r.runSPF()
		}
	}
}

// lsuGenerationLoop handles periodic LSU generation.
func (r *Router) lsuGenerationLoop() {
	defer r.wg.Done()
	lsuTicker := time.NewTicker(LSUInterval)
	defer lsuTicker.Stop()

	log.Printf("Router %s: LSU generation loop started.", r.ID)

	for {
		select {
		case <-r.shutdown:
			log.Printf("Router %s: Shutting down LSU generation loop.", r.ID)
			return
		case <-lsuTicker.C:
			// Check if enough time has passed or if significant event occurred
			// For now, just generate and flood periodically
			r.triggerLSUGeneration()
		}
	}
}

func (r *Router) triggerLSUGeneration() {
	// Potentially add more complex logic here, e.g., check for actual changes
	log.Printf("Router %s: LSU generation triggered.", r.ID)
	lsu := r.generateLSU() // generateLSU now returns *LinkStateUpdate
	if lsu != nil {        // Check if LSU generation was successful
		r.floodLSU(lsu, "")
		r.lsudbMutex.Lock()
		r.LSUDB[r.ID] = lsu // lsu is *LinkStateUpdate, LSUDB stores *LinkStateUpdate
		r.lsudbMutex.Unlock()
		r.lastLSUGenerationTime = time.Now()
		r.runSPF()
	}
}

// sendHelloPacket sends a Hello packet to discover neighbors.
func (r *Router) sendHelloPacket() {
	r.peersMutex.RLock()
	defer r.peersMutex.RUnlock()

	if len(r.ConnectedPeers) == 0 && !enableBroadcastHello {
		// log.Printf("Router %s: No connected peers and broadcast Hello is disabled. Skipping Hello send.", r.ID)
		return
	}

	hello := HelloPacket{
		Header: OSPFHeader{
			Type:      PacketTypeHello,
			RouterID:  r.ID,
			Interface: r.TunDevice.Name, // Use Name field
		},
	}

	var buffer bytes.Buffer
	encoder := gob.NewEncoder(&buffer)
	err := encoder.Encode(hello)
	if err != nil {
		log.Printf("Router %s: Error encoding Hello packet: %v", r.ID, err)
		return
	}
	helloData := buffer.Bytes()
	srcIP := r.TunDevice.IP // IP is net.IP type

	// Send to all connected peers via unicast
	for peerID, peerIP := range r.ConnectedPeers {
		ipHeader := &IPv4Header{
			Version:     4,
			IHL:         5,
			TotalLength: uint16(20 + len(helloData)),
			ID:          0,
			TTL:         1, // For Hellos to direct peers
			Protocol:    OSPFProtocolNumber,
			Checksum:    0,
			SrcIP:       srcIP,
			DstIP:       peerIP,
		}

		finalPacket, err := constructIPPacket(ipHeader, helloData)
		if err != nil {
			log.Printf("Router %s: Error constructing IP packet for Hello to peer %s (%s): %v", r.ID, peerID, peerIP.String(), err)
			continue
		}

		if r.manager == nil {
			log.Printf("Router %s: RouterManager reference is nil. Cannot relay Hello packet to peer %s (%s).", r.ID, peerID, peerIP.String())
			continue
		}
		relayed := r.manager.RelayPacket(r.ID, peerIP, finalPacket)
		if !relayed {
			log.Printf("Router %s: Failed to relay Hello packet to peer %s (%s) via RouterManager.", r.ID, peerID, peerIP.String())
		}
	}

	// Optional: Keep broadcast Hello for networks where peers are not explicitly connected (e.g. shared segment discovery)
	// For this project, explicit connections are primary, so broadcast might be disabled or removed.
	if enableBroadcastHello {
		broadcastDestIP := net.ParseIP(BroadcastIPv4Str)
		broadcastIPHeader := &IPv4Header{
			Version:     4,
			IHL:         5,
			TotalLength: uint16(20 + len(helloData)),
			ID:          0,
			TTL:         1,
			Protocol:    OSPFProtocolNumber,
			Checksum:    0,
			SrcIP:       srcIP,
			DstIP:       broadcastDestIP,
		}
		broadcastFinalPacket, err := constructIPPacket(broadcastIPHeader, helloData)
		if err != nil {
			log.Printf("Router %s: Error constructing broadcast IP packet for Hello: %v", r.ID, err)
			return // return here or continue depending on desired strictness
		}

		_, err = r.TunDevice.WritePacket(broadcastFinalPacket)
		if err != nil {
			log.Printf("Router %s: Error sending broadcast Hello packet via TUN %s: %v", r.ID, r.TunDevice.Name, err)
		} else {
			log.Printf("Router %s: Sent broadcast Hello packet via %s.", r.ID, r.TunDevice.Name)
		}
	}
}

// handleHelloPacket processes an incoming Hello packet.
func (r *Router) handleHelloPacket(hello *HelloPacket, sourceIP net.IP) {
	log.Printf("Router %s: Entered handleHelloPacket. Received Hello from RouterID: %s, SourceIP: %s, Interface: %s", r.ID, hello.Header.RouterID, sourceIP.String(), hello.Header.Interface)

	r.neighborMutex.Lock()
	defer r.neighborMutex.Unlock()

	if hello.Header.RouterID == r.ID {
		log.Printf("Router %s: Ignoring Hello from self.", r.ID)
		return // Ignore Hellos from self
	}

	neighbor, exists := r.Neighbors[hello.Header.RouterID]
	if !exists {
		log.Printf("Router %s: Neighbor %s not found in existing neighbors. Creating new.", r.ID, hello.Header.RouterID)
		neighbor = &Neighbor{
			RouterID:             hello.Header.RouterID,
			IPAddress:            sourceIP.String(),      // IP address from which Hello was received
			TunInterface:         hello.Header.Interface, // TUN interface name of the NEIGHBOR router that sent the hello
			LastHelloTime:        time.Now(),
			AdjacencyEstablished: true, // Simplified: adjacency on first Hello
		}
		r.Neighbors[hello.Header.RouterID] = neighbor
		log.Printf("Router %s: New neighbor %s (%s) ADDED. Adjacency established. Triggering LSU/SPF.", r.ID, hello.Header.RouterID, sourceIP.String())
		// When a new neighbor comes up, we need to regenerate our LSU and run SPF.
		go r.triggerLSUGeneration() // Run in goroutine to avoid deadlock on neighborMutex
		// SPF will be triggered by LSU generation
	} else {
		log.Printf("Router %s: Neighbor %s found. Updating LastHelloTime.", r.ID, hello.Header.RouterID)
		neighbor.LastHelloTime = time.Now()
		neighbor.IPAddress = sourceIP.String()         // Update IP in case it changed (e.g. DHCP)
		neighbor.TunInterface = hello.Header.Interface // Update neighbor's interface name
		log.Printf("Router %s: Received Hello from existing neighbor %s (%s). Updated LastHelloTime.", r.ID, hello.Header.RouterID, sourceIP.String())
	}
}

// checkNeighborLiveness checks for dead neighbors and triggers SPF if any are found.
// Returns true if any neighbor status changed (went dead).
func (r *Router) checkNeighborLiveness() bool {
	r.neighborMutex.Lock()
	defer r.neighborMutex.Unlock()

	now := time.Now()
	changed := false
	for id, neighbor := range r.Neighbors {
		if now.Sub(neighbor.LastHelloTime) > DeadInterval {
			log.Printf("Router %s: Neighbor %s (%s) declared dead. Last hello: %v, DeadInterval: %v", r.ID, id, neighbor.IPAddress, neighbor.LastHelloTime, DeadInterval)
			delete(r.Neighbors, id)
			changed = true
		}
	}

	if changed {
		log.Printf("Router %s: Neighbor status changed. Triggering LSU/SPF.", r.ID)
		// LSU generation will trigger SPF
		go r.triggerLSUGeneration() // Run in goroutine as this holds neighborMutex
	}
	return changed
}

// handleOSPFLogic is called by processIncomingPacket for OSPF packets.
func (r *Router) handleOSPFLogic(packetData []byte, sourceIP net.IP) {
	// Try decoding as HelloPacket first
	var hello HelloPacket
	helloBuffer := bytes.NewBuffer(packetData)
	helloDecoder := gob.NewDecoder(helloBuffer)
	errHello := helloDecoder.Decode(&hello)

	if errHello == nil && hello.Header.Type == PacketTypeHello {
		log.Printf("Router %s: Decoded as HelloPacket. Received from %s (RouterID: %s) on interface %s", r.ID, sourceIP.String(), hello.Header.RouterID, hello.Header.Interface)
		r.handleHelloPacket(&hello, sourceIP)
		return
	}

	// If not a valid Hello or failed, try decoding as LinkStateUpdate
	var lsu LinkStateUpdate
	lsuBuffer := bytes.NewBuffer(packetData) // Use a new buffer for LSU decoding
	lsuDecoder := gob.NewDecoder(lsuBuffer)
	errLSU := lsuDecoder.Decode(&lsu)

	if errLSU == nil && lsu.Header.Type == PacketTypeLSU {
		log.Printf("Router %s: Decoded as LinkStateUpdate. Received LSU from %s (OrigRouterID: %s, Seq: %d) via interface %s", r.ID, sourceIP.String(), lsu.Header.RouterID, lsu.SequenceNumber, lsu.Header.Interface)
		r.processIncomingLSU(&lsu, sourceIP.String(), "") // Assuming received on r.TunDevice.Name(), skipInterface not used here for now
		return
	}

	// If neither, log error including details about why each decoding attempt might have failed.
	log.Printf("Router %s: Error parsing OSPF packet from %s. Hello decode attempt error: %v (Packet Type if decoded: %d). LSU decode attempt error: %v (Packet Type if decoded: %d). Packet data: %x", r.ID, sourceIP.String(), errHello, hello.Header.Type, errLSU, lsu.Header.Type, packetData)
}

// processIncomingPacket is the entry point for all packets read from the TUN device.
func (r *Router) processIncomingPacket(fullPacket []byte) {
	// Temporary log to see ALL packets read from TUN before parsing
	if len(fullPacket) >= 20 { // Basic check for minimum IPv4 header size
		srcIPRaw := net.IP(fullPacket[12:16])
		dstIPRaw := net.IP(fullPacket[16:20])
		protocolRaw := fullPacket[9]
		log.Printf("Router %s: RAW PACKET READ from TUN. Src: %s, Dst: %s, Proto: %d, Length: %d", r.ID, srcIPRaw.String(), dstIPRaw.String(), protocolRaw, len(fullPacket))
	} else {
		log.Printf("Router %s: RAW PACKET READ from TUN (too short for IP header). Length: %d, Data: %x", r.ID, len(fullPacket), fullPacket)
	}

	ipHeader, payload, err := parseIPPacket(fullPacket)
	if err != nil {
		log.Printf("Router %s: Error parsing IP packet: %v. Packet: %x", r.ID, err, fullPacket)
		return
	}

	// log.Printf("Router %s: Decoded IP Packet: %+v, Payload Length: %d", r.ID, ipHeader, len(payload))

	// Check if the packet is for our OSPF-like protocol
	if ipHeader.Protocol == OSPFProtocolNumber {
		r.handleOSPFLogic(payload, ipHeader.SrcIP)
		return
	}

	// Check if the packet is destined for this router's TUN interface IP
	if ipHeader.DstIP.Equal(r.TunDevice.GetIP()) {
		if ipHeader.Protocol == ICMPProtocolNumber {
			log.Printf("Router %s: Received ICMP packet for self from %s", r.ID, ipHeader.SrcIP.String())
			r.handleICMPPacket(ipHeader, payload)
		} else {
			log.Printf("Router %s: Packet for self (not ICMP, proto %d) from %s. Dropping.", r.ID, ipHeader.Protocol, ipHeader.SrcIP.String())
		}
		return
	}

	// Forward the packet
	r.rtMutex.RLock()
	defer r.rtMutex.RUnlock()

	var bestMatch *RoutingEntry = nil
	longestPrefix := -1

	for prefixStr, entry := range r.RoutingTable {
		_, network, err := net.ParseCIDR(prefixStr)
		if err != nil {
			log.Printf("Router %s: Invalid CIDR in routing table: %s", r.ID, prefixStr)
			continue
		}
		if network.Contains(ipHeader.DstIP) {
			prefixLen, _ := network.Mask.Size()
			if prefixLen > longestPrefix {
				longestPrefix = prefixLen
				bestMatch = entry
			}
		}
	}

	if bestMatch != nil {
		if bestMatch.NextHop == "0.0.0.0" { // Directly connected
			// This case should ideally not happen for forwarding if DstIP is not self.
			// If it's a directly connected network, the destination is on that link.
			// However, our simple TUN model doesn't distinguish L2 broadcast domains well.
			// For now, if it's for a directly connected network and not us, we assume it needs to be sent out of the TUN.
			// This logic needs refinement for more complex topologies.
			// This implies the other host is on the same L2 segment as our TUN.
			// For directly connected, if DstIP is not self, it means it's for another host on the same segment.
			// The packet is already an IP packet, just write it back to TUN.
			log.Printf("Router %s: Dst %s is on directly connected network %s. Writing to TUN %s (Original Dst %s).", r.ID, ipHeader.DstIP.String(), bestMatch.Network, r.TunDevice.Name, ipHeader.DstIP.String())
			_, err := r.TunDevice.WritePacket(fullPacket)
			if err != nil {
				log.Printf("Router %s: Error writing packet to TUN %s for directly connected dst %s: %v", r.ID, r.TunDevice.Name, ipHeader.DstIP.String(), err)
			}
		} else {
			// Forward to next hop router via RouterManager
			nextHopIPAddr := net.ParseIP(bestMatch.NextHop)
			if nextHopIPAddr == nil {
				log.Printf("Router %s: Invalid NextHop IP address '%s' in routing table for %s. Packet dropped.", r.ID, bestMatch.NextHop, ipHeader.DstIP.String())
				return
			}

			log.Printf("Router %s: Forwarding packet from %s to %s via RouterManager. NextHop IP: %s (RouterID: %s)", r.ID, ipHeader.SrcIP.String(), ipHeader.DstIP.String(), bestMatch.NextHop, bestMatch.NextHopRouterID)
			if r.manager == nil {
				log.Printf("Router %s: RouterManager reference is nil. Cannot relay packet.", r.ID)
				return
			}
			relayed := r.manager.RelayPacket(r.ID, nextHopIPAddr, fullPacket)
			if !relayed {
				log.Printf("Router %s: Failed to relay packet via RouterManager to NextHop %s for Dst %s.", r.ID, bestMatch.NextHop, ipHeader.DstIP.String())
			}
		}
	} else {
		log.Printf("Router %s: No route to %s from %s. Packet dropped.", r.ID, ipHeader.DstIP.String(), ipHeader.SrcIP.String())
	}
}

// generateLSU creates a Link State Update packet for this router.
// Returns *LinkStateUpdate or nil if no links.
func (r *Router) generateLSU() *LinkStateUpdate {
	r.neighborMutex.RLock()
	// It's important that RoutingTable (rtMutex) is not locked here if links are derived from it
	// to avoid AB-BA deadlocks if runSPF locks rtMutex then neighborMutex.
	// For now, links are from neighbors.

	links := make([]Link, 0, len(r.Neighbors))
	for neighborID, neighbor := range r.Neighbors {
		if neighbor.AdjacencyEstablished { // Only include established neighbors
			// Cost can be dynamic or fixed. For now, fixed at 1.
			// Network for the link: This is tricky.
			// If it's a point-to-point link, it might be the neighbor's IP /32 or a shared subnet.
			// For simplicity, use neighbor's IP as a /32 link.
			links = append(links, Link{
				NeighborRouterID: neighborID,
				Cost:             1,
				Network:          neighbor.IPAddress + "/32", // Simplification
			})
		}
	}
	r.neighborMutex.RUnlock()

	if len(links) == 0 && r.ID != "" { // Don't generate empty LSUs unless it's a lone router advertising itself
		// Or, always generate an LSU even if no links, to show the router exists.
		// Let's always generate one if router ID is set.
	}

	// Add link to self / own network if desired (e.g. for stub networks attached to this router)
	// For now, only advertising links to neighbors.
	// We could also advertise the router's own TUN IP/subnet as a link with cost 0.
	_, tunNet, err := net.ParseCIDR(r.config.TunIPAddress)
	if err == nil {
		links = append(links, Link{
			NeighborRouterID: r.ID, // Link to self essentially
			Cost:             0,
			Network:          tunNet.String(),
		})
	}

	// Create LSU
	lsu := &LinkStateUpdate{ // Return pointer
		Header: OSPFHeader{
			Type:      PacketTypeLSU,
			RouterID:  r.ID,
			Interface: r.TunDevice.Name,
		},
		SequenceNumber: time.Now().UnixNano(), // Higher sequence number is newer
		TTL:            64,                    // Max hops for LSU flooding
		Links:          links,
		Timestamp:      time.Now(),
	}
	// log.Printf("Router %s: Generated LSU with Seq %d, %d links.", r.ID, lsu.SequenceNumber, len(lsu.Links))
	return lsu
}

// floodLSU sends an LSU to all neighbors except the one it was received from (if any).
func (r *Router) floodLSU(lsu *LinkStateUpdate, skipInterface string) { // lsu is now *LinkStateUpdate
	if lsu == nil {
		return
	}
	lsu.TTL--
	if lsu.TTL <= 0 {
		// log.Printf("Router %s: LSU TTL expired, not flooding. Orig: %s", r.ID, lsu.Header.RouterID)
		return
	}

	var buffer bytes.Buffer
	encoder := gob.NewEncoder(&buffer)
	err := encoder.Encode(lsu) // Encode the pointer, gob handles this
	if err != nil {
		log.Printf("Router %s: Error encoding LSU for flooding: %v", r.ID, err)
		return
	}
	lsuData := buffer.Bytes()

	r.neighborMutex.RLock()
	defer r.neighborMutex.RUnlock()

	// log.Printf("Router %s: Flooding LSU (Orig: %s, Seq: %d, TTL: %d) to %d neighbors.", r.ID, lsu.Header.RouterID, lsu.SequenceNumber, lsu.TTL, len(r.Neighbors))

	for neighborID, neighbor := range r.Neighbors {
		// Don't flood back to the interface it was (conceptually) received on.
		// This simple model uses RouterID of the neighbor as a proxy.
		// A real implementation uses incoming interface.
		if neighbor.TunInterface == skipInterface && skipInterface != "" { // skipInterface logic might need refinement
			// log.Printf("Router %s: Skipping flood of LSU from %s to neighbor %s on same interface %s", r.ID, lsu.Header.RouterID, neighborID, skipInterface)
			continue
		}

		// For now, assume all neighbors are reachable via our single TUN device.
		// Destination IP for the IP packet carrying LSU should be the neighbor's IP.
		neighborIP := net.ParseIP(neighbor.IPAddress)
		if neighborIP == nil {
			log.Printf("Router %s: Invalid IPAddress %s for neighbor %s. Cannot flood LSU.", r.ID, neighbor.IPAddress, neighborID)
			continue
		}

		ipHeader := &IPv4Header{
			Version:     4,
			IHL:         5,
			TotalLength: uint16(20 + len(lsuData)),
			ID:          0,
			TTL:         64, // TTL for the IP packet itself
			Protocol:    OSPFProtocolNumber,
			Checksum:    0,
			SrcIP:       r.TunDevice.IP,
			DstIP:       neighborIP,
		}
		finalPacket, err := constructIPPacket(ipHeader, lsuData)
		if err != nil {
			log.Printf("Router %s: Error constructing IP packet for LSU to %s: %v", r.ID, neighborID, err)
			continue
		}

		// _, err = r.TunDevice.WritePacket(finalPacket)
		// if err != nil {
		// 	log.Printf("Router %s: Error flooding LSU to neighbor %s (%s) via TUN %s: %v", r.ID, neighborID, neighbor.IPAddress, r.TunDevice.Name, err)
		// } else {
		// 	// log.Printf("Router %s: Flooded LSU to %s (%s)", r.ID, neighborID, neighbor.IPAddress)
		// }
		if r.manager == nil {
			log.Printf("Router %s: RouterManager reference is nil. Cannot relay LSU to neighbor %s (%s).", r.ID, neighborID, neighborIP.String())
			continue
		}
		// RelayPacket expects the IP of the *next hop's TUN interface*.
		// In this case, neighborIP is the TUN IP of the neighbor router we want to send the LSU to.
		relayed := r.manager.RelayPacket(r.ID, neighborIP, finalPacket)
		if !relayed {
			log.Printf("Router %s: Failed to relay LSU to neighbor %s (%s) via RouterManager.", r.ID, neighborID, neighborIP.String())
		} else {
			// log.Printf("Router %s: Relayed LSU to neighbor %s (%s) via RouterManager.", r.ID, neighborID, neighborIP.String())
		}
	}
}

// processIncomingLSU processes a received LSU packet.
func (r *Router) processIncomingLSU(newLSU *LinkStateUpdate, fromIPAddress string, receivedOnInterface string) { // newLSU is *LinkStateUpdate
	if newLSU == nil {
		return
	}

	// log.Printf("Router %s: Processing incoming LSU. Originator: %s, Seq: %d, Received from: %s on %s", r.ID, newLSU.Header.RouterID, newLSU.SequenceNumber, fromIPAddress, receivedOnInterface)

	// 1. Ignore if LSU originated from self
	if newLSU.Header.RouterID == r.ID {
		// log.Printf("Router %s: Discarding LSU originated by self.", r.ID)
		return
	}

	r.lsudbMutex.Lock()
	existingLSU, found := r.LSUDB[newLSU.Header.RouterID]
	r.lsudbMutex.Unlock()

	// 2. If not found, or if newLSU is newer, accept it.
	isNewer := false
	if !found {
		isNewer = true
	} else {
		if newLSU.SequenceNumber > existingLSU.SequenceNumber {
			isNewer = true
		} else if newLSU.SequenceNumber == existingLSU.SequenceNumber && newLSU.Timestamp.After(existingLSU.Timestamp) {
			isNewer = true // Tie-break with timestamp if sequence numbers are identical
		}
	}

	if isNewer {
		// log.Printf("Router %s: Accepted new/updated LSU from %s (Orig: %s, Seq: %d). Links: %d.", r.ID, fromIPAddress, newLSU.Header.RouterID, newLSU.SequenceNumber, len(newLSU.Links))
		r.lsudbMutex.Lock()
		r.LSUDB[newLSU.Header.RouterID] = newLSU // Store pointer
		r.lsudbMutex.Unlock()

		// 3. Flood to other neighbors
		r.floodLSU(newLSU, receivedOnInterface) // Pass the interface it was received on to prevent flooding back

		// 4. Trigger SPF calculation
		r.runSPF() // This should ideally be non-blocking or carefully managed
	} else {
		// log.Printf("Router %s: Discarding older/same LSU from %s (Orig: %s, Existing Seq: %d, New Seq: %d).", r.ID, fromIPAddress, newLSU.Header.RouterID, existingLSU.SequenceNumber, newLSU.SequenceNumber)
		// TODO: Send LSAck for duplicate if received from a different neighbor than the one that sent the accepted LSU
	}
}

// Item represents an item in the priority queue for Dijkstra's algorithm.
type Item struct {
	RouterID string // Router ID
	Cost     int    // Cost from source to this router
	Index    int    // Index of the item in the heap
	// We might also need to store the IP of the next hop to reach this RouterID from source
	// For now, prevRouter map will help trace back the path.
}

// PriorityQueue implements heap.Interface and holds Items.
type PriorityQueue []*Item

func (pq PriorityQueue) Len() int { return len(pq) }

func (pq PriorityQueue) Less(i, j int) bool {
	return pq[i].Cost < pq[j].Cost
}

func (pq PriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].Index = i
	pq[j].Index = j
}

// Push adds an item to the priority queue.
func (pq *PriorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*Item)
	item.Index = n
	*pq = append(*pq, item)
}

// Pop removes and returns the item with the smallest cost from the priority queue.
func (pq *PriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil  // avoid memory leak
	item.Index = -1 // for safety
	*pq = old[0 : n-1]
	return item
}

// update modifies the cost and potentially other properties of an item in the priority queue.
// This is not strictly used by heap.Fix if only cost changes, but good for completeness.
func (pq *PriorityQueue) update(item *Item, cost int) {
	item.Cost = cost
	heap.Fix(pq, item.Index)
}

// runSPF calculates the shortest paths using Dijkstra's algorithm and updates the routing table.
func (r *Router) runSPF() {
	r.rtMutex.Lock()
	defer r.rtMutex.Unlock()
	r.lsudbMutex.RLock() // Lock LSUDB for reading during SPF
	defer r.lsudbMutex.RUnlock()

	log.Printf("Router [%s] Running SPF algorithm... (LSUDB size: %d)", r.ID, len(r.LSUDB))
	newRoutingTable := make(map[string]*RoutingEntry)

	dist := make(map[string]int)          // Cost from r.ID to RouterID
	prevRouter := make(map[string]string) // Previous RouterID in path from r.ID
	// Store the actual next hop IP from this router (r.ID) to reach a given routerID
	// This is the IP of our direct neighbor that is on the path to the target routerID.
	firstHopToRouter := make(map[string]string) // RouterID -> IP of first hop neighbor from r.ID
	pqItems := make(map[string]*Item)           // Map RouterID to its Item in PQ for easy update

	// Initialize distances: 0 for self, infinity for others
	for routerID := range r.LSUDB {
		dist[routerID] = 1 << 30 // Effectively infinity
	}
	dist[r.ID] = 0

	pq := make(PriorityQueue, 0)
	heap.Init(&pq)

	// Add self to PQ
	selfItem := &Item{RouterID: r.ID, Cost: 0}
	heap.Push(&pq, selfItem)
	pqItems[r.ID] = selfItem

	// Main Dijkstra loop
	for pq.Len() > 0 {
		uItem := heap.Pop(&pq).(*Item)
		u := uItem.RouterID
		uCost := uItem.Cost

		// If we found a shorter path already (can happen with some PQ implementations or graph structures)
		if uCost > dist[u] && dist[u] != 0 { // dist[u] != 0 handles the initial self case
			continue
		}

		// Get LSU for router u. If u is self, we look at our direct neighbors.
		var currentLSU *LinkStateUpdate
		var uIsSelf bool = (u == r.ID)

		if uIsSelf {
			// For self, iterate over direct neighbors to start paths
			// This will establish the first hop to our direct neighbors.
			r.neighborMutex.RLock()
			for neighborID, neighborInfo := range r.Neighbors {
				if neighborInfo.AdjacencyEstablished {
					costToNeighbor := 1                                                   // Assuming cost 1 to direct neighbors
					if dist[neighborID] == 0 || uCost+costToNeighbor < dist[neighborID] { // dist[neighborID] == 0 implies not yet set or self
						if dist[neighborID] == 0 && neighborID != r.ID {
							dist[neighborID] = 1 << 30
						} // Initialize if not self and not set
						if uCost+costToNeighbor < dist[neighborID] {
							dist[neighborID] = uCost + costToNeighbor
							prevRouter[neighborID] = u // u is r.ID here
							firstHopToRouter[neighborID] = neighborInfo.IPAddress

							if existingItem, ok := pqItems[neighborID]; ok {
								pq.update(existingItem, dist[neighborID])
							} else {
								newItem := &Item{RouterID: neighborID, Cost: dist[neighborID]}
								heap.Push(&pq, newItem)
								pqItems[neighborID] = newItem
							}
						}
					}
				}
			}
			r.neighborMutex.RUnlock()
		} else {
			// For other routers, get their LSU from DB
			var ok bool
			currentLSU, ok = r.LSUDB[u]
			if !ok || currentLSU == nil {
				log.Printf("Router %s: SPF: LSU for %s not found in DB, skipping.", r.ID, u)
				continue
			}
			// Iterate over links in this LSU
			for _, link := range currentLSU.Links {
				v := link.NeighborRouterID // This is the router ID at the other end of the link from u
				linkCost := link.Cost

				// Ensure neighbor v exists in dist map (i.e., we have an LSU for it or it's self)
				if _, known := dist[v]; !known {
					if _, lsuExists := r.LSUDB[v]; lsuExists || v == r.ID {
						dist[v] = 1 << 30 // Initialize if known through LSUDB but not yet in dist
					} else {
						// log.Printf("Router %s: SPF: Unknown neighbor %s in LSU from %s. Skipping link.", r.ID, v, u)
						continue
					}
				}

				if uCost+linkCost < dist[v] {
					dist[v] = uCost + linkCost
					prevRouter[v] = u
					// Determine the first hop from r.ID to v
					if u == r.ID {
						// This case should be handled by the uIsSelf block. If link.NeighborRouterID is a direct neighbor.
						// If u is self, firstHopToRouter[v] would be the direct neighbor's IP.
						r.neighborMutex.RLock()
						if directNeighbor, isDirect := r.Neighbors[v]; isDirect {
							firstHopToRouter[v] = directNeighbor.IPAddress
						}
						r.neighborMutex.RUnlock()
					} else {
						firstHopToRouter[v] = firstHopToRouter[u] // Inherit first hop from path to u
					}

					if existingItem, ok := pqItems[v]; ok {
						pq.update(existingItem, dist[v])
					} else {
						newItem := &Item{RouterID: v, Cost: dist[v]}
						heap.Push(&pq, newItem)
						pqItems[v] = newItem
					}
				}
			}
		}
	}

	// Construct new routing table based on SPF results
	// 1. Add directly connected route (already ensures lowest metric for local networks)
	_, ipNetSelf, errSelf := net.ParseCIDR(r.config.TunIPAddress)
	if errSelf == nil {
		directNetworkCIDR := ipNetSelf.String()
		newRoutingTable[directNetworkCIDR] = &RoutingEntry{
			Network:     directNetworkCIDR,
			NextHop:     "0.0.0.0",
			Interface:   r.TunDevice.Name,
			Metric:      0,
			LearnedFrom: "Direct",
			LastUpdated: time.Now(),
		}
	} else {
		log.Printf("Router %s: Error parsing own TunIPAddress %s for SPF direct route: %v", r.ID, r.config.TunIPAddress, errSelf)
	}

	// 2. Add routes learned via OSPF (from LSUs of other routers)
	for destRouterID, lsu := range r.LSUDB {
		if destRouterID == r.ID { // Skip self LSU for generating routes to other networks via self
			continue
		}
		costToDestRouter, reachable := dist[destRouterID]
		if !reachable || costToDestRouter >= (1<<30) { // If not reachable or cost is infinity
			continue
		}

		// Determine the first hop (our direct neighbor) on the path to destRouterID
		// This requires tracing back from destRouterID using prevRouter until we hit r.ID or a direct neighbor of r.ID.
		// The firstHopToRouter map should already contain the IP of the direct neighbor from r.ID to reach destRouterID.
		actualNextHopIP := firstHopToRouter[destRouterID]
		actualNextHopRouterID := ""
		// Find the router ID of this first hop neighbor
		r.neighborMutex.RLock()
		for nid, ninfo := range r.Neighbors {
			if ninfo.IPAddress == actualNextHopIP {
				actualNextHopRouterID = nid
				break
			}
		}
		r.neighborMutex.RUnlock()

		if actualNextHopIP == "" || actualNextHopRouterID == "" {
			// log.Printf("Router %s: SPF: Could not determine first hop IP/RouterID for destination router %s. Path: %s",r.ID, destRouterID, tracePath(prevRouter, destRouterID, r.ID))
			continue
		}

		// Add routes to networks advertised in this LSU
		for _, link := range lsu.Links {
			// A link in an LSU can be to another router or to a network.
			// We are interested in links that represent networks attached to destRouterID.
			// Our current Link struct has NeighborRouterID, Cost, Network.
			// If link.NeighborRouterID == destRouterID, it means link.Network is a network attached to destRouterID with cost link.Cost from destRouterID.
			if link.NeighborRouterID == destRouterID { // This identifies a stub network link in the LSU
				destNetworkCIDR := link.Network
				totalCostToNetwork := costToDestRouter + link.Cost

				// Check if we already have a route to this network or if this one is better
				if existingEntry, exists := newRoutingTable[destNetworkCIDR]; !exists || totalCostToNetwork < existingEntry.Metric {
					newRoutingTable[destNetworkCIDR] = &RoutingEntry{
						Network:         destNetworkCIDR,
						NextHop:         actualNextHopIP,
						NextHopRouterID: actualNextHopRouterID,
						Interface:       r.TunDevice.Name, // All OSPF routes go out our TUN
						Metric:          totalCostToNetwork,
						LearnedFrom:     "OSPF",
						LastUpdated:     time.Now(),
					}
				}
			}
		}
	}

	// Replace old routing table
	r.RoutingTable = newRoutingTable
	log.Printf("Router [%s] SPF run complete. Routing table updated (entries: %d).", r.ID, len(r.RoutingTable))
	r.dumpRoutingTable() // Call dumpRoutingTable to log the new table content

	// Notify about routing table update
	tableCopy := make([]RoutingEntry, 0, len(r.RoutingTable))
	for _, entry := range r.RoutingTable {
		tableCopy = append(tableCopy, *entry)
	}
	select {
	case r.RoutingTableUpdateChan <- tableCopy:
		log.Printf("Router [%s] Sent routing table update notification", r.ID)
	default:
		log.Printf("Router [%s] Routing table update channel full, notification skipped", r.ID)
	}
}

// Helper function to trace path (for debugging)
// func tracePath(prev map[string]string, target, source string) string {
// 	path := []string{target}
// 	curr := target
// 	for curr != source && prev[curr] != "" {
// 		curr = prev[curr]
// 		path = append([]string{curr}, path...)
// 		if len(path) > 20 { path = append([]string{"..."}, path...); break} // safety break
// 	}
// 	if curr != source { return "path not found to source"}
// 	return strings.Join(path, " -> ")
// }

// constructIPPacket assembles an IPv4 header and payload into a byte slice.
// It calculates the IPv4 header checksum.
func constructIPPacket(header *IPv4Header, payload []byte) ([]byte, error) {
	if header == nil {
		return nil, fmt.Errorf("IP header cannot be nil")
	}
	header.TotalLength = uint16(20 + len(payload)) // Assuming no IP options for IHL=5

	headerBytes := make([]byte, 20) // For IHL=5, header is 20 bytes

	headerBytes[0] = (header.Version << 4) | (header.IHL & 0x0F)
	headerBytes[1] = header.TOS
	binary.BigEndian.PutUint16(headerBytes[2:4], header.TotalLength)
	binary.BigEndian.PutUint16(headerBytes[4:6], header.ID)

	flagsAndOffset := (header.Flags << 13) | (header.FragOffset & 0x1FFF)
	binary.BigEndian.PutUint16(headerBytes[6:8], flagsAndOffset)

	headerBytes[8] = header.TTL
	headerBytes[9] = header.Protocol
	// Checksum (headerBytes[10:12]) is calculated later
	copy(headerBytes[12:16], header.SrcIP.To4())
	copy(headerBytes[16:20], header.DstIP.To4())

	// Calculate checksum
	header.Checksum = calculateIPv4Checksum(headerBytes)
	binary.BigEndian.PutUint16(headerBytes[10:12], header.Checksum)

	return append(headerBytes, payload...), nil
}

// calculateIPv4Checksum calculates the IPv4 header checksum.
func calculateIPv4Checksum(headerBytes []byte) uint16 {
	// Ensure checksum field is zero for calculation
	headerBytes[10] = 0
	headerBytes[11] = 0

	var sum uint32
	for i := 0; i < len(headerBytes); i += 2 {
		sum += uint32(headerBytes[i])<<8 + uint32(headerBytes[i+1])
	}

	for sum>>16 > 0 {
		sum = (sum & 0xFFFF) + (sum >> 16)
	}
	return uint16(^sum)
}

// calculateICMPChecksum calculates the ICMP checksum.
func calculateICMPChecksum(icmpPacketBytes []byte) uint16 {
	var sum uint32
	length := len(icmpPacketBytes)
	for i := 0; i < length-1; i += 2 {
		sum += uint32(icmpPacketBytes[i])<<8 + uint32(icmpPacketBytes[i+1])
	}
	if length%2 == 1 {
		sum += uint32(icmpPacketBytes[length-1]) << 8
	}
	for sum>>16 > 0 {
		sum = (sum & 0xFFFF) + (sum >> 16)
	}
	return uint16(^sum)
}

// handleICMPPacket processes ICMP packets destined for the router.
func (r *Router) handleICMPPacket(ipHdr *IPv4Header, icmpPayload []byte) {
	if len(icmpPayload) < 8 { // Minimum ICMP Echo header size
		log.Printf("Router %s: ICMP packet too short from %s", r.ID, ipHdr.SrcIP.String())
		return
	}

	var icmpHdr ICMPHeader
	icmpHdr.Type = icmpPayload[0]
	icmpHdr.Code = icmpPayload[1]
	// icmpHdr.Checksum = binary.BigEndian.Uint16(icmpPayload[2:4]) // Original checksum
	icmpHdr.ID = binary.BigEndian.Uint16(icmpPayload[4:6])
	icmpHdr.Seq = binary.BigEndian.Uint16(icmpPayload[6:8])
	// icmpData := icmpPayload[8:]

	if icmpHdr.Type == 8 { // Echo Request
		log.Printf("Router %s: Received ICMP Echo Request (type 8, code %d) from %s, ID: %d, Seq: %d", r.ID, icmpHdr.Code, ipHdr.SrcIP.String(), icmpHdr.ID, icmpHdr.Seq)

		// Prepare Echo Reply
		replyICMPPayload := make([]byte, len(icmpPayload))
		copy(replyICMPPayload, icmpPayload)
		replyICMPPayload[0] = 0 // Type 0 for Echo Reply
		// replyICMPPayload[1] = 0 // Code 0

		// Zero out checksum field for calculation
		replyICMPPayload[2] = 0
		replyICMPPayload[3] = 0
		replyChecksum := calculateICMPChecksum(replyICMPPayload)
		binary.BigEndian.PutUint16(replyICMPPayload[2:4], replyChecksum)

		replyIPHeader := &IPv4Header{
			Version:     4,
			IHL:         5,
			TotalLength: uint16(20 + len(replyICMPPayload)), // 20 for IPv4 header
			ID:          ipHdr.ID,                           // Can use original ID or new one
			TTL:         64,
			Protocol:    ICMPProtocolNumber,
			Checksum:    0, // Kernel will calculate if 0, or we calculate it
			SrcIP:       r.TunDevice.GetIP(),
			DstIP:       ipHdr.SrcIP, // Send back to original source
		}

		finalPacket, err := constructIPPacket(replyIPHeader, replyICMPPayload)
		if err != nil {
			log.Printf("Router %s: Error constructing ICMP Echo Reply IP packet: %v", r.ID, err)
			return
		}

		_, err = r.TunDevice.WritePacket(finalPacket)
		if err != nil {
			log.Printf("Router %s: Error sending ICMP Echo Reply to %s: %v", r.ID, ipHdr.SrcIP.String(), err)
		} else {
			log.Printf("Router %s: Sent ICMP Echo Reply to %s", r.ID, ipHdr.SrcIP.String())
		}
	} else {
		log.Printf("Router %s: Received ICMP (type %d, code %d) from %s. Not an Echo Request, ignoring.", r.ID, icmpHdr.Type, icmpHdr.Code, ipHdr.SrcIP.String())
	}
}

// Helper to parse an IP packet (simplified)
func parseIPPacket(packet []byte) (*IPv4Header, []byte, error) {
	if len(packet) < 20 { // Minimum IPv4 header size
		return nil, nil, fmt.Errorf("packet too short to be IPv4 (%d bytes)", len(packet))
	}

	header := &IPv4Header{}
	header.Version = packet[0] >> 4
	header.IHL = packet[0] & 0x0F
	headerLength := int(header.IHL * 4)

	if header.Version != 4 {
		return nil, nil, fmt.Errorf("not an IPv4 packet (version: %d)", header.Version)
	}
	if len(packet) < headerLength {
		return nil, nil, fmt.Errorf("packet too short for reported IHL (%d bytes, need %d)", len(packet), headerLength)
	}

	header.TOS = packet[1]
	header.TotalLength = binary.BigEndian.Uint16(packet[2:4])
	header.ID = binary.BigEndian.Uint16(packet[4:6])
	flagsAndOffset := binary.BigEndian.Uint16(packet[6:8])
	header.Flags = flagsAndOffset >> 13
	header.FragOffset = flagsAndOffset & 0x1FFF
	header.TTL = packet[8]
	header.Protocol = packet[9]
	header.Checksum = binary.BigEndian.Uint16(packet[10:12])
	header.SrcIP = net.IP(packet[12:16])
	header.DstIP = net.IP(packet[16:20])

	if headerLength > 20 {
		header.Options = packet[20:headerLength]
	}

	// Basic validation of checksum (optional, kernel usually handles on receive)
	// currentChecksum := header.Checksum
	// calculatedChecksum := calculateIPv4Checksum(packet[:headerLength])
	// if currentChecksum != calculatedChecksum {
	//    log.Printf("Warning: IPv4 checksum mismatch. Got %04x, Calculated %04x for packet from %s", currentChecksum, calculatedChecksum, header.SrcIP)
	//    // return nil, nil, fmt.Errorf("IPv4 checksum mismatch") // Can be too strict for TUN traffic
	// }

	if int(header.TotalLength) > len(packet) {
		// This can happen with some TUN interfaces if packets are fragmented or not fully read.
		// log.Printf("Warning: IP header TotalLength (%d) > actual packet length (%d)", header.TotalLength, len(packet))
		// For now, we'll use the actual packet length for the payload.
		// return nil, nil, fmt.Errorf("IP header TotalLength (%d) > actual packet length (%d)", header.TotalLength, len(packet))
	}

	// Ensure payload slicing is within bounds of actual packet length
	payloadStart := headerLength
	payloadEnd := len(packet)                 // Use actual packet length
	if int(header.TotalLength) < payloadEnd { // If TotalLength is less, use that
		payloadEnd = int(header.TotalLength)
	}
	if payloadStart > payloadEnd {
		// log.Printf("Warning: payloadStart (%d) > payloadEnd (%d). No payload.", payloadStart, payloadEnd)
		return header, []byte{}, nil // No payload or malformed
	}

	payload := packet[payloadStart:payloadEnd]
	return header, payload, nil
}

// dumpRoutingTable prints the routing table to the log.
func (r *Router) dumpRoutingTable() {
	r.rtMutex.RLock()
	defer r.rtMutex.RUnlock()
	log.Printf("Router %s: Routing Table (%d entries):", r.ID, len(r.RoutingTable))
	for dest, entry := range r.RoutingTable {
		log.Printf("  Dst: %s, NextHop: %s (Router: %s), Iface: %s, Metric: %d, Learned: %s",
			dest, entry.NextHop, entry.NextHopRouterID, entry.Interface, entry.Metric, entry.LearnedFrom)
	}
}

// AddDirectlyConnectedRoute adds the route for the TUN interface's network.
func (r *Router) AddDirectlyConnectedRoute() {
	r.rtMutex.Lock()
	defer r.rtMutex.Unlock()

	_, ipNet, err := net.ParseCIDR(r.config.TunIPAddress)
	if err != nil {
		log.Printf("Router %s: Error parsing TunIPAddress %s for direct route: %v", r.ID, r.config.TunIPAddress, err)
		return
	}

	networkCIDR := ipNet.String()
	entry := &RoutingEntry{
		Network:     networkCIDR,
		NextHop:     "0.0.0.0", // Indicates directly connected
		Interface:   r.TunDevice.Name,
		Metric:      0,
		LearnedFrom: "Direct",
		LastUpdated: time.Now(),
	}
	r.RoutingTable[networkCIDR] = entry
	log.Printf("Router %s: Added directly connected route: %s via %s", r.ID, networkCIDR, r.TunDevice.Name)
}

// InjectPacket allows the RouterManager to inject a packet directly into this router's processing logic,
// bypassing the TUN device read loop. This is used for manager-facilitated inter-router communication.
func (r *Router) InjectPacket(packet []byte, fromRouterID string) {
	// It might be useful to log that this packet was injected rather than read from TUN.
	log.Printf("Router %s: Packet INJECTED by manager from %s (simulating arrival). Length: %d", r.ID, fromRouterID, len(packet))
	r.processIncomingPacket(packet) // Process it as if it came from the TUN device
}
