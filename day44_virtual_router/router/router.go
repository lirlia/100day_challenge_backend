package router

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"net"
	"sort"
	"sync"
	"time"

	"github.com/songgao/water"
)

// IRouter defines the interface for a virtual router.
type IRouter interface {
	Start(ctx context.Context)
	Stop()
	AddRoute(route *RoutingEntry)
	RemoveRoute(destination net.IPNet)
	FindRoute(destinationIP net.IP) *RoutingEntry
	PrintRoutingTable() string
	AddNeighborLink(localIP, remoteIP net.IP, neighborID string, toNeighborChan chan []byte, fromNeighborChan chan []byte, cost int) error
	RemoveNeighborLink(neighborID string) error
	GetRoutingTable() []*RoutingEntry
	TUNInterfaceName() string
	TUNIPNet() *net.IPNet
	TUNIPNetString() string
	IsRunning() bool
	OSPFEnabled() bool
	GetFormattedNeighborLinks() []FormattedNeighborLink
	SetOSPFInstance(ospf *OSPFInstance)
	GetOSPFInstance() *OSPFInstance
	GetID() string
	GetRoutingTableForDisplay() []RoutingTableEntryForDisplay
	GetLSDBForRouterDisplay() []LSAForDisplay
	SimulatePing(destinationIPStr string) (bool, int, string, error)
}

// RoutingEntry はルーティングテーブルのエントリを表します。
type RoutingEntry struct {
	Destination net.IPNet // 宛先ネットワーク (例: 192.168.2.0/24)
	NextHop     net.IP    // 次のホップのIPアドレス
	Interface   string    // 送出インターフェース名 (TUNデバイス名 or 仮想リンクID)
	Metric      int       // ルートのコスト (OSPFなどで使用)
	Type        RouteType // ルートの種類 (Static, OSPFなど)
	// LastUpdated time.Time // 最終更新時刻
}

// RouteType はルートの種類を示します。
type RouteType string

const (
	StaticRoute RouteType = "static"
	OSPFRoute   RouteType = "ospf"
	DirectRoute RouteType = "direct" // 直接接続
)

// FormattedNeighborLink is a struct for template display
type FormattedNeighborLink struct {
	NeighborID   string
	LocalLinkIP  string // IP on this router's side of the link (requires enhancement to retrieve)
	RemoteLinkIP string // IP on the neighbor's side of the link (requires enhancement to retrieve)
	Cost         int
	// We also need the local router ID to make a unique removal link
	LocalRouterID string
}

// Router struct represents a virtual router
type Router struct {
	ID                 string // Changed to public field ID
	TUNInterface       *water.Interface
	IPAddress          net.IPNet // TUNデバイスのIP/マスク
	RoutingTable       []*RoutingEntry
	routingTableMutex  sync.RWMutex
	NeighborLinks      map[string]*NeighborLink
	neighborLinksMutex sync.RWMutex
	PacketChan         chan []byte // TUNデバイスから読み取ったパケットを受信
	ctx                context.Context
	cancelFunc         context.CancelFunc
	wg                 sync.WaitGroup
	isRunning          bool
	ospfInstance       *OSPFInstance // OSPF機能が必要な場合に設定
}

// NeighborLink は隣接ルーターへの仮想リンクを表します。
type NeighborLink struct {
	LocalInterfaceIP  net.IP      // このルーター側のリンクIP
	RemoteRouterID    string      // 隣接ルーターのID
	RemoteInterfaceIP net.IP      // 隣接ルーター側のリンクIP
	ToNeighborChan    chan []byte // このルーターから隣接ルーターへのパケット送信用チャネル
	FromNeighborChan  chan []byte // 隣接ルーターからこのルーターへのパケット受信用チャネル
	Cost              int         // リンクコスト (OSPF用)
	// status // LinkUp, LinkDown
}

// NewRouter は新しい仮想ルーターインスタンスを作成します。
// ipNetStr は "10.0.1.1/24" のような形式。
func NewRouter(id string, ipNetStr string, mtu int) (*Router, error) {
	tunDev, err := CreateTUN()
	if err != nil {
		return nil, fmt.Errorf("router %s: failed to create TUN: %w", id, err)
	}
	log.Printf("Router %s: TUN device %s created.", id, tunDev.Name())

	err = ConfigureTUN(tunDev.Name(), ipNetStr, mtu)
	if err != nil {
		tunDev.Close()
		return nil, fmt.Errorf("router %s: failed to configure TUN %s: %w", id, tunDev.Name(), err)
	}
	log.Printf("Router %s: TUN device %s configured with %s, MTU %d.", id, tunDev.Name(), ipNetStr, mtu)

	parsedIP, parsedNet, err := net.ParseCIDR(ipNetStr)
	if err != nil {
		tunDev.Close()
		return nil, fmt.Errorf("router %s: failed to parse IPNet %s: %w", id, ipNetStr, err)
	}
	parsedNet.IP = parsedIP // net.ParseCIDR はネットワークアドレスを返すため、ホストアドレスを明示的にセット

	ctx, cancel := context.WithCancel(context.Background())

	r := &Router{
		ID:            id,
		TUNInterface:  tunDev,
		IPAddress:     *parsedNet,
		RoutingTable:  make([]*RoutingEntry, 0),
		NeighborLinks: make(map[string]*NeighborLink),
		PacketChan:    make(chan []byte, 256), // Buffer size can be tuned
		ctx:           ctx,
		cancelFunc:    cancel,
		isRunning:     false,
	}

	// 直接接続ルートを追加
	directRoute := &RoutingEntry{
		Destination: *parsedNet, // 自分自身のネットワーク
		Interface:   tunDev.Name(),
		Metric:      0,
		Type:        DirectRoute,
		NextHop:     nil, // 直接接続なのでNextHopは不要
	}
	r.AddRoute(directRoute)

	// Initialize OSPF instance for this router
	r.ospfInstance = NewOSPFInstance(r) // Create and assign OSPF instance

	log.Printf("Router %s: Initialized. IP: %s", id, r.IPAddress.String())
	return r, nil
}

