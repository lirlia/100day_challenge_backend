package router

import (
	"net"
)

// OSPFInstance is a placeholder for OSPF-related data and methods.
// Actual implementation will be in a later step.
type OSPFInstance struct {
	// Placeholder fields, if any, or can be empty for now.
}

// Stop is a placeholder for stopping the OSPF instance.
func (o *OSPFInstance) Stop() {
	// Placeholder implementation
}

// HandleLinkDown is a placeholder for OSPF link down handling.
func (o *OSPFInstance) HandleLinkDown(neighborID string, remoteIP net.IP) {
	// Placeholder implementation
}
