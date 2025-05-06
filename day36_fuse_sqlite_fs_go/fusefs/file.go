package fusefs

import (
	"context"
	"log"
	"os"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
)

// sqliteFile represents a file node.
type sqliteFile struct {
	sqliteNode // Embed the base node logic
}

// Ensure sqliteFile implements necessary interfaces
var _ fs.NodeGetattrer = (*sqliteFile)(nil)
var _ fs.NodeOpener = (*sqliteFile)(nil)
var _ fs.NodeReader = (*sqliteFile)(nil)    // Implement Read directly on Node
var _ fs.NodeWriter = (*sqliteFile)(nil)    // Implement Write directly on Node
var _ fs.NodeSetattrer = (*sqliteFile)(nil) // For truncate

// Getattr delegates to the embedded sqliteNode.
func (f *sqliteFile) Getattr(ctx context.Context, fh fs.FileHandle, out *fuse.AttrOut) syscall.Errno {
	return f.sqliteNode.Getattr(ctx, fh, out)
}

// Open opens the file. For simplicity, we don't need a custom handle specific state here,
// so we return OK without creating a custom handle.
// File operations (Read, Write) will be handled directly by the *sqliteFile node.
func (f *sqliteFile) Open(ctx context.Context, flags uint32) (fh fs.FileHandle, fuseFlags uint32, errno syscall.Errno) {
	log.Printf("File -> Open() called for ID: %d, Name: %s, flags: %x", f.sqliteNode.model.ID, f.sqliteNode.model.Name, flags)
	// We could perform permission checks based on flags here if needed,
	// but basic checks might be done by the kernel based on Getattr mode.

	// Keep cache enabled by default
	fuseFlags = fuse.FOPEN_KEEP_CACHE
	return nil, fuseFlags, fs.OK // Return nil handle, Read/Write will be on the node itself
}

// Read reads data from the file.
func (f *sqliteFile) Read(ctx context.Context, fh fs.FileHandle, dest []byte, off int64) (fuse.ReadResult, syscall.Errno) {
	log.Printf("File -> Read() called for ID: %d, Name: %s, Offset: %d, Size: %d", f.sqliteNode.model.ID, f.sqliteNode.model.Name, off, len(dest))

	data, err := f.sqliteNode.store.ReadData(f.sqliteNode.model.ID, off, len(dest))
	if err != nil {
		log.Printf("ERROR: File -> Read() failed reading data for ID %d: %v", f.sqliteNode.model.ID, err)
		return nil, syscall.EIO
	}

	log.Printf("File -> Read() read %d bytes for ID: %d", len(data), f.sqliteNode.model.ID)
	return fuse.ReadResultData(data), fs.OK
}

// Write writes data to the file.
func (f *sqliteFile) Write(ctx context.Context, fh fs.FileHandle, data []byte, off int64) (written uint32, errno syscall.Errno) {
	log.Printf("File -> Write() called for ID: %d, Name: %s, Offset: %d, Size: %d", f.sqliteNode.model.ID, f.sqliteNode.model.Name, off, len(data))

	bytesWritten, err := f.sqliteNode.store.WriteData(f.sqliteNode.model.ID, off, data)
	if err != nil {
		log.Printf("ERROR: File -> Write() failed writing data for ID %d: %v", f.sqliteNode.model.ID, err)
		return 0, syscall.EIO
	}

	// Important: Update the model cache after write, especially the size.
	// Reload the model to get accurate Mtime as well.
	updatedModel, err := f.sqliteNode.store.GetNode(f.sqliteNode.model.ID)
	if err == nil {
		f.sqliteNode.model = updatedModel
	} else {
		log.Printf("WARN: File -> Write() failed to reload node %d after write: %v", f.sqliteNode.model.ID, err)
		// Manually update size at least, Mtime might be slightly off in cache
		f.sqliteNode.model.Size = int64(off) + int64(bytesWritten) // Approximate, reload is better
	}

	log.Printf("File -> Write() wrote %d bytes for ID: %d, New size: %d", bytesWritten, f.sqliteNode.model.ID, f.sqliteNode.model.Size)
	return uint32(bytesWritten), fs.OK
}

// Setattr handles attribute changes, primarily for truncate (setting size).
func (f *sqliteFile) Setattr(ctx context.Context, fh fs.FileHandle, in *fuse.SetAttrIn, out *fuse.AttrOut) syscall.Errno {
	log.Printf("File -> Setattr() called for ID: %d, Name: %s, Valid: %x", f.sqliteNode.model.ID, f.sqliteNode.model.Name, in.Valid)

	// Ensure model is loaded
	if err := f.sqliteNode.loadModel(ctx); err != nil {
		return syscall.EIO
	}

	modified := false
	originalModel := *f.sqliteNode.model // Create a copy to modify

	if sz, ok := in.GetSize(); ok {
		log.Printf("File -> Setattr() handling size change to: %d", sz)
		// Handle truncate. We need to update file_data and inode size.
		// For simplicity, let's implement truncate by writing empty data up to the new size
		// or by using DeleteData if sz is 0.
		// A more efficient way would be needed for large files.

		if sz == 0 {
			// Use DeleteData for truncate to zero
			err := f.sqliteNode.store.DeleteData(f.sqliteNode.model.ID)
			if err != nil {
				log.Printf("ERROR: File -> Setattr() failed DeleteData for truncate to 0 on ID %d: %v", f.sqliteNode.model.ID, err)
				return syscall.EIO
			}
		} else {
			// Read existing data up to the new size
			existingData, err := f.sqliteNode.store.ReadData(f.sqliteNode.model.ID, 0, int(sz))
			if err != nil {
				log.Printf("ERROR: File -> Setattr() failed ReadData for truncate on ID %d: %v", f.sqliteNode.model.ID, err)
				return syscall.EIO
			}
			// Ensure the data buffer has the target size, padding with zeros if needed
			if int64(len(existingData)) < int64(sz) {
				paddedData := make([]byte, sz)
				copy(paddedData, existingData)
				existingData = paddedData
			} else if int64(len(existingData)) > int64(sz) {
				existingData = existingData[:sz]
			}
			// Write the (potentially truncated or padded) data back
			_, err = f.sqliteNode.store.WriteData(f.sqliteNode.model.ID, 0, existingData)
			if err != nil {
				log.Printf("ERROR: File -> Setattr() failed WriteData for truncate on ID %d: %v", f.sqliteNode.model.ID, err)
				return syscall.EIO
			}
		}
		originalModel.Size = int64(sz)
		modified = true
	}

	if mode, ok := in.GetMode(); ok {
		log.Printf("File -> Setattr() handling mode change to: %v", os.FileMode(mode))
		originalModel.Mode = os.FileMode(mode) & ^os.ModeType | (originalModel.Mode & os.ModeType) // Preserve file type bits
		modified = true
	}

	// Handle other attributes like UID, GID, Atime, Mtime if needed
	// ... (implement similar checks for other SetAttrIn fields)
	// Remember to update Mtime if relevant fields are changed.

	if modified {
		// Update the node in the database
		// Note: UpdateNode doesn't update all fields yet (like times)
		// We should enhance UpdateNode or handle updates here.
		// For now, let's assume WriteData updated Mtime during truncate.
		err := f.sqliteNode.store.UpdateNode(&originalModel)
		if err != nil {
			log.Printf("ERROR: File -> Setattr() failed UpdateNode for ID %d: %v", f.sqliteNode.model.ID, err)
			return syscall.EIO
		}
		f.sqliteNode.model = &originalModel // Update cached model
	}

	// Return the potentially updated attributes
	return f.sqliteNode.Getattr(ctx, fh, out)
}
