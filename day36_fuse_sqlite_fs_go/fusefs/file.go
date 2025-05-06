package fusefs

import (
	"context"
	"log"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

// sqliteFile represents a file node in the filesystem.
type sqliteFile struct {
	sqliteNode // Embed the base node implementation
}

// Ensure sqliteFile implements necessary file interfaces
var _ fs.NodeGetattrer = (*sqliteFile)(nil)
var _ fs.NodeSetattrer = (*sqliteFile)(nil)
var _ fs.NodeOpener = (*sqliteFile)(nil)

// Read and Write operations are handled by the file handle (sqliteHandle)

// Getattr delegates to the embedded sqliteNode.
func (f *sqliteFile) Getattr(ctx context.Context, fh fs.FileHandle, out *fuse.AttrOut) syscall.Errno {
	log.Printf("File (Ino:%d) -> Getattr() called", f.sqliteNode.Inode.StableAttr().Ino) // Use StableAttr().Ino
	return f.sqliteNode.Getattr(ctx, fh, out)                                            // Access via sqliteNode
}

// Setattr updates file attributes (currently supports size truncation).
func (f *sqliteFile) Setattr(ctx context.Context, fh fs.FileHandle, in *fuse.SetAttrIn, out *fuse.AttrOut) syscall.Errno {
	log.Printf("File (Ino:%d) -> Setattr() called with input: %+v", f.sqliteNode.Inode.StableAttr().Ino, in) // Use StableAttr().Ino

	// Ensure model is loaded for modification
	if err := f.sqliteNode.loadModel(ctx); err != nil { // Access via sqliteNode
		return syscall.EIO
	}

	updated := false
	if sz, ok := in.GetSize(); ok {
		log.Printf("File (Ino:%d) -> Setattr() attempting to truncate to size: %d", f.sqliteNode.Inode.StableAttr().Ino, sz) // Use StableAttr().Ino
		err := f.sqliteNode.store.TruncateFile(f.sqliteNode.model.ID, int64(sz))                                             // Access via sqliteNode
		if err != nil {
			log.Printf("ERROR: File (Ino:%d) -> Setattr() failed truncating: %v", f.sqliteNode.Inode.StableAttr().Ino, err) // Use StableAttr().Ino
			return syscall.EIO                                                                                              // Or a more specific error?
		}
		f.sqliteNode.model.Size = int64(sz) // Update cached model size
		updated = true
		log.Printf("File (Ino:%d) -> Setattr() truncated successfully", f.sqliteNode.Inode.StableAttr().Ino) // Use StableAttr().Ino
	}

	// Handle other attributes like mode, timestamps if needed
	// ... (implementation for chown, chmod, utimes) ...

	// If any attribute was updated, call Getattr to return the updated state.
	if updated {
		return f.sqliteNode.Getattr(ctx, fh, out) // Access via sqliteNode
	}

	// If nothing changed that we handle, just return OK.
	// However, fuse library might expect Getattr to be called.
	// Let's call Getattr anyway for consistency.
	log.Printf("File (Ino:%d) -> Setattr() finished, calling Getattr for final state.", f.sqliteNode.Inode.StableAttr().Ino) // Use StableAttr().Ino
	return f.sqliteNode.Getattr(ctx, fh, out)                                                                                // Access via sqliteNode
}

// Open creates a handle for the file.
func (f *sqliteFile) Open(ctx context.Context, flags uint32) (fh fs.FileHandle, fuseFlags uint32, errno syscall.Errno) {
	log.Printf("File (Ino:%d) -> Open() called with flags: %x", f.sqliteNode.Inode.StableAttr().Ino, flags) // Use StableAttr().Ino

	// Ensure model is loaded (might be needed by handle)
	if err := f.sqliteNode.loadModel(ctx); err != nil { // Access via sqliteNode
		return nil, 0, syscall.EIO
	}

	// Create a file handle (sqliteHandle needs to be defined)
	handle := &sqliteHandle{ // Assume sqliteHandle definition exists
		fileNode: f, // Pass the file node itself
		flags:    flags,
	}

	// Decide on cache behavior. FOPEN_KEEP_CACHE is usually good.
	fuseFlags = fuse.FOPEN_KEEP_CACHE

	log.Printf("File (Ino:%d) -> Open() succeeded, returning handle", f.sqliteNode.Inode.StableAttr().Ino) // Use StableAttr().Ino
	return handle, fuseFlags, fs.OK
}

// --- sqliteHandle implementation --- (Handles Read/Write)

type sqliteHandle struct {
	fileNode *sqliteFile // Reference back to the file node (contains model, store)
	flags    uint32      // Open flags (O_RDONLY, O_WRONLY, O_RDWR, etc.)
	// We could add a read/write buffer here, or manage file position.
}

// Ensure sqliteHandle implements necessary file handle interfaces
var _ fs.FileReader = (*sqliteHandle)(nil)
var _ fs.FileWriter = (*sqliteHandle)(nil)
var _ fs.FileReleaser = (*sqliteHandle)(nil)

// Read reads data from the file.
func (fh *sqliteHandle) Read(ctx context.Context, dest []byte, off int64) (fuse.ReadResult, syscall.Errno) {
	fino := fh.fileNode.sqliteNode.Inode.StableAttr().Ino // Get Ino
	log.Printf("Handle (FileIno:%d) -> Read() called, offset: %d, buffer size: %d", fino, off, len(dest))

	// Ensure model is loaded (contains size info)
	if err := fh.fileNode.sqliteNode.loadModel(ctx); err != nil { // Access via fileNode.sqliteNode
		return nil, syscall.EIO
	}

	// Access store via fileNode.sqliteNode
	data, err := fh.fileNode.sqliteNode.store.ReadData(fh.fileNode.sqliteNode.model.ID, off, int64(len(dest)))
	if err != nil {
		log.Printf("ERROR: Handle (FileIno:%d) -> Read() failed reading data: %v", fino, err)
		return nil, syscall.EIO
	}

	n := copy(dest, data)
	log.Printf("Handle (FileIno:%d) -> Read() read %d bytes", fino, n)
	return fuse.ReadResultData(dest[:n]), fs.OK
}

// Write writes data to the file.
func (fh *sqliteHandle) Write(ctx context.Context, data []byte, off int64) (written uint32, errno syscall.Errno) {
	fino := fh.fileNode.sqliteNode.Inode.StableAttr().Ino // Get Ino
	log.Printf("Handle (FileIno:%d) -> Write() called, offset: %d, data size: %d", fino, off, len(data))

	// Ensure model is loaded for updates
	if err := fh.fileNode.sqliteNode.loadModel(ctx); err != nil { // Access via fileNode.sqliteNode
		return 0, syscall.EIO
	}

	// Access store via fileNode.sqliteNode
	newSize, err := fh.fileNode.sqliteNode.store.WriteData(fh.fileNode.sqliteNode.model.ID, off, data)
	if err != nil {
		log.Printf("ERROR: Handle (FileIno:%d) -> Write() failed writing data: %v", fino, err)
		return 0, syscall.EIO
	}

	// Update the cached model size if it changed
	fh.fileNode.sqliteNode.model.Size = newSize // Access via fileNode.sqliteNode
	written = uint32(len(data))

	log.Printf("Handle (FileIno:%d) -> Write() wrote %d bytes, new size: %d", fino, written, newSize)
	return written, fs.OK
}

// Release is called when the file handle is closed.
func (fh *sqliteHandle) Release(ctx context.Context) syscall.Errno {
	fino := fh.fileNode.sqliteNode.Inode.StableAttr().Ino // Get Ino
	log.Printf("Handle (FileIno:%d) -> Release() called", fino)
	// No specific action needed for release in this simple implementation
	return fs.OK
}
