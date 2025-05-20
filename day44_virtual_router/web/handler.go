package web

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net"
	"net/http"
	"sort"
	"strconv"

	// "strconv"

	"github.com/gorilla/mux"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
)

var (
	routerMgr *router.RouterManager
	templates *template.Template
)

// Alert defines the structure for alert messages to be displayed in templates.
type Alert struct {
	Message string
	Type    string // e.g., "error", "success", "warning"
}

// TemplateData holds data passed to HTML templates.
type TemplateData struct {
	PageTitle  string
	Routers    []*router.Router
	RouterData *router.Router
	// Links               []*router.Link // Temporarily commented out as router.Link is not defined and GetAllLinks is not available
	Error               string
	ContentTemplateName string
	Neighbors           []router.OSPFNeighborData            // Corrected type
	LSDB                []router.LSAForDisplay               // Changed from map[string]router.LSAInfo
	RoutingTable        []router.RoutingTableEntryForDisplay // Changed from map[string]string
}

type Breadcrumb struct {
	Name     string
	URL      string
	IsActive bool
}

// loggingMiddleware is a simple middleware to log request details
func loggingMiddleware(label string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			log.Printf("Logging Middleware (%s) - Before Next: %s %s", label, r.Method, r.URL.Path)

			resInterceptor := &responseLogger{ResponseWriter: w, label: label}
			next.ServeHTTP(resInterceptor, r) // Call the next handler

			log.Printf("Logging Middleware (%s) - After Next: %s %s, Status: %d", label, r.Method, r.URL.Path, resInterceptor.status)
		})
	}
}

// responseLogger captures the status code and can be extended to capture headers
type responseLogger struct {
	http.ResponseWriter
	status int
	label  string
}

func (rl *responseLogger) WriteHeader(status int) {
	rl.status = status
	rl.ResponseWriter.WriteHeader(status)
	log.Printf("Logging Middleware (%s) - WriteHeader: Status %d", rl.label, status)
}

func (rl *responseLogger) Write(b []byte) (int, error) {
	// If status is not set, default to 200 OK before writing body
	if rl.status == 0 {
		rl.status = http.StatusOK
	}
	return rl.ResponseWriter.Write(b)
}

// RegisterHandlers sets up the HTTP handlers and parses templates.
func RegisterHandlers(muxRouter *mux.Router, mgr *router.RouterManager) {
	log.Println("!!!!!!!!!!!!!!!!!!!! WEB HANDLER REGISTRATION STARTED !!!!!!!!!!!!!!!!!!!!")
	routerMgr = mgr

	log.Println("RegisterHandlers: Attempting to parse templates from web/templates/*.html")
	tpls, err := template.ParseGlob("web/templates/*.html")
	if err != nil {
		log.Fatalf("RegisterHandlers: FATAL - Failed to parse HTML templates: %v", err)
	}
	templates = tpls
	log.Println("RegisterHandlers: Templates parsed successfully.")

	// ★★★ グローバルなCORSミドルウェアを一時的にコメントアウト ★★★
	// permissiveCORSMiddleware := handlers.CORS(
	//     handlers.AllowedOrigins([]string{"*"}),
	//     handlers.AllowedMethods([]string{"GET", "POST", "PUT", "DELETE", "OPTIONS", "HEAD"}),
	//     handlers.AllowedHeaders([]string{"*"}),
	//     handlers.AllowCredentials(),
	// )
	// muxRouter.Use(permissiveCORSMiddleware)

	// グローバルなロギングミドルウェアは有効のまま
	muxRouter.Use(loggingMiddleware("Global"))

	// HTML page handlers
	muxRouter.HandleFunc("/", indexHandler).Methods("GET")
	muxRouter.HandleFunc("/router/detail", routerDetailHandler).Methods("GET")
	muxRouter.HandleFunc("/router/add", addRouterHTMLHandler).Methods("POST")
	muxRouter.HandleFunc("/router/delete", deleteRouterHTMLHandler).Methods("GET")
	muxRouter.HandleFunc("/link/add", addLinkHTMLHandler).Methods("POST")

	apiRouter := muxRouter.PathPrefix("/api").Subrouter()

	// /api/router への OPTIONS ハンドラ (これは有効のまま)
	apiRouter.HandleFunc("/router", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("EXPLICIT DAY44 OPTIONS HANDLER: Method: %s, Path: %s", r.Method, r.URL.Path)
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS, PUT, DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		w.WriteHeader(http.StatusOK)
		log.Println("EXPLICIT DAY44 OPTIONS HANDLER: Processed and CORS headers set.")
	}).Methods(http.MethodOptions)

	// /api/router への POST ハンドラ (これも有効のまま)
	apiRouter.HandleFunc("/router", apiAddRouterHandler).Methods(http.MethodPost)

	// 他のAPIエンドポイント
	apiRouter.HandleFunc("/topology", apiTopologyHandler).Methods("GET")
	apiRouter.HandleFunc("/router/{id}", apiRouterDetailHandler).Methods("GET")
	// apiAddRouterHandler is already defined for /router POST
	apiRouter.HandleFunc("/router/{id}", apiDeleteRouterHandler).Methods("DELETE")
	apiRouter.HandleFunc("/link", apiAddLinkHandler).Methods("POST")
	apiRouter.HandleFunc("/link", apiDeleteLinkHandler).Methods("DELETE")
	apiRouter.HandleFunc("/router/{id}/ping", pingAPIHandler).Methods("POST")

	log.Println("RegisterHandlers: API and page handlers registered.")
	log.Println("!!!!!!!!!!!!!!!!!!!! WEB HANDLER REGISTRATION FINISHED SUCCESSFULLY !!!!!!!!!!!!!!!!!!!!")
}

