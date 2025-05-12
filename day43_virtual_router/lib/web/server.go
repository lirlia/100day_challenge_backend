package web

import (
	"fmt"
	"html/template"
	"log"
	"net"
	"net/http"
	"path/filepath"
	"strconv"
	"time"

	"github.com/lirlia/100day_challenge_backend/day43_virtual_router/lib/router"
)

// Server Webサーバーを表す構造体
type Server struct {
	Port          int                 // サーバーのポート
	RouterManager *router.RouterManager // ルーターマネージャー
	templates     *template.Template  // HTMLテンプレート
}

// PageData テンプレートに渡すデータ
type PageData struct {
	Title          string                  // ページタイトル
	Routers        map[string]*router.Router // ルーター
	Links          map[string]*router.Link    // リンク
	SelectedRouter string                 // 選択されたルーターID
	Message        string                 // メッセージ (エラーや成功通知)
	TimeStamp      string                 // タイムスタンプ
}

// NewServer 新しいWebサーバーを作成する
func NewServer(port int, rm *router.RouterManager) *Server {
	return &Server{
		Port:          port,
		RouterManager: rm,
	}
}

// Start Webサーバーを起動する
func (s *Server) Start() error {
	// HTMLテンプレートを読み込む
	var err error
	s.templates, err = template.ParseGlob("web/templates/*.html")
	if err != nil {
		return fmt.Errorf("テンプレートの読み込みに失敗: %v", err)
	}

	// 静的ファイルのハンドラを設定
	http.Handle("/static/", http.StripPrefix("/static/", http.FileServer(http.Dir("web/static"))))

	// APIエンドポイントのハンドラを設定
	http.HandleFunc("/api/routers", s.handleGetRouters)
	http.HandleFunc("/api/links", s.handleGetLinks)
	http.HandleFunc("/api/router/", s.handleGetRouter)
	http.HandleFunc("/api/link/status", s.handleSetLinkStatus)
	http.HandleFunc("/api/route/add", s.handleAddRoute)
	http.HandleFunc("/api/route/delete", s.handleDeleteRoute)
	http.HandleFunc("/api/ping", s.handlePing)

	// ページのハンドラを設定
	http.HandleFunc("/", s.handleIndex)
	http.HandleFunc("/router/", s.handleRouterDetail)
	http.HandleFunc("/topology", s.handleTopology)

	// サーバーを起動
	addr := fmt.Sprintf(":%d", s.Port)
	log.Printf("Webサーバーを %s で起動します", addr)
	return http.ListenAndServe(addr, nil)
}

// renderTemplate テンプレートをレンダリングする
func (s *Server) renderTemplate(w http.ResponseWriter, tmpl string, data PageData) {
	if s.templates == nil {
		http.Error(w, "テンプレートが初期化されていません", http.StatusInternalServerError)
		return
	}

	// タイムスタンプを設定
	data.TimeStamp = time.Now().Format("2006/01/02 15:04:05")

	if err := s.templates.ExecuteTemplate(w, tmpl+".html", data); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

// handleIndex インデックスページのハンドラ
func (s *Server) handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	routers := s.RouterManager.GetAllRouters()
	links := s.RouterManager.GetAllLinks()

	data := PageData{
		Title:   "Day43 - 仮想ルーターシミュレーター",
		Routers: routers,
		Links:   links,
	}

	s.renderTemplate(w, "index", data)
}

