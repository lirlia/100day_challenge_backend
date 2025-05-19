package router

import (
	"sync"
	"log"
)

// ルーターID型
type RouterID string

// ルーター本体
type Router struct {
	ID         RouterID
	Name       string
	IP         string
	Links      map[RouterID]*Link // 接続しているリンク
	RoutingTbl map[string]string  // 宛先IP→NextHopIP
	inbox      chan Packet        // 受信パケットチャネル
	quit       chan struct{}      // 終了通知
	Tun        *TunDevice         // TUNデバイス
	OSPF       *OSPFState         // OSPF状態
}

// ルーター間リンク
type Link struct {
	PeerID   RouterID
	Outbox   chan Packet // このリンク経由で送るパケット
}

// パケット（簡易）
type Packet struct {
	SrcIP string
	DstIP string
	Data  []byte
}

// ルーター管理マネージャ
type RouterManager struct {
	Routers map[RouterID]*Router
	mu      sync.RWMutex
}

// ルーター生成
func (m *RouterManager) AddRouter(id RouterID, name, ip string) *Router {
	m.mu.Lock()
	defer m.mu.Unlock()

	tun, err := NewTunDevice("utun10")
	if err != nil {
		log.Printf("TUNデバイス作成失敗: %v", err)
		return nil
	}

	r := &Router{
		ID:         id,
		Name:       name,
		IP:         ip,
		Links:      make(map[RouterID]*Link),
		RoutingTbl: make(map[string]string),
		inbox:      make(chan Packet, 32),
		quit:       make(chan struct{}),
		Tun:        tun,
	}
	r.InitOSPF()
	m.Routers[id] = r
	go r.run() // goroutine起動
	return r
}

// ルーター削除
func (m *RouterManager) RemoveRouter(id RouterID) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.Routers[id]
	if ok {
		close(r.quit)
		if r.Tun != nil {
			r.Tun.Close()
		}
		delete(m.Routers, id)
	}
}

// ルーターgoroutine本体
func (r *Router) run() {
	// TUNデバイス→inbox
	go func() {
		buf := make([]byte, 1500)
		for {
			select {
			case <-r.quit:
				return
			default:
				n, err := r.Tun.ReadPacket(buf)
				if err != nil {
					log.Printf("TUN読込エラー: %v", err)
					continue
				}
				pkt := Packet{SrcIP: r.IP, DstIP: "", Data: append([]byte{}, buf[:n]...)}
				r.inbox <- pkt
			}
		}
	}()
	// inbox→TUNデバイス
	go func() {
		for {
			select {
			case pkt := <-r.inbox:
				if pkt.Data != nil {
					_, err := r.Tun.WritePacket(pkt.Data)
					if err != nil {
						log.Printf("TUN書込エラー: %v", err)
					}
				}
			case <-r.quit:
				return
			}
		}
	}()
	// メインループ（リンク経由のパケット処理など）
	for {
		select {
		case pkt := <-r.inbox:
			// ルーティングテーブルに従って転送
			if nextHop, ok := r.RoutingTbl[pkt.DstIP]; ok {
				for peerID, link := range r.Links {
					if string(peerID) == nextHop {
						link.Outbox <- pkt
						break
					}
				}
			} else {
				log.Printf("ルーティング不可: dst=%s", pkt.DstIP)
			}
		case <-r.quit:
			return
		}
	}
}

// RouterManagerの初期化
func NewRouterManager() *RouterManager {
	return &RouterManager{
		Routers: make(map[RouterID]*Router),
	}
}

// ルーター間リンク追加
func (m *RouterManager) AddLink(id1, id2 RouterID) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r1, ok1 := m.Routers[id1]
	r2, ok2 := m.Routers[id2]
	if !ok1 || !ok2 {
		return
	}
	ch1 := make(chan Packet, 32)
	ch2 := make(chan Packet, 32)
	r1.Links[id2] = &Link{PeerID: id2, Outbox: ch1}
	r2.Links[id1] = &Link{PeerID: id1, Outbox: ch2}
	// 双方向転送goroutine
	go func() {
		for pkt := range ch1 {
			r2.inbox <- pkt
		}
	}()
	go func() {
		for pkt := range ch2 {
			r1.inbox <- pkt
		}
	}()
}

// ルーター間リンク削除
func (m *RouterManager) RemoveLink(id1, id2 RouterID) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r1, ok1 := m.Routers[id1]
	r2, ok2 := m.Routers[id2]
	if ok1 {
		if l, ok := r1.Links[id2]; ok {
			close(l.Outbox)
			delete(r1.Links, id2)
		}
	}
	if ok2 {
		if l, ok := r2.Links[id1]; ok {
			close(l.Outbox)
			delete(r2.Links, id1)
		}
	}
}

// Routerのinboxチャネルを返すメソッド
func (r *Router) Inbox() <-chan Packet {
	return r.inbox
}

// Routerのinboxチャネルにパケットを送信するメソッド
func (r *Router) SendPacket(pkt Packet) {
	r.inbox <- pkt
}

// 送信可能なinboxチャネルを返す
func (r *Router) InboxWritable() chan<- Packet {
	return r.inbox
}

// 静的ルート設定
func (r *Router) SetStaticRoute(dstIP, nextHop string) {
	r.RoutingTbl[dstIP] = nextHop
}
