package fusefs

import (
	"context"
	"log"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/store"
)

// sqliteNode implements fs.InodeEmbedder.
// It serves as the base for our file and directory nodes.
type sqliteNode struct {
	fs.Inode              // Embed the standard Inode struct
	store    store.Store  // Reference to the database store
	model    *models.Node // Cached node model from the database
	debug    bool         // Enable debug logging for this node
	// We might need a mutex here if we modify the model concurrently,
	// but reads should be safe after initialization.
}

// Ensure sqliteNode implements necessary interfaces (can add more later)
var _ fs.NodeGetattrer = (*sqliteNode)(nil)

// loadModel ensures the node's model is loaded from the store if it hasn't been already.
// This is useful because Inode ID might be set before we have the full model.
func (n *sqliteNode) loadModel(ctx context.Context) error {
	if n.model == nil {
		inodeID := n.Inode.StableAttr().Ino
		if inodeID == 0 {
			log.Println("WARN: loadModel called with Ino == 0")
			// This might happen for the root before OnAdd is called.
			// Handle root loading specifically in Root's OnAdd.
			// For other nodes, this indicates an issue.
			return syscall.EIO
		}
		if n.debug {
			log.Printf("Node -> loadModel() loading model for ID: %d", inodeID)
		}
		model, err := n.store.GetNode(int64(inodeID))
		if err != nil {
			log.Printf("ERROR: Node -> loadModel() failed for ID %d: %v", inodeID, err)
			return syscall.EIO // Or map os.ErrNotExist to ENOENT?
		}
		n.model = model
	}
	return nil
}

// Getattr retrieves the attributes for the node.
func (n *sqliteNode) Getattr(ctx context.Context, fh fs.FileHandle, out *fuse.AttrOut) syscall.Errno {
	// Inode ID should be available via n.Inode.StableAttr().Ino
	inodeID := n.Inode.StableAttr().Ino
	if n.debug {
		log.Printf("Node -> Getattr() called for ID: %d", inodeID)
	}

	// Ensure the model is loaded (might be redundant if loaded elsewhere, but safe)
	if err := n.loadModel(ctx); err != nil {
		log.Printf("ERROR: Node -> Getattr() failed loading model for ID %d: %v", inodeID, err)
		return syscall.EIO
	}

	if n.model == nil { // Should not happen after loadModel, but check defensively
		log.Printf("ERROR: Node -> Getattr() model is nil after loading for ID %d", inodeID)
		return syscall.EIO
	}

	out.Attr.Ino = uint64(n.model.ID)
	out.Attr.Size = uint64(n.model.Size)
	out.Attr.Blksize = 4096                              // Standard block size
	out.Attr.Blocks = (uint64(n.model.Size) + 511) / 512 // 512-byte blocks
	out.Attr.Atime = uint64(n.model.Atime.Unix())
	out.Attr.Mtime = uint64(n.model.Mtime.Unix())
	out.Attr.Ctime = uint64(n.model.Ctime.Unix())
	out.Attr.Atimensec = uint32(n.model.Atime.Nanosecond())
	out.Attr.Mtimensec = uint32(n.model.Mtime.Nanosecond())
	out.Attr.Ctimensec = uint32(n.model.Ctime.Nanosecond())
	out.Attr.Mode = uint32(n.model.Mode) // Mode already includes S_IFDIR/S_IFREG flags if set correctly
	out.Attr.Nlink = 1                   // We don't support hard links for now
	out.Attr.Uid = n.model.UID
	out.Attr.Gid = n.model.GID

	if n.debug {
		log.Printf("Node -> Getattr() success for ID: %d, Size: %d, Mode: %v", n.model.ID, out.Attr.Size, n.model.Mode)
	}
	return fs.OK // Use fs.OK for success
}

// Helper to fill fuse.Attr from models.Node
// Used by Getattr and potentially Lookup, Create, Mkdir results.
func entryOutFromModel(model *models.Node, out *fuse.Attr) {
	out.Ino = uint64(model.ID)
	out.Size = uint64(model.Size)
	out.Blksize = 4096
	out.Blocks = (uint64(model.Size) + 511) / 512 // Assuming 512 byte blocks
	out.Atime = uint64(model.Atime.Unix())
	out.Mtime = uint64(model.Mtime.Unix())
	out.Ctime = uint64(model.Ctime.Unix())
	out.Atimensec = uint32(model.Atime.Nanosecond())
	out.Mtimensec = uint32(model.Mtime.Nanosecond())
	out.Ctimensec = uint32(model.Ctime.Nanosecond())
	out.Mode = uint32(model.Mode) // Mode should include S_IFDIR/S_IFREG
	out.Nlink = 1                 // Assume 1 link unless hard links are supported
	out.Uid = model.UID
	out.Gid = model.GID
}
