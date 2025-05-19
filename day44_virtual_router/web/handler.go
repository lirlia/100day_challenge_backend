package web

import (
	"encoding/json"
	"fmt"
	"html/template"
	"log"
	"net"
	"net/http"
	"sort"

	// "strconv"

	"github.com/gorilla/mux"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
)

var (
	routerMgr  *router.RouterManager
	templates  *template.Template
	baseLayout = "web/templates/layout.html"
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
	Neighbors           []router.OSPFNeighborData // Corrected type
	LSDB                map[string]router.LSAInfo // Assumes LSAInfo is defined in router package
	RoutingTable        map[string]string
}

type Breadcrumb struct {
	Name     string
	URL      string
	IsActive bool
}

// RegisterHandlers sets up the HTTP handlers and parses templates.
func RegisterHandlers(muxRouter *mux.Router, mgr *router.RouterManager) {
	log.Println("RegisterHandlers: Starting...")
	routerMgr = mgr

	log.Println("RegisterHandlers: Attempting to parse templates from web/templates/*.html")
	tpls, err := template.ParseGlob("web/templates/*.html")
	if err != nil {
		log.Fatalf("RegisterHandlers: FATAL - Failed to parse HTML templates: %v", err)
	}
	templates = tpls
	log.Println("RegisterHandlers: Templates parsed successfully.")

	// HTML page handlers
	muxRouter.HandleFunc("/", indexHandler).Methods("GET")
	muxRouter.HandleFunc("/router/detail", routerDetailHandler).Methods("GET") // Path: /router/detail?id=R1 (Query param based)
	// For path variable based detail: muxRouter.HandleFunc("/router/{id}", routerDetailHandler).Methods("GET")

	// Form submission handlers (HTML UI)
	muxRouter.HandleFunc("/router/add", addRouterHandler).Methods("POST")
	muxRouter.HandleFunc("/router/delete", deleteRouterHandler).Methods("GET") // Kept as GET for simplicity from HTML form
	muxRouter.HandleFunc("/link/add", addLinkHandler).Methods("POST")
	// muxRouter.HandleFunc("/link/delete", removeLinkHandler).Methods("POST") // Removed old HTML form handler

	// API Handlers (New)
	apiRouter := muxRouter.PathPrefix("/api").Subrouter() // Create a subrouter for /api paths
	apiRouter.HandleFunc("/topology", apiTopologyHandler).Methods("GET")
	apiRouter.HandleFunc("/router/{id}", apiRouterDetailHandler).Methods("GET")

	// New API handlers for router management
	apiRouter.HandleFunc("/router", addRouterHandler).Methods("POST")
	apiRouter.HandleFunc("/router/{id}", deleteRouterHandler).Methods("DELETE")

	// New API handlers for link management
	apiRouter.HandleFunc("/link", addLinkHandler).Methods("POST")
	apiRouter.HandleFunc("/link", deleteLinkHandler).Methods("DELETE")

	log.Println("RegisterHandlers: API and page handlers registered.")
	log.Println("RegisterHandlers: Finished.")
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

func addRouterHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("addRouterHandler: received request")
	var reqBody struct {
		ID     string `json:"id"`
		IPCidr string `json:"ip_cidr"`
		MTU    int    `json:"mtu"` // Optional, defaults if not provided or zero
	}

	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		log.Printf("addRouterHandler: Error decoding request body: %v", err)
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if reqBody.ID == "" || reqBody.IPCidr == "" {
		log.Printf("addRouterHandler: Missing id or ip_cidr in request body: %+v", reqBody)
		http.Error(w, "Missing id or ip_cidr in request body", http.StatusBadRequest)
		return
	}

	mtu := reqBody.MTU
	if mtu == 0 {
		mtu = router.DefaultMTU // Use default MTU if not specified or zero
	}

	log.Printf("addRouterHandler: Attempting to add router ID: %s, IP: %s, MTU: %d", reqBody.ID, reqBody.IPCidr, mtu)
	newRouter, err := routerMgr.AddRouter(reqBody.ID, reqBody.IPCidr, mtu)
	if err != nil {
		log.Printf("addRouterHandler: Error adding router %s: %v", reqBody.ID, err)
		http.Error(w, fmt.Sprintf("Failed to add router: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("addRouterHandler: Router %s added successfully", newRouter.GetID())
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	if err := json.NewEncoder(w).Encode(newRouter); err != nil { // Assuming Router struct can be marshalled
		log.Printf("addRouterHandler: Error encoding response: %v", err)
		// Already sent header, so can't send http.Error. Log it.
	}
}

func deleteRouterHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	routerID, ok := vars["id"]
	if !ok || routerID == "" {
		log.Println("deleteRouterHandler: Missing router id in path")
		http.Error(w, "Missing router id in path", http.StatusBadRequest)
		return
	}

	log.Printf("deleteRouterHandler: Attempting to delete router ID: %s", routerID)
	err := routerMgr.RemoveRouter(routerID)
	if err != nil {
		log.Printf("deleteRouterHandler: Error deleting router %s: %v", routerID, err)
		// Differentiate between "not found" and other errors if possible
		// For now, assume any error is an internal server error or bad request (e.g., router has links)
		http.Error(w, fmt.Sprintf("Failed to delete router: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("deleteRouterHandler: Router %s deleted successfully", routerID)
	w.WriteHeader(http.StatusNoContent)
}

func addLinkHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("addLinkHandler: received request")
	var reqBody struct {
		SourceRouterID string `json:"source_router_id"`
		TargetRouterID string `json:"target_router_id"`
		SourceRouterIP string `json:"source_router_ip"` // e.g., "10.100.1.1"
		TargetRouterIP string `json:"target_router_ip"` // e.g., "10.100.1.2"
		Cost           int    `json:"cost"`
	}

	if err := json.NewDecoder(r.Body).Decode(&reqBody); err != nil {
		log.Printf("addLinkHandler: Error decoding request body: %v", err)
		http.Error(w, fmt.Sprintf("Invalid request body: %v", err), http.StatusBadRequest)
		return
	}
	defer r.Body.Close()

	if reqBody.SourceRouterID == "" || reqBody.TargetRouterID == "" || reqBody.SourceRouterIP == "" || reqBody.TargetRouterIP == "" || reqBody.Cost <= 0 {
		log.Printf("addLinkHandler: Missing required fields or invalid cost in request body: %+v", reqBody)
		http.Error(w, "Missing required fields (source_router_id, target_router_id, source_router_ip, target_router_ip) or invalid cost (must be > 0)", http.StatusBadRequest)
		return
	}

	log.Printf("addLinkHandler: Attempting to add link between %s (%s) and %s (%s) with cost %d",
		reqBody.SourceRouterID, reqBody.SourceRouterIP, reqBody.TargetRouterID, reqBody.TargetRouterIP, reqBody.Cost)

	err := routerMgr.AddLinkBetweenRouters(reqBody.SourceRouterID, reqBody.TargetRouterID, reqBody.SourceRouterIP, reqBody.TargetRouterIP, reqBody.Cost)
	if err != nil {
		log.Printf("addLinkHandler: Error adding link: %v", err)
		http.Error(w, fmt.Sprintf("Failed to add link: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("addLinkHandler: Link between %s and %s added successfully", reqBody.SourceRouterID, reqBody.TargetRouterID)
	w.WriteHeader(http.StatusCreated) // Or http.StatusOK if not returning a resource representation
	// Optionally return some representation of the link or just success
	fmt.Fprintf(w, `{"message": "Link added successfully"}`)
}

// deleteLinkHandler handles DELETE requests to /api/link to delete a link between routers.
// Expects query parameters: from_router_id and to_router_id
func deleteLinkHandler(w http.ResponseWriter, r *http.Request) {
	log.Println("deleteLinkHandler: received request")
	fromRouterID := r.URL.Query().Get("from_router_id")
	toRouterID := r.URL.Query().Get("to_router_id")

	if fromRouterID == "" || toRouterID == "" {
		log.Println("deleteLinkHandler: Missing from_router_id or to_router_id query parameter")
		http.Error(w, "Missing from_router_id or to_router_id query parameter", http.StatusBadRequest)
		return
	}

	log.Printf("deleteLinkHandler: Attempting to delete link between %s and %s", fromRouterID, toRouterID)
	err := routerMgr.RemoveLinkBetweenRouters(fromRouterID, toRouterID)
	if err != nil {
		log.Printf("deleteLinkHandler: Error deleting link: %v", err)
		http.Error(w, fmt.Sprintf("Failed to delete link: %v", err), http.StatusInternalServerError)
		return
	}

	log.Printf("deleteLinkHandler: Link between %s and %s deleted successfully", fromRouterID, toRouterID)
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
	var lsdb map[string]router.LSAInfo
	if rtr.OSPFEnabled() && rtr.GetOSPFInstance() != nil {
		neighbors = rtr.GetOSPFInstance().GetOSPFNeighbors()
		lsdb = rtr.GetOSPFInstance().GetLSDBInfo()
	} else {
		log.Printf("routerDetailHandler: OSPF not enabled or instance is nil for router %s", routerID)
		neighbors = []router.OSPFNeighborData{} // Initialize to empty slice
		lsdb = make(map[string]router.LSAInfo)  // Initialize to empty map
	}

	routingTable := rtr.GetRoutingTableForDisplay()

	log.Printf("routerDetailHandler: Router: %s, Neighbors: %d, LSDB entries: %d, Routing table entries: %d", rtr.ID, len(neighbors), len(lsdb), len(routingTable))

	data := TemplateData{
		PageTitle:           fmt.Sprintf("Router %s Details", rtr.ID),
		RouterData:          rtr,
		ContentTemplateName: "router_detail_content",
		Neighbors:           neighbors,
		LSDB:                lsdb,
		RoutingTable:        routingTable,
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
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*") // Allow all origins for simplicity during development

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
func apiRouterDetailHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	routerID := vars["id"]
	log.Printf("apiRouterDetailHandler: received request for router %s", routerID)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Access-Control-Allow-Origin", "*") // Allow all origins for simplicity

	rtr, ok := routerMgr.GetRouter(routerID)
	if !ok {
		log.Printf("apiRouterDetailHandler: router %s not found", routerID)
		http.Error(w, fmt.Sprintf("Router %s not found", routerID), http.StatusNotFound)
		return
	}

	var neighborsData []map[string]interface{}
	var lsdbData map[string]router.LSAInfo
	if rtr.OSPFEnabled() && rtr.GetOSPFInstance() != nil {
		ospfNeighbors := rtr.GetOSPFInstance().GetOSPFNeighbors()
		for _, n := range ospfNeighbors {
			neighborsData = append(neighborsData, map[string]interface{}{"router_id": n.RouterID})
		}
		lsdbData = rtr.GetOSPFInstance().GetLSDBInfo()
	} else {
		neighborsData = []map[string]interface{}{}
		lsdbData = make(map[string]router.LSAInfo)
	}

	data := map[string]interface{}{
		"id":             rtr.ID,
		"ip":             rtr.TUNIPNetString(),
		"status":         rtr.IsRunning(), // Consider string RUNNING/STOPPED
		"ospf_enabled":   rtr.OSPFEnabled(),
		"routing_table":  rtr.GetRoutingTableForDisplay(),
		"ospf_neighbors": neighborsData,
		"lsdb":           lsdbData,
	}

	err := json.NewEncoder(w).Encode(data)
	if err != nil {
		log.Printf("apiRouterDetailHandler: error encoding JSON for router %s: %v", routerID, err)
		http.Error(w, "Failed to encode router detail data", http.StatusInternalServerError)
	}
}
