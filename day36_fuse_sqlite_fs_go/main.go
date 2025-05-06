package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/hanwen/go-fuse/v2/fs"
	_ "github.com/mattn/go-sqlite3" // driver

	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/fusefs"
	"github.com/lirlia/100day_challenge_backend/day36_fuse_sqlite_fs_go/store"
)

var (
	dbPath     = flag.String("db", "db/dev.db", "Path to the SQLite database file")
	mountpoint = flag.String("mountpoint", "", "Directory to mount the filesystem on")
	debug      = flag.Bool("debug", false, "Enable FUSE debug logging")
)

func main() {
	flag.Parse()

	if *mountpoint == "" {
		fmt.Println("Mountpoint directory is required.")
		flag.Usage()
		os.Exit(1)
	}

	// Initialize the store
	dbPath := "./db/dev.db" // Path relative to where the binary is run
	// Ensure the db directory exists
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		log.Fatalf("Failed to create database directory: %v", err)
	}
	log.Printf("Using database at: %s", dbPath)

	// Call NewSQLStore with the path (string), and handle the error return
	storage, err := store.NewSQLStore(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize store: %v", err)
	}
	defer storage.Close()

	// The root node implementation - use the constructor
	root := fusefs.NewRoot(storage, *debug)

	// --- FUSE Server Setup (hanwen/go-fuse) ---
	opts := &fs.Options{}
	opts.Debug = *debug
	opts.AllowOther = false // Set to true if needed (requires /etc/fuse.conf change)
	opts.FsName = "sqlitefs"
	opts.Name = "sqlitefs"
	// Add other options as needed, e.g.:
	// opts.MountOptions.Options = []string{"volname=SQLiteFS"} // For macOS volume name

	// Explicitly set the UID/GID for the mount using raw mount options
	opts.MountOptions.Options = append(opts.MountOptions.Options, fmt.Sprintf("uid=%d", os.Getuid()))
	opts.MountOptions.Options = append(opts.MountOptions.Options, fmt.Sprintf("gid=%d", os.Getgid()))

	server, err := fs.Mount(*mountpoint, root, opts)
	if err != nil {
		log.Fatalf("Failed to mount filesystem: %v", err)
	}

	log.Printf("Filesystem mounted at %s. Press Ctrl+C to unmount.", *mountpoint)

	// Setup signal handling for clean unmount
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		sig := <-sigChan
		log.Printf("Received signal: %v. Unmounting...", sig)
		if err := server.Unmount(); err != nil {
			log.Printf("ERROR: Failed to unmount %s on signal: %v", *mountpoint, err)
		} else {
			log.Println("Unmount successful.")
		}
	}()

	// Wait until unmount
	server.Wait()

	log.Println("Filesystem server finished.")
}