// handleRouterDetail ルーター詳細ページのハンドラ
func (s *Server) handleRouterDetail(w http.ResponseWriter, r *http.Request) {
	// URLからルーターIDを取得 (/router/r1 -> r1)
	routerID := filepath.Base(r.URL.Path)
	router, err := s.RouterManager.GetRouter(routerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	routers := s.RouterManager.GetAllRouters()
	links := s.RouterManager.GetAllLinks()

	data := PageData{
		Title:          fmt.Sprintf("ルーター: %s (%s)", router.Name, router.ID),
		Routers:        routers,
		Links:          links,
		SelectedRouter: routerID,
	}

	s.renderTemplate(w, "router_detail", data)
}

// handleTopology トポロジーページのハンドラ
func (s *Server) handleTopology(w http.ResponseWriter, r *http.Request) {
	routers := s.RouterManager.GetAllRouters()
	links := s.RouterManager.GetAllLinks()

	data := PageData{
		Title:   "ネットワークトポロジー",
		Routers: routers,
		Links:   links,
	}

	s.renderTemplate(w, "topology", data)
}

// APIハンドラ

// handleGetRouters ルーター一覧を取得するAPIハンドラ
func (s *Server) handleGetRouters(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	routers := s.RouterManager.GetAllRouters()
	routerList := make([]map[string]interface{}, 0, len(routers))

	for id, router := range routers {
		routerData := map[string]interface{}{
			"id":          id,
			"name":        router.Name,
			"rip_enabled": router.RIPEnabled,
			"interfaces":  make([]map[string]interface{}, 0, len(router.Interfaces)),
		}

		for ifName, iface := range router.Interfaces {
			ifaceData := map[string]interface{}{
				"name":        ifName,
				"ip_address":  iface.IPAddress.String(),
				"subnet_mask": net.IP(iface.SubnetMask).String(),
				"is_up":       iface.IsUp,
			}
			routerData["interfaces"] = append(routerData["interfaces"].([]map[string]interface{}), ifaceData)
		}

		routerList = append(routerList, routerData)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"routers": %s}`, marshalJSON(routerList))
}

// handleGetLinks リンク一覧を取得するAPIハンドラ
func (s *Server) handleGetLinks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	links := s.RouterManager.GetAllLinks()
	linkList := make([]map[string]interface{}, 0, len(links))

	for id, link := range links {
		linkData := map[string]interface{}{
			"id":        id,
			"bandwidth": link.Bandwidth,
			"latency":   link.Latency.Milliseconds(),
			"drop_rate": link.DropRate,
			"is_up":     link.IsUp,
			"endpoint1": map[string]string{
				"router_id":      link.Endpoint1.RouterID,
				"interface_name": link.Endpoint1.InterfaceName,
			},
			"endpoint2": map[string]string{
				"router_id":      link.Endpoint2.RouterID,
				"interface_name": link.Endpoint2.InterfaceName,
			},
		}
		linkList = append(linkList, linkData)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"links": %s}`, marshalJSON(linkList))
}

