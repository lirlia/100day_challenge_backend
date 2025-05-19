package router

import (
	"fmt"
	"log"
	"net"
	"sync"
)

const DefaultChannelBufferSize = 128 // Added constant for channel buffer size

// RouterManager manages all active router instances.
// This will be a central point for web handlers to interact with routers.
type RouterManager struct {
	routers   map[string]*Router // key: Router ID
	mutex     sync.RWMutex
	linkMutex sync.Mutex // Used for operations that might involve multiple routers, like adding a link
}

// NewRouterManager creates a new RouterManager.
func NewRouterManager() *RouterManager {
	return &RouterManager{
		routers: make(map[string]*Router),
	}
}

// AddRouter creates a new router with the given parameters, starts it, and adds it to the manager.
func (rm *RouterManager) AddRouter(id string, ipNetStr string, mtu int) (*Router, error) {
	rm.mutex.Lock()
	defer rm.mutex.Unlock()

	if _, exists := rm.routers[id]; exists {
		return nil, fmt.Errorf("router with ID %s already exists", id)
	}

	r, err := NewRouter(id, ipNetStr, mtu)
	if err != nil {
		return nil, fmt.Errorf("failed to create new router %s: %w", id, err)
	}

	if err := r.Start(); err != nil {
		// Attempt to clean up TUN if start fails
		_ = r.Stop() // Stop will also try to close TUN
		return nil, fmt.Errorf("failed to start router %s: %w", id, err)
	}

	rm.routers[id] = r
	log.Printf("RouterManager: Added and started router %s (%s)", id, ipNetStr)
	return r, nil
}

// GetRouter retrieves a router by its ID.
func (rm *RouterManager) GetRouter(id string) (*Router, bool) {
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()
	r, ok := rm.routers[id]
	return r, ok
}

// RemoveRouter stops and removes a router from the manager.
func (rm *RouterManager) RemoveRouter(id string) error {
	rm.mutex.Lock()
	r, exists := rm.routers[id]
	if !exists {
		rm.mutex.Unlock()
		return fmt.Errorf("router with ID %s not found for removal", id)
	}
	// Remove from map before stopping to prevent new operations on it via GetRouter
	delete(rm.routers, id)
	rm.mutex.Unlock() // Unlock before potentially long Stop operation

	log.Printf("RouterManager: Removing router %s...", id)
	if err := r.Stop(); err != nil {
		// Even if stop fails, it's removed from the manager. Log error.
		log.Printf("RouterManager: Error stopping router %s during removal: %v", id, err)
		// Potentially re-add to map if Stop is critical and failed? For now, no.
		return fmt.Errorf("error stopping router %s: %w", id, err) // Propagate stop error
	}

	log.Printf("RouterManager: Router %s removed successfully.", id)
	return nil
}

// ListRouters returns a slice of all managed routers.
// The slice contains copies of router pointers, so the caller should not modify the Router structs directly
// if modifications are intended to be managed by RouterManager.
// For read-only purposes, this is fine.
func (rm *RouterManager) ListRouters() []*Router {
	rm.mutex.RLock()
	defer rm.mutex.RUnlock()
	routers := make([]*Router, 0, len(rm.routers))
	for _, r := range rm.routers {
		routers = append(routers, r)
	}
	return routers
}

