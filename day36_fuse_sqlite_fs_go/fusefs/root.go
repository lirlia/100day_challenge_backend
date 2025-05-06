package fusefs

import (
	"context"
	"errors"
	"log"
	"os"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/store"
)

// sqliteRoot represents the root directory of the filesystem.
type sqliteRoot struct {
	sqliteNode // Embed the base node implementation
	// No extra fields needed for root itself, state is in sqliteNode.model
}

// Ensure sqliteRoot implements necessary interfaces
var _ fs.NodeOnAdder = (*sqliteRoot)(nil)
var _ fs.NodeGetattrer = (*sqliteRoot)(nil)
var _ fs.NodeLookuper = (*sqliteRoot)(nil)
var _ fs.NodeMkdirer = (*sqliteRoot)(nil)
var _ fs.NodeCreater = (*sqliteRoot)(nil)
var _ fs.NodeReaddirer = (*sqliteRoot)(nil)

// var _ fs.NodeRmdirer = (*sqliteRoot)(nil) // Rmdir will be on sqliteDir
// var _ fs.NodeUnlinker = (*sqliteRoot)(nil) // Unlink will be on sqliteDir

// NewRoot creates a new root node.
func NewRoot(store store.Store) *sqliteRoot {
	// Root node model will be loaded in OnAdd
	return &sqliteRoot{
		sqliteNode: sqliteNode{
			store: store,
			// model is initially nil, loaded in OnAdd
		},
	}
}

// OnAdd is called when the root node is added to the filesystem tree.
// We use this to load the root directory model from the database.
func (r *sqliteRoot) OnAdd(ctx context.Context) {
	log.Println("Root -> OnAdd() called")
	// Normally, Inode ID is set by the parent lookup/creation.
	// For root, the ID is fixed (1).
	// We need to set the StableAttr Ino here if not already set,
	// and then load the model.

	// Get the root inode ID (should always be 1)
	rootID := int64(fuse.FUSE_ROOT_ID) // FUSE_ROOT_ID is typically 1

	// Set the Ino in StableAttr if needed (might already be set by fs framework)
	if r.Inode.StableAttr().Ino == 0 {
		r.Inode.SetStable(&fuse.StableAttr{Ino: uint64(rootID)})
		log.Printf("Root -> OnAdd() set root Ino to %d", rootID)
	}

	// Load the model from the store
	model, err := r.store.GetNode(rootID)
	if err != nil {
		// This is a critical error, filesystem cannot start without a root node.
		log.Fatalf("CRITICAL: Failed to load root node (ID %d) from store: %v", rootID, err)
		// In a real scenario, might return an error or panic.
	}

	if !model.IsDir {
		log.Fatalf("CRITICAL: Root node (ID %d) is not a directory in the database!", rootID)
	}

	r.model = model // Assign the loaded model to the embedded sqliteNode
	log.Printf("Root -> OnAdd() loaded root model: %+v", r.model)
}

// --- Directory Operations --- (Implemented on Root for now)

// Lookup looks up a name in the root directory.
func (r *sqliteRoot) Lookup(ctx context.Context, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	log.Printf("Root -> Lookup() looking for: %s", name)
	if r.model == nil {
		log.Println("ERROR: Root -> Lookup() called before root model loaded")
		return nil, syscall.EIO
	}

	childModel, err := r.store.GetChildNode(r.model.ID, name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			log.Printf("Root -> Lookup() entry not found: %s", name)
			return nil, syscall.ENOENT // Not found
		}
		log.Printf("ERROR: Root -> Lookup() failed getting child %s: %v", name, err)
		return nil, syscall.EIO // Internal error
	}

	// Create the child Inode
	childNode := r.newChildInode(ctx, childModel)

	// Set attributes for the response
	entryOutFromModel(childModel, &out.Attr)

	log.Printf("Root -> Lookup() found %s, Inode ID: %d", name, childModel.ID)
	return childNode, fs.OK
}

// Readdir reads the content of the root directory.
func (r *sqliteRoot) Readdir(ctx context.Context) (fs.DirStream, syscall.Errno) {
	log.Printf("Root -> Readdir() called")
	if r.model == nil {
		log.Println("ERROR: Root -> Readdir() called before root model loaded")
		return nil, syscall.EIO
	}

	children, err := r.store.ListChildren(r.model.ID)
	if err != nil {
		log.Printf("ERROR: Root -> Readdir() failed listing children: %v", err)
		return nil, syscall.EIO
	}

	entries := make([]fuse.DirEntry, 0, len(children))
	for _, child := range children {
		entry := fuse.DirEntry{
			Mode: uint32(child.Mode), // Ensure mode includes file type (S_IFDIR/S_IFREG)
			Name: child.Name,
			Ino:  uint64(child.ID),
		}
		entries = append(entries, entry)
		log.Printf("Root -> Readdir() adding entry: Name=%s, Ino=%d, Mode=%v", entry.Name, entry.Ino, child.Mode)
	}

	log.Printf("Root -> Readdir() returning %d entries", len(entries))
	return fs.NewListDirStream(entries), fs.OK
}

