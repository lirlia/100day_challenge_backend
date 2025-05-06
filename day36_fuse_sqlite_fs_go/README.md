# Day 36: FUSE SQLite Filesystem in Go

This project implements a userspace filesystem using FUSE (Filesystem in Userspace) with Go. It uses a SQLite database as the backend storage for file and directory metadata and file content.

## Overview

- **Language:** Go
- **FUSE Library:** `github.com/hanwen/go-fuse/v2`
- **Database:** SQLite (`github.com/mattn/go-sqlite3`)
- **Storage:**
    - Metadata (inodes, names, permissions, timestamps, etc.) stored in the `nodes` table.
    - File content stored as BLOBs in the `file_data` table.
- **Goal:** Learn about FUSE implementation and interaction between userspace filesystems and the OS kernel.

## Features

- Mountable filesystem via FUSE (`macfuse.io` or Linux FUSE required).
- Stores filesystem structure and data in a SQLite DB (`db/dev.db`).
- Supports basic operations:
    - `mkdir`, `rmdir`
    - `touch`, `create`
    - `ls`, `stat` (Getattr)
    - `echo "..." > file` (Write)
    - `cat file` (Read)
    - `rm file` (Unlink)
    - Truncate (`Setattr` with size)

## How to Build and Run

1.  **Prerequisites:**
    *   Go compiler (>= 1.18)
    *   `macfuse` (on macOS) or FUSE development headers (on Linux).
2.  **Build:**
    ```bash
    cd day36_fuse_sqlite_fs_go
    go build -o sqlitefs .
    ```
3.  **Create Mountpoint:**
    ```bash
    mkdir mnt
    chmod 755 mnt
    ```
4.  **Run (Mount):**
    *   Open a terminal in the `day36_fuse_sqlite_fs_go` directory.
    *   Run the executable, specifying the mountpoint and database path (use absolute paths for reliability):
        ```bash
        # Use absolute paths for mountpoint and db
        ./sqlitefs -mountpoint=/path/to/100day_challenge_backend/day36_fuse_sqlite_fs_go/mnt \\
                   -db=/path/to/100day_challenge_backend/day36_fuse_sqlite_fs_go/db/dev.db
        ```
    *   Add the `-debug` flag for verbose FUSE operation logging:
        ```bash
        ./sqlitefs -mountpoint=... -db=... -debug
        ```
5.  **Interact:**
    *   Open *another* terminal.
    *   Use standard commands (`ls`, `cd`, `mkdir`, `touch`, `echo`, `cat`, `rm`) on the mountpoint (`/path/to/.../mnt`).
6.  **Unmount:**
    *   Press `Ctrl+C` in the terminal where `sqlitefs` is running.
    *   If it doesn't unmount cleanly, you might need `diskutil unmount /path/to/.../mnt` (macOS) or `fusermount -u /path/to/.../mnt` (Linux).

## Notes

- The database file (`db/dev.db`) will be created automatically on the first run if it doesn't exist.
- Deleting the `db/dev.db` file effectively resets the filesystem.
- File content is stored entirely in memory within the Go process during read/write operations and then read/written to the SQLite BLOB. This is inefficient for large files.
- Extended attributes (`xattr`) are not currently supported.
- Hard links are not supported (link count is always 1).
- On macOS, `ls -la` on the mountpoint itself might show `root wheel` as the owner due to FUSE/OS behavior, but files created *inside* the mountpoint should have the correct user/group ownership based on the running process and database entries.