// handleGetRouter 特定のルーター情報を取得するAPIハンドラ
func (s *Server) handleGetRouter(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// URLからルーターIDを取得 (/api/router/r1 -> r1)
	routerID := filepath.Base(r.URL.Path)
	router, err := s.RouterManager.GetRouter(routerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// ルーティングテーブル情報を取得
	routes := router.RoutingTable.GetRoutes()
	routeList := make([]map[string]interface{}, 0, len(routes))

	for _, route := range routes {
		nextHop := "直接接続"
		if route.NextHop != nil {
			nextHop = route.NextHop.String()
		}

		source := "直接"
		switch route.Source {
		case router.RouteSourceDirect:
			source = "直接"
		case router.RouteSourceStatic:
			source = "静的"
		case router.RouteSourceRIP:
			source = "RIP"
		}

		routeData := map[string]interface{}{
			"network":         route.Network.String(),
			"subnet_mask":     net.IP(route.SubnetMask).String(),
			"next_hop":        nextHop,
			"interface":       route.Interface,
			"metric":          route.Metric,
			"source":          source,
			"admin_distance":  route.AdminDistance,
			"last_updated":    route.LastUpdated.Format(time.RFC3339),
		}
		routeList = append(routeList, routeData)
	}

	// インターフェース情報
	interfaces := make(map[string]interface{})
	for name, iface := range router.Interfaces {
		ifaceData := map[string]interface{}{
			"name":        name,
			"ip_address":  iface.IPAddress.String(),
			"subnet_mask": net.IP(iface.SubnetMask).String(),
			"is_up":       iface.IsUp,
			"mtu":         iface.MTU,
		}
		interfaces[name] = ifaceData
	}

	// パケット統計情報
	stats := map[string]interface{}{
		"received":  router.PacketStatistics.Received,
		"sent":      router.PacketStatistics.Sent,
		"forwarded": router.PacketStatistics.Forwarded,
		"dropped":   router.PacketStatistics.Dropped,
	}

	// レスポンスデータの作成
	responseData := map[string]interface{}{
		"id":           router.ID,
		"name":         router.Name,
		"rip_enabled":  router.RIPEnabled,
		"interfaces":   interfaces,
		"routes":       routeList,
		"statistics":   stats,
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, "%s", marshalJSON(responseData))
}

// handleSetLinkStatus リンクの状態を設定するAPIハンドラ
func (s *Server) handleSetLinkStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// フォームパラメータの解析
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	linkID := r.Form.Get("link_id")
	if linkID == "" {
		http.Error(w, "link_id is required", http.StatusBadRequest)
		return
	}

	isUpStr := r.Form.Get("is_up")
	isUp := isUpStr == "true"

	// リンク状態の更新
	if err := s.RouterManager.SetLinkStatus(linkID, isUp); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// リダイレクト元が設定されていればそこにリダイレクト
	referer := r.Header.Get("Referer")
	if referer != "" {
		http.Redirect(w, r, referer, http.StatusSeeOther)
		return
	}

	// リダイレクト元が不明な場合はJSONレスポンス
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"success": true, "message": "Link status updated"}`)
}

// handleAddRoute 静的ルートを追加するAPIハンドラ
func (s *Server) handleAddRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// フォームパラメータの解析
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	routerID := r.Form.Get("router_id")
	if routerID == "" {
		http.Error(w, "router_id is required", http.StatusBadRequest)
		return
	}

	router, err := s.RouterManager.GetRouter(routerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	network := net.ParseIP(r.Form.Get("network"))
	if network == nil {
		http.Error(w, "Invalid network address", http.StatusBadRequest)
		return
	}

	mask := net.IPMask(net.ParseIP(r.Form.Get("subnet_mask")).To4())
	if mask == nil {
		http.Error(w, "Invalid subnet mask", http.StatusBadRequest)
		return
	}

	nextHop := net.ParseIP(r.Form.Get("next_hop"))
	if nextHop == nil {
		http.Error(w, "Invalid next hop address", http.StatusBadRequest)
		return
	}

	metric, err := strconv.Atoi(r.Form.Get("metric"))
	if err != nil {
		metric = 1 // デフォルト値
	}

	// インターフェースを決定（ネクストホップIPから最適なインターフェースを選択）
	var ifaceName string
	for name, iface := range router.Interfaces {
		ifaceNet := getNetwork(iface.IPAddress, iface.SubnetMask)
		if containsIP(ifaceNet, iface.SubnetMask, nextHop) {
			ifaceName = name
			break
		}
	}

	if ifaceName == "" {
		http.Error(w, "Next hop is not reachable via any interface", http.StatusBadRequest)
		return
	}

	// ルートの追加
	router.RoutingTable.AddRoute(network, mask, nextHop, ifaceName, metric)

	// リダイレクト元が設定されていればそこにリダイレクト
	referer := r.Header.Get("Referer")
	if referer != "" {
		http.Redirect(w, r, referer, http.StatusSeeOther)
		return
	}

	// リダイレクト元が不明な場合はJSONレスポンス
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"success": true, "message": "Route added"}`)
}