// Start はルーターのパケット読み取りと処理を開始します。
func (r *Router) Start() error {
	if r.isRunning {
		return fmt.Errorf("router %s is already running", r.ID)
	}

	r.isRunning = true
	r.wg.Add(1) // For TUN reading goroutine

	// TUNデバイスからパケットを読み取るゴルーチン
	go func() {
		defer r.wg.Done()
		defer log.Printf("Router %s: TUN reading goroutine stopped.", r.ID)
		log.Printf("Router %s: Starting TUN reading goroutine for %s.", r.ID, r.TUNInterface.Name())

		buffer := make([]byte, DefaultMTU+100) // MTU + some header room
		for {
			select {
			case <-r.ctx.Done():
				return
			default:
				// Set a timeout for the read operation to allow context cancellation checking
				// This is a workaround as water.Interface.Read doesn't directly support context.
				// However, water's Read is blocking, so a direct timeout isn't simple.
				// For now, we rely on Stop() closing the TUNInterface, which should unblock Read.
				// A more robust solution might involve platform-specific non-blocking I/O
				// or using an intermediate goroutine that can be signaled.

				n, err := r.TUNInterface.Read(buffer)
				if err != nil {
					if r.ctx.Err() != nil { // Check if context was cancelled
						log.Printf("Router %s: TUN read cancelled: %v", r.ID, r.ctx.Err())
						return
					}
					// If the TUN device is closed by Stop(), Read might return an error.
					log.Printf("Router %s: Error reading from TUN %s: %v", r.ID, r.TUNInterface.Name(), err)
					// Consider whether to stop the router or just log and continue trying.
					// If TUN is closed by Stop(), this goroutine will exit soon.
					return // Stop on read error for now
				}
				if n > 0 {
					packet := make([]byte, n)
					copy(packet, buffer[:n])
					// log.Printf("Router %s: Read %d bytes from TUN %s", r.ID, n, r.TUNInterface.Name())
					// パケット処理ゴルーチンに送信 (非同期)
					go r.handlePacket(packet, r.TUNInterface.Name())
				}
			}
		}
	}()

	// NeighborLinkからのパケット受信と処理
	r.startNeighborLinkListeners()

	// Start OSPF instance if it exists
	if r.ospfInstance != nil {
		r.ospfInstance.Start()
	}

	log.Printf("Router %s: Started.", r.ID)
	return nil
}

// Stop はルーターを停止します。
func (r *Router) Stop() error {
	if !r.isRunning {
		return fmt.Errorf("router %s is not running", r.ID)
	}

	log.Printf("Router %s: Stopping...", r.ID)
	r.cancelFunc() // Signal all goroutines to stop

	// TUNデバイスをクローズすると、Read()がエラーを返してゴルーチンが終了するはず
	if err := r.TUNInterface.Close(); err != nil {
		log.Printf("Router %s: Error closing TUN device %s: %v", r.ID, r.TUNInterface.Name(), err)
		// Continue stopping other parts even if TUN close fails
	} else {
		log.Printf("Router %s: TUN device %s closed.", r.ID, r.TUNInterface.Name())
	}

	// OSPFインスタンスがあれば停止
	if r.ospfInstance != nil {
		r.ospfInstance.Stop()
		log.Printf("Router %s: OSPF instance stopped.", r.ID)
	}

	// Close neighbor link channels (from this router's perspective)
	r.neighborLinksMutex.Lock()
	for _, link := range r.NeighborLinks {
		if link.ToNeighborChan != nil {
			close(link.ToNeighborChan)
		}
		// FromNeighborChan is typically closed by the other end or when the link is removed.
	}
	r.neighborLinksMutex.Unlock()

	r.wg.Wait() // Wait for all goroutines to finish
	r.isRunning = false
	log.Printf("Router %s: Stopped.", r.ID)
	return nil
}

