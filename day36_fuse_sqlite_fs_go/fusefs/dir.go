package fusefs

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	"github.com/hanwen/go-fuse/v2/fuse"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
)

// sqliteDir represents a directory node.
type sqliteDir struct {
	sqliteNode // Embed the base node logic
}

// Ensure sqliteDir implements necessary interfaces
var _ fs.NodeGetattrer = (*sqliteDir)(nil)
var _ fs.NodeLookuper = (*sqliteDir)(nil)
var _ fs.NodeMkdirer = (*sqliteDir)(nil)
var _ fs.NodeCreater = (*sqliteDir)(nil)
var _ fs.NodeReaddirer = (*sqliteDir)(nil)
var _ fs.NodeRmdirer = (*sqliteDir)(nil)
var _ fs.NodeUnlinker = (*sqliteDir)(nil) // For removing files

// Getattr delegates to the embedded sqliteNode.
func (d *sqliteDir) Getattr(ctx context.Context, fh fs.FileHandle, out *fuse.AttrOut) syscall.Errno {
	return d.sqliteNode.Getattr(ctx, fh, out)
}

// Lookup looks up a name in this directory.
func (d *sqliteDir) Lookup(ctx context.Context, name string, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	log.Printf("Dir -> Lookup() in ID: %d, looking for: %s", d.sqliteNode.model.ID, name)
	if d.sqliteNode.model == nil {
		log.Println("ERROR: Dir -> Lookup() called on node with nil model")
		return nil, syscall.EIO
	}

	childModel, err := d.sqliteNode.store.GetChildNode(d.sqliteNode.model.ID, name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, syscall.ENOENT
		}
		log.Printf("ERROR: Dir -> Lookup() failed getting child %s in dir %d: %v", name, d.sqliteNode.model.ID, err)
		return nil, syscall.EIO
	}

	// Use the helper from root.go (or move it to node.go)
	childNode := d.newChildInode(ctx, childModel)
	entryOutFromModel(childModel, &out.Attr)
	return childNode, fs.OK
}

// Readdir reads the content of this directory.
func (d *sqliteDir) Readdir(ctx context.Context) (fs.DirStream, syscall.Errno) {
	log.Printf("Dir -> Readdir() called for ID: %d", d.sqliteNode.model.ID)
	if d.sqliteNode.model == nil {
		log.Println("ERROR: Dir -> Readdir() called on node with nil model")
		return nil, syscall.EIO
	}

	children, err := d.sqliteNode.store.ListChildren(d.sqliteNode.model.ID)
	if err != nil {
		log.Printf("ERROR: Dir -> Readdir() failed listing children for dir %d: %v", d.sqliteNode.model.ID, err)
		return nil, syscall.EIO
	}

	entries := make([]fuse.DirEntry, 0, len(children))
	for _, child := range children {
		entry := fuse.DirEntry{
			Mode: uint32(child.Mode),
			Name: child.Name,
			Ino:  uint64(child.ID),
		}
		entries = append(entries, entry)
	}
	return fs.NewListDirStream(entries), fs.OK
}

// Mkdir creates a directory inside this directory.
func (d *sqliteDir) Mkdir(ctx context.Context, name string, mode uint32, out *fuse.EntryOut) (*fs.Inode, syscall.Errno) {
	log.Printf("Dir -> Mkdir() in ID: %d, creating: %s with mode %v", d.sqliteNode.model.ID, name, os.FileMode(mode))
	if d.sqliteNode.model == nil {
		log.Println("ERROR: Dir -> Mkdir() called on node with nil model")
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
		log.Printf("ERROR: Dir -> Mkdir() failed creating node %s in dir %d: %v", name, d.sqliteNode.model.ID, err)
		// TODO: Map EEXIST
		return nil, syscall.EIO
	}

	childNode := d.newChildInode(ctx, createdModel)
	entryOutFromModel(createdModel, &out.Attr)
	return childNode, fs.OK
}

