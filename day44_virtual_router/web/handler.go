package web

import (
	"fmt"
	"html/template"
	"log"
	"net/http"
	"sort"
	"strconv"

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
func RegisterHandlers(mgr *router.RouterManager) {
	log.Println("RegisterHandlers: Starting...")
	routerMgr = mgr

	// Parse all templates once on startup
	log.Println("RegisterHandlers: Attempting to parse templates from web/templates/*.html")
	tpls, err := template.ParseGlob("web/templates/*.html")
	if err != nil {
		log.Fatalf("RegisterHandlers: FATAL - Failed to parse HTML templates: %v", err)
	}
	templates = tpls
	log.Println("RegisterHandlers: Templates parsed successfully.")

	// Serve static files (if any, not primary for Brutalism from CDN but useful for custom CSS/JS if needed)
	// fs := http.FileServer(http.Dir("web/static"))
	// http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.HandleFunc("/", indexHandler)
	http.HandleFunc("/router/add", addRouterHandler)
	http.HandleFunc("/router/delete", deleteRouterHandler) // Using GET for simplicity, POST preferred
	http.HandleFunc("/link/add", addLinkHandler)           // Add new route for adding links
	http.HandleFunc("/link/delete", removeLinkHandler)     // Add this for deleting links
	http.HandleFunc("/router/detail", routerDetailHandler) // New route for router details e.g. /router/detail?id=R1
	// http.HandleFunc("/router/", routerDetailHandler) // Path with trailing slash for specific router
	log.Println("RegisterHandlers: HTTP Handlers registered.")
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
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}
	if err := r.ParseForm(); err != nil {
		http.Error(w, "Failed to parse form", http.StatusBadRequest)
		return
	}
	routerID := r.FormValue("routerId")
	ipNetStr := r.FormValue("ipNetStr")
	// mtuStr := r.FormValue("mtu")
	// mtu, _ := strconv.Atoi(mtuStr)
	// if mtu == 0 {
	// 	mtu = router.DefaultMTU
	// }
	mtu := router.DefaultMTU // Keep it simple for now

	if routerID == "" || ipNetStr == "" {
		// Handle error, maybe re-render form with error message
		// For now, just redirect with an error (not ideal UX for form resubmission)
		http.Redirect(w, r, "/?error=RouterID+and+IPNet+are+required", http.StatusSeeOther)
		return
	}

	_, err := routerMgr.AddRouter(routerID, ipNetStr, mtu)
	if err != nil {
		log.Printf("Failed to add router %s: %v", routerID, err)
		http.Redirect(w, r, "/?error="+template.URLQueryEscaper(err.Error()), http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, "/?success=Router+"+template.URLQueryEscaper(routerID)+"+added", http.StatusSeeOther)
}

func deleteRouterHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Only GET method is allowed", http.StatusMethodNotAllowed)
		return
	}
	routerID := r.URL.Query().Get("id")
	if routerID == "" {
		http.Redirect(w, r, "/?error=Router+ID+required+for+deletion", http.StatusSeeOther)
		return
	}

	// In a real app, add a confirmation step here.
	err := routerMgr.RemoveRouter(routerID)
	if err != nil {
		log.Printf("Failed to remove router %s: %v", routerID, err)
		http.Redirect(w, r, "/?error="+template.URLQueryEscaper(err.Error()), http.StatusSeeOther)
		return
	}
	http.Redirect(w, r, "/?success=Router+"+template.URLQueryEscaper(routerID)+"+deleted", http.StatusSeeOther)
}

func addLinkHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseForm()
	if err != nil {
		log.Printf("Error parsing form: %v", err)
		renderError(w, "Error parsing form", http.StatusBadRequest)
		return
	}

	router1ID := r.FormValue("router1Id")
	router1LinkIP := r.FormValue("router1LinkIp")
	router2ID := r.FormValue("router2Id")
	router2LinkIP := r.FormValue("router2LinkIp")
	costStr := r.FormValue("cost")

	if router1ID == "" || router1LinkIP == "" || router2ID == "" || router2LinkIP == "" || costStr == "" {
		log.Printf("Missing form fields for add link")
		renderError(w, "Missing form fields", http.StatusBadRequest)
		return
	}

	cost, err := strconv.Atoi(costStr)
	if err != nil {
		log.Printf("Invalid cost value: %v", err)
		renderError(w, "Invalid cost value: must be an integer", http.StatusBadRequest)
		return
	}
	if cost <= 0 {
		renderError(w, "Cost must be a positive integer", http.StatusBadRequest)
		return
	}

	err = routerMgr.AddLinkBetweenRouters(router1ID, router1LinkIP, router2ID, router2LinkIP, cost)
	if err != nil {
		log.Printf("Error adding link: %v", err)
		renderError(w, fmt.Sprintf("Error adding link: %s", err.Error()), http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully added link between %s (%s) and %s (%s) with cost %d", router1ID, router1LinkIP, router2ID, router2LinkIP, cost)
	http.Redirect(w, r, "/", http.StatusSeeOther)
}

// removeLinkHandler handles POST requests to delete a link between two routers.
func removeLinkHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Only POST method is allowed for link deletion", http.StatusMethodNotAllowed)
		return
	}

	err := r.ParseForm()
	if err != nil {
		log.Printf("Error parsing form for remove link: %v", err)
		// Using renderError to show the error on the index page
		renderError(w, "Error parsing form data for link removal.", http.StatusBadRequest)
		return
	}

	router1ID := r.FormValue("router1Id")
	router2ID := r.FormValue("router2Id")

	if router1ID == "" || router2ID == "" {
		log.Printf("Missing router IDs for remove link operation.")
		renderError(w, "Router IDs are missing. Cannot remove link.", http.StatusBadRequest)
		return
	}

	err = routerMgr.RemoveLinkBetweenRouters(router1ID, router2ID)
	if err != nil {
		log.Printf("Error removing link between %s and %s: %v", router1ID, router2ID, err)
		// Show a more specific error from the manager if possible
		renderError(w, fmt.Sprintf("Failed to remove link: %s", err.Error()), http.StatusInternalServerError)
		return
	}

	log.Printf("Successfully removed link between %s and %s", router1ID, router2ID)
	successMessage := fmt.Sprintf("Link between router %s and %s has been successfully removed.", router1ID, router2ID)
	http.Redirect(w, r, "/?alertType=success&alertMessage="+template.URLQueryEscaper(successMessage), http.StatusSeeOther)
}

func routerDetailHandler(w http.ResponseWriter, r *http.Request) {
	vars := mux.Vars(r)
	routerID := vars["id"]
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
