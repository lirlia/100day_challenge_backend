package router

import (
	"encoding/json"
	"fmt"
	"log"
	"math/rand"
	"net"
	"os"
	"sync"
	"time"
)

// RouterManager 複数のルーターとそれらの間のリンクを管理する構造体
type RouterManager struct {
	Routers map[string]*Router      // ルーターの集合 (キーはルーターID)
	Links   map[string]*Link        // リンクの集合 (キーはリンクID)
	Config  *NetworkConfiguration   // ネットワーク構成
	mu      sync.RWMutex            // 並行アクセス用ミューテックス
}

// NetworkConfiguration ネットワーク構成を表す構造体
type NetworkConfiguration struct {
	Routers []RouterConfig     `json:"routers"`     // ルーター設定
	Links   []LinkConfig       `json:"links"`       // リンク設定
	Routes  []StaticRouteConfig `json:"routes"`     // 静的ルート設定
}

// RouterConfig ルーター設定を表す構造体
type RouterConfig struct {
	ID          string              `json:"id"`           // ルーターID
	Name        string              `json:"name"`         // ルーター名
	RIPEnabled  bool                `json:"rip_enabled"`  // RIPが有効かどうか
	Interfaces  []InterfaceConfig   `json:"interfaces"`   // インターフェース設定
}

// InterfaceConfig インターフェース設定を表す構造体
type InterfaceConfig struct {
	Name       string `json:"name"`        // インターフェース名
	IPAddress  string `json:"ip_address"`  // IPアドレス
	SubnetMask string `json:"subnet_mask"` // サブネットマスク
}

// LinkConfig リンク設定を表す構造体
type LinkConfig struct {
	ID          string `json:"id"`          // リンクID
	Bandwidth   int    `json:"bandwidth"`   // 帯域幅 (kbps)
	Latency     int    `json:"latency"`     // レイテンシ (ms)
	DropRate    float64 `json:"drop_rate"`  // パケットドロップ率 (0.0-1.0)
	Endpoint1   LinkEndpointConfig `json:"endpoint1"` // エンドポイント1
	Endpoint2   LinkEndpointConfig `json:"endpoint2"` // エンドポイント2
}

// LinkEndpointConfig リンクエンドポイント設定を表す構造体
type LinkEndpointConfig struct {
	RouterID      string `json:"router_id"`       // ルーターID
	InterfaceName string `json:"interface_name"`  // インターフェース名
}

// StaticRouteConfig 静的ルート設定を表す構造体
type StaticRouteConfig struct {
	RouterID    string `json:"router_id"`     // ルーターID
	Network     string `json:"network"`      // ネットワークアドレス
	SubnetMask  string `json:"subnet_mask"`  // サブネットマスク
	NextHop     string `json:"next_hop"`     // ネクストホップ
	Metric      int    `json:"metric"`       // メトリック
}

// NewRouterManager 新しいルーターマネージャーを作成する
func NewRouterManager(configFile string) (*RouterManager, error) {
	rm := &RouterManager{
		Routers: make(map[string]*Router),
		Links:   make(map[string]*Link),
	}

	// 設定ファイルから構成を読み込む
	config, err := loadNetworkConfiguration(configFile)
	if err != nil {
		// デフォルト設定を使用
		log.Printf("設定ファイルの読み込みに失敗したため、デフォルト構成を使用します: %v", err)
		config = createDefaultConfiguration()
	}

	rm.Config = config

	// 設定に基づいてルーターとリンクを作成
	if err := rm.createRoutersFromConfig(); err != nil {
		return nil, fmt.Errorf("ルーターの作成に失敗: %v", err)
	}

	if err := rm.createLinksFromConfig(); err != nil {
		return nil, fmt.Errorf("リンクの作成に失敗: %v", err)
	}

	if err := rm.configureStaticRoutesFromConfig(); err != nil {
		return nil, fmt.Errorf("静的ルートの設定に失敗: %v", err)
	}

	return rm, nil
}