func renderTemplate(w http.ResponseWriter, tmplName string, data TemplateData) {
	// If ContentTemplateName is set, we assume we're rendering the layout which will then include the specific content.
	// Otherwise, execute the template tmplName directly (e.g., for error pages not using the full layout).
	targetTemplate := tmplName
	if data.ContentTemplateName != "" && tmplName == "layout.html" {
		// We are rendering the layout, and the layout will use ContentTemplateName
		log.Printf("renderTemplate: rendering layout '%s' with content '%s'", tmplName, data.ContentTemplateName)
	} else if data.ContentTemplateName == "" && tmplName != "layout.html" {
		// We are rendering a specific template directly (e.g. an error page snippet or a partial)
		// or a layout that doesn't use the dynamic content mechanism.
		log.Printf("renderTemplate: rendering template '%s' directly", tmplName)
	} else if data.ContentTemplateName != "" && tmplName != "layout.html" {
		log.Printf("renderTemplate: warning - ContentTemplateName ('%s') is set, but we are not rendering 'layout.html' (rendering '%s'). This might be unintended.", data.ContentTemplateName, tmplName)
		// Proceed with tmplName, but this case might indicate a logic error in handler.
	}

	err := templates.ExecuteTemplate(w, targetTemplate, data)
	if err != nil {
		// Log the error internally. The caller (handler) will decide how to respond to the user.
		log.Printf("renderTemplate: error executing template %s: %v. Data: %+v", targetTemplate, err, data)
		// The handler is responsible for sending an HTTP error response to the client if needed.
		// We avoid http.Error here to prevent double responses if handler also calls it.
		// And also to prevent error loops if renderError itself calls renderTemplate.
		// We will ensure handlers send an error response if this template execution fails.
		// For now, the original log and no http.Error here is kept from the previous step.
		// Callers like indexHandler and routerDetailHandler were modified to NOT expect 'err' return.
		// They now have their own http.Error calls if template rendering (checked via other means or assumed failed on panic perhaps) fails.
		// Re-evaluating this: renderTemplate *should* return an error if one occurs, so callers can act.
		// Let's revert renderTemplate to return an error, and adjust callers.
	}
}

func indexHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("indexHandler: processing request for", r.URL.Path)
	// routers := routerMgr.GetAllRouters() // Incorrect method name
	routers := routerMgr.ListRouters()        // Corrected method name
	sort.Slice(routers, func(i, j int) bool { // Keep sorting for consistent display
		return routers[i].ID < routers[j].ID
	})
	// links := routerMgr.GetAllLinks() // This method doesn't exist
	data := TemplateData{
		PageTitle: "Virtual Router Management",
		Routers:   routers,
		// Links:               links, // Temporarily commented out
		ContentTemplateName: "index_content",
	}
	renderTemplate(w, "layout.html", data) // err is handled internally by renderTemplate or logged
	log.Println("indexHandler: successfully rendered template for", r.URL.Path)
}

// Renaming HTML form handlers to avoid conflict with API handlers
func addRouterHTMLHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("addRouterHTMLHandler: received request")
	// Existing logic for HTML form submission to add router
	// This handler typically redirects or renders a template, not JSON.
	// For example:
	if err := r.ParseForm(); err != nil {
		renderError(w, "Failed to parse form.", http.StatusBadRequest)
		return
	}
	id := r.FormValue("id")
	ipCidr := r.FormValue("ip_cidr")
	mtuStr := r.FormValue("mtu")
	mtu := router.DefaultMTU
	if mtuStr != "" {
		// Parse MTU, handle error
	}

	_, err := routerMgr.AddRouter(id, ipCidr, mtu)
	if err != nil {
		renderError(w, fmt.Sprintf("Failed to add router: %v", err), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func deleteRouterHTMLHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("deleteRouterHTMLHandler: received request")
	// Existing logic for HTML form submission to delete router
	routerID := r.URL.Query().Get("id") // Assuming ID from query param for GET based delete
	if routerID == "" {
		renderError(w, "Router ID missing for deletion.", http.StatusBadRequest)
		return
	}
	err := routerMgr.RemoveRouter(routerID)
	if err != nil {
		renderError(w, fmt.Sprintf("Failed to delete router: %v", err), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

func addLinkHTMLHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("addLinkHTMLHandler: received request")
	// Existing logic for HTML form submission to add link
	if err := r.ParseForm(); err != nil {
		renderError(w, "Failed to parse form.", http.StatusBadRequest)
		return
	}
	sourceRouterID := r.FormValue("source_router_id")
	targetRouterID := r.FormValue("target_router_id")
	sourceRouterIP := r.FormValue("source_router_ip")
	targetRouterIP := r.FormValue("target_router_ip")
	costStr := r.FormValue("cost")
	cost, err := strconv.Atoi(costStr)
	if err != nil {
		renderError(w, fmt.Sprintf("Invalid cost value: %s", costStr), http.StatusBadRequest)
		return
	}

	err = routerMgr.AddLinkBetweenRouters(sourceRouterID, targetRouterID, sourceRouterIP, targetRouterIP, cost)
	if err != nil {
		renderError(w, fmt.Sprintf("Failed to add link: %v", err), http.StatusInternalServerError)
		return
	}
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// API handler for adding a router (previously addRouterHandler)
func apiAddRouterHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("apiAddRouterHandler: received request") // Changed log message
	var reqBody struct {
		ID     string `json:"id"`
		IPCidr string `json:"ip_cidr"`
		MTU    int    `json:"mtu"` // Optional, defaults if not provided or zero
	}

	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		log.Printf("apiAddRouterHandler: Error decoding request body: %v", err)
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if reqBody.ID == "" || reqBody.IPCidr == "" {
		log.Printf("apiAddRouterHandler: Missing id or ip_cidr in request body: %+v", reqBody)
		http.Error(w, "Missing id or ip_cidr in request body", http.StatusBadRequest)
		return
	}

	mtu := reqBody.MTU
	if mtu == 0 {
		mtu = router.DefaultMTU // Use default MTU if not specified or zero
	}

	log.Printf("apiAddRouterHandler: Attempting to add router ID: %s, IP: %s, MTU: %d", reqBody.ID, reqBody.IPCidr, mtu)
	newRouter, err := routerMgr.AddRouter(reqBody.ID, reqBody.IPCidr, mtu)
	if err != nil {
		log.Printf("apiAddRouterHandler: Error adding router %s: %v", reqBody.ID, err)
		http.Error(w, fmt.Sprintf("Failed to add router: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("apiAddRouterHandler: Router %s added successfully", newRouter.GetID())
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3001")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	// Encode the actual newRouter data, not the interface which might be problematic for JSON.
	// Assuming newRouter has a method or can be structured for JSON response.
	// For now, creating a map similar to other API responses.
	response := map[string]interface{}{
		"id":           newRouter.GetID(),
		"ip":           newRouter.TUNIPNetString(),
		"status":       newRouter.IsRunning(),
		"ospf_enabled": newRouter.OSPFEnabled(),
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("apiAddRouterHandler: Error encoding response: %v", err)
	}
}

// API handler for deleting a router (previously deleteRouterHandler)
func apiDeleteRouterHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("apiDeleteRouterHandler: received request") // Changed log message
	vars := mux.Vars(r)
	routerID, ok := vars["id"]
	if !ok || routerID == "" {
		log.Println("apiDeleteRouterHandler: Missing router id in path")
		http.Error(w, "Missing router id in path", http.StatusBadRequest)
		return
	}

	log.Printf("apiDeleteRouterHandler: Attempting to delete router ID: %s", routerID)
	err := routerMgr.RemoveRouter(routerID)
	if err != nil {
		log.Printf("apiDeleteRouterHandler: Error deleting router %s: %v", routerID, err)
		http.Error(w, fmt.Sprintf("Failed to delete router: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("apiDeleteRouterHandler: Router %s deleted successfully", routerID)
	w.WriteHeader(http.StatusNoContent)
}

// API handler for adding a link (previously addLinkHandler)
func apiAddLinkHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("apiAddLinkHandler: received request") // Changed log message
	var reqBody struct {
		SourceRouterID string `json:"source_router_id"`
		TargetRouterID string `json:"target_router_id"`
		SourceRouterIP string `json:"source_router_ip"` // e.g., "10.100.1.1"
		TargetRouterIP string `json:"target_router_ip"` // e.g., "10.100.1.2"
		Cost           int    `json:"cost"`
	}

	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		log.Printf("apiAddLinkHandler: Error decoding request body: %v", err)
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if reqBody.SourceRouterID == "" || reqBody.TargetRouterID == "" || reqBody.SourceRouterIP == "" || reqBody.TargetRouterIP == "" || reqBody.Cost <= 0 {
		log.Printf("apiAddLinkHandler: Missing required fields or invalid cost in request body: %+v", reqBody)
		http.Error(w, "Missing required fields (source_router_id, target_router_id, source_router_ip, target_router_ip) or invalid cost (must be > 0)", http.StatusBadRequest)
		return
	}

	log.Printf("apiAddLinkHandler: Attempting to add link between %s (%s) and %s (%s) with cost %d",
		reqBody.SourceRouterID, reqBody.SourceRouterIP, reqBody.TargetRouterID, reqBody.TargetRouterIP, reqBody.Cost)

	err := routerMgr.AddLinkBetweenRouters(reqBody.SourceRouterID, reqBody.TargetRouterID, reqBody.SourceRouterIP, reqBody.TargetRouterIP, reqBody.Cost)
	if err != nil {
		log.Printf("apiAddLinkHandler: Error adding link: %v", err)
		http.Error(w, fmt.Sprintf("Failed to add link: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("apiAddLinkHandler: Link between %s and %s added successfully", reqBody.SourceRouterID, reqBody.TargetRouterID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	fmt.Fprintf(w, `{"message": "Link added successfully between %s and %s"}`, reqBody.SourceRouterID, reqBody.TargetRouterID)
}

// API handler for deleting a link (previously deleteLinkHandler)
// deleteLinkHandler handles DELETE requests to /api/link to delete a link between routers.
// Expects query parameters: from_router_id and to_router_id
func apiDeleteLinkHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("apiDeleteLinkHandler: received request") // Changed log message
	fromRouterID := r.URL.Query().Get("from_router_id")
	toRouterID := r.URL.Query().Get("to_router_id")

	if fromRouterID == "" || toRouterID == "" {
		log.Println("apiDeleteLinkHandler: Missing from_router_id or to_router_id query parameter")
		http.Error(w, "Missing from_router_id or to_router_id query parameter", http.StatusBadRequest)
		return
	}

	log.Printf("apiDeleteLinkHandler: Attempting to delete link between %s and %s", fromRouterID, toRouterID)
	err := routerMgr.RemoveLinkBetweenRouters(fromRouterID, toRouterID)
	if err != nil {
		log.Printf("apiDeleteLinkHandler: Error deleting link: %v", err)
		http.Error(w, fmt.Sprintf("Failed to delete link: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("apiDeleteLinkHandler: Link between %s and %s deleted successfully", fromRouterID, toRouterID)
	w.WriteHeader(http.StatusNoContent)
}

func routerDetailHandler(w http.ResponseWriter, r *http.Request) {
	// For query parameter based: /router/detail?id=R1
	routerID := r.URL.Query().Get("id")
	if routerID == "" {
		// If using path variable like /router/{id}, then use mux.Vars:
		// vars := mux.Vars(r)
		// routerID = vars["id"]
		// if routerID == "" { ... handle error ... }
		log.Printf("routerDetailHandler: router ID missing from query params")
		renderError(w, "Router ID is required for detail view.", http.StatusBadRequest)
		return
	}
	log.Printf("routerDetailHandler: fetching details for router %s", routerID)

	// rtr := routerMgr.GetRouter(routerID) // Incorrect usage
	rtr, ok := routerMgr.GetRouter(routerID) // Corrected usage
	if !ok {                                 // Check if router was found
		log.Printf("routerDetailHandler: router %s not found", routerID)
		renderError(w, "Router not found", http.StatusNotFound)
		return
	}

	// Ensure OSPF instance exists before trying to get info from it
	var neighbors []router.OSPFNeighborData
	var lsdb []router.LSAForDisplay // Changed type from map[string]router.LSAInfo
	if rtr.OSPFEnabled() && rtr.GetOSPFInstance() != nil {
		neighbors = rtr.GetOSPFInstance().GetOSPFNeighbors()
		lsdb = rtr.GetOSPFInstance().GetLSDBForDisplay() // Changed from GetLSDBInfo
	} else {
		log.Printf("routerDetailHandler: OSPF not enabled or instance is nil for router %s", routerID)
		neighbors = []router.OSPFNeighborData{} // Initialize to empty slice
		lsdb = []router.LSAForDisplay{}         // Initialize to empty slice
	}

	routingTable := rtr.GetRoutingTableForDisplay() // This is already []router.RoutingTableEntryForDisplay

	log.Printf("routerDetailHandler: Router: %s, Neighbors: %d, LSDB entries: %d, Routing table entries: %d", rtr.ID, len(neighbors), len(lsdb), len(routingTable))

	data := TemplateData{
		PageTitle:           fmt.Sprintf("Router %s Details", rtr.ID),
		RouterData:          rtr,
		ContentTemplateName: "router_detail_content",
		Neighbors:           neighbors,
		LSDB:                lsdb,         // Type is now []router.LSAForDisplay
		RoutingTable:        routingTable, // Type is now []router.RoutingTableEntryForDisplay
	}

	renderTemplate(w, "layout.html", data) // err is handled internally
	log.Printf("routerDetailHandler: successfully rendered template for router %s", routerID)
}

// renderError is a helper to display an error message page.
// For simplicity, it just uses http.Error for now, but could render a template.
func renderError(w http.ResponseWriter, message string, statusCode int) {
	log.Printf("renderError: status %d, message: %s", statusCode, message)
	data := TemplateData{
		PageTitle: "Error",
		Error:     message,
	}
	w.WriteHeader(statusCode)
	// Try to render a simple error page using layout. It should handle missing ContentTemplateName gracefully
	// or have a default way to display .Error
	err := templates.ExecuteTemplate(w, "layout.html", data)
	if err != nil {
		log.Printf("renderError: CRITICAL - failed to render error layout template: %v. Falling back to plain text.", err)
		http.Error(w, message, statusCode) // Fallback to plain text error
	}
}

// TODO: routerDetailHandler, addLinkHandler, removeLinkHandler

// initTemplates parses all HTML templates from the web/templates directory.
// It now also includes router_detail.html and any other html files.
func InitTemplates() {
	var err error
	templates, err = template.ParseGlob("web/templates/*.html")
	if err != nil {
		log.Fatalf("Failed to parse templates: %v", err)
	}
	log.Println("Successfully parsed all templates in web/templates/")
}

// API handler for topology data
func apiTopologyHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("apiTopologyHandler: received request")
	w.Header().Set("Access-Control-Allow-Origin", "http://localhost:3001")
	w.Header().Set("Content-Type", "application/json")

	routers := routerMgr.ListRouters()
	formattedRouters := []map[string]interface{}{}
	for _, rtr := range routers {
		formattedRouters = append(formattedRouters, map[string]interface{}{
			"id":           rtr.ID,
			"ip":           rtr.TUNIPNetString(),
			"status":       rtr.IsRunning(), // Consider returning string "RUNNING"/"STOPPED"
			"ospf_enabled": rtr.OSPFEnabled(),
			// Add any other relevant router data for the topology view node
		})
	}

	// Need a way to get all links from RouterManager, or iterate through routers and their links
	// For now, let's assume we have a way to get all unique links
	// This part needs a proper implementation in RouterManager or here
	formattedLinks := []map[string]interface{}{}
	allLinks := collectAllLinks(routerMgr) // Placeholder for a function that gathers all links

	for _, link := range allLinks {
		formattedLinks = append(formattedLinks, map[string]interface{}{
			"source":    link.SourceRouterID,
			"target":    link.TargetRouterID,
			"cost":      link.Cost,
			"local_ip":  link.LocalIP.String(), // Assuming Link has these fields
			"remote_ip": link.RemoteIP.String(),
		})
	}

	data := map[string]interface{}{
		"routers": formattedRouters,
		"links":   formattedLinks,
	}

	err := json.NewEncoder(w).Encode(data)
	if err != nil {
		log.Printf("apiTopologyHandler: error encoding JSON: %v", err)
		http.Error(w, "Failed to encode topology data", http.StatusInternalServerError)
	}
}

// Helper function placeholder - needs actual implementation
type TopoLink struct { // Define a suitable struct for link representation
	SourceRouterID string
	TargetRouterID string
	Cost           int
	LocalIP        net.IP
	RemoteIP       net.IP
}

func collectAllLinks(mgr *router.RouterManager) []TopoLink {
	links := []TopoLink{}
	processedLinks := make(map[string]bool) // To avoid duplicate links (R1-R2 and R2-R1)

	for _, r := range mgr.ListRouters() {
		neighborLinks := r.GetNeighborLinks() // This returns map[string]*NeighborLink
		for neighborID, linkData := range neighborLinks {
			linkKey1 := fmt.Sprintf("%s-%s", r.ID, neighborID)
			linkKey2 := fmt.Sprintf("%s-%s", neighborID, r.ID)

			if !processedLinks[linkKey1] && !processedLinks[linkKey2] {
				links = append(links, TopoLink{
					SourceRouterID: r.ID,
					TargetRouterID: neighborID,
					Cost:           linkData.Cost,
					LocalIP:        linkData.LocalInterfaceIP,
					RemoteIP:       linkData.RemoteInterfaceIP,
				})
				processedLinks[linkKey1] = true
				processedLinks[linkKey2] = true
			}
		}
	}
	return links
}

// API handler for specific router details
func apiRouterDetailHandler(w http.ResponseWriter, req *http.Request) {
	vars := mux.Vars(req)
	routerID := vars["id"]

	rtr, ok := routerMgr.GetRouter(routerID) // Changed r to rtr to avoid conflict if any
	if !ok {
		http.Error(w, fmt.Sprintf("Router %s not found", routerID), http.StatusNotFound)
		return
	}

	// Placeholder for actual gateway logic.
	// For now, using a simple placeholder.
	gatewayStr := "N/A"
	if rtr.IPAddress.IP.IsLoopback() { // Example, actual gateway logic might be more complex
		// gatewayStr = "N/A (Loopback)" // Or some other indicator
	}

	// Placeholder for MTU. If Router struct stores MTU, retrieve it.
	mtu := 1500 // Default or placeholder from router configuration
	// if tun, ok := rtr.TUNInterface.(*router.TUNInterfaceDetails); ok { // Hypothetical type assertion for MTU
	//     // mtu = tun.MTU() // If such method exists
	// }

	routerData := router.RouterDataForDetailDisplay{
		ID:                     rtr.GetID(),
		IPAddress:              rtr.TUNIPNetString(),
		Gateway:                gatewayStr, // Using the placeholder
		MTU:                    mtu,        // Using the placeholder or configured MTU
		IsRunning:              rtr.IsRunning(),
		RoutingTableForDisplay: rtr.GetRoutingTableForDisplay(), // This should return []RoutingTableEntryForDisplay
		LSDBInfo:               rtr.GetLSDBForRouterDisplay(),   // This should return []LSAForDisplay
	}

	jsonBytes, err := json.Marshal(routerData)
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to marshal router detail for %s: %v", routerID, err), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(jsonBytes)
}

// pingAPIHandler handles POST requests to /api/router/{id}/ping to simulate a ping.
func pingAPIHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	routerID, ok := vars["id"]
	if !ok || routerID == "" {
		log.Println("pingAPIHandler: Missing router id in path")
		http.Error(w, "Missing router id in path", http.StatusBadRequest)
		return
	}

	var reqBody struct {
		TargetIP string `json:"target_ip"`
	}

	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		log.Printf("pingAPIHandler: Error decoding request body for router %s: %v", routerID, err)
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if reqBody.TargetIP == "" {
		log.Printf("pingAPIHandler: Missing target_ip in request body for router %s", routerID)
		http.Error(w, "Missing target_ip in request body", http.StatusBadRequest)
		return
	}

	log.Printf("pingAPIHandler: Received ping request from router %s to %s", routerID, reqBody.TargetIP)

	rtr, routerExists := routerMgr.GetRouter(routerID)
	if !routerExists {
		log.Printf("pingAPIHandler: Router %s not found", routerID)
		http.Error(w, fmt.Sprintf("Router %s not found", routerID), http.StatusNotFound)
		return
	}

	if !rtr.IsRunning() {
		log.Printf("pingAPIHandler: Router %s is not running", routerID)
		http.Error(w, fmt.Sprintf("Router %s is not running", routerID), http.StatusServiceUnavailable)
		return
	}

	success, rtt, message, err := rtr.SimulatePing(reqBody.TargetIP)
	if err != nil { // This error is for invalid IP format from SimulatePing
		log.Printf("pingAPIHandler: Error from SimulatePing for router %s to %s: %v", routerID, reqBody.TargetIP, err)
		http.Error(w, fmt.Sprintf("Ping simulation error: %v", err), http.StatusBadRequest) // Likely bad IP format
		return
	}

	response := map[string]interface{}{
		"source_router_id": routerID,
		"target_ip":        reqBody.TargetIP,
		"success":          success,
		"rtt_ms":           rtt,
		"message":          message,
	}

	w.Header().Set("Content-Type", "application/json")
	if !success {
		// Although technically the API call itself succeeded, the ping operation failed.
		// We could return 200 OK with success:false, or a more specific error code if desired.
		// For now, 200 OK with success:false is fine. User can check the success field.
		log.Printf("pingAPIHandler: Ping from %s to %s failed: %s", routerID, reqBody.TargetIP, message)
	}
	if err := json.NewEncoder(w).Encode(response); err != nil {
		log.Printf("pingAPIHandler: Error encoding response for router %s: %v", routerID, err)
		// Header already set, can't send another http.Error, but the client might get partial response.
	}
}
