package router

import (
	"fmt"
	"log"
	"net"
	"sync"
	"time"
)

// Router 仮想ルーターを表す構造体
type Router struct {
	ID               string                // ルーターの一意識別子
	Name             string                // ルーターの表示名
	Interfaces       map[string]*Interface // インターフェース（リンク）の集合
	RoutingTable     *RoutingTable         // ルーティングテーブル
	RIPEnabled       bool                  // RIPが有効かどうか
	forwardingQueue  chan Packet           // 転送パケットのキュー
	stopCh           chan struct{}         // 停止シグナル
	wg               sync.WaitGroup        // 同期用WaitGroup
	mu               sync.RWMutex          // 並行アクセス用ミューテックス
	PacketStatistics *PacketStatistics     // パケット統計情報
}

// Interface ルーターのインターフェースを表す構造体
type Interface struct {
	Name       string    // インターフェース名
	IPAddress  net.IP    // IPアドレス
	SubnetMask net.IPMask // サブネットマスク
	IsUp       bool      // インターフェースが稼働中かどうか
	MTU        int       // MTU (Maximum Transmission Unit)
	RemoteLink *Link     // 接続先のリンク
}

// Link ルーター間の仮想リンクを表す構造体
type Link struct {
	ID          string          // リンクの一意識別子
	Bandwidth   int             // 帯域幅 (kbps)
	Latency     time.Duration   // レイテンシ
	DropRate    float64         // パケットドロップ率 (0.0-1.0)
	IsUp        bool            // リンクが稼働中かどうか
	Endpoint1   *LinkEndpoint   // リンクのエンドポイント1
	Endpoint2   *LinkEndpoint   // リンクのエンドポイント2
	packetCh    chan Packet     // パケット転送用チャネル
	stopCh      chan struct{}   // 停止シグナル
	wg          sync.WaitGroup  // 同期用WaitGroup
}

// LinkEndpoint リンクのエンドポイントを表す構造体
type LinkEndpoint struct {
	RouterID        string   // ルーターID
	InterfaceName   string   // インターフェース名
}

// Packet 転送するパケットを表す構造体
type Packet struct {
	SourceIP      net.IP    // 送信元IPアドレス
	DestinationIP net.IP    // 宛先IPアドレス
	TTL           int       // TTL (Time To Live)
	Protocol      int       // プロトコル番号
	Length        int       // パケット長
	Payload       []byte    // パケットのペイロード
	SourceRouter  string    // 送信元ルーターID (シミュレーション用)
	NextHop       string    // 次ホップのIPアドレス (シミュレーション用)
}

// PacketStatistics パケット統計情報を表す構造体
type PacketStatistics struct {
	Received    int     // 受信パケット数
	Sent        int     // 送信パケット数
	Forwarded   int     // 転送パケット数
	Dropped     int     // 廃棄パケット数
	mu          sync.RWMutex // 並行アクセス用ミューテックス
}

// NewRouter 新しいルーターを作成する
func NewRouter(id, name string) *Router {
	return &Router{
		ID:               id,
		Name:             name,
		Interfaces:       make(map[string]*Interface),
		RoutingTable:     NewRoutingTable(),
		RIPEnabled:       false,
		forwardingQueue:  make(chan Packet, 1000),
		stopCh:           make(chan struct{}),
		PacketStatistics: &PacketStatistics{},
	}
}

// Start ルーターを起動する
func (r *Router) Start() error {
	log.Printf("ルーター %s (%s) を起動しています...", r.Name, r.ID)

	// パケット転送ゴルーチンを開始
	r.wg.Add(1)
	go r.forwardPackets()

	// RIPが有効ならRIPゴルーチンを開始
	if r.RIPEnabled {
		r.wg.Add(1)
		go r.ripProcess()
	}

	return nil
}

// Stop ルーターを停止する
func (r *Router) Stop() {
	log.Printf("ルーター %s (%s) を停止しています...", r.Name, r.ID)
	close(r.stopCh)
	r.wg.Wait()
}

// AddInterface ルーターにインターフェースを追加する
func (r *Router) AddInterface(name string, ip net.IP, mask net.IPMask) error {
	r.mu.Lock()
	defer r.mu.Unlock()

	if _, exists := r.Interfaces[name]; exists {
		return fmt.Errorf("インターフェース %s は既に存在します", name)
	}

	r.Interfaces[name] = &Interface{
		Name:       name,
		IPAddress:  ip,
		SubnetMask: mask,
		IsUp:       true,
		MTU:        1500,
	}

	// このインターフェースのネットワークを直接接続としてルーティングテーブルに追加
	network := getNetwork(ip, mask)
	r.RoutingTable.AddRoute(network, mask, nil, name, 0)

	return nil
}

// 簡単な実装のため、パケット転送関数とRIPプロセス関数は仮の実装
func (r *Router) forwardPackets() {
	defer r.wg.Done()

	for {
		select {
		case <-r.stopCh:
			return
		case pkt := <-r.forwardingQueue:
			// パケットの転送処理（後で実装）
			r.PacketStatistics.Forwarded++
			// パケットが使用されていることを示す
			_ = pkt
		}
	}
}

func (r *Router) ripProcess() {
	defer r.wg.Done()

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.stopCh:
			return
		case <-ticker.C:
			// RIPの処理（後で実装）
		}
	}
}

// ヘルパー関数: IPアドレスとサブネットマスクからネットワークアドレスを取得
func getNetwork(ip net.IP, mask net.IPMask) net.IP {
	network := make(net.IP, len(ip))
	for i := range ip {
		network[i] = ip[i] & mask[i]
	}
	return network
}