// handleDeleteRoute 静的ルートを削除するAPIハンドラ
func (s *Server) handleDeleteRoute(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// フォームパラメータの解析
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	routerID := r.Form.Get("router_id")
	if routerID == "" {
		http.Error(w, "router_id is required", http.StatusBadRequest)
		return
	}

	router, err := s.RouterManager.GetRouter(routerID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	network := net.ParseIP(r.Form.Get("network"))
	if network == nil {
		http.Error(w, "Invalid network address", http.StatusBadRequest)
		return
	}

	mask := net.IPMask(net.ParseIP(r.Form.Get("subnet_mask")).To4())
	if mask == nil {
		http.Error(w, "Invalid subnet mask", http.StatusBadRequest)
		return
	}

	// ルートの削除
	if !router.RoutingTable.RemoveRoute(network, mask) {
		http.Error(w, "Route not found", http.StatusNotFound)
		return
	}

	// リダイレクト元が設定されていればそこにリダイレクト
	referer := r.Header.Get("Referer")
	if referer != "" {
		http.Redirect(w, r, referer, http.StatusSeeOther)
		return
	}

	// リダイレクト元が不明な場合はJSONレスポンス
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"success": true, "message": "Route deleted"}`)
}

// handlePing Pingパケットを送信するAPIハンドラ（シミュレーション用）
func (s *Server) handlePing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// フォームパラメータの解析
	if err := r.ParseForm(); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	sourceRouterID := r.Form.Get("source_router")
	if sourceRouterID == "" {
		http.Error(w, "source_router is required", http.StatusBadRequest)
		return
	}

	destIP := net.ParseIP(r.Form.Get("destination_ip"))
	if destIP == nil {
		http.Error(w, "Invalid destination IP", http.StatusBadRequest)
		return
	}

	// 送信元ルーターを取得
	router, err := s.RouterManager.GetRouter(sourceRouterID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}

	// 送信元IPアドレスを取得（最初のインターフェースのIPを使用）
	var sourceIP net.IP
	for _, iface := range router.Interfaces {
		if iface.IsUp {
			sourceIP = iface.IPAddress
			break
		}
	}

	if sourceIP == nil {
		http.Error(w, "No active interface found", http.StatusInternalServerError)
		return
	}

	// ICMPエコーリクエストパケットを作成（シミュレーション用）
	packet := router.Packet{
		SourceIP:      sourceIP,
		DestinationIP: destIP,
		TTL:           64,
		Protocol:      1, // ICMP
		Length:        84,
		Payload:       []byte("PING"),
	}

	// パケットを送信
	if err := s.RouterManager.SendPacket(sourceRouterID, packet); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// リダイレクト元が設定されていればそこにリダイレクト
	referer := r.Header.Get("Referer")
	if referer != "" {
		http.Redirect(w, r, referer, http.StatusSeeOther)
		return
	}

	// リダイレクト元が不明な場合はJSONレスポンス
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"success": true, "message": "Ping sent"}`)
}

// ヘルパー関数

// marshalJSON JSONにシリアライズする補助関数
func marshalJSON(v interface{}) string {
	// 簡易的な実装（実際にはencodingパッケージを使用する方が良い）
	// ここでは単純化のために、直接整形して返す
	switch val := v.(type) {
	case []map[string]interface{}:
		jsonStr := "["
		for i, item := range val {
			if i > 0 {
				jsonStr += ","
			}
			jsonStr += "{"
			j := 0
			for k, v := range item {
				if j > 0 {
					jsonStr += ","
				}
				jsonStr += fmt.Sprintf(`"%s":%s`, k, formatJSONValue(v))
				j++
			}
			jsonStr += "}"
		}
		jsonStr += "]"
		return jsonStr
	case map[string]interface{}:
		jsonStr := "{"
		i := 0
		for k, v := range val {
			if i > 0 {
				jsonStr += ","
			}
			jsonStr += fmt.Sprintf(`"%s":%s`, k, formatJSONValue(v))
			i++
		}
		jsonStr += "}"
		return jsonStr
	default:
		return fmt.Sprintf("%v", v)
	}
}

// formatJSONValue JSONの値をフォーマットする
func formatJSONValue(v interface{}) string {
	switch val := v.(type) {
	case string:
		return fmt.Sprintf(`"%s"`, val)
	case bool:
		if val {
			return "true"
		}
		return "false"
	case []map[string]interface{}, map[string]interface{}:
		return marshalJSON(val)
	default:
		return fmt.Sprintf("%v", val)
	}
}

// getNetwork IPアドレスとサブネットマスクからネットワークアドレスを取得
func getNetwork(ip net.IP, mask net.IPMask) net.IP {
	network := make(net.IP, len(ip))
	for i := range ip {
		network[i] = ip[i] & mask[i]
	}
	return network
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
