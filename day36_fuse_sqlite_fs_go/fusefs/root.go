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

// SqliteRoot represents the root node of our filesystem.
// It embeds sqliteNode to handle basic node operations and holds the store.
type SqliteRoot struct {
	sqliteNode // Embed the base node implementation
	// No extra fields needed for root itself, state is in sqliteNode.model
}

// Ensure SqliteRoot implements necessary root/directory interfaces
var _ fs.InodeEmbedder = (*SqliteRoot)(nil) // Should embed fs.Inode via sqliteNode
var _ fs.NodeOnAdder = (*SqliteRoot)(nil)
var _ fs.NodeGetattrer = (*SqliteRoot)(nil)
var _ fs.NodeLookuper = (*SqliteRoot)(nil)
var _ fs.NodeMkdirer = (*SqliteRoot)(nil)
var _ fs.NodeCreater = (*SqliteRoot)(nil)
var _ fs.NodeReaddirer = (*SqliteRoot)(nil)
var _ fs.NodeRmdirer = (*SqliteRoot)(nil)
var _ fs.NodeUnlinker = (*SqliteRoot)(nil)

// var _ fs.NodeRmdirer = (*sqliteRoot)(nil) // Rmdir will be on sqliteDir
// var _ fs.NodeUnlinker = (*sqliteRoot)(nil) // Unlink will be on sqliteDir

// NewRoot creates a new root node.
func NewRoot(store store.Store, debug bool) *SqliteRoot {
	// Root node model will be loaded in OnAdd
	return &SqliteRoot{
		sqliteNode: sqliteNode{
			store: store,
			debug: debug, // Pass debug flag
			// model is initially nil, loaded in OnAdd
		},
	}
}

// OnAdd is called when the root node is added to the filesystem tree.
// We use this to load the root directory model from the database.
func (r *SqliteRoot) OnAdd(ctx context.Context) {
	if r.sqliteNode.debug {
		log.Println("Root -> OnAdd() called")
	}
	// Normally, Inode ID is set by the parent lookup/creation.
	// For root, the ID is fixed (1).
	// We load the model here. The Inode itself (with StableAttr) should be
	// initialized by the library when Mount is called, potentially using
	// RootStableAttr from Options if provided.

	// Get the root inode ID (should always be 1)
	rootID := int64(fuse.FUSE_ROOT_ID) // FUSE_ROOT_ID is typically 1

	// We no longer need to manually set StableAttr here.
	/*
		// Set the Ino in StableAttr if needed (might already be set by fs framework)
		// Access via embedded sqliteNode.Inode
		if r.sqliteNode.Inode.StableAttr().Ino == 0 {
			r.sqliteNode.Inode.SetStable(&fs.StableAttr{Ino: uint64(rootID)}) // Needs fs.StableAttr, but SetStable doesn't exist
			log.Printf("Root -> OnAdd() set root Ino to %d", rootID)
		}
	*/

	// Load the model from the store (Access via sqliteNode)
	model, err := r.sqliteNode.store.GetNode(rootID)
	if err != nil {
		// This is a critical error, filesystem cannot start without a root node.
		log.Fatalf("CRITICAL: Failed to load root node (ID %d) from store: %v", rootID, err)
		// In a real scenario, might return an error or panic.
	}

	if !model.IsDir {
		log.Fatalf("CRITICAL: Root node (ID %d) is not a directory in the database!", rootID)
	}

	r.sqliteNode.model = model // Assign the loaded model to the embedded sqliteNode
	if r.sqliteNode.debug {
		log.Printf("Root -> OnAdd() loaded root model: %+v", r.sqliteNode.model)
	}
}

// Getattr delegates to the embedded sqliteNode's Getattr.
func (r *SqliteRoot) Getattr(ctx context.Context, fh fs.FileHandle, out *fuse.AttrOut) syscall.Errno {
	if r.sqliteNode.debug {
		log.Printf("Root -> Getattr() called")
	}
	return r.sqliteNode.Getattr(ctx, fh, out)
}

// --- Directory Operations --- (Lookup, Readdir, Mkdir, Create, Rmdir, Unlink)
// These methods largely duplicate the logic in sqliteDir, potentially refactorable.

