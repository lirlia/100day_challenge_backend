package web

import (
	"fmt"
	"html/template"
	"io"
	"log"
	"net"
	"net/http"
	"sync"

	// "strconv"

	"github.com/labstack/echo/v4"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
	// "github.com/gorilla/handlers" // コメントアウトまたは削除
)

// TemplateRenderer is a custom html/template renderer for Echo framework
type TemplateRenderer struct {
	templates *template.Template
}

// Render renders a template document
func (t *TemplateRenderer) Render(w io.Writer, name string, data interface{}, c echo.Context) error {
	// Add global data if needed
	// dataMap, ok := data.(map[string]interface{})
	// if !ok {
	//  dataMap = map[string]interface{}{"Data": data}
	// }
	// dataMap["CurrentYear"] = time.Now().Year()
	return t.templates.ExecuteTemplate(w, name, data)
}

// Datastore defines the interface for data storage operations.
type Datastore interface {
	GetRouters() ([]*router.Router, error)
	GetRouter(id string) (*router.Router, error)
	AddRouter(r *router.Router) error
	UpdateRouter(r *router.Router) error
	DeleteRouter(id string) error
	GetLinks() ([]*router.Link, error)
	AddLink(l *router.Link) error
	DeleteLink(l *router.Link) error
	GetOSPFNeighbors(routerID string) ([]router.OSPFNeighborData, error)
	GetLSDB(routerID string) ([]router.LSAForDisplay, error)
	GetRoutingTable(routerID string) ([]router.RoutingTableEntryForDisplay, error)
	Ping(routerID string, targetIP string) (string, error)
}

// HTML関連の var や struct は一旦コメントアウトまたは削除を検討
// var (
// 	globalRouterManager *router.RouterManager
// 	globalTemplates     *template.Template
// )
// type Alert struct { ... }
// type TemplateData struct { ... }
// type Breadcrumb struct { ... }

// RegisterHandlers を Echo 用に修正
func RegisterHandlers(e *echo.Echo, store Datastore) {
	log.Println("RegisterHandlers: Registering API and Page routes for Echo...")

	// Templates
	renderer := &TemplateRenderer{
		templates: template.Must(template.ParseGlob("web/templates/*.html")),
	}
	e.Renderer = renderer

	// Static files
	e.Static("/static", "static")

	// Page Handlers
	e.GET("/", indexPageHandler(store))
	// e.GET("/router/:id", routerDetailPageHandler(store)) // TODO: ルーター詳細ページ

	apiGroup := e.Group("/api")

	// SetupAPIGroupMiddlewares(apiGroup) // もしAPIグループ特有のミドルウェアがあれば (middleware.goで定義)

	apiGroup.GET("/routers", apiGetRoutersHandler(store))
	apiGroup.POST("/routers", apiAddRouterHandler(store))
	apiGroup.GET("/routers/:id", apiGetRouterHandler(store))
	apiGroup.PUT("/routers/:id", apiUpdateRouterHandler(store))
	apiGroup.DELETE("/routers/:id", apiDeleteRouterHandler(store))

	apiGroup.POST("/links", apiAddLinkHandler(store))
	apiGroup.DELETE("/links/from/:from_router_id/to/:to_router_id", apiDeleteSpecificLinkHandler(store))
	apiGroup.POST("/routers/:id/ping", pingAPIHandler(store))
	apiGroup.GET("/routers/:id/ospf/neighbors", apiGetOSPFNeighborsHandler(store))
	apiGroup.GET("/routers/:id/ospf/lsdb", apiGetLSDBHandler(store))
	apiGroup.GET("/routers/:id/routing-table", apiGetRoutingTableHandler(store))

	log.Println("Finished registering routes for Echo.")
}

// --- Page Handlers ---
func indexPageHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		// Data for the template can be passed here if not fetching client-side
		return c.Render(http.StatusOK, "index.html", nil)
	}
}

// --- API Handlers (Echo形式) ---

// apiGetRoutersHandler returns a list of routers
func apiGetRoutersHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		log.Println("apiGetRoutersHandler called")
		routers, err := store.GetRouters()
		if err != nil {
			log.Printf("Error in apiGetRoutersHandler calling store.GetRouters: %v", err)
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error getting routers: %v", err))
		}
		if routers == nil {
			return c.JSON(http.StatusOK, []*router.Router{}) // Return empty slice if nil
		}
		return c.JSON(http.StatusOK, routers)
	}
}

func apiAddRouterHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		log.Println("apiAddRouterHandler called")
		var req struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		}

		if err := c.Bind(&req); err != nil {
			log.Printf("Error binding request body for add router: %v", err)
			return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("Invalid request payload: %v", err))
		}
		log.Printf("Request body for add router: %+v", req)

		if req.ID == "" || req.Name == "" {
			log.Printf("Validation failed for new router: ID or Name is empty. Request: %+v", req)
			return echo.NewHTTPError(http.StatusBadRequest, "Router ID and Name are required")
		}

		// TODO: IPアドレスの重複を避ける仕組みが必要。ここでは一時的に固定値。
		// 将来的には、利用可能なIPアドレスプールから割り当てるか、ユーザーが指定できるようにする。
		tempIPNetStr := "10.0.1.1/24" // この値はルータ作成ごとにユニークにする必要がある
		// 簡易的な対応として、既存ルータの数に基づいてIPを変える (ただし、これは根本解決ではない)
		routers, _ := store.GetRouters() // エラーハンドリングは省略（デモ用）
		if len(routers) > 0 {
			// 非常に単純な例: 10.0.(N+1).1/24 のようにする。
			// これはIDの衝突や、ルータ削除後の再利用などを考慮していない。
			tempIPNetStr = fmt.Sprintf("10.0.%d.1/24", len(routers)+1)
		}

		defaultMTU := 1500
		defaultOSPFEnabled := true

		newRouter, err := router.NewRouter(req.ID, req.Name, tempIPNetStr, defaultMTU, defaultOSPFEnabled)
		if err != nil {
			// NewRouter でのエラーをハンドリング (例: IPパースエラー、TUN作成エラーなど)
			log.Printf("Error creating new router via router.NewRouter: %v", err)
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Failed to initialize router: %v", err))
		}

		if err := store.AddRouter(newRouter); err != nil {
			log.Printf("Error calling store.AddRouter: %v. Router: %+v", err, newRouter)
			if err.Error() == fmt.Sprintf("router with ID %s already exists", newRouter.ID) {
				return echo.NewHTTPError(http.StatusConflict, err.Error())
			}
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error adding router to store: %v", err))
		}
		log.Printf("Router added successfully: %+v", newRouter)
		// NewRouterが成功すれば、newRouter.Interfaces[0].IP などに必要な情報が入っているはず
		// APIレスポンスとして返すのは、クライアントが必要とする情報に絞っても良い。
		// ここではnewRouterをそのまま返す。
		return c.JSON(http.StatusCreated, newRouter)
	}
}

func apiGetRouterHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		routerID := c.Param("id")
		log.Printf("apiGetRouterHandler called for ID: %s", routerID)
		routerData, err := store.GetRouter(routerID)
		if err != nil {
			log.Printf("Error getting router %s: %v", routerID, err)
			return echo.NewHTTPError(http.StatusNotFound, fmt.Sprintf("Router with ID '%s' not found: %v", routerID, err))
		}
		return c.JSON(http.StatusOK, routerData)
	}
}

func apiUpdateRouterHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		routerID := c.Param("id")
		log.Printf("apiUpdateRouterHandler called for ID: %s", routerID)

		var req struct {
			Name string `json:"name"`
			// Add other updatable fields here, e.g., OSPF settings, static routes.
			// For now, only Name.
		}

		if err := c.Bind(&req); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("Invalid request payload: %v", err))
		}

		// Fetch existing router to update it, or ensure UpdateRouter handles partial updates
		existingRouter, err := store.GetRouter(routerID)
		if err != nil {
			log.Printf("Error getting router %s for update: %v", routerID, err)
			return echo.NewHTTPError(http.StatusNotFound, fmt.Sprintf("Router with ID '%s' not found for update", routerID))
		}

		// Update fields
		if req.Name != "" {
			existingRouter.Name = req.Name
		}
		// Update other fields as necessary based on req

		if err := store.UpdateRouter(existingRouter); err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error updating router %s: %v", routerID, err))
		}
		return c.JSON(http.StatusOK, existingRouter)
	}
}

func apiDeleteRouterHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		routerID := c.Param("id")
		log.Printf("apiDeleteRouterHandler called for ID: %s", routerID)
		if err := store.DeleteRouter(routerID); err != nil {
			log.Printf("Error deleting router %s: %v", routerID, err)
			// Differentiate between "not found" and other errors if possible
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error deleting router %s: %v", routerID, err))
		}
		return c.NoContent(http.StatusNoContent)
	}
}

func apiAddLinkHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		log.Println("apiAddLinkHandler called")
		var newLink router.Link
		if err := c.Bind(&newLink); err != nil {
			log.Printf("Error binding request body for add link: %v", err)
			return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("Invalid request payload: %v", err))
		}
		log.Printf("Request body for add link: %+v", newLink)

		if newLink.FromRouterID == "" || newLink.ToRouterID == "" || newLink.FromInterfaceIP == "" || newLink.ToInterfaceIP == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "Missing required fields for link (FromRouterID, ToRouterID, FromInterfaceIP, ToInterfaceIP)")
		}

		// Validate IPs
		if net.ParseIP(newLink.FromInterfaceIP) == nil {
			return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("Invalid FromInterfaceIP: %s", newLink.FromInterfaceIP))
		}
		if net.ParseIP(newLink.ToInterfaceIP) == nil {
			return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("Invalid ToInterfaceIP: %s", newLink.ToInterfaceIP))
		}

		if err := store.AddLink(&newLink); err != nil {
			log.Printf("Error calling store.AddLink: %v. Link: %+v", err, newLink)
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error adding link: %v", err))
		}
		log.Printf("Link added successfully: %+v", newLink)
		return c.JSON(http.StatusCreated, newLink)
	}
}

func apiDeleteSpecificLinkHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		fromRouterID := c.Param("from_router_id")
		toRouterID := c.Param("to_router_id")
		// Potentially, you might need more info like interface IPs if multiple links can exist.
		// For simplicity, assuming from/to router IDs are enough to identify a unique link for deletion.

		log.Printf("apiDeleteSpecificLinkHandler called to delete link from %s to %s", fromRouterID, toRouterID)

		// Construct a Link object or pass IDs to a modified DeleteLink method in Datastore
		// This depends on how DeleteLink is implemented. If it takes a Link object:
		linkToDelete := &router.Link{
			FromRouterID: fromRouterID,
			ToRouterID:   toRouterID,
			// Other fields might be unknown or not strictly needed for identification by some DeleteLink implementations
		}

		// Or, if DeleteLink can take IDs directly (preferred for RESTful DELETE):
		// err := store.DeleteLinkByIds(fromRouterID, toRouterID)

		err := store.DeleteLink(linkToDelete) // Assuming current DeleteLink takes a Link object
		if err != nil {
			log.Printf("Error deleting link from %s to %s: %v", fromRouterID, toRouterID, err)
			// Check for specific errors, e.g., link not found
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error deleting link: %v", err))
		}

		log.Printf("Link from %s to %s deleted successfully", fromRouterID, toRouterID)
		return c.NoContent(http.StatusNoContent)
	}
}

func pingAPIHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		routerID := c.Param("id")

		var req struct {
			TargetIP string `json:"target_ip"`
		}
		// Try to bind from JSON body first
		if err := c.Bind(&req); err != nil || req.TargetIP == "" {
			// Fallback to query parameter if body binding fails or target_ip is not in body
			req.TargetIP = c.QueryParam("target_ip")
		}

		log.Printf("pingAPIHandler called for router %s, target IP %s", routerID, req.TargetIP)

		if req.TargetIP == "" {
			return echo.NewHTTPError(http.StatusBadRequest, "target_ip (in query or JSON body) is required")
		}
		if net.ParseIP(req.TargetIP) == nil {
			return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("Invalid target_ip format: %s", req.TargetIP))
		}

		result, err := store.Ping(routerID, req.TargetIP)
		if err != nil {
			log.Printf("Error pinging from router %s to %s: %v", routerID, req.TargetIP, err)
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error during ping: %v", err))
		}
		return c.JSON(http.StatusOK, map[string]string{"result": result})
	}
}

func apiGetOSPFNeighborsHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		routerID := c.Param("id")
		log.Printf("apiGetOSPFNeighborsHandler called for ID: %s", routerID)
		neighbors, err := store.GetOSPFNeighbors(routerID)
		if err != nil {
			log.Printf("Error getting OSPF neighbors for router %s: %v", routerID, err)
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error getting OSPF neighbors: %v", err))
		}
		if neighbors == nil {
			return c.JSON(http.StatusOK, []router.OSPFNeighborData{})
		}
		return c.JSON(http.StatusOK, neighbors)
	}
}

func apiGetLSDBHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		routerID := c.Param("id")
		log.Printf("apiGetLSDBHandler called for ID: %s", routerID)
		lsdb, err := store.GetLSDB(routerID)
		if err != nil {
			log.Printf("Error getting LSDB for router %s: %v", routerID, err)
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error getting LSDB: %v", err))
		}
		if lsdb == nil {
			return c.JSON(http.StatusOK, []router.LSAForDisplay{})
		}
		return c.JSON(http.StatusOK, lsdb)
	}
}

func apiGetRoutingTableHandler(store Datastore) echo.HandlerFunc {
	return func(c echo.Context) error {
		routerID := c.Param("id")
		log.Printf("apiGetRoutingTableHandler called for ID: %s", routerID)
		table, err := store.GetRoutingTable(routerID)
		if err != nil {
			log.Printf("Error getting routing table for router %s: %v", routerID, err)
			return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("Error getting routing table: %v", err))
		}
		if table == nil {
			return c.JSON(http.StatusOK, []router.RoutingTableEntryForDisplay{})
		}
		return c.JSON(http.StatusOK, table)
	}
}

// Mock InMemoryStore
type InMemoryStore struct {
	routers map[string]*router.Router
	links   []*router.Link
	mu      sync.Mutex
}

// NewInMemoryStore creates a new InMemoryStore.
func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		routers: make(map[string]*router.Router),
		links:   make([]*router.Link, 0),
	}
}

// GetRouters returns all routers.
func (s *InMemoryStore) GetRouters() ([]*router.Router, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	routersList := make([]*router.Router, 0, len(s.routers))
	for _, r := range s.routers {
		routersList = append(routersList, r)
	}
	return routersList, nil
}

// GetRouter retrieves a router by its string ID.
func (s *InMemoryStore) GetRouter(id string) (*router.Router, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.routers[id]
	if !ok {
		return nil, fmt.Errorf("router with ID '%s' not found", id)
	}
	return r, nil
}

// AddRouter adds a new router.
func (s *InMemoryStore) AddRouter(newRouter *router.Router) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.routers[newRouter.ID]; exists {
		return fmt.Errorf("router with ID '%s' already exists", newRouter.ID)
	}
	s.routers[newRouter.ID] = newRouter
	log.Printf("[InMemoryStore] Added router: %s, Name: %s, OSPFEnabled: %v", newRouter.ID, newRouter.Name, newRouter.OSPFEnabled)
	return nil
}

// UpdateRouter updates an existing router.
func (s *InMemoryStore) UpdateRouter(r *router.Router) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.routers[r.ID]; !exists {
		return fmt.Errorf("router with ID '%s' not found for update", r.ID)
	}
	s.routers[r.ID] = r
	log.Printf("[InMemoryStore] Updated router: %s", r.ID)
	return nil
}

// DeleteRouter deletes a router by its string ID.
func (s *InMemoryStore) DeleteRouter(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.routers[id]; !exists {
		return fmt.Errorf("router with ID '%s' not found for deletion", id)
	}
	delete(s.routers, id)
	// Also remove links associated with this router
	updatedLinks := []*router.Link{}
	for _, l := range s.links {
		if l.FromRouterID != id && l.ToRouterID != id {
			updatedLinks = append(updatedLinks, l)
		}
	}
	s.links = updatedLinks
	log.Printf("[InMemoryStore] Deleted router: %s and associated links", id)
	return nil
}

// GetLinks returns all links.
func (s *InMemoryStore) GetLinks() ([]*router.Link, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.links, nil
}