// AddRoute はルーティングテーブルにエントリを追加します。
func (r *Router) AddRoute(entry *RoutingEntry) {
	r.routingTableMutex.Lock()
	defer r.routingTableMutex.Unlock()
	// TODO: 同じ宛先のルートが既に存在する場合の処理 (更新または無視)
	r.RoutingTable = append(r.RoutingTable, entry)
	log.Printf("Router %s: Route added - Dest: %s, NextHop: %s, Iface: %s, Metric: %d, Type: %s",
		r.ID, entry.Destination.String(), entry.NextHop, entry.Interface, entry.Metric, entry.Type)
}

// RemoveRoute はルーティングテーブルからエントリを削除します。
// (単純な実装。より効率的な方法も検討可能)
func (r *Router) RemoveRoute(destNet net.IPNet) bool {
	r.routingTableMutex.Lock()
	defer r.routingTableMutex.Unlock()
	found := false
	newTable := make([]*RoutingEntry, 0, len(r.RoutingTable))
	for _, entry := range r.RoutingTable {
		if entry.Destination.String() == destNet.String() {
			found = true
			log.Printf("Router %s: Route removed - Dest: %s", r.ID, destNet.String())
		} else {
			newTable = append(newTable, entry)
		}
	}
	if found {
		r.RoutingTable = newTable
	}
	return found
}

// FindRoute は指定された宛先IPアドレスに一致するルートを検索します。
// 最長プレフィックスマッチを使用します。
func (r *Router) FindRoute(destIP net.IP) *RoutingEntry {
	r.routingTableMutex.RLock()
	defer r.routingTableMutex.RUnlock()

	var bestMatch *RoutingEntry
	longestMask := -1

	for _, entry := range r.RoutingTable {
		if entry.Destination.Contains(destIP) {
			ones, _ := entry.Destination.Mask.Size()
			if ones > longestMask {
				longestMask = ones
				bestMatch = entry
			}
		}
	}
	return bestMatch
}

