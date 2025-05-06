package fusefs

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"syscall"

	"bazil.org/fuse"
	"bazil.org/fuse/fs"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/models"
)

// Compile-time checks to ensure Dir implements the necessary FUSE interfaces.
var _ fs.Node = (*Dir)(nil)
var _ fs.NodeLookuper = (*Dir)(nil)
var _ fs.NodeMkdirer = (*Dir)(nil)
var _ fs.HandleReadDirAller = (*Dir)(nil)
var _ fs.NodeRemover = (*Dir)(nil)
var _ fs.NodeCreater = (*Dir)(nil)

// Dir represents a directory node in the FUSE filesystem.
type Dir struct {
	Node // Embed the common Node implementation
}

// Lookup looks up a specific entry in the directory.
func (d *Dir) Lookup(ctx context.Context, name string) (fs.Node, error) {
	log.Printf("Dir -> Lookup() called in dir ID: %d, Name: %s, looking for: %s", d.model.ID, d.model.Name, name)

	childModel, err := d.store.GetChildNode(d.model.ID, name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			log.Printf("Dir -> Lookup() entry not found: %s", name)
			return nil, fuse.ENOENT // Entry not found
		}
		log.Printf("ERROR: Dir -> Lookup() failed to get child node: %v", err)
		return nil, fuse.EIO // Input/output error or other internal error
	}

	// Create the appropriate node type (Dir or File) based on the model
	if childModel.IsDir {
		log.Printf("Dir -> Lookup() found directory: %+v", childModel)
		return &Dir{Node: newNode(childModel, d.store)}, nil
	} else {
		log.Printf("Dir -> Lookup() found file: %+v", childModel)
		return &File{Node: newNode(childModel, d.store)}, nil // File struct defined in file.go
	}
}

// Mkdir creates a new directory.
func (d *Dir) Mkdir(ctx context.Context, req *fuse.MkdirRequest) (fs.Node, error) {
	log.Printf("Dir -> Mkdir() called in dir ID: %d, Name: %s, creating: %s with mode %v", d.model.ID, d.model.Name, req.Name, req.Mode)

	// Create the node model for the new directory
	newDirModel := &models.Node{
		ParentID: d.model.ID,
		Name:     req.Name,
		IsDir:    true,
		Mode:     req.Mode,
		Size:     0, // Directories have size 0 in this model
		UID:      req.Header.Uid,
		GID:      req.Header.Gid,
	}

	createdModel, err := d.store.CreateNode(newDirModel)
	if err != nil {
		log.Printf("ERROR: Dir -> Mkdir() failed to create node in store: %v", err)
		// TODO: Check for specific errors like EEXIST (duplicate name)
		// For now, return a generic error
		return nil, fuse.EIO
	}

	log.Printf("Dir -> Mkdir() created directory: %+v", createdModel)
	return &Dir{Node: newNode(createdModel, d.store)}, nil
}

// ReadDirAll reads all directory entries.
func (d *Dir) ReadDirAll(ctx context.Context) ([]fuse.Dirent, error) {
	log.Printf("Dir -> ReadDirAll() called for dir ID: %d, Name: %s", d.model.ID, d.model.Name)

	children, err := d.store.ListChildren(d.model.ID)
	if err != nil {
		log.Printf("ERROR: Dir -> ReadDirAll() failed to list children: %v", err)
		return nil, fuse.EIO
	}

	var entries []fuse.Dirent
	for _, child := range children {
		entry := fuse.Dirent{
			Inode: uint64(child.ID),
			Name:  child.Name,
		}
		if child.IsDir {
			entry.Type = fuse.DT_Dir
		} else {
			entry.Type = fuse.DT_File
		}
		entries = append(entries, entry)
		log.Printf("Dir -> ReadDirAll() adding entry: %+v", entry)
	}

	log.Printf("Dir -> ReadDirAll() returning %d entries", len(entries))
	return entries, nil
}

// Remove removes a file or directory.
func (d *Dir) Remove(ctx context.Context, req *fuse.RemoveRequest) error {
	log.Printf("Dir -> Remove() called in dir ID: %d, Name: %s, removing: %s (IsDir: %v)", d.model.ID, d.model.Name, req.Name, req.Dir)

	// Find the node to be removed
	childModel, err := d.store.GetChildNode(d.model.ID, req.Name)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			log.Printf("Dir -> Remove() entry not found: %s", req.Name)
			return fuse.ENOENT
		}
		log.Printf("ERROR: Dir -> Remove() failed to get child node %s: %v", req.Name, err)
		return fuse.EIO
	}

	// Check if the type matches (trying to rmdir a file or rm a dir)
	if req.Dir != childModel.IsDir {
		if req.Dir {
			log.Printf("Dir -> Remove() attempt to rmdir a file: %s", req.Name)
			return fuse.Errno(syscall.ENOTDIR) // Not a directory
		} else {
			log.Printf("Dir -> Remove() attempt to rm a directory: %s", req.Name)
			return fuse.Errno(syscall.EISDIR) // Is a directory
		}
	}

	// Delete the node from the store
	err = d.store.DeleteNode(childModel.ID)
	if err != nil {
		log.Printf("ERROR: Dir -> Remove() failed to delete node %d (%s): %v", childModel.ID, req.Name, err)
		// Check if the error was due to directory not being empty
		// The store's DeleteNode currently returns a generic error. Need to improve error mapping.
		// For now, assume EIO for store errors.
		if err.Error() == fmt.Sprintf("directory %d is not empty", childModel.ID) { // Fragile check
			return fuse.Errno(syscall.ENOTEMPTY)
		}
		return fuse.EIO
	}

	log.Printf("Dir -> Remove() successfully removed node %d (%s)", childModel.ID, req.Name)
	return nil
}

// Create handles the creation of a new file within this directory.
func (d *Dir) Create(ctx context.Context, req *fuse.CreateRequest, resp *fuse.CreateResponse) (fs.Node, fs.Handle, error) {
	log.Printf("Dir -> Create() called in dir ID: %d, Name: %s, creating file: %s with mode %v, flags %s",
		d.model.ID, d.model.Name, req.Name, req.Mode, req.Flags.String())

	// Check if a node with the same name already exists
	_, err := d.store.GetChildNode(d.model.ID, req.Name)
	if err == nil {
		log.Printf("Dir -> Create() file already exists: %s", req.Name)
		return nil, nil, fuse.EEXIST // File exists
	} else if !errors.Is(err, os.ErrNotExist) {
		log.Printf("ERROR: Dir -> Create() failed checking for existing child: %v", err)
		return nil, nil, fuse.EIO // Other error during check
	}

	// Create the node model for the new file
	newFileModel := &models.Node{
		ParentID: d.model.ID,
		Name:     req.Name,
		IsDir:    false,
		Mode:     req.Mode, // Use mode from request
		Size:     0,
		UID:      req.Header.Uid,
		GID:      req.Header.Gid,
	}

	createdModel, err := d.store.CreateNode(newFileModel)
	if err != nil {
		log.Printf("ERROR: Dir -> Create() failed to create node in store: %v", err)
		return nil, nil, fuse.EIO // Internal error
	}

	log.Printf("Dir -> Create() created file node: %+v", createdModel)
	newFileNode := &File{Node: newNode(createdModel, d.store)}

	// Open the newly created file and return a handle
	// Mimic the Open logic from File.Open
	handle := &FileHandle{file: newFileNode} // FileHandle defined in handle.go

	log.Printf("Dir -> Create() returning new File node and handle")
	return newFileNode, handle, nil
}