// 設定ファイルからネットワーク構成を読み込む
func loadNetworkConfiguration(configFile string) (*NetworkConfiguration, error) {
	data, err := os.ReadFile(configFile)
	if err != nil {
		return nil, err
	}

	var config NetworkConfiguration
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}

	return &config, nil
}

// デフォルトのネットワーク構成を作成
func createDefaultConfiguration() *NetworkConfiguration {
	return &NetworkConfiguration{
		Routers: []RouterConfig{
			{
				ID:         "r1",
				Name:       "ルーター1",
				RIPEnabled: true,
				Interfaces: []InterfaceConfig{
					{Name: "eth0", IPAddress: "192.168.1.1", SubnetMask: "255.255.255.0"},
					{Name: "eth1", IPAddress: "10.0.0.1", SubnetMask: "255.255.255.0"},
				},
			},
			{
				ID:         "r2",
				Name:       "ルーター2",
				RIPEnabled: true,
				Interfaces: []InterfaceConfig{
					{Name: "eth0", IPAddress: "10.0.0.2", SubnetMask: "255.255.255.0"},
					{Name: "eth1", IPAddress: "10.0.1.1", SubnetMask: "255.255.255.0"},
				},
			},
			{
				ID:         "r3",
				Name:       "ルーター3",
				RIPEnabled: true,
				Interfaces: []InterfaceConfig{
					{Name: "eth0", IPAddress: "10.0.1.2", SubnetMask: "255.255.255.0"},
					{Name: "eth1", IPAddress: "192.168.2.1", SubnetMask: "255.255.255.0"},
				},
			},
		},
		Links: []LinkConfig{
			{
				ID:        "l1",
				Bandwidth: 1000,
				Latency:   10,
				DropRate:  0.01,
				Endpoint1: LinkEndpointConfig{RouterID: "r1", InterfaceName: "eth1"},
				Endpoint2: LinkEndpointConfig{RouterID: "r2", InterfaceName: "eth0"},
			},
			{
				ID:        "l2",
				Bandwidth: 1000,
				Latency:   10,
				DropRate:  0.01,
				Endpoint1: LinkEndpointConfig{RouterID: "r2", InterfaceName: "eth1"},
				Endpoint2: LinkEndpointConfig{RouterID: "r3", InterfaceName: "eth0"},
			},
		},
		Routes: []StaticRouteConfig{},
	}
}

// 設定からルーターを作成
func (rm *RouterManager) createRoutersFromConfig() error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	for _, routerConfig := range rm.Config.Routers {
		router := NewRouter(routerConfig.ID, routerConfig.Name)
		router.RIPEnabled = routerConfig.RIPEnabled

		// インターフェースの設定
		for _, ifConfig := range routerConfig.Interfaces {
			ip := net.ParseIP(ifConfig.IPAddress)
			if ip == nil {
				return fmt.Errorf("無効なIPアドレス: %s", ifConfig.IPAddress)
			}

			mask := net.IPMask(net.ParseIP(ifConfig.SubnetMask).To4())
			if mask == nil {
				return fmt.Errorf("無効なサブネットマスク: %s", ifConfig.SubnetMask)
			}

			if err := router.AddInterface(ifConfig.Name, ip, mask); err != nil {
				return err
			}
		}

		rm.Routers[routerConfig.ID] = router
	}

	return nil
}