// handlePacket は受信したIPパケットを処理します。
// sourceInterface はパケットを受信したインターフェース名 (TUNデバイス名 or 仮想リンクID)
func (r *Router) handlePacket(packet []byte, sourceInterface string) {
	if len(packet) < 20 { // IPv4ヘッダの最小長
		log.Printf("Router %s: Received short packet (%d bytes) from %s, discarding.", r.ID, len(packet), sourceInterface)
		return
	}

	// 宛先IPアドレスをパケットから抽出 (IPv4の場合)
	// 簡易的な抽出: IPヘッダの16-19バイト目が宛先IP
	destIP := net.IP(packet[16:20])
	// 送信元IPアドレス (デバッグ用)
	// srcIP := net.IP(packet[12:16])

	// log.Printf("Router %s: Packet received from %s. Src: %s, Dest: %s. Length: %d", r.ID, sourceInterface, srcIP, destIP, len(packet))

	// ルーター自身のIP宛かチェック (例: ping to router's TUN IP)
	if destIP.Equal(r.IPAddress.IP) {
		log.Printf("Router %s: Packet for self (%s) from %s. (Protocol: %d). Handling...", r.ID, destIP, sourceInterface, packet[9])
		// ICMP Echo Requestの場合、Echo Replyを返す
		protocol := packet[9]
		if protocol == ICMPProtocolNumber { // Protocol is ICMP
			// Check if it's an Echo Request by parsing ICMP header
			ipv4HeaderLen := int(packet[0]&0x0F) * 4
			if len(packet) > ipv4HeaderLen+8 { // Enough data for ICMP header (min 8 bytes for echo)
				icmpHeader, err := ParseICMPHeader(packet[ipv4HeaderLen:])
				if err == nil && icmpHeader.Type == ICMPEchoRequestType {
					log.Printf("Router %s: Received ICMP Echo Request from %s for self. Replying...", r.ID, sourceInterface)
					replyPkt, err := CreateICMPEchoReply(packet, r.IPAddress.IP)
					if err != nil {
						log.Printf("Router %s: Error creating ICMP Echo Reply: %v", r.ID, err)
						return
					}

					// 送信元インターフェースに応じて返送方法を決定
					if sourceInterface == r.TUNInterface.Name() {
						// TUNから来たのでTUNに書き出す (OSがルーティングする)
						// log.Printf("Router %s: Sending ICMP Echo Reply (len %d) to TUN %s (orig_src %s)", r.id, len(replyPkt), r.TUNInterface.Name(), net.IP(packet[12:16]))
						_, errWrite := r.TUNInterface.Write(replyPkt)
						if errWrite != nil {
							log.Printf("Router %s: Error writing ICMP Echo Reply to TUN: %v", r.ID, errWrite)
						}
					} else {
						// 仮想リンクから来たので、そのリンク経由で返す
						r.neighborLinksMutex.RLock()
						link, ok := r.NeighborLinks[sourceInterface] // sourceInterface is NeighborRouterID
						r.neighborLinksMutex.RUnlock()
						if ok {
							// log.Printf("Router %s: Sending ICMP Echo Reply (len %d) to neighbor %s (orig_src %s)", r.ID, len(replyPkt), link.RemoteRouterID, net.IP(packet[12:16]))
							select {
							case link.ToNeighborChan <- replyPkt:
							case <-time.After(1 * time.Second):
								log.Printf("Router %s: Timeout sending ICMP Echo Reply to neighbor %s", r.ID, link.RemoteRouterID)
							case <-r.ctx.Done():
								log.Printf("Router %s: Context done, not sending ICMP Echo Reply to neighbor %s", r.ID, link.RemoteRouterID)
							}
						} else {
							log.Printf("Router %s: Source interface %s for Echo Request not found in neighbor links. Cannot reply.", r.ID, sourceInterface)
						}
					}
					return // Handled ICMP Echo Request
				}
			}
		} else if protocol == 89 && r.ospfInstance != nil { // OSPF Protocol Number
			log.Printf("Router %s: Received OSPF packet (Proto 89) for self from %s. Passing to OSPF instance.", r.ID, sourceInterface)
			// OSPFパケットは通常、ルーターのリンクローカルアドレスや特定のOSPFマルチキャストアドレス宛。
			// ここでは、ルーターのTUN IP宛に来たOSPFパケットも処理対象とするか、
			// または、リンクIP宛に来たものを処理する。
			// OSPF LSAは通常、リンクの対向IP (NeighborLink.RemoteInterfaceIP) から来るので、
			// sourceInterface が neighborID の場合に、その neighbor の RemoteInterfaceIP を sourceIP として渡す。
			var sourceLinkIP net.IP
			if sourceInterface != r.TUNInterface.Name() { // From a neighbor link
				r.neighborLinksMutex.RLock()
				link, ok := r.NeighborLinks[sourceInterface]
				if ok {
					sourceLinkIP = link.RemoteInterfaceIP
				}
				r.neighborLinksMutex.RUnlock()
			}
			if sourceLinkIP == nil { // If from TUN or link not found, use packet's source IP
				sourceLinkIP = net.IP(packet[12:16]) // packet source IP
			}
			r.ospfInstance.HandleReceivedOSPFPacket(packet, sourceLinkIP, sourceInterface)
			return // Handled OSPF Packet
		}
		log.Printf("Router %s: Packet for self (%s) from %s. Protocol %d. Not an ICMP Echo Request or OSPF. Dropping.", r.ID, destIP, sourceInterface, protocol)
		return
	}

	// OSPFパケットでないか、またはルーター自身宛でない場合、通常の転送処理
	// ただし、隣接ルータから受信したOSPFパケット(宛先がマルチキャスト等)もここで処理する必要があるかもしれない。
	// ここでは、まず宛先が自分自身(TUN IP)であるOSPFパケットのみ上記で処理する。
	// リンクローカルなOSPFパケット(e.g. Hello)は、リンクのIP宛に来るため、上記のdestIP.Equal(r.IPAddress.IP)では通常ヒットしない。
	// なので、destIPチェックの前にプロトコル89をチェックする方が良いかもしれない。

	protocol := packet[9]
	if protocol == 89 && r.ospfInstance != nil {
		// OSPFパケットはルーティングテーブルで転送するのではなく、OSPFプロセスが処理する。
		// 宛先IPが自分自身でなくても、OSPF制御パケットならここで処理。
		log.Printf("Router %s: Received OSPF packet (Proto 89) from %s (Dest: %s). Passing to OSPF instance.", r.ID, sourceInterface, destIP)
		var sourceLinkIP net.IP
		if sourceInterface != r.TUNInterface.Name() { // From a neighbor link
			r.neighborLinksMutex.RLock()
			link, ok := r.NeighborLinks[sourceInterface]
			if ok {
				sourceLinkIP = link.RemoteInterfaceIP
			}
			r.neighborLinksMutex.RUnlock()
		}
		if sourceLinkIP == nil { // If from TUN or link not found, use packet's source IP
			sourceLinkIP = net.IP(packet[12:16]) // packet source IP
		}
		r.ospfInstance.HandleReceivedOSPFPacket(packet, sourceLinkIP, sourceInterface)
		return // Handled OSPF Packet, do not forward via routing table
	}

	// ルーティングテーブルでネクストホップを検索
	route := r.FindRoute(destIP)
	if route == nil {
		log.Printf("Router %s: No route found for destination %s (from %s). Packet dropped.", r.ID, destIP, sourceInterface)
		return
	}

	// log.Printf("Router %s: Routing packet for %s via NextHop: %s, Interface: %s", r.ID, destIP, route.NextHop, route.Interface)

	// パケット転送
	if route.Interface == r.TUNInterface.Name() { // TUNデバイスから外に出ていくパケット
		// 通常、直接接続のネットワーク宛の場合、NextHopは宛先IP自身かnil。
		// もしNextHopが設定されていて、それがTUNのネットワーク内にあるなら、ARP解決が必要だが、
		// TUNではレイヤ2ヘッダがないため、そのまま書き出す。
		// OSがARP解決などを行う。
		// log.Printf("Router %s: Forwarding packet (len %d) to %s out via TUN %s", r.ID, len(packet), destIP, r.TUNInterface.Name())
		_, err := r.TUNInterface.Write(packet)
		if err != nil {
			log.Printf("Router %s: Error writing packet to TUN %s: %v", r.ID, r.TUNInterface.Name(), err)
		}
	} else { // 仮想リンク経由で隣接ルーターに転送
		r.neighborLinksMutex.RLock()
		link, ok := r.NeighborLinks[route.Interface] // route.Interface が NeighborRouterID を示すように設計する場合
		r.neighborLinksMutex.RUnlock()

		if !ok {
			// もしroute.Interface が直接 link.RemoteRouterID を指さない場合、
			// NextHop IPアドレスから対応するリンクを見つけるロジックが必要。
			// ここでは、route.Interface が RemoteRouterID であると仮定する。
			// あるいは、NextHop IP からリンクを探す。
			// 今回はシンプルに、route.Interface == link.RemoteRouterID と扱うか、
			// または、NextHop IPが一致するリンクを探す。
			// ここでは NextHop IP に基づいて探すことにする。
			var targetLink *NeighborLink
			r.neighborLinksMutex.RLock()
			for _, l := range r.NeighborLinks {
				// NextHopが直接接続された隣接ルータのIPである場合
				if route.NextHop != nil && route.NextHop.Equal(l.RemoteInterfaceIP) {
					targetLink = l
					break
				}
			}
			r.neighborLinksMutex.RUnlock()

			if targetLink == nil {
				log.Printf("Router %s: No neighbor link found for NextHop %s (intended interface %s) for packet to %s. Packet dropped.", r.ID, route.NextHop, route.Interface, destIP)
				return
			}
			link = targetLink
		}

		// log.Printf("Router %s: Forwarding packet (len %d) to %s via neighbor %s (link cost %d)", r.ID, len(packet), destIP, link.RemoteRouterID, link.Cost)
		select {
		case link.ToNeighborChan <- packet:
			// Successfully sent
		case <-time.After(1 * time.Second): // Timeout to prevent blocking indefinitely
			log.Printf("Router %s: Timeout sending packet to neighbor %s for dest %s", r.ID, link.RemoteRouterID, destIP)
		case <-r.ctx.Done():
			log.Printf("Router %s: Context done, not sending packet to neighbor %s", r.ID, link.RemoteRouterID)
		}
	}
}

