package fusefs

import (
	"context"
	"log"

	"bazil.org/fuse"
	"bazil.org/fuse/fs"
)

// Compile-time checks to ensure File implements the necessary FUSE interfaces.
var _ fs.Node = (*File)(nil)
var _ fs.NodeOpener = (*File)(nil)

// Note: Create is handled by the parent Dir node's Create method.

// File represents a file node in the FUSE filesystem.
type File struct {
	Node // Embed the common Node implementation
}

// Open opens the file. It returns a handle used for subsequent I/O operations (Read, Write).
func (f *File) Open(ctx context.Context, req *fuse.OpenRequest, resp *fuse.OpenResponse) (fs.Handle, error) {
	log.Printf("File -> Open() called for file ID: %d, Name: %s, Flags: %s", f.model.ID, f.model.Name, req.Flags.String())

	// Basic permission check based on open flags (simplified)
	// FUSE kernel module often does more thorough checks.
	if req.Flags.IsReadOnly() && (f.model.Mode&0444 == 0) {
		log.Printf("File -> Open() permission denied (read): ID %d, Mode %v", f.model.ID, f.model.Mode)
		return nil, fuse.EPERM
	}
	if req.Flags.IsWriteOnly() && (f.model.Mode&0222 == 0) {
		log.Printf("File -> Open() permission denied (write): ID %d, Mode %v", f.model.ID, f.model.Mode)
		return nil, fuse.EPERM
	}
	if req.Flags.IsReadWrite() && (f.model.Mode&0666 == 0) { // Need both read and write bits
		log.Printf("File -> Open() permission denied (read/write): ID %d, Mode %v", f.model.ID, f.model.Mode)
		return nil, fuse.EPERM
	}

	// Create a FileHandle (implementation in handle.go)
	handle := &FileHandle{file: f} // Pass the File node to the handle

	// Optionally, set flags on the response if needed (e.g., DirectIO)
	// resp.Flags |= fuse.OpenDirectIO

	log.Printf("File -> Open() successful for file ID: %d, returning handle", f.model.ID)
	return handle, nil
}