// 設定からリンクを作成
func (rm *RouterManager) createLinksFromConfig() error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	for _, linkConfig := range rm.Config.Links {
		// エンドポイントのルーターとインターフェースを取得
		router1, ok := rm.Routers[linkConfig.Endpoint1.RouterID]
		if !ok {
			return fmt.Errorf("ルーター %s が見つかりません", linkConfig.Endpoint1.RouterID)
		}

		router2, ok := rm.Routers[linkConfig.Endpoint2.RouterID]
		if !ok {
			return fmt.Errorf("ルーター %s が見つかりません", linkConfig.Endpoint2.RouterID)
		}

		iface1, ok := router1.Interfaces[linkConfig.Endpoint1.InterfaceName]
		if !ok {
			return fmt.Errorf("インターフェース %s がルーター %s に見つかりません",
				linkConfig.Endpoint1.InterfaceName, linkConfig.Endpoint1.RouterID)
		}

		iface2, ok := router2.Interfaces[linkConfig.Endpoint2.InterfaceName]
		if !ok {
			return fmt.Errorf("インターフェース %s がルーター %s に見つかりません",
				linkConfig.Endpoint2.InterfaceName, linkConfig.Endpoint2.RouterID)
		}

		// リンクの作成
		link := &Link{
			ID:        linkConfig.ID,
			Bandwidth: linkConfig.Bandwidth,
			Latency:   (time.Duration(linkConfig.Latency) * time.Millisecond),
			DropRate:  linkConfig.DropRate,
			IsUp:      true,
			Endpoint1: &LinkEndpoint{
				RouterID:      linkConfig.Endpoint1.RouterID,
				InterfaceName: linkConfig.Endpoint1.InterfaceName,
			},
			Endpoint2: &LinkEndpoint{
				RouterID:      linkConfig.Endpoint2.RouterID,
				InterfaceName: linkConfig.Endpoint2.InterfaceName,
			},
			packetCh: make(chan Packet, 1000),
			stopCh:   make(chan struct{}),
		}

		// インターフェースとリンクを相互に関連付け
		iface1.RemoteLink = link
		iface2.RemoteLink = link

		rm.Links[linkConfig.ID] = link
	}

	return nil
}

// 設定から静的ルートを設定
func (rm *RouterManager) configureStaticRoutesFromConfig() error {
	for _, routeConfig := range rm.Config.Routes {
		router, ok := rm.Routers[routeConfig.RouterID]
		if !ok {
			return fmt.Errorf("静的ルート設定のルーター %s が見つかりません", routeConfig.RouterID)
		}

		network := net.ParseIP(routeConfig.Network)
		if network == nil {
			return fmt.Errorf("無効なネットワークアドレス: %s", routeConfig.Network)
		}

		mask := net.IPMask(net.ParseIP(routeConfig.SubnetMask).To4())
		if mask == nil {
			return fmt.Errorf("無効なサブネットマスク: %s", routeConfig.SubnetMask)
		}

		nextHop := net.ParseIP(routeConfig.NextHop)
		if nextHop == nil {
			return fmt.Errorf("無効なネクストホップアドレス: %s", routeConfig.NextHop)
		}

		// 出力インターフェースを決定（ネクストホップIPから最適なインターフェースを選択）
		var ifaceName string
		for name, iface := range router.Interfaces {
			ifaceNet := getNetwork(iface.IPAddress, iface.SubnetMask)
			if containsIP(ifaceNet, iface.SubnetMask, nextHop) {
				ifaceName = name
				break
			}
		}

		if ifaceName == "" {
			return fmt.Errorf("ネクストホップ %s に到達できるインターフェースが見つかりません", routeConfig.NextHop)
		}

		router.RoutingTable.AddRoute(network, mask, nextHop, ifaceName, routeConfig.Metric)
	}

	return nil
}

// Start すべてのルーターとリンクを起動する
func (rm *RouterManager) Start() error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	// すべてのリンクを起動
	for _, link := range rm.Links {
		rm.startLinkPacketProcessor(link)
	}

	// すべてのルーターを起動
	for _, router := range rm.Routers {
		if err := router.Start(); err != nil {
			return err
		}
	}

	log.Println("すべてのルーターとリンクを起動しました")
	return nil
}

