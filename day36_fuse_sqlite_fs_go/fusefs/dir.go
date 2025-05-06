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

// sqliteDir represents a directory node in the filesystem.
type sqliteDir struct {
	sqliteNode // Embed the base node implementation
}

// Ensure sqliteDir implements necessary directory interfaces
var _ fs.NodeGetattrer = (*sqliteDir)(nil)
var _ fs.NodeLookuper = (*sqliteDir)(nil)
var _ fs.NodeMkdirer = (*sqliteDir)(nil)
var _ fs.NodeCreater = (*sqliteDir)(nil)
var _ fs.NodeReaddirer = (*sqliteDir)(nil)
var _ fs.NodeRmdirer = (*sqliteDir)(nil)
var _ fs.NodeUnlinker = (*sqliteDir)(nil)

// Getattr delegates to the embedded sqliteNode.
func (d *sqliteDir) Getattr(ctx context.Context, fh fs.FileHandle, out *fuse.AttrOut) syscall.Errno {
	// Debug logging for Getattr is handled within sqliteNode.Getattr itself
	return d.sqliteNode.Getattr(ctx, fh, out)
}

// Lookup looks up a name in the directory.
func (d *sqliteDir) Lookup(ctx context.Context, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Lookup() looking for: %s", d.sqliteNode.model.ID, name)
	}
	if d.sqliteNode.model == nil {
		log.Printf("ERROR: Dir (Ino:%d) -> Lookup() called before model loaded?", d.sqliteNode.Inode.StableAttr().Ino)
		return nil, syscall.EIO
	}

	childModel, err := d.sqliteNode.store.GetChildNode(d.sqliteNode.model.ID, name)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			if d.sqliteNode.debug {
				log.Printf("Dir (ID:%d) -> Lookup() entry not found: %s", d.sqliteNode.model.ID, name)
			}
			return nil, syscall.ENOENT
		}
		log.Printf("ERROR: Dir (ID:%d) -> Lookup() failed getting child %s: %v", d.sqliteNode.model.ID, name, err)
		return nil, syscall.EIO
	}

	// Create the child Inode using the helper
	childNode := d.newChildInode(ctx, childModel)

	// Set attributes for the response
	entryOutFromModel(childModel, &out.Attr)

	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Lookup() found %s, Inode Ino: %d", d.sqliteNode.model.ID, name, childNode.StableAttr().Ino)
	}
	return childNode, fs.OK
}

// Readdir reads the content of the directory.
func (d *sqliteDir) Readdir(ctx context.Context) (fs.DirStream, syscall.Errno) {
	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Readdir() called", d.sqliteNode.model.ID)
	}
	if d.sqliteNode.model == nil {
		log.Printf("ERROR: Dir (Ino:%d) -> Readdir() called before model loaded?", d.sqliteNode.Inode.StableAttr().Ino)
		return nil, syscall.EIO
	}

	children, err := d.sqliteNode.store.ListChildren(d.sqliteNode.model.ID)
	if err != nil {
		log.Printf("ERROR: Dir (ID:%d) -> Readdir() failed listing children: %v", d.sqliteNode.model.ID, err)
		return nil, syscall.EIO
	}

	entries := make([]fuse.DirEntry, 0, len(children))
	for _, child := range children {
		entry := fuse.DirEntry{
			Mode: uint32(child.Mode), // Mode includes file type
			Name: child.Name,
			Ino:  uint64(child.ID),
		}
		entries = append(entries, entry)
		// Individual entry logging can be too verbose, skip for now unless specifically needed
		// if d.sqliteNode.debug {
		// 	log.Printf("Dir (ID:%d) -> Readdir() adding entry: Name=%s, Ino=%d", d.sqliteNode.model.ID, entry.Name, entry.Ino)
		// }
	}

	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Readdir() returning %d entries", d.sqliteNode.model.ID, len(entries))
	}
	return fs.NewListDirStream(entries), fs.OK
}

// Mkdir creates a directory inside this directory.
func (d *sqliteDir) Mkdir(ctx context.Context, name string, mode uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Mkdir() creating: %s with mode %v", d.sqliteNode.model.ID, name, os.FileMode(mode))
	}
	if d.sqliteNode.model == nil {
		log.Printf("ERROR: Dir (Ino:%d) -> Mkdir() called before model loaded?", d.sqliteNode.Inode.StableAttr().Ino)
		return nil, syscall.EIO
	}

	caller, _ := fuse.FromContext(ctx)
	newDirModel := &models.Node{
		ParentID: d.sqliteNode.model.ID,
		Name:     name,
		IsDir:    true,
		Mode:     os.FileMode(mode) | os.ModeDir,
		Size:     0,
		UID:      caller.Uid,
		GID:      caller.Gid,
	}

	createdModel, err := d.sqliteNode.store.CreateNode(newDirModel)
	if err != nil {
		log.Printf("ERROR: Dir (ID:%d) -> Mkdir() failed creating node %s: %v", d.sqliteNode.model.ID, name, err)
		// TODO: Map EEXIST from store
		return nil, syscall.EIO
	}

	childNode := d.newChildInode(ctx, createdModel)
	entryOutFromModel(createdModel, &out.Attr)

	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Mkdir() created %s, Inode ID: %d", d.sqliteNode.model.ID, createdModel.Name, createdModel.ID)
	}
	return childNode, fs.OK
}

