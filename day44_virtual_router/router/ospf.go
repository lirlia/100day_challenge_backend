package router

import (
	"sync"
)

// OSPF風 LSA
type LSA struct {
	Origin   RouterID
	Seq      uint64
	Links    map[RouterID]struct{} // 接続先
}

// OSPF状態
type OSPFState struct {
	LSDB map[RouterID]*LSA
	mu   sync.RWMutex
}

// ルーターにOSPF状態を追加
func (r *Router) InitOSPF() {
	if r.OSPF == nil {
		r.OSPF = &OSPFState{LSDB: make(map[RouterID]*LSA)}
	}
}

// LSA生成・伝播（雛形）
func (r *Router) FloodLSA() {
	// TODO: LSA生成・隣接ルーターに送信
}

// LSA受信処理（雛形）
func (r *Router) ReceiveLSA(lsa *LSA) {
	// TODO: LSA受信・LSDB更新
}

// Dijkstra法でルーティングテーブル再計算（雛形）
func (r *Router) RecalculateRouting() {
	// TODO: LSDBから最短経路計算
}

// 全ルーターでLSAをFloodする（雛形）
func (m *RouterManager) FloodAllLSA() {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for _, r := range m.Routers {
		go r.FloodLSA()
	}
}
