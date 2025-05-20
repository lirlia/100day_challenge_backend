# Day 44: Go Virtual Router

## Progress

- [x] **Step 1: Project Setup & Basic Go Web Server (net/http)**
    - [x] Create `day44_virtual_router` directory and initialize Go module (`go mod init github.com/lirlia/100day_challenge_backend/day44_virtual_router`).
    - [x] Create basic directory structure (`main.go`, `router/`, `web/`, `internal/`, `templates/`, `static/`).
    - [x] Implement a simple HTTP server in `main.go` using `net/http` serving static files and basic HTML templates.
    - [x] Create initial `README.md` and `PROGRESS.md`.
    - [x] Setup `.gitignore`.
- [x] **Step 2: Core Router Logic (Go)**
    - [x] Define `Router` struct in `router/router.go` (ID, Name, Interfaces, RoutingTable, OSPF).
    - [x] Define `Interface` struct (IPAddress, Mask, Cost, State, LinkToRouterID).
    - [x] Define `RoutingEntry` struct (Destination, NextHop, Metric, Type).
    - [x] Implement basic router functions (add/remove interface, add/remove static route).
    - [x] Implement TUN device creation/deletion logic in `router/tun.go` (placeholder for now, focusing on API and management first).
    - [x] Implement packet forwarding logic (placeholder).
- [x] **Step 3: OSPF-like Protocol (Go - Conceptual)**
    - [x] Define LSA (Link State Advertisement) structure in `router/ospf.go`.
    - [x] Implement LSA flooding mechanism (placeholder).
    - [x] Implement Dijkstra's algorithm for SPF calculation (placeholder).
    - [x] Implement routing table update based on SPF (placeholder).
- [x] **Step 4: Web API with Echo & Data Store (Go)**
    - [x] Integrate Echo framework for API routing and request handling.
    - [x] Implement `web/handler.go` with API handlers for router and link management.
    - [x] Create `Datastore` interface and `InMemoryStore` implementation for managing router instances and their states.
    - [x] Define API endpoints:
        - [x] `GET /api/routers`: List all routers.
        - [x] `POST /api/routers`: Create a new router.
        - [x/partial] `GET /api/routers/{id}`: Get router details. (Initial implementation, OSPF/TUN details to be added)
        - [x/partial] `PUT /api/routers/{id}`: Update router (name, static routes). (Initial implementation)
        - [x] `DELETE /api/routers/{id}`: Delete a router.
        - [x] `POST /api/links`: Create a link between routers.
        - [x] `DELETE /api/links/from/:from_router_id/to/:to_router_id`: Delete a link.
        - [ ] `GET /api/routers/{id}/routing-table`: Get routing table.
        - [ ] `POST /api/routers/{id}/routing-table/static`: Add a static route.
        - [ ] `DELETE /api/routers/{id}/routing-table/static/{destination_network}`: Delete a static route.
        - [ ] `GET /api/routers/{id}/ospf/neighbors`: Get OSPF neighbors.
        - [ ] `POST /api/routers/{id}/ping`: Ping from a router. (Conceptual, actual ping via TUN later)
    - [x] Define request/response structs for APIs.
    - [x] Implement basic validation for API inputs.
    - [x] Setup common middlewares (logger, CORS) in `web/middleware.go`.
- [ ] **Step 5: Web UI with Go Templates & Tailwind CSS (CDN)**
    - [x] Design and implement HTML templates in `web/templates/` for:
        - [x] Main dashboard: List routers, add router button. (layout.html, index.html with JS for list/add)
        - [ ] Router detail page: Router info, interfaces, static routes, OSPF neighbors, routing table, logs.
        - [ ] Forms for adding/editing routers, links, static routes.
    - [x] Use Tailwind CSS via CDN for styling. (in layout.html)
    - [x] Implement JavaScript for dynamic UI updates (fetching data, submitting forms via AJAX). (in index.html for router list/add)
- [ ] **Step 6: TUN Device Integration & Packet Forwarding (Go)**
    - [ ] Implement actual TUN device creation/configuration using a library like `songgao/water`.
    - [ ] Implement logic to read IP packets from TUN devices.
    - [ ] Implement packet forwarding based on the routing table.
    - [ ] Handle ICMP echo requests/replies for ping functionality.
- [ ] **Step 7: OSPF-like Protocol Implementation (Go - Full)**
    - [ ] Implement LSA generation and exchange between routers (via Go channels simulating links).
    - [ ] Implement Dijkstra's algorithm for shortest path calculation.
    - [ ] Implement routing table updates based on OSPF calculations.
    - [ ] Implement OSPF neighbor discovery and adjacency management.
- [ ] **Step 8: Testing & Refinement**
    - [ ] Implement unit tests for core router logic and OSPF.
    - [ ] Test API endpoints thoroughly.
    - [ ] Test UI functionality.
    - [ ] Refine error handling and logging.
- [ ] **Step 9: Documentation**
    - [ ] Update `README.md` with detailed setup and usage instructions.
    - [ ] Update `PROGRESS.md` (this file).
    - [ ] Add comments to the code.

# 進捗

以下に進捗を記載してください。


- [x] ルーター・リンクの追加・削除UI (Step 7)
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ]
