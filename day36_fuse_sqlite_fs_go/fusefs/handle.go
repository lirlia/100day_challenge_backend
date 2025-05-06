package fusefs

import (
	"context"
	"log"

	"bazil.org/fuse"
	"bazil.org/fuse/fs"
)

// Compile-time checks to ensure FileHandle implements the necessary FUSE interfaces.
var _ fs.Handle = (*FileHandle)(nil)
var _ fs.HandleReader = (*FileHandle)(nil)
var _ fs.HandleWriter = (*FileHandle)(nil)

// Potentially add Releaser if needed for cleanup

// FileHandle represents an open file handle.
// It holds a reference to the File node it belongs to.
type FileHandle struct {
	file *File // Reference back to the File node
}

// Read reads data from the file associated with the handle.
func (h *FileHandle) Read(ctx context.Context, req *fuse.ReadRequest, resp *fuse.ReadResponse) error {
	log.Printf("Handle -> Read() called for file ID: %d, Name: %s, Offset: %d, Size: %d",
		h.file.model.ID, h.file.model.Name, req.Offset, req.Size)

	// Use the store's ReadData method
	data, err := h.file.store.ReadData(h.file.model.ID, req.Offset, req.Size)
	if err != nil {
		// Should ReadData return specific errors that can be mapped to FUSE errors?
		// e.g., if ReadData returns os.ErrNotExist (though unlikely here), map to EIO?
		log.Printf("ERROR: Handle -> Read() failed calling store.ReadData for ID %d: %v", h.file.model.ID, err)
		return fuse.EIO // Generic I/O error for store failures
	}

	resp.Data = data
	log.Printf("Handle -> Read() read %d bytes for file ID: %d", len(resp.Data), h.file.model.ID)

	// Update access time (optional, could be done less frequently)
	// Reading doesn't change the node model directly here, but could update atime.
	// For simplicity, we only update times on Write for now.

	return nil
}

// Write writes data to the file associated with the handle.
func (h *FileHandle) Write(ctx context.Context, req *fuse.WriteRequest, resp *fuse.WriteResponse) error {
	log.Printf("Handle -> Write() called for file ID: %d, Name: %s, Offset: %d, Size: %d",
		h.file.model.ID, h.file.model.Name, req.Offset, len(req.Data))

	// Use the store's WriteData method
	bytesWritten, err := h.file.store.WriteData(h.file.model.ID, req.Offset, req.Data)
	if err != nil {
		log.Printf("ERROR: Handle -> Write() failed calling store.WriteData for ID %d: %v", h.file.model.ID, err)
		return fuse.EIO // Generic I/O error for store failures
	}

	resp.Size = bytesWritten
	log.Printf("Handle -> Write() wrote %d bytes for file ID: %d", resp.Size, h.file.model.ID)

	// Update the in-memory node model to reflect the potential size change immediately.
	// This helps subsequent operations within the same FUSE session see the new size.
	// We need to reload the node from the store to get the updated Mtime as well.
	updatedModel, err := h.file.store.GetNode(h.file.model.ID)
	if err == nil {
		h.file.model = updatedModel // Update the model in the associated File node
	} else {
		log.Printf("WARN: Handle -> Write() failed to reload node %d after write: %v", h.file.model.ID, err)
		// Continue, but the in-memory state might be slightly stale regarding Mtime.
	}

	return nil
}