// Lookup looks up a name in the root directory.
func (r *SqliteRoot) Lookup(ctx context.Context, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	if r.sqliteNode.debug {
		log.Printf("Root -> Lookup() looking for: %s", name)
	}
	if r.sqliteNode.model == nil {
		log.Println("ERROR: Root -> Lookup() called before root model loaded")
		return nil, syscall.EIO
	}

	childModel, err := r.sqliteNode.store.GetChildNode(r.sqliteNode.model.ID, name)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			// Log is optional, FUSE layer doesn't usually care about this expected error.
			// if r.sqliteNode.debug {
			// 	log.Printf("Root -> Lookup() entry not found: %s", name)
			// }
			return nil, syscall.ENOENT // Not found
		}
		log.Printf("ERROR: Root -> Lookup() failed getting child %s: %v", name, err)
		// Return EIO for unexpected errors from the store
		return nil, syscall.EIO
	}

	// Create the child Inode
	childNode := r.newChildInode(ctx, childModel)

	// Set attributes for the response
	entryOutFromModel(childModel, &out.Attr)

	if r.sqliteNode.debug {
		log.Printf("Root -> Lookup() found %s, Inode ID: %d", name, childModel.ID)
	}
	return childNode, fs.OK
}

// Readdir reads the content of the root directory.
func (r *SqliteRoot) Readdir(ctx context.Context) (fs.DirStream, syscall.Errno) {
	if r.sqliteNode.debug {
		log.Printf("Root -> Readdir() called")
	}
	if r.sqliteNode.model == nil {
		log.Println("ERROR: Root -> Readdir() called before root model loaded")
		return nil, syscall.EIO
	}

	children, err := r.sqliteNode.store.ListChildren(r.sqliteNode.model.ID)
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
		if r.sqliteNode.debug {
			log.Printf("Root -> Readdir() adding entry: Name=%s, Ino=%d, Mode=%v", entry.Name, entry.Ino, child.Mode)
		}
	}

	if r.sqliteNode.debug {
		log.Printf("Root -> Readdir() returning %d entries", len(entries))
	}
	return fs.NewListDirStream(entries), fs.OK
}

// Mkdir creates a directory inside the root directory.
func (r *SqliteRoot) Mkdir(ctx context.Context, name string, mode uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	if r.sqliteNode.debug {
		log.Printf("Root -> Mkdir() creating: %s with mode %v", name, os.FileMode(mode))
	}
	if r.sqliteNode.model == nil {
		log.Println("ERROR: Root -> Mkdir() called before root model loaded")
		return nil, syscall.EIO
	}

	// Get UID/GID from context
	caller, _ := fuse.FromContext(ctx)

	newDirModel := &models.Node{
		ParentID: r.sqliteNode.model.ID,
		Name:     name,
		IsDir:    true,
		Mode:     os.FileMode(mode) | os.ModeDir, // Ensure ModeDir is set
		Size:     0,
		UID:      caller.Uid,
		GID:      caller.Gid,
	}

	createdModel, err := r.sqliteNode.store.CreateNode(newDirModel)
	if err != nil {
		log.Printf("ERROR: Root -> Mkdir() failed creating node %s: %v", name, err)
		// TODO: Map EEXIST from store
		return nil, syscall.EIO
	}

	childNode := r.newChildInode(ctx, createdModel)
	entryOutFromModel(createdModel, &out.Attr)

	if r.sqliteNode.debug {
		log.Printf("Root -> Mkdir() created %s, Inode ID: %d", name, createdModel.ID)
	}
	return childNode, fs.OK
}