// Create creates a file inside this directory.
func (d *sqliteDir) Create(ctx context.Context, name string, flags uint32, mode uint32, out *fuse.EntryOut) (node *fs.Inode, fh fs.FileHandle, fuseFlags uint32, errno syscall.Errno) {
	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Create() creating file: %s with mode %v, flags %x", d.sqliteNode.model.ID, name, os.FileMode(mode), flags)
	}
	if d.sqliteNode.model == nil {
		log.Printf("ERROR: Dir (Ino:%d) -> Create() called before model loaded?", d.sqliteNode.Inode.StableAttr().Ino)
		return nil, nil, 0, syscall.EIO
	}

	// Check existence
	_, err := d.sqliteNode.store.GetChildNode(d.sqliteNode.model.ID, name)

	if err == nil {
		// File exists - return EEXIST
		if d.sqliteNode.debug {
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
	if d.sqliteNode.debug {
		log.Printf("Create(): File '%s' does not exist, proceeding.", name)
	}

	caller, _ := fuse.FromContext(ctx)
	newFileModel := &models.Node{
		ParentID: d.sqliteNode.model.ID,
		Name:     name,
		IsDir:    false,
		Mode:     os.FileMode(mode) & ^os.ModeType,
		Size:     0,
		UID:      caller.Uid,
		GID:      caller.Gid,
	}

	createdModel, err := d.sqliteNode.store.CreateNode(newFileModel)
	if err != nil {
		log.Printf("ERROR: Dir (ID:%d) -> Create() failed creating node %s: %v", d.sqliteNode.model.ID, name, err)
		return nil, nil, 0, syscall.EIO
	}

	childInode := d.newChildInode(ctx, createdModel)
	fileNode := childInode.Operations().(*sqliteFile)
	handle := &sqliteHandle{fileNode: fileNode}

	entryOutFromModel(createdModel, &out.Attr)
	fuseFlags = fuse.FOPEN_KEEP_CACHE

	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Create() created %s, Inode ID: %d", d.sqliteNode.model.ID, name, createdModel.ID)
	}
	return childInode, handle, fuseFlags, fs.OK
}

// Rmdir removes an empty directory.
func (d *sqliteDir) Rmdir(ctx context.Context, name string) syscall.Errno {
	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Rmdir() removing: %s", d.sqliteNode.model.ID, name)
	}
	if d.sqliteNode.model == nil {
		return syscall.EIO
	}

	err := d.sqliteNode.store.DeleteNode(d.sqliteNode.model.ID, name, true)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) { // Use store.ErrNotFound
			return syscall.ENOENT
		} else if errors.Is(err, store.ErrNotEmpty) {
			// hanwen/go-fuse uses ENOTEMPTY for this
			return syscall.ENOTEMPTY
		} else if errors.Is(err, store.ErrNotADirectory) {
			return syscall.ENOTDIR
		}
		log.Printf("ERROR: Dir (ID:%d) -> Rmdir() failed deleting node %s: %v", d.sqliteNode.model.ID, name, err)
		return syscall.EIO
	}

	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Rmdir() removed %s successfully", d.sqliteNode.model.ID, name)
	}
	return fs.OK
}

// Unlink removes a file.
func (d *sqliteDir) Unlink(ctx context.Context, name string) syscall.Errno {
	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Unlink() removing: %s", d.sqliteNode.model.ID, name)
	}
	if d.sqliteNode.model == nil {
		return syscall.EIO
	}

	err := d.sqliteNode.store.DeleteNode(d.sqliteNode.model.ID, name, false)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) { // Use store.ErrNotFound
			return syscall.ENOENT
		} else if errors.Is(err, store.ErrIsDirectory) {
			return syscall.EISDIR // Trying to unlink a directory
		}
		log.Printf("ERROR: Dir (ID:%d) -> Unlink() failed deleting node %s: %v", d.sqliteNode.model.ID, name, err)
		return syscall.EIO
	}

	if d.sqliteNode.debug {
		log.Printf("Dir (ID:%d) -> Unlink() removed %s successfully", d.sqliteNode.model.ID, name)
	}
	return fs.OK
}

// Helper to create child inodes (either Dir or File)
// Duplicated from root.go for now, could be refactored.
func (d *sqliteDir) newChildInode(ctx context.Context, model *models.Node) *fs.Inode {
	var child fs.InodeEmbedder
	if model.IsDir {
		child = &sqliteDir{sqliteNode: sqliteNode{store: d.sqliteNode.store, model: model, debug: d.sqliteNode.debug}}
	} else {
		child = &sqliteFile{sqliteNode: sqliteNode{store: d.sqliteNode.store, model: model, debug: d.sqliteNode.debug}}
	}
	stable := &fs.StableAttr{Ino: uint64(model.ID), Mode: uint32(model.Mode)}
	childInode := d.sqliteNode.Inode.NewInode(ctx, child, *stable)
	return childInode
}
