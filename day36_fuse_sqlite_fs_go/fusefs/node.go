package fusefs

import (
	"context"
	"log"

	"bazil.org/fuse"
	"bazil.org/fuse/fs"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/store"
)

// Compile-time check to ensure Node implements the necessary interface.
var _ fs.Node = (*Node)(nil)
var _ fs.NodeAttributes = (*Node)(nil)

// Node represents a generic node (file or directory) in the FUSE filesystem.
// It embeds the database model and holds a reference to the store.
type Node struct {
	model *models.Node
	store store.Store
}

// newNode creates a new Node wrapper.
func newNode(model *models.Node, s store.Store) Node {
	return Node{model: model, store: s}
}

// Attr fills the file attributes based on the underlying models.Node.
func (n *Node) Attr(ctx context.Context, a *fuse.Attr) error {
	log.Printf("Node -> Attr() called for ID: %d, Name: %s", n.model.ID, n.model.Name)
	if n.model == nil {
		log.Printf("ERROR: Node.Attr called on Node with nil model!")
		return fuse.EIO // Internal error
	}
	a.Inode = uint64(n.model.ID)
	a.Mode = n.model.Mode
	a.Size = uint64(n.model.Size)
	a.Atime = n.model.Atime
	a.Mtime = n.model.Mtime
	a.Ctime = n.model.Ctime
	a.Uid = n.model.UID
	a.Gid = n.model.GID

	// Set block count (important for tools like `ls`)
	// Use a simple estimate: size / 512, rounded up.
	a.Blocks = (a.Size + 511) / 512

	return nil
}