// Stop すべてのルーターとリンクを停止する
func (rm *RouterManager) Stop() {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	// すべてのルーターを停止
	for _, router := range rm.Routers {
		router.Stop()
	}

	// すべてのリンクを停止
	for _, link := range rm.Links {
		close(link.stopCh)
		link.wg.Wait()
	}

	log.Println("すべてのルーターとリンクを停止しました")
}

// リンクのパケット処理を開始
func (rm *RouterManager) startLinkPacketProcessor(link *Link) {
	link.wg.Add(1)
	go func() {
		defer link.wg.Done()

		for {
			select {
			case <-link.stopCh:
				return
			case packet := <-link.packetCh:
				if !link.IsUp {
					// リンクがダウンしている場合はパケットを破棄
					continue
				}

				// パケットのドロップシミュレーション
				if link.DropRate > 0 && rand.Float64() < link.DropRate {
					log.Printf("リンク %s でパケットをドロップしました: %v -> %v",
						link.ID, packet.SourceIP, packet.DestinationIP)
					continue
				}

				// レイテンシシミュレーション
				if link.Latency > 0 {
					time.Sleep(link.Latency)
				}

				// パケットの転送先（相手側）のルーターとインターフェースを特定
				var targetRouterID string

				if packet.SourceRouter == link.Endpoint1.RouterID {
					// Endpoint1 -> Endpoint2 の方向
					targetRouterID = link.Endpoint2.RouterID
					// ここでは変数を使用しないためコメントアウト
					// targetInterfaceName = link.Endpoint2.InterfaceName
				} else {
					// Endpoint2 -> Endpoint1 の方向
					targetRouterID = link.Endpoint1.RouterID
					// ここでは変数を使用しないためコメントアウト
					// targetInterfaceName = link.Endpoint1.InterfaceName
				}

				// 転送先のルーターにパケットを配信
				if router, ok := rm.Routers[targetRouterID]; ok {
					router.forwardingQueue <- packet
				}
			}
		}
	}()
}

// GetLinkStatus リンクの状態を取得
func (rm *RouterManager) GetLinkStatus(linkID string) (bool, error) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	link, ok := rm.Links[linkID]
	if !ok {
		return false, fmt.Errorf("リンク %s が見つかりません", linkID)
	}

	return link.IsUp, nil
}

// SetLinkStatus リンクの状態を設定
func (rm *RouterManager) SetLinkStatus(linkID string, isUp bool) error {
	rm.mu.Lock()
	defer rm.mu.Unlock()

	link, ok := rm.Links[linkID]
	if !ok {
		return fmt.Errorf("リンク %s が見つかりません", linkID)
	}

	link.IsUp = isUp
	return nil
}

// GetRouter ルーターを取得
func (rm *RouterManager) GetRouter(routerID string) (*Router, error) {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	router, ok := rm.Routers[routerID]
	if !ok {
		return nil, fmt.Errorf("ルーター %s が見つかりません", routerID)
	}

	return router, nil
}

// GetAllRouters すべてのルーターを取得
func (rm *RouterManager) GetAllRouters() map[string]*Router {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	// ディープコピーではなく参照を返す（呼び出し側で書き込み操作をしないことを前提）
	return rm.Routers
}

// GetAllLinks すべてのリンクを取得
func (rm *RouterManager) GetAllLinks() map[string]*Link {
	rm.mu.RLock()
	defer rm.mu.RUnlock()

	// ディープコピーではなく参照を返す（呼び出し側で書き込み操作をしないことを前提）
	return rm.Links
}

// SendPacket ルーターからパケットを送信する（シミュレーション用）
func (rm *RouterManager) SendPacket(routerID string, packet Packet) error {
	rm.mu.RLock()
	router, ok := rm.Routers[routerID]
	rm.mu.RUnlock()

	if !ok {
		return fmt.Errorf("ルーター %s が見つかりません", routerID)
	}

	// パケットに送信元ルーターIDを設定
	packet.SourceRouter = routerID

	// パケットをルーターのキューに入れる
	router.forwardingQueue <- packet

	return nil
}