// Create creates a file inside the root directory.
func (r *SqliteRoot) Create(ctx context.Context, name string, flags uint32, mode uint32, out *fuse.EntryOut) (node *fs.Inode, fh fs.FileHandle, fuseFlags uint32, errno syscall.Errno) {
	if r.sqliteNode.debug {
		log.Printf("Root -> Create() creating file: %s with mode %v, flags %x", name, os.FileMode(mode), flags)
	}
	if r.sqliteNode.model == nil {
		log.Println("ERROR: Root -> Create() called before root model loaded")
		return nil, nil, 0, syscall.EIO
	}

	// Check existence
	_, err := r.sqliteNode.store.GetChildNode(r.sqliteNode.model.ID, name)

	if err == nil {
		// File exists - return EEXIST
		if r.sqliteNode.debug {
			log.Printf("Create(): File '%s' already exists.", name)
		}
		return nil, nil, 0, syscall.EEXIST
	}

	// Check if the error is the expected "not found" error
	if !errors.Is(err, store.ErrNotFound) {
		// An unexpected error occurred during the check
		log.Printf("ERROR: Create(): Unexpected error checking for child '%s': %v", name, err)
		return nil, nil, 0, syscall.EIO
	}

	// If we reach here, the error was store.ErrNotFound, which is expected.
	// Proceed with creating the new node.
	if r.sqliteNode.debug {
		log.Printf("Create(): File '%s' does not exist, proceeding.", name)
	}

	caller, _ := fuse.FromContext(ctx)
	newFileModel := &models.Node{
		ParentID: r.sqliteNode.model.ID,
		Name:     name,
		IsDir:    false,
		Mode:     os.FileMode(mode) & ^os.ModeType, // Ensure only permission bits, not type bits initially
		Size:     0,
		UID:      caller.Uid,
		GID:      caller.Gid,
	}

	createdModel, err := r.sqliteNode.store.CreateNode(newFileModel)
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

	if r.sqliteNode.debug {
		log.Printf("Root -> Create() created %s, Inode ID: %d, returning handle", name, createdModel.ID)
	}
	return childInode, handle, fuseFlags, fs.OK
}

// Rmdir removes an empty directory from the root.
func (r *SqliteRoot) Rmdir(ctx context.Context, name string) syscall.Errno {
	if r.sqliteNode.debug {
		log.Printf("Root (ID:%d) -> Rmdir() removing: %s", r.sqliteNode.model.ID, name)
	}
	if r.sqliteNode.model == nil {
		return syscall.EIO
	}

	err := r.sqliteNode.store.DeleteNode(r.sqliteNode.model.ID, name, true)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return syscall.ENOENT
		} else if errors.Is(err, store.ErrNotEmpty) {
			return syscall.ENOTEMPTY
		} else if errors.Is(err, store.ErrNotADirectory) {
			return syscall.ENOTDIR
		}
		log.Printf("ERROR: Root (ID:%d) -> Rmdir() failed deleting node %s: %v", r.sqliteNode.model.ID, name, err)
		return syscall.EIO
	}

	if r.sqliteNode.debug {
		log.Printf("Root (ID:%d) -> Rmdir() removed %s successfully", r.sqliteNode.model.ID, name)
	}
	return fs.OK
}

// Unlink removes a file from the root.
func (r *SqliteRoot) Unlink(ctx context.Context, name string) syscall.Errno {
	if r.sqliteNode.debug {
		log.Printf("Root (ID:%d) -> Unlink() removing: %s", r.sqliteNode.model.ID, name)
	}
	if r.sqliteNode.model == nil {
		return syscall.EIO
	}

	err := r.sqliteNode.store.DeleteNode(r.sqliteNode.model.ID, name, false)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return syscall.ENOENT
		} else if errors.Is(err, store.ErrIsDirectory) {
			return syscall.EISDIR // Trying to unlink a directory
		}
		log.Printf("ERROR: Root (ID:%d) -> Unlink() failed deleting node %s: %v", r.sqliteNode.model.ID, name, err)
		return syscall.EIO
	}

	if r.sqliteNode.debug {
		log.Printf("Root (ID:%d) -> Unlink() removed %s successfully", r.sqliteNode.model.ID, name)
	}
	return fs.OK
}

// Helper to create child inodes (either Dir or File)
func (r *SqliteRoot) newChildInode(ctx context.Context, model *models.Node) *fs.Inode {
	var child fs.InodeEmbedder // Use fs.InodeEmbedder
	if model.IsDir {
		// Pass store, model, and debug flag via embedded sqliteNode
		child = &sqliteDir{sqliteNode: sqliteNode{store: r.sqliteNode.store, model: model, debug: r.sqliteNode.debug}}
	} else {
		child = &sqliteFile{sqliteNode: sqliteNode{store: r.sqliteNode.store, model: model, debug: r.sqliteNode.debug}}
	}

	// Create a new Inode. The StableAttr Ino should match the model.ID
	// Let the fs library manage child lifecycle (embedding fs.Inode)
	stable := &fs.StableAttr{Ino: uint64(model.ID), Mode: uint32(model.Mode)} // Use fs.StableAttr
	// Access NewInode via the embedded fs.Inode within the embedded sqliteNode
	childInode := r.sqliteNode.Inode.NewInode(ctx, child, *stable) // Pass stable struct
	return childInode
}