// AddNeighborLink は隣接ルーターへの仮想リンクをセットアップします。
// toNeighborChanは、このルーターからneighborIDのルーターへパケットを送信するためのチャネル。
// fromNeighborChanは、neighborIDのルーターからこのルーターがパケットを受信するためのチャネル。
func (r *Router) AddNeighborLink(
	localIP, remoteIP net.IP, // リンクの両端のIP。CIDRではなく単一IP。
	neighborID string,
	toNeighborChan chan []byte,
	fromNeighborChan chan []byte,
	cost int,
) error {
	log.Printf("Router %s: AddNeighborLink: Attempting to add link to %s (Local: %s, Remote: %s, Cost: %d)", r.ID, neighborID, localIP, remoteIP, cost)
	r.neighborLinksMutex.Lock() // Lock at the beginning

	if _, exists := r.NeighborLinks[neighborID]; exists {
		r.neighborLinksMutex.Unlock() // Unlock before returning error
		log.Printf("Router %s: AddNeighborLink: Link to neighbor %s already exists. Aborting add.", r.ID, neighborID)
		return fmt.Errorf("router %s: link to neighbor %s already exists", r.ID, neighborID)
	}

	// Keep a reference to the link to be used after unlocking
	link := &NeighborLink{
		LocalInterfaceIP:  localIP,
		RemoteRouterID:    neighborID,
		RemoteInterfaceIP: remoteIP,
		ToNeighborChan:    toNeighborChan,
		FromNeighborChan:  fromNeighborChan,
		Cost:              cost,
	}
	r.NeighborLinks[neighborID] = link
	log.Printf("Router %s: AddNeighborLink: Successfully added neighbor link struct to %s.", r.ID, neighborID)

	// Unlock neighborLinksMutex before operations that don't directly need it or might lock other things
	r.neighborLinksMutex.Unlock()

	// Add a direct route for the immediate neighbor's link IP
	// This is done after unlocking neighborLinksMutex as AddRoute has its own lock.
	destNetForNeighborLink := net.IPNet{IP: remoteIP, Mask: net.CIDRMask(32, 32)} // Host route to neighbor's link IP
	r.AddRoute(&RoutingEntry{                                                     // AddRoute itself handles locking r.routingTableMutex
		Destination: destNetForNeighborLink,
		NextHop:     remoteIP,
		Interface:   neighborID,
		Metric:      cost,
		Type:        DirectRoute,
	})

	// Prepare flags for operations to be done after this point
	notifyOSPF := r.ospfInstance != nil
	listenerShouldStart := r.isRunning

	if listenerShouldStart {
		log.Printf("Router %s: AddNeighborLink: Router is running. Preparing to start listener goroutine for neighbor %s.", r.ID, neighborID)
		r.wg.Add(1)
		go r.listenToNeighbor(link) // 'link' is captured by the closure
		log.Printf("Router %s: AddNeighborLink: Listener goroutine for neighbor %s launched.", r.ID, neighborID)
	} else {
		log.Printf("Router %s: AddNeighborLink: Router is NOT running. Listener goroutine for %s NOT launched.", r.ID, neighborID)
	}

	if notifyOSPF {
		log.Printf("Router %s: AddNeighborLink: Notifying OSPF about link up to %s (after lock release and other ops).", r.ID, neighborID)
		r.ospfInstance.HandleLinkUp(neighborID, cost, localIP, remoteIP)
	}

	log.Printf("Router %s: AddNeighborLink: Finished adding link to %s.", r.ID, neighborID)
	return nil
}