// Create creates a file inside this directory.
func (d *sqliteDir) Create(ctx context.Context, name string, flags uint32, mode uint32, out *fuse.EntryOut) (node *fs.Inode, fh fs.FileHandle, fuseFlags uint32, errno syscall.Errno) {
	log.Printf("Dir -> Create() in ID: %d, creating file: %s with mode %v, flags %x", d.sqliteNode.model.ID, name, os.FileMode(mode), flags)
	if d.sqliteNode.model == nil {
		log.Println("ERROR: Dir -> Create() called on node with nil model")
		return nil, nil, 0, syscall.EIO
	}

	// Check existence
	_, err := d.sqliteNode.store.GetChildNode(d.sqliteNode.model.ID, name)
	if err == nil {
		return nil, nil, 0, syscall.EEXIST
	} else if !errors.Is(err, os.ErrNotExist) {
		log.Printf("ERROR: Dir -> Create() failed checking for existing child %s in dir %d: %v", name, d.sqliteNode.model.ID, err)
		return nil, nil, 0, syscall.EIO
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
		log.Printf("ERROR: Dir -> Create() failed creating node %s in dir %d: %v", name, d.sqliteNode.model.ID, err)
		return nil, nil, 0, syscall.EIO
	}

	childInode := d.newChildInode(ctx, createdModel)
	fileNode := childInode.Operations().(*sqliteFile)
	handle := &sqliteHandle{fileNode: fileNode}
	entryOutFromModel(createdModel, &out.Attr)
	fuseFlags = fuse.FOPEN_KEEP_CACHE
	return childInode, handle, fuseFlags, fs.OK
}

// Rmdir removes an empty directory.
func (d *sqliteDir) Rmdir(ctx context.Context, name string) syscall.Errno {
	log.Printf("Dir -> Rmdir() in ID: %d, removing: %s", d.sqliteNode.model.ID, name)
	if d.sqliteNode.model == nil {
		log.Println("ERROR: Dir -> Rmdir() called on node with nil model")
		return syscall.EIO
	}

	childModel, err := d.sqliteNode.store.GetChildNode(d.sqliteNode.model.ID, name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return syscall.ENOENT
		}
		log.Printf("ERROR: Dir -> Rmdir() failed getting child %s in dir %d: %v", name, d.sqliteNode.model.ID, err)
		return syscall.EIO
	}

	if !childModel.IsDir {
		return syscall.ENOTDIR // Trying to rmdir a file
	}

	// store.DeleteNode should check for emptiness
	err = d.sqliteNode.store.DeleteNode(childModel.ID)
	if err != nil {
		log.Printf("ERROR: Dir -> Rmdir() failed deleting node %d (%s): %v", childModel.ID, name, err)
		// TODO: Map ENOTEMPTY from store error
		if err.Error() == "directory "+fmt.Sprintf("%d", childModel.ID)+" is not empty" { // Fragile
			return syscall.ENOTEMPTY
		}
		return syscall.EIO
	}

	return fs.OK
}

// Unlink removes a file.
func (d *sqliteDir) Unlink(ctx context.Context, name string) syscall.Errno {
	log.Printf("Dir -> Unlink() in ID: %d, removing: %s", d.sqliteNode.model.ID, name)
	if d.sqliteNode.model == nil {
		log.Println("ERROR: Dir -> Unlink() called on node with nil model")
		return syscall.EIO
	}

	childModel, err := d.sqliteNode.store.GetChildNode(d.sqliteNode.model.ID, name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return syscall.ENOENT
		}
		log.Printf("ERROR: Dir -> Unlink() failed getting child %s in dir %d: %v", name, d.sqliteNode.model.ID, err)
		return syscall.EIO
	}

	if childModel.IsDir {
		return syscall.EISDIR // Trying to unlink a directory
	}

	err = d.sqliteNode.store.DeleteNode(childModel.ID)
	if err != nil {
		log.Printf("ERROR: Dir -> Unlink() failed deleting node %d (%s): %v", childModel.ID, name, err)
		return syscall.EIO
	}

	return fs.OK
}

// Helper to create child inodes (moved from root.go or duplicated/refined)
func (d *sqliteDir) newChildInode(ctx context.Context, model *models.Node) *fs.Inode {
	var child fs.NodeEmbedder
	if model.IsDir {
		child = &sqliteDir{sqliteNode: sqliteNode{store: d.sqliteNode.store, model: model}}
	} else {
		child = &sqliteFile{sqliteNode: sqliteNode{store: d.sqliteNode.store, model: model}}
	}
	stable := &fuse.StableAttr{Ino: uint64(model.ID), Mode: uint32(model.Mode)}
	// Use d.Inode as the parent Inode for creating the child
	childInode := d.Inode.NewInode(ctx, child, stable)
	return childInode
}