// Mkdir creates a directory inside the root directory.
func (r *sqliteRoot) Mkdir(ctx context.Context, name string, mode uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	log.Printf("Root -> Mkdir() creating: %s with mode %v", name, os.FileMode(mode))
	if r.model == nil {
		log.Println("ERROR: Root -> Mkdir() called before root model loaded")
		return nil, syscall.EIO
	}

	// Get UID/GID from context
	caller, _ := fuse.FromContext(ctx)

	newDirModel := &models.Node{
		ParentID: r.model.ID,
		Name:     name,
		IsDir:    true,
		Mode:     os.FileMode(mode) | os.ModeDir, // Ensure ModeDir is set
		Size:     0,
		UID:      caller.Uid,
		GID:      caller.Gid,
	}

	createdModel, err := r.store.CreateNode(newDirModel)
	if err != nil {
		log.Printf("ERROR: Root -> Mkdir() failed creating node %s: %v", name, err)
		// TODO: Map EEXIST from store
		return nil, syscall.EIO
	}

	childNode := r.newChildInode(ctx, createdModel)
	entryOutFromModel(createdModel, &out.Attr)

	log.Printf("Root -> Mkdir() created %s, Inode ID: %d", name, createdModel.ID)
	return childNode, fs.OK
}

// Create creates a file inside the root directory.
func (r *sqliteRoot) Create(ctx context.Context, name string, flags uint32, mode uint32, out *fuse.EntryOut) (node *fs.Inode, fh fs.FileHandle, fuseFlags uint32, errno syscall.Errno) {
	log.Printf("Root -> Create() creating file: %s with mode %v, flags %x", name, os.FileMode(mode), flags)
	if r.model == nil {
		log.Println("ERROR: Root -> Create() called before root model loaded")
		return nil, nil, 0, syscall.EIO
	}

	// Check existence (though CreateNode in store might also do this)
	_, err := r.store.GetChildNode(r.model.ID, name)
	if err == nil {
		log.Printf("Root -> Create() file already exists: %s", name)
		return nil, nil, 0, syscall.EEXIST
	} else if !errors.Is(err, os.ErrNotExist) {
		log.Printf("ERROR: Root -> Create() failed checking for existing child %s: %v", name, err)
		return nil, nil, 0, syscall.EIO
	}

	caller, _ := fuse.FromContext(ctx)
	newFileModel := &models.Node{
		ParentID: r.model.ID,
		Name:     name,
		IsDir:    false,
		Mode:     os.FileMode(mode) & ^os.ModeType, // Ensure only permission bits, not type bits initially
		Size:     0,
		UID:      caller.Uid,
		GID:      caller.Gid,
	}

	createdModel, err := r.store.CreateNode(newFileModel)
	if err != nil {
		log.Printf("ERROR: Root -> Create() failed creating node %s: %v", name, err)
		return nil, nil, 0, syscall.EIO
	}

	// Create the Inode and FileHandle
	childInode := r.newChildInode(ctx, createdModel)
	fileNode := childInode.Operations().(*sqliteFile) // Assume newChildInode returns the correct type
	handle := &sqliteHandle{fileNode: fileNode}

	entryOutFromModel(createdModel, &out.Attr)

	fuseFlags = fuse.FOPEN_KEEP_CACHE // Keep cache by default

	log.Printf("Root -> Create() created %s, Inode ID: %d, returning handle", name, createdModel.ID)
	return childInode, handle, fuseFlags, fs.OK
}

// Helper to create child inodes (either Dir or File)
func (r *sqliteRoot) newChildInode(ctx context.Context, model *models.Node) *fs.Inode {
	var child fs.NodeEmbedder // Interface implemented by sqliteDir and sqliteFile
	if model.IsDir {
		// We need sqliteDir struct here
		child = &sqliteDir{sqliteNode: sqliteNode{store: r.store, model: model}}
	} else {
		// We need sqliteFile struct here
		child = &sqliteFile{sqliteNode: sqliteNode{store: r.store, model: model}}
	}

	// Create a new Inode. The StableAttr Ino should match the model.ID
	// Let the fs library manage child lifecycle (embedding fs.Inode)
	stable := &fuse.StableAttr{Ino: uint64(model.ID), Mode: uint32(model.Mode)}
	childInode := r.NewInode(ctx, child, stable)
	return childInode
}

// Helper to fill fuse.AttrOut from models.Node
func entryOutFromModel(model *models.Node, out *fuse.Attr) {
	out.Ino = uint64(model.ID)
	out.Size = uint64(model.Size)
	out.Blksize = 4096
	out.Blocks = (uint64(model.Size) + 511) / 512
	out.Atime = uint64(model.Atime.Unix())
	out.Mtime = uint64(model.Mtime.Unix())
	out.Ctime = uint64(model.Ctime.Unix())
	out.Atimensec = uint32(model.Atime.Nanosecond())
	out.Mtimensec = uint32(model.Mtime.Nanosecond())
	out.Ctimensec = uint32(model.Ctime.Nanosecond())
	out.Mode = uint32(model.Mode)
	out.Nlink = 1
	out.Uid = model.UID
	out.Gid = model.GID
}
