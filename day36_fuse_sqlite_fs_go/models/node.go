package models

import (
	"os"
	"time"
)

// Node represents a file or directory entry in the filesystem.
// Corresponds to the 'inodes' table in the database.
type Node struct {
	ID       int64       // Inode number (Primary Key)
	ParentID int64       // Parent inode ID
	Name     string      // File/directory name
	IsDir    bool        // True if it's a directory
	Mode     os.FileMode // File permissions (e.g., 0755)
	Size     int64       // Size in bytes
	Atime    time.Time   // Last access time
	Mtime    time.Time   // Last modification time
	Ctime    time.Time   // Creation time / Last metadata change time
	UID      uint32      // User ID of owner
	GID      uint32      // Group ID of owner
}