// AddLink adds a new link.
func (s *InMemoryStore) AddLink(newLink *router.Link) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	// Basic validation: Check if source and target routers exist
	if _, ok := s.routers[newLink.FromRouterID]; !ok {
		return fmt.Errorf("source router with ID '%s' not found for link", newLink.FromRouterID)
	}
	if _, ok := s.routers[newLink.ToRouterID]; !ok {
		return fmt.Errorf("target router with ID '%s' not found for link", newLink.ToRouterID)
	}

	// TODO: より厳密な重複チェック (例: 同じインターフェースIPが使われていないかなど)
	// 簡易的な重複チェック: 全く同じリンクが既に存在するかどうか
	for _, l := range s.links {
		if l.FromRouterID == newLink.FromRouterID && l.ToRouterID == newLink.ToRouterID &&
			l.FromInterfaceIP == newLink.FromInterfaceIP && l.ToInterfaceIP == newLink.ToInterfaceIP &&
			l.Cost == newLink.Cost {
			return fmt.Errorf("identical link already exists from %s to %s", newLink.FromRouterID, newLink.ToRouterID)
		}
		// 逆方向のリンクも考慮に入れるか (オプション)
		if l.FromRouterID == newLink.ToRouterID && l.ToRouterID == newLink.FromRouterID &&
			l.FromInterfaceIP == newLink.ToInterfaceIP && l.ToInterfaceIP == newLink.FromInterfaceIP &&
			l.Cost == newLink.Cost {
			return fmt.Errorf("identical reverse link already exists from %s to %s", newLink.ToRouterID, newLink.FromRouterID)
		}
	}

	s.links = append(s.links, newLink)
	log.Printf("[InMemoryStore] Added link from %s (%s) to %s (%s) with cost %d", newLink.FromRouterID, newLink.FromInterfaceIP, newLink.ToRouterID, newLink.ToInterfaceIP, newLink.Cost)
	return nil
}

// DeleteLink removes a link.
// リンクの特定には FromRouterID, ToRouterID, FromInterfaceIP, ToInterfaceIP を使うのがより確実
func (s *InMemoryStore) DeleteLink(linkToDelete *router.Link) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	found := false
	updatedLinks := []*router.Link{}
	for _, l := range s.links {
		// リンクを一意に特定できる条件で比較する
		// ここでは簡易的にFrom/To RouterIDとFrom/To InterfaceIPで比較
		if l.FromRouterID == linkToDelete.FromRouterID && l.ToRouterID == linkToDelete.ToRouterID &&
			l.FromInterfaceIP == linkToDelete.FromInterfaceIP && l.ToInterfaceIP == linkToDelete.ToInterfaceIP {
			found = true
			log.Printf("[InMemoryStore] Deleting link: %+v", l)
		} else {
			updatedLinks = append(updatedLinks, l)
		}
	}
	if !found {
		return fmt.Errorf("link not found for deletion: %+v", linkToDelete)
	}
	s.links = updatedLinks
	return nil
}

// GetTopology returns the current network topology.
func (s *InMemoryStore) GetTopology() (*router.Topology, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	routersList := make([]*router.Router, 0, len(s.routers))
	for _, r := range s.routers {
		// OSPF情報を付加するなど、必要に応じてrouter情報を加工
		// ここではシンプルにそのまま返す
		routersList = append(routersList, r)
	}
	// リンク情報も同様に
	currentLinks := make([]*router.Link, len(s.links))
	copy(currentLinks, s.links)

	return &router.Topology{
		Routers: routersList,
		Links:   currentLinks,
	}, nil
}

// GetOSPFNeighbors returns OSPF neighbors for a given router.
func (s *InMemoryStore) GetOSPFNeighbors(routerID string) ([]router.OSPFNeighborData, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.routers[routerID]
	if !ok {
		return nil, fmt.Errorf("router with ID '%s' not found", routerID)
	}
	if !r.OSPFEnabled { // OSPFが有効かどうかのチェックのみで十分
		log.Printf("[InMemoryStore] GetOSPFNeighbors: OSPF not enabled for router %s", routerID)
		return []router.OSPFNeighborData{}, nil
	}
	neighbors := r.GetOSPFNeighborsForDisplay() // Router のメソッドを呼び出す
	log.Printf("[InMemoryStore] GetOSPFNeighbors for %s: Found %d neighbors", routerID, len(neighbors))
	return neighbors, nil
}

// GetLSDB returns the LSDB for a given router.
func (s *InMemoryStore) GetLSDB(routerID string) ([]router.LSAForDisplay, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.routers[routerID]
	if !ok {
		return nil, fmt.Errorf("router with ID '%s' not found", routerID)
	}
	if !r.OSPFEnabled { // OSPFが有効かどうかのチェックのみで十分
		log.Printf("[InMemoryStore] GetLSDB: OSPF not enabled for router %s", routerID)
		return []router.LSAForDisplay{}, nil
	}
	lsdb := r.GetLSDBForRouterDisplay() // Router のメソッドを呼び出す
	log.Printf("[InMemoryStore] GetLSDB for %s: Found %d LSAs", routerID, len(lsdb))
	return lsdb, nil
}

