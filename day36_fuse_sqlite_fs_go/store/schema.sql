-- Filesystem Nodes (Inodes)
CREATE TABLE IF NOT EXISTS inodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  parent_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_dir BOOLEAN NOT NULL DEFAULT FALSE,
  mode INTEGER NOT NULL DEFAULT 0644,
  -- File permissions (e.g., 0755 for dir, 0644 for file)
  size INTEGER NOT NULL DEFAULT 0,
  -- Size in bytes
  atime INTEGER NOT NULL,
  -- Last access time (Unix timestamp)
  mtime INTEGER NOT NULL,
  -- Last modification time (Unix timestamp)
  ctime INTEGER NOT NULL,
  -- Creation time / Last metadata change time (Unix timestamp)
  uid INTEGER NOT NULL DEFAULT 0,
  -- User ID (defaulting to root for simplicity)
  gid INTEGER NOT NULL DEFAULT 0,
  -- Group ID (defaulting to root for simplicity)
  FOREIGN KEY (parent_id) REFERENCES inodes(id) ON DELETE CASCADE,
  UNIQUE (parent_id, name) -- Ensure unique names within a directory
);
-- File Content Blocks
-- Storing data in chunks might be more efficient for large files,
-- but for simplicity, we'll store the full content for now.
-- A separate table approach allows for sparse files later if needed.
CREATE TABLE IF NOT EXISTS file_data (
  inode_id INTEGER PRIMARY KEY,
  data BLOB,
  FOREIGN KEY (inode_id) REFERENCES inodes(id) ON DELETE CASCADE
);
-- Create the root directory if it doesn't exist
-- parent_id = 1 points to itself for the root
INSERT
  OR IGNORE INTO inodes (
    id,
    parent_id,
    name,
    is_dir,
    mode,
    size,
    atime,
    mtime,
    ctime,
    uid,
    gid
  )
VALUES (
    1,
    1,
    '',
    TRUE,
    0755,
    0,
    strftime('%s', 'now'),
    strftime('%s', 'now'),
    strftime('%s', 'now'),
    0,
    0
  );