// RemoveNeighborLink は隣接ルーターへの仮想リンクを削除します。
func (r *Router) RemoveNeighborLink(neighborID string) error {
	r.neighborLinksMutex.Lock()
	// Note: fromNeighborChan should be closed by the entity that created/owns it,
	// or its sender side needs to handle closed channel errors.
	// Closing ToNeighborChan is generally safe for the sender side here.
	link, exists := r.NeighborLinks[neighborID]
	if exists {
		if link.ToNeighborChan != nil {
			close(link.ToNeighborChan)
		}
		// fromNeighborChan is read by this router, so it doesn't close it.
		// The goroutine reading from it will exit when the channel is closed by the other side or stops sending.
		delete(r.NeighborLinks, neighborID)
	}
	r.neighborLinksMutex.Unlock()

	if !exists {
		return fmt.Errorf("router %s: link to neighbor %s not found", r.ID, neighborID)
	}

	// OSPFが有効な場合、リンクダウンを通知
	if r.ospfInstance != nil {
		// OSPFにリンクダウンを通知する処理 (例: LSA更新トリガー)
		r.ospfInstance.HandleLinkDown(neighborID, link.RemoteInterfaceIP)
	}

	// 関連するルートを削除 (このリンクを経由していたもの)
	// これは複雑になる可能性がある。単純にこのインターフェースを使うルートをすべて消すか、
	// OSPFに任せるか。ここでは、OSPFが再計算することを期待し、
	// DirectRouteのみ削除する。
	r.routingTableMutex.Lock()
	newTable := make([]*RoutingEntry, 0)
	for _, route := range r.RoutingTable {
		if route.Interface == neighborID && route.Type == DirectRoute { // Remove direct routes for this link
			log.Printf("Router %s: Removing direct route via link %s: Dest %s", r.ID, neighborID, route.Destination.String())
		} else {
			newTable = append(newTable, route)
		}
	}
	r.RoutingTable = newTable
	r.routingTableMutex.Unlock()

	log.Printf("Router %s: Removed neighbor link to %s", r.ID, neighborID)
	return nil
}

// startNeighborLinkListeners はすべての隣接リンクリスナーを開始します。
func (r *Router) startNeighborLinkListeners() {
	r.neighborLinksMutex.RLock()
	defer r.neighborLinksMutex.RUnlock()

	log.Printf("Router %s: Starting neighbor link listeners for %d links.", r.ID, len(r.NeighborLinks))
	for _, link := range r.NeighborLinks {
		r.wg.Add(1)
		go r.listenToNeighbor(link)
	}
}

// listenToNeighbor は特定の隣接ルーターからのパケットを受信して処理します。
func (r *Router) listenToNeighbor(link *NeighborLink) {
	defer r.wg.Done()
	log.Printf("Router %s: listenToNeighbor: Goroutine STARTING for neighbor %s.", r.ID, link.RemoteRouterID)
	defer log.Printf("Router %s: listenToNeighbor: Goroutine STOPPING for neighbor %s (via its FromNeighborChan).", r.ID, link.RemoteRouterID)
	// log.Printf("Router %s: Starting listener for packets from neighbor %s.", r.ID, link.RemoteRouterID) // Original log, can be removed or kept

	for {
		select {
		case <-r.ctx.Done():
			log.Printf("Router %s: listenToNeighbor: Context cancelled for neighbor %s. Exiting goroutine.", r.ID, link.RemoteRouterID)
			return
		case packet, ok := <-link.FromNeighborChan:
			// log.Printf("Router %s: listenToNeighbor: Received from FromNeighborChan for %s (ok: %t)", r.ID, link.RemoteRouterID, ok) // Debug log
			if !ok {
				log.Printf("Router %s: listenToNeighbor: FromNeighborChan for neighbor %s CLOSED. Exiting goroutine.", r.ID, link.RemoteRouterID)
				// Potentially trigger link down processing if not already handled by RemoveNeighborLink
				// For now, just exit the goroutine.
				return
			}
			if len(packet) > 0 {
				// log.Printf("Router %s: Received %d bytes from neighbor %s via channel.", r.ID, len(packet), link.RemoteRouterID)
				log.Printf("Router %s: listenToNeighbor: Packet (len %d) received from neighbor %s. Dispatching to handlePacket.", r.ID, len(packet), link.RemoteRouterID)
				go r.handlePacket(packet, link.RemoteRouterID) // sourceInterface is neighborID
			} else {
				log.Printf("Router %s: listenToNeighbor: Empty packet (or nil) received from neighbor %s. Ignoring.", r.ID, link.RemoteRouterID)
			}
		}
	}
}