// AddLinkBetweenRouters establishes a bidirectional link between two managed routers.
func (rm *RouterManager) AddLinkBetweenRouters(routerID1, routerID2 string, ip1Str, ip2Str string, cost int) error {
	log.Printf("RouterManager: AddLinkBetweenRouters START for %s <-> %s (IPs: %s, %s, Cost: %d)", routerID1, routerID2, ip1Str, ip2Str, cost)
	rm.linkMutex.Lock() // Lock to ensure atomic link creation/deletion
	defer rm.linkMutex.Unlock()

	rm.mutex.RLock()
	r1, r1Exists := rm.routers[routerID1]
	r2, r2Exists := rm.routers[routerID2]
	rm.mutex.RUnlock()

	if !r1Exists {
		log.Printf("RouterManager: AddLinkBetweenRouters: Router %s not found.", routerID1)
		return fmt.Errorf("router %s not found", routerID1)
	}
	if !r2Exists {
		log.Printf("RouterManager: AddLinkBetweenRouters: Router %s not found.", routerID2)
		return fmt.Errorf("router %s not found", routerID2)
	}

	ip1 := net.ParseIP(ip1Str)
	if ip1 == nil {
		log.Printf("RouterManager: AddLinkBetweenRouters: Invalid IP address string for router %s: %s", routerID1, ip1Str)
		return fmt.Errorf("invalid IP address string for router %s: %s", routerID1, ip1Str)
	}
	ip2 := net.ParseIP(ip2Str)
	if ip2 == nil {
		log.Printf("RouterManager: AddLinkBetweenRouters: Invalid IP address string for router %s: %s", routerID2, ip2Str)
		return fmt.Errorf("invalid IP address string for router %s: %s", routerID2, ip2Str)
	}

	log.Printf("RouterManager: AddLinkBetweenRouters: Parsed IPs: %s, %s", ip1.String(), ip2.String())

	// Create communication channels (buffered to avoid deadlocks on send)
	r1ToR2Chan := make(chan []byte, DefaultChannelBufferSize) // Use defined constant
	r2ToR1Chan := make(chan []byte, DefaultChannelBufferSize) // Use defined constant
	log.Printf("RouterManager: AddLinkBetweenRouters: Communication channels created for %s <-> %s.", routerID1, routerID2)

	// Add link to r1 (r1 -> r2)
	log.Printf("RouterManager: AddLinkBetweenRouters: Attempting to add link from %s (%s) to %s (%s).", r1.ID, ip1.String(), r2.ID, ip2.String())
	if err := r1.AddNeighborLink(ip1, ip2, r2.ID, r1ToR2Chan, r2ToR1Chan, cost); err != nil {
		log.Printf("RouterManager: AddLinkBetweenRouters: ERROR adding link from %s to %s: %v", r1.ID, r2.ID, err)
		return fmt.Errorf("failed to add link from %s to %s: %w", r1.ID, r2.ID, err)
	}
	log.Printf("RouterManager: AddLinkBetweenRouters: Successfully added link from %s to %s.", r1.ID, r2.ID)

	// Add link to r2 (r2 -> r1)
	log.Printf("RouterManager: AddLinkBetweenRouters: Attempting to add link from %s (%s) to %s (%s).", r2.ID, ip2.String(), r1.ID, ip1.String())
	if err := r2.AddNeighborLink(ip2, ip1, r1.ID, r2ToR1Chan, r1ToR2Chan, cost); err != nil {
		log.Printf("RouterManager: AddLinkBetweenRouters: ERROR adding link from %s to %s: %v", r2.ID, r1.ID, err)
		// Attempt to roll back the link addition on r1 if r2 fails
		// This is a simple rollback, more complex scenarios might need more robust transactionality
		if r1 != nil { // Check r1 to be safe, though it should exist here
			r1.RemoveNeighborLink(r2.ID)
			log.Printf("RouterManager: AddLinkBetweenRouters: Rolled back link from %s to %s due to error on reverse link.", r1.ID, r2.ID)
		}
		return fmt.Errorf("failed to add link from %s to %s: %w", r2.ID, r1.ID, err)
	}
	log.Printf("RouterManager: AddLinkBetweenRouters: Successfully added link from %s to %s.", r2.ID, r1.ID)

	log.Printf("RouterManager: AddLinkBetweenRouters FINISHED for %s <-> %s.", routerID1, routerID2)
	return nil
}

// RemoveLinkBetweenRouters removes a bidirectional link between two managed routers.
func (rm *RouterManager) RemoveLinkBetweenRouters(router1ID, router2ID string) error {
	rm.linkMutex.Lock()
	defer rm.linkMutex.Unlock()

	rm.mutex.RLock()
	r1, r1Exists := rm.routers[router1ID]
	r2, r2Exists := rm.routers[router2ID]
	rm.mutex.RUnlock()

	if !r1Exists {
		return fmt.Errorf("router %s not found for link removal", router1ID)
	}
	if !r2Exists {
		return fmt.Errorf("router %s not found for link removal", router2ID)
	}

	var errR1, errR2 error
	log.Printf("RouterManager: Attempting to remove link between %s and %s", router1ID, router2ID)

	if err := r1.RemoveNeighborLink(router2ID); err != nil {
		errR1 = fmt.Errorf("failed to remove link from %s to %s: %w", router1ID, router2ID, err)
		log.Println(errR1)
	} else {
		log.Printf("RouterManager: Link from %s to %s removed.", router1ID, router2ID)
	}

	if err := r2.RemoveNeighborLink(router1ID); err != nil {
		errR2 = fmt.Errorf("failed to remove link from %s to %s: %w", router2ID, router1ID, err)
		log.Println(errR2)
	} else {
		log.Printf("RouterManager: Link from %s to %s removed.", router2ID, router1ID)
	}

	if errR1 != nil || errR2 != nil {
		return fmt.Errorf("errors during link removal between %s and %s. R1->R2: %v, R2->R1: %v", router1ID, router2ID, errR1, errR2)
	}

	log.Printf("RouterManager: Successfully removed bidirectional link between %s and %s", router1ID, router2ID)
	return nil
}
