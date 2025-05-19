package router

import (
	"context"
	"fmt"
	"log"
	"net"
	"sync"
	"time"

	"github.com/songgao/water"
)

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

// Router は仮想ルーターを表します。
type Router struct {
	ID                 string
	TUNInterface       *water.Interface
	IPAddress          net.IPNet // TUNデバイスのIP/マスク
	RoutingTable       []*RoutingEntry
	routingTableMutex  sync.RWMutex
	NeighborLinks      map[string]*NeighborLink // key: NeighborRouterID
	neighborLinksMutex sync.RWMutex
	PacketChan         chan []byte // TUNデバイスから読み取ったパケットを受信
	ctx                context.Context
	cancelFunc         context.CancelFunc
	wg                 sync.WaitGroup
	IsRunning          bool
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
		IsRunning:     false,
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

	log.Printf("Router %s: Initialized. IP: %s", id, r.IPAddress.String())
	return r, nil
}

// Start はルーターのパケット読み取りと処理を開始します。
func (r *Router) Start() error {
	if r.IsRunning {
		return fmt.Errorf("router %s is already running", r.ID)
	}

	r.IsRunning = true
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

	log.Printf("Router %s: Started.", r.ID)
	return nil
}

// Stop はルーターを停止します。
func (r *Router) Stop() error {
	if !r.IsRunning {
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
	r.IsRunning = false
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
		if packet[9] == ICMPProtocolNumber { // Protocol is ICMP
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
						// log.Printf("Router %s: Sending ICMP Echo Reply (len %d) to TUN %s (orig_src %s)", r.ID, len(replyPkt), r.TUNInterface.Name(), net.IP(packet[12:16]))
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
		}
		log.Printf("Router %s: Packet for self (%s) from %s. Protocol %d. Not an ICMP Echo Request or failed to parse. Dropping.", r.ID, destIP, sourceInterface, packet[9])
		return
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
	r.neighborLinksMutex.Lock()
	defer r.neighborLinksMutex.Unlock()

	if _, exists := r.NeighborLinks[neighborID]; exists {
		return fmt.Errorf("router %s: link to neighbor %s already exists", r.ID, neighborID)
	}

	link := &NeighborLink{
		LocalInterfaceIP:  localIP,
		RemoteRouterID:    neighborID,
		RemoteInterfaceIP: remoteIP,
		ToNeighborChan:    toNeighborChan,
		FromNeighborChan:  fromNeighborChan,
		Cost:              cost,
	}
	r.NeighborLinks[neighborID] = link

	// 隣接ルータへの直接ルートを追加 (ネクストホップは隣接ルータのリンクIP)
	// 宛先は隣接ルータのTUNデバイスIPネットワークではなく、隣接ルータのリンクIP単体とするか、
	// または、隣接ルータのTUNデバイスのネットワーク全体へのルートとするか。
	// 通常、ポイントツーポイントリンクでは、相手のIPへのホストルートができる。
	// ここでは、相手のTUNのIPアドレスへのルートを、このリンク経由で追加するイメージ。
	// より一般的には、リンクの対向IPアドレスへの直接接続ルートを追加する。
	// OSPFが有効なら、OSPFがネットワークルートを広告する。

	// Add a direct route for the immediate neighbor's link IP
	// This helps in reaching the neighbor itself over this link.
	destNetForNeighborLink := net.IPNet{IP: remoteIP, Mask: net.CIDRMask(32, 32)} // Host route to neighbor's link IP
	r.AddRoute(&RoutingEntry{
		Destination: destNetForNeighborLink,
		NextHop:     remoteIP,
		Interface:   neighborID, // interface is the neighbor router ID for link
		Metric:      cost,
		Type:        DirectRoute,
	})

	log.Printf("Router %s: Added neighbor link to %s (Local: %s, Remote: %s, Cost: %d)", r.ID, neighborID, localIP, remoteIP, cost)

	// Start listener for this specific link if router is running
	if r.IsRunning {
		r.wg.Add(1)
		go r.listenToNeighbor(link)
	}

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
	defer log.Printf("Router %s: Listener for neighbor %s (via its FromNeighborChan) stopped.", r.ID, link.RemoteRouterID)
	log.Printf("Router %s: Starting listener for packets from neighbor %s.", r.ID, link.RemoteRouterID)

	for {
		select {
		case <-r.ctx.Done():
			return
		case packet, ok := <-link.FromNeighborChan:
			if !ok {
				log.Printf("Router %s: FromNeighborChan for neighbor %s closed.", r.ID, link.RemoteRouterID)
				// Potentially trigger link down processing if not already handled by RemoveNeighborLink
				// For now, just exit the goroutine.
				return
			}
			if len(packet) > 0 {
				// log.Printf("Router %s: Received %d bytes from neighbor %s via channel.", r.ID, len(packet), link.RemoteRouterID)
				go r.handlePacket(packet, link.RemoteRouterID) // sourceInterface is neighborID
			}
		}
	}
}

// SetOSPFInstance はOSPFインスタンスをルーターに設定します。
func (r *Router) SetOSPFInstance(ospf *OSPFInstance) {
	r.ospfInstance = ospf
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

// GetNeighborLinks は現在の隣接リンクのコピーを返します。
func (r *Router) GetNeighborLinks() map[string]*NeighborLink {
	r.neighborLinksMutex.RLock()
	defer r.neighborLinksMutex.RUnlock()
	linksCopy := make(map[string]*NeighborLink, len(r.NeighborLinks))
	for id, link := range r.NeighborLinks {
		linksCopy[id] = link // Shallow copy of link pointer
	}
	return linksCopy
}

// GetRoutingTable は現在のルーティングテーブルのコピーを返します。
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