// GetLinkCost は指定された隣接ルーターIDへのリンクコストを返します。
func (r *Router) GetLinkCost(neighborID string) (int, bool) {
	r.neighborLinksMutex.RLock()
	defer r.neighborLinksMutex.RUnlock()
	link, ok := r.NeighborLinks[neighborID]
	if !ok {
		return 0, false
	}
	return link.Cost, true
}

// GetSelfIP はルーター自身のTUNインターフェースのIPアドレスを返します。
func (r *Router) GetSelfIP() net.IP {
	return r.IPAddress.IP
}

// GetNeighborLinks returns a copy of the neighbor links map.
func (r *Router) GetNeighborLinks() map[string]*NeighborLink {
	log.Printf("Router %s: GetNeighborLinks START.", r.ID)
	r.neighborLinksMutex.RLock()
	defer r.neighborLinksMutex.RUnlock()
	// Create a copy to avoid race conditions if the caller modifies the map
	// or if the map is modified by another goroutine while the caller is using it.
	linksCopy := make(map[string]*NeighborLink, len(r.NeighborLinks))
	for id, link := range r.NeighborLinks {
		linksCopy[id] = link // Shallow copy of pointer is fine for read-only use by OSPF
	}
	log.Printf("Router %s: GetNeighborLinks FINISHED, returning %d links.", r.ID, len(linksCopy))
	return linksCopy
}

// GetRoutingTable returns a copy of the routing table.
func (r *Router) GetRoutingTable() []*RoutingEntry {
	r.routingTableMutex.RLock()
	defer r.routingTableMutex.RUnlock()
	tableCopy := make([]*RoutingEntry, len(r.RoutingTable))
	for i, entry := range r.RoutingTable {
		// Create a copy of the entry to avoid external modification issues
		entryCopy := *entry
		tableCopy[i] = &entryCopy
	}
	return tableCopy
}

// TUNIPNetString returns the TUN IP address and mask in CIDR string format (e.g., "10.0.1.1/24")
func (r *Router) TUNIPNetString() string {
	if r.TUNInterface == nil { // Should not happen if router is initialized
		return "N/A"
	}
	ones, _ := r.IPAddress.Mask.Size()
	return fmt.Sprintf("%s/%d", r.IPAddress.IP.String(), ones)
}

// IsRunning checks if the router is currently active.
func (r *Router) IsRunning() bool {
	return r.isRunning
}

// OSPFEnabled checks if OSPF is configured and running for this router.
func (r *Router) OSPFEnabled() bool {
	return r.ospfInstance != nil // For now, just checks if instance exists. Could check a status field later.
}

// GetFormattedNeighborLinks returns a slice of neighbor links formatted for display.
func (r *Router) GetFormattedNeighborLinks() []FormattedNeighborLink {
	r.neighborLinksMutex.RLock()
	defer r.neighborLinksMutex.RUnlock()

	links := make([]FormattedNeighborLink, 0, len(r.NeighborLinks))

	for neighborID, nl := range r.NeighborLinks {
		if nl == nil {
			continue
		}
		links = append(links, FormattedNeighborLink{
			LocalRouterID: r.ID,
			NeighborID:    neighborID,
			Cost:          nl.Cost,
			LocalLinkIP:   "N/A", // Placeholder, needs enhancement
			RemoteLinkIP:  "N/A", // Placeholder, needs enhancement
		})
	}

	sort.Slice(links, func(i, j int) bool {
		return links[i].NeighborID < links[j].NeighborID
	})

	return links
}

// SetOSPFInstance sets the OSPF instance for the router.
// This is typically called by NewOSPFInstance.
func (r *Router) SetOSPFInstance(ospf *OSPFInstance) {
	r.ospfInstance = ospf
}

// GetOSPFInstance returns the OSPF instance associated with the router.
func (r *Router) GetOSPFInstance() *OSPFInstance {
	return r.ospfInstance
}

// GetID returns the router's ID. This implements IRouter.
func (r *Router) GetID() string {
	return r.ID
}