// GetRoutingTable returns the routing table for a given router.
func (s *InMemoryStore) GetRoutingTable(routerID string) ([]router.RoutingTableEntryForDisplay, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.routers[routerID]
	if !ok {
		return nil, fmt.Errorf("router with ID '%s' not found", routerID)
	}
	// ルーティングテーブルはルータ自身が持つ (OSPFの結果も含むため)
	table := r.GetRoutingTableForDisplay() // Router のメソッドを呼び出す
	log.Printf("[InMemoryStore] GetRoutingTable for %s: Found %d entries", routerID, len(table))
	return table, nil
}

// Ping simulates a ping from a router to a target IP.
func (s *InMemoryStore) Ping(routerID string, targetIP string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	r, ok := s.routers[routerID]
	if !ok {
		return "", fmt.Errorf("source router with ID '%s' not found for ping", routerID)
	}

	log.Printf("[InMemoryStore] Ping from router %s (%s) to target %s", r.ID, r.Name, targetIP)

	for _, intf := range r.Interfaces {
		ipAddr, ipNet, err := net.ParseCIDR(intf.IP)
		if err == nil {
			if ipNet.Contains(net.ParseIP(targetIP)) {
				if ipAddr.Equal(net.ParseIP(targetIP)) {
					return fmt.Sprintf("Ping to %s (router's own interface %s): Reply from %s", targetIP, intf.Name, targetIP), nil
				}
				return fmt.Sprintf("Ping to %s (directly connected on interface %s): Reply from %s", targetIP, intf.Name, targetIP), nil
			}
		} else {
			if intf.IP == targetIP {
				return fmt.Sprintf("Ping to %s (directly connected on interface %s): Reply from %s", targetIP, intf.Name, targetIP), nil
			}
		}
	}

	// OSPFが有効な場合、ルータのルーティングテーブルを参照
	if r.OSPFEnabled && r.GetOSPFInstance() != nil { // GetOSPFInstance() を使って nil チェック
		routingTable := r.GetRoutingTableForDisplay() // Router のメソッドを使用
		var bestRouteEntry *router.RoutingTableEntryForDisplay
		bestRoutePrefixLen := -1

		for i := range routingTable {
			entry := routingTable[i]
			_, network, err := net.ParseCIDR(entry.DestinationCIDR)
			if err != nil {
				log.Printf("[InMemoryStore] Ping: Skipping invalid route destination %s: %v", entry.DestinationCIDR, err)
				continue
			}
			targetAddr := net.ParseIP(targetIP)
			if targetAddr == nil {
				return "", fmt.Errorf("invalid target IP address: %s", targetIP)
			}

			if network.Contains(targetAddr) {
				prefixLen, _ := network.Mask.Size()
				if prefixLen > bestRoutePrefixLen {
					bestRoutePrefixLen = prefixLen
					bestRouteEntry = &entry
				}
			}
		}

		if bestRouteEntry != nil {
			if bestRouteEntry.NextHop == "0.0.0.0" || bestRouteEntry.NextHop == "" {
				return fmt.Sprintf("Ping to %s (via OSPF, appears directly connected on %s): Reply from %s", targetIP, bestRouteEntry.InterfaceName, targetIP), nil
			}
			return fmt.Sprintf("Ping to %s (via OSPF, next-hop %s on interface %s) - (Simulated) Reply from %s", targetIP, bestRouteEntry.NextHop, bestRouteEntry.InterfaceName, targetIP), nil
		}
	}

	return fmt.Sprintf("Ping to %s: Destination Host Unreachable from router %s", targetIP, r.ID), nil
}

// HTML系ハンドラは後で対応
// func renderTemplate(w http.ResponseWriter, tmplName string, data interface{}) { ... }
// func indexHandler(store Datastore) http.HandlerFunc { ... }
// func addRouterHTMLHandler(store Datastore) http.HandlerFunc { ... }
// func routerDetailHandler(store Datastore) http.HandlerFunc { ... }
// func deleteRouterHTMLHandler(store Datastore) http.HandlerFunc { ... }
// func addLinkHTMLHandler(store Datastore) http.HandlerFunc { ... }
// func deleteLinkHTMLHandler(store Datastore) http.HandlerFunc { ... }
// func toggleOSPFHandler(store Datastore) http.HandlerFunc { ... }
// func adminResetDataHandler(store Datastore) http.HandlerFunc { ... }
