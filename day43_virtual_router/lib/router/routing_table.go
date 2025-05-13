package router

import (
	"fmt"
	"net"
	"sort"
	"sync"
	"time"
)

// RouteEntry ルーティングテーブルのエントリを表す構造体
type RouteEntry struct {
	Network      net.IP      // ネットワークアドレス
	SubnetMask   net.IPMask  // サブネットマスク
	NextHop      net.IP      // ネクストホップIPアドレス (nil の場合は直接接続)
	Interface    string      // 出力インターフェース名
	Metric       int         // メトリック (経路コスト)
	Source       RouteSource // 経路の情報源
	LastUpdated  time.Time   // 最終更新時刻
	IsStatic     bool        // 静的ルートかどうか
	AdminDistance int        // 管理距離 (複数のソースがある場合の優先度)
}

// RouteSource 経路情報の取得元
type RouteSource int

const (
	RouteSourceDirect RouteSource = iota // 直接接続
	RouteSourceStatic                    // 静的設定
	RouteSourceRIP                       // RIPプロトコル
)

// RoutingTable ルーティングテーブルを表す構造体
type RoutingTable struct {
	routes []*RouteEntry  // ルートエントリのスライス
	mu     sync.RWMutex   // 並行アクセス用ミューテックス
}

// NewRoutingTable 新しいルーティングテーブルを作成する
func NewRoutingTable() *RoutingTable {
	return &RoutingTable{
		routes: make([]*RouteEntry, 0),
	}
}

// AddRoute ルーティングテーブルにルートを追加する
func (rt *RoutingTable) AddRoute(network net.IP, mask net.IPMask, nextHop net.IP, iface string, metric int) *RouteEntry {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	// すでに同じネットワークへのルートがあるか確認
	for i, route := range rt.routes {
		if route.Network.Equal(network) && maskEqual(route.SubnetMask, mask) {
			// 既存のルートを更新
			if nextHop != nil && !route.NextHop.Equal(nextHop) {
				rt.routes[i].NextHop = nextHop
			}
			if iface != "" && route.Interface != iface {
				rt.routes[i].Interface = iface
			}
			if metric < route.Metric || (nextHop != nil && !route.NextHop.Equal(nextHop)) {
				rt.routes[i].Metric = metric
			}
			rt.routes[i].LastUpdated = time.Now()
			return rt.routes[i]
		}
	}

	// 新しいルートを作成
	source := RouteSourceStatic
	adminDistance := 1
	if nextHop == nil {
		source = RouteSourceDirect
		adminDistance = 0
	}

	entry := &RouteEntry{
		Network:       network,
		SubnetMask:    mask,
		NextHop:       nextHop,
		Interface:     iface,
		Metric:        metric,
		Source:        source,
		LastUpdated:   time.Now(),
		IsStatic:      true,
		AdminDistance: adminDistance,
	}

	rt.routes = append(rt.routes, entry)
	rt.sortRoutes() // マスク長でソート

	return entry
}

// RemoveRoute ルーティングテーブルからルートを削除する
func (rt *RoutingTable) RemoveRoute(network net.IP, mask net.IPMask) bool {
	rt.mu.Lock()
	defer rt.mu.Unlock()

	for i, route := range rt.routes {
		if route.Network.Equal(network) && maskEqual(route.SubnetMask, mask) {
			// このルートを削除
			rt.routes = append(rt.routes[:i], rt.routes[i+1:]...)
			return true
		}
	}

	return false // ルートが見つからなかった
}

// Lookup 特定の宛先IPアドレスに最適なルートを検索する
func (rt *RoutingTable) Lookup(destIP net.IP) *RouteEntry {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	var bestMatch *RouteEntry
	var bestMatchMaskBits int

	for _, route := range rt.routes {
		if containsIP(route.Network, route.SubnetMask, destIP) {
			// このルートは宛先をカバーしている
			maskBits, _ := route.SubnetMask.Size()
			if bestMatch == nil || maskBits > bestMatchMaskBits {
				bestMatch = route
				bestMatchMaskBits = maskBits
			} else if maskBits == bestMatchMaskBits && route.Metric < bestMatch.Metric {
				// 同じマスク長ならメトリックが小さい方を選択
				bestMatch = route
			}
		}
	}

	return bestMatch
}

// GetRoutes ルーティングテーブルのすべてのルートを取得する
func (rt *RoutingTable) GetRoutes() []*RouteEntry {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	// スライスをコピーして返す
	routes := make([]*RouteEntry, len(rt.routes))
	copy(routes, rt.routes)

	return routes
}

// String ルーティングテーブルを文字列形式で表示する
func (rt *RoutingTable) String() string {
	rt.mu.RLock()
	defer rt.mu.RUnlock()

	result := "ネットワーク\t\tマスク\t\tNextHop\t\tインターフェース\tメトリック\tソース\n"
	result += "----------------------------------------------------------------------------------------------------------------------\n"

	for _, route := range rt.routes {
		nextHop := "直接接続"
		if route.NextHop != nil {
			nextHop = route.NextHop.String()
		}

		source := "直接"
		switch route.Source {
		case RouteSourceStatic:
			source = "静的"
		case RouteSourceRIP:
			source = "RIP"
		}

		result += fmt.Sprintf("%s\t%s\t%s\t%s\t\t%d\t\t%s\n",
			route.Network, net.IP(route.SubnetMask).String(), nextHop, route.Interface, route.Metric, source)
	}

	return result
}

// sortRoutes ルートをサブネットマスクの長さでソートする（最長一致優先）
func (rt *RoutingTable) sortRoutes() {
	sort.Slice(rt.routes, func(i, j int) bool {
		maskI, _ := rt.routes[i].SubnetMask.Size()
		maskJ, _ := rt.routes[j].SubnetMask.Size()
		return maskI > maskJ // マスク長が長い方が優先
	})
}

// ヘルパー関数

// maskEqual 2つのサブネットマスクが等しいかどうかを確認
func maskEqual(mask1, mask2 net.IPMask) bool {
	if len(mask1) != len(mask2) {
		return false
	}
	for i := range mask1 {
		if mask1[i] != mask2[i] {
			return false
		}
	}
	return true
}

// containsIP ネットワークがIPアドレスを含むかどうかを確認
func containsIP(network net.IP, mask net.IPMask, ip net.IP) bool {
	// IPアドレスとネットワークアドレスのバージョンが一致するか確認
	if len(network) != len(ip) {
		return false
	}

	for i := 0; i < len(network); i++ {
		if network[i]&mask[i] != ip[i]&mask[i] {
			return false
		}
	}
	return true
}
