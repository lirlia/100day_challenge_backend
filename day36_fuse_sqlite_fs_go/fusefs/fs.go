package fusefs

import (
	"log"

	"bazil.org/fuse"
	"bazil.org/fuse/fs"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/store"
)

// Compile-time checks to ensure our types implement the FUSE interfaces.
var _ fs.FS = (*FileSystem)(nil)

// var _ fs.Node = (*Dir)(nil) // Add check for Dir later
// var _ fs.Node = (*File)(nil) // Add check for File later

// FileSystem implements the FUSE filesystem interface.
type FileSystem struct {
	store store.Store // Use the combined Store interface
	// Add more fields if needed, e.g., logger, config
}

// NewFileSystem creates a new FileSystem instance.
func NewFileSystem(s store.Store) *FileSystem {
	return &FileSystem{
		store: s,
	}
}

// Root returns the root directory node of the filesystem.
func (f *FileSystem) Root() (fs.Node, error) {
	log.Println("FS -> Root() called")
	rootNode, err := f.store.GetNode(1) // Root node ID is 1
	if err != nil {
		log.Printf("ERROR: Failed to get root node: %v", err)
		// If the root node doesn't exist in the DB, something is fundamentally wrong.
		// FUSE expects an error like EIO (Input/output error) or similar in critical failures.
		return nil, fuse.EIO
	}

	if !rootNode.IsDir {
		log.Printf("ERROR: Node ID 1 is not a directory!")
		return nil, fuse.EIO // Critical error
	}

	log.Printf("FS -> Root() returning Dir node for ID: %d", rootNode.ID)
	// Return a Dir node (implementation will be in dir.go)
	// Pass the store down to the node.
	return &Dir{Node: Node{model: rootNode, store: f.store}}, nil
}

// --- Temporary Node/Dir/File structs until defined in separate files ---
// Node represents a basic node in the FUSE FS, embedding the DB model.
// This will be moved to node.go
/*
type Node struct {
	model *models.Node
	store store.Store
}
*/

// Attr fills the file attributes.
// This basic implementation will be moved to node.go
/*
func (n *Node) Attr(ctx context.Context, a *fuse.Attr) error {
	log.Printf("Node -> Attr() called for ID: %d, Name: %s", n.model.ID, n.model.Name)
	a.Inode = uint64(n.model.ID)
	a.Mode = n.model.Mode
	a.Size = uint64(n.model.Size)
	a.Atime = n.model.Atime
	a.Mtime = n.model.Mtime
	a.Ctime = n.model.Ctime
	a.Uid = n.model.UID
	a.Gid = n.model.GID
	return nil
}
*/

// Dir represents a directory node.
// This will be moved to dir.go
type Dir struct {
	Node // Embed the basic Node implementation
}

// TODO: Implement Dir specific methods like Lookup, Mkdir, Readdir, Remove

// File represents a file node.
// This will be moved to file.go
type File struct {
	Node // Embed the basic Node implementation
}

// TODO: Implement File specific methods like Open, Create