// GetRoutingTableForDisplay はルーティングテーブルを画面表示用に整形して返します。
// 例: map["10.0.2.0/24"] = "via 10.0.100.2 (eth0, OSPF, Metric: 20)"
func (r *Router) GetRoutingTableForDisplay() []RoutingTableEntryForDisplay {
	r.routingTableMutex.RLock()
	defer r.routingTableMutex.RUnlock()
	displayTable := make([]RoutingTableEntryForDisplay, 0, len(r.RoutingTable))
	for _, entry := range r.RoutingTable {
		var nextHopIP string
		if entry.NextHop != nil {
			nextHopIP = entry.NextHop.String()
		} else {
			nextHopIP = "-"
		}
		displayTable = append(displayTable, RoutingTableEntryForDisplay{
			DestinationCIDR: entry.Destination.String(),
			NextHop:         nextHopIP,
			Cost:            entry.Metric,
			InterfaceName:   entry.Interface,
		})
	}
	return displayTable
}

// SimulatePing checks if a destination IP is reachable based on the routing table
// and returns a simulated RTT if successful.
func (r *Router) SimulatePing(destinationIPStr string) (bool, int, string, error) {
	r.routingTableMutex.RLock()
	defer r.routingTableMutex.RUnlock()

	destIP := net.ParseIP(destinationIPStr)
	if destIP == nil {
		return false, 0, "", fmt.Errorf("invalid destination IP address format: %s", destinationIPStr)
	}

	// Check direct connections first (local subnet)
	ipNet := &net.IPNet{IP: r.IPAddress.IP, Mask: r.IPAddress.Mask}
	if ipNet.Contains(destIP) {
		if destIP.Equal(r.IPAddress.IP) { // Ping self
			return true, 1, fmt.Sprintf("Pong from %s (self)", r.IPAddress.IP.String()), nil
		}
		r.neighborLinksMutex.RLock()
		foundOnLink := false
		var neighborRouterID string
		for _, nl := range r.NeighborLinks {
			if nl.RemoteInterfaceIP.Equal(destIP) {
				foundOnLink = true
				neighborRouterID = nl.RemoteRouterID
				break
			}
		}
		r.neighborLinksMutex.RUnlock()
		if foundOnLink {
			rtt := rand.Intn(10) + 1 // 1-10 ms for very close direct link
			return true, rtt, fmt.Sprintf("Pong from %s (neighbor %s on direct link)", destinationIPStr, neighborRouterID), nil
		}
		// If not a direct neighbor IP, but on local subnet, treat as reachable with small RTT.
		// This might be too simplistic, but ok for now.
		// return true, rand.Intn(5) + 1, fmt.Sprintf("Pong from %s (local subnet)", destIPStr), nil
		// Fall through to routing table lookup, as OSPF routes might be more specific or preferred.
	}

	var bestMatch *RoutingEntry
	for _, entry := range r.RoutingTable {
		if entry.Destination.Contains(destIP) {
			if bestMatch == nil {
				bestMatch = entry
			} else {
				// Check if current entry has a more specific subnet mask
				currentMaskLen, _ := entry.Destination.Mask.Size()
				bestMatchMaskLen, _ := bestMatch.Destination.Mask.Size()
				if currentMaskLen > bestMatchMaskLen {
					bestMatch = entry
				}
			}
		}
	}

	if bestMatch != nil {
		// Simulate RTT based on metric (e.g., metric * 2ms, plus some randomness)
		baseRtt := bestMatch.Metric * 2   // Arbitrary calculation
		randomJitter := rand.Intn(10)     // Add some jitter (0-9ms)
		rtt := baseRtt + randomJitter + 1 // Ensure RTT is at least 1
		if rtt < 1 {
			rtt = 1
		}
		if rtt > 500 {
			rtt = 500
		} // Cap RTT

		message := fmt.Sprintf("Pong from %s, NextHop: %s, Interface: %s, Metric: %d",
			destinationIPStr,
			bestMatch.NextHop.String(),
			bestMatch.Interface,
			bestMatch.Metric)
		return true, rtt, message, nil
	}

	return false, 0, "Destination host unreachable", nil
}

type RoutingTableEntryForDisplay struct {
	DestinationCIDR string `json:"destinationCidr"`
	NextHop         string `json:"nextHop"`
	Cost            int    `json:"cost"`
	InterfaceName   string `json:"interfaceName"`
}

type RouterDataForDetailDisplay struct {
	ID                     string                        `json:"id"`
	IPAddress              string                        `json:"ipAddress"`
	Gateway                string                        `json:"gateway"`
	MTU                    int                           `json:"mtu"`
	IsRunning              bool                          `json:"isRunning"`
	RoutingTableForDisplay []RoutingTableEntryForDisplay `json:"routingTable"`
	LSDBInfo               []LSAForDisplay               `json:"lsdb"`
}

// GetLSDBForRouterDisplay fetches LSDB info from the OSPF instance.
func (r *Router) GetLSDBForRouterDisplay() []LSAForDisplay {
	if r.ospfInstance == nil {
		log.Printf("Router %s: OSPF instance is nil, cannot get LSDB for display.", r.ID)
		return []LSAForDisplay{}
	}
	return r.ospfInstance.GetLSDBForDisplay()
}
