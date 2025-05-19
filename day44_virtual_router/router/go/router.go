package router

import (
	"fmt"
	"log"
	"net"
	"sync"

	"github.com/your-project/ospf"
)

type Router struct {
	ID                 string
	NeighborLinks      map[string]*NeighborLink
	neighborLinksMutex sync.RWMutex
	routingTable       []*RoutingEntry
	routingTableMutex  sync.RWMutex
	ospfInstance       *ospf.OSPF
	isRunning          bool
	wg                 sync.WaitGroup
}

func (r *Router) AddNeighborLink(
	neighborID string,
	localIP net.IP,
	remoteIP net.IP,
	toNeighborChan chan<- *NeighborLink,
	fromNeighborChan chan<- *NeighborLink,
	cost int,
) error {
	log.Printf("Router %s: AddNeighborLink: Attempting to add link to %s (Local: %s, Remote: %s, Cost: %d)", r.ID, neighborID, localIP, remoteIP, cost)
	r.neighborLinksMutex.Lock()

	if _, exists := r.NeighborLinks[neighborID]; exists {
		r.neighborLinksMutex.Unlock() // Unlock before returning error
		log.Printf("Router %s: AddNeighborLink: Link to neighbor %s already exists. Aborting add.", r.ID, neighborID)
		return fmt.Errorf("router %s: link to neighbor %s already exists", r.ID, neighborID)
	}

	link := &NeighborLink{
		LocalInterfaceIP:  localIP,
		RemoteRouterID:    neighborID,
		RemoteInterfaceIP: remoteIP,
		ToNeighborChan:    toNeighborChan,
		FromNeighborChan:  fromNeighborChan,
		Cost:              cost,
	}
	r.NeighborLinks[neighborID] = link

	// Add a direct route for the immediate neighbor's link IP
	destNetForNeighborLink := net.IPNet{IP: remoteIP, Mask: net.CIDRMask(32, 32)} // Host route to neighbor's link IP
	r.routingTableMutex.Lock()                                                    // Lock for routing table modification
	r.RoutingTable = append(r.RoutingTable, &RoutingEntry{
		Destination: destNetForNeighborLink,
		NextHop:     remoteIP,
		Interface:   neighborID, // interface is the neighbor router ID for link
		Metric:      cost,
		Type:        DirectRoute,
	})
	log.Printf("Router %s: Route added - Dest: %s, NextHop: %s, Iface: %s, Metric: %d, Type: %s",
		r.ID, destNetForNeighborLink.String(), remoteIP, neighborID, cost, DirectRoute)
	r.routingTableMutex.Unlock()

	log.Printf("Router %s: AddNeighborLink: Successfully added neighbor link struct to %s (Local: %s, Remote: %s, Cost: %d).", r.ID, neighborID, localIP, remoteIP, cost)

	// Unlock neighborLinksMutex before potentially long-running or locking operations (OSPF, goroutine start)
	r.neighborLinksMutex.Unlock()

	// Notify OSPF about the new link (after releasing the lock)
	notifyOSPF := r.ospfInstance != nil

	// Start listener for this specific link if router is running
	listenerShouldStart := r.isRunning

	if listenerShouldStart {
		log.Printf("Router %s: AddNeighborLink: Router is running. Preparing to start listener goroutine for neighbor %s.", r.ID, neighborID)
		r.wg.Add(1)
		go r.listenToNeighbor(link) // link variable is from the locked section, its content is stable
		log.Printf("Router %s: AddNeighborLink: Listener goroutine for neighbor %s launched.", r.ID, neighborID)
	} else {
		log.Printf("Router %s: AddNeighborLink: Router is NOT running. Listener goroutine for %s NOT launched.", r.ID, neighborID)
	}

	if notifyOSPF {
		log.Printf("Router %s: AddNeighborLink: Notifying OSPF about link up to %s (after lock release).", r.ID, neighborID)
		r.ospfInstance.HandleLinkUp(neighborID, cost, localIP, remoteIP)
	}

	log.Printf("Router %s: AddNeighborLink: Finished adding link to %s.", r.ID, neighborID)
	return nil
}

// RemoveNeighborLink は隣接ルーターへの仮想リンクを削除します。
// ... existing code ...
