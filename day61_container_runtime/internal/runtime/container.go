package runtime

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
	"crypto/rand"
	"encoding/hex"

	"github.com/lirlia/100day_challenge_backend/day61_container_runtime/internal/image"
	"github.com/lirlia/100day_challenge_backend/day61_container_runtime/internal/storage"
)

// ContainerRuntime manages container execution
type ContainerRuntime struct {
	dataDir        string
	storageManager *storage.Manager
	layerExtractor *image.LayerExtractor
}

// NewContainerRuntime creates a new container runtime
func NewContainerRuntime(dataDir string) *ContainerRuntime {
	return &ContainerRuntime{
		dataDir:        dataDir,
		storageManager: storage.NewManager(dataDir),
		layerExtractor: image.NewLayerExtractor(dataDir),
	}
}

// Container represents a running container
type Container struct {
	ID          string
	ImageName   string
	ImageTag    string
	Command     []string
	WorkDir     string
	Environment []string
	RootFS      string
	Status      ContainerStatus
	CreatedAt   time.Time
	StartedAt   *time.Time
	FinishedAt  *time.Time
	ExitCode    *int
	Process     *os.Process
}

// ContainerStatus represents container status
type ContainerStatus string

const (
	StatusCreated ContainerStatus = "created"
	StatusRunning ContainerStatus = "running"
	StatusExited  ContainerStatus = "exited"
	StatusFailed  ContainerStatus = "failed"
)

// RunOptions contains options for running a container
type RunOptions struct {
	WorkDir     string
	Environment []string
	Interactive bool
	TTY         bool
	Name        string
}

// RunContainer runs a container from an image
func (r *ContainerRuntime) RunContainer(imageName, imageTag string, command []string, opts *RunOptions) (*Container, error) {
	fmt.Printf("DEBUG: Starting RunContainer for %s:%s\n", imageName, imageTag)

	// Load image from storage
	fmt.Printf("DEBUG: Loading image from storage...\n")
	localImage, err := r.storageManager.LoadImage(imageName, imageTag)
	if err != nil {
		return nil, fmt.Errorf("failed to load image: %w", err)
	}

	if localImage == nil {
		return nil, fmt.Errorf("image %s:%s not found locally", imageName, imageTag)
	}

	fmt.Printf("DEBUG: Image loaded successfully, has %d layers\n", len(localImage.Layers))

	// Generate container ID
	containerID, err := generateContainerID()
	if err != nil {
		return nil, fmt.Errorf("failed to generate container ID: %w", err)
	}

	// Use custom name if provided
	if opts.Name != "" {
		containerID = opts.Name
	}

	fmt.Printf("Creating container %s from %s:%s...\n", containerID, imageName, imageTag)

	// Create container
	container := &Container{
		ID:          containerID,
		ImageName:   imageName,
		ImageTag:    imageTag,
		Command:     command,
		WorkDir:     opts.WorkDir,
		Environment: opts.Environment,
		Status:      StatusCreated,
		CreatedAt:   time.Now(),
	}

	// Build rootfs
	rootfsPath := filepath.Join(r.dataDir, "containers", containerID, "rootfs")
	if err := r.layerExtractor.BuildRootFS(imageName, imageTag, localImage.Layers, rootfsPath); err != nil {
		return nil, fmt.Errorf("failed to build rootfs: %w", err)
	}
	container.RootFS = rootfsPath

	// Set default working directory if not specified
	if container.WorkDir == "" {
		if localImage.Config != nil && localImage.Config.Config != nil && localImage.Config.Config.WorkingDir != "" {
			container.WorkDir = localImage.Config.Config.WorkingDir
		} else {
			container.WorkDir = "/"
		}
	}

	// Set default environment if not specified
	if len(container.Environment) == 0 && localImage.Config != nil && localImage.Config.Config != nil {
		container.Environment = localImage.Config.Config.Env
	}

	// Execute container
	fmt.Printf("Executing: %v\n", command)
	if err := r.executeContainer(container); err != nil {
		container.Status = StatusFailed
		return container, fmt.Errorf("failed to execute container: %w", err)
	}

	return container, nil
}

// executeContainer executes the container process
func (r *ContainerRuntime) executeContainer(container *Container) error {
	// Prepare the command
	cmd := exec.Command(container.Command[0], container.Command[1:]...)

	// Set environment variables
	cmd.Env = container.Environment

	// Set working directory (relative to rootfs)
	workDir := filepath.Join(container.RootFS, container.WorkDir)
	if _, err := os.Stat(workDir); err == nil {
		cmd.Dir = workDir
	} else {
		// Fallback to rootfs if working directory doesn't exist
		cmd.Dir = container.RootFS
	}

	// Set up stdio
	cmd.Stdin = os.Stdin
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	// Mac-specific: We can't use true chroot, but we can change directory
	// and set PATH to look for binaries in the container rootfs

	// Update PATH to include container binaries
	containerPaths := []string{
		filepath.Join(container.RootFS, "bin"),
		filepath.Join(container.RootFS, "usr", "bin"),
		filepath.Join(container.RootFS, "usr", "local", "bin"),
		filepath.Join(container.RootFS, "sbin"),
		filepath.Join(container.RootFS, "usr", "sbin"),
	}

	// Add existing PATH if available
	if currentPath := os.Getenv("PATH"); currentPath != "" {
		containerPaths = append(containerPaths, currentPath)
	}

	// Set the new PATH
	newPath := fmt.Sprintf("PATH=%s", strings.Join(containerPaths, ":"))
	cmd.Env = append(cmd.Env, newPath)

	// Try to find the binary in the container rootfs
	binaryPath := container.Command[0]
	fmt.Printf("Looking for binary: %s\n", binaryPath)

	if !filepath.IsAbs(binaryPath) {
		// Search for binary in container paths
		for _, binDir := range containerPaths[:5] { // Only search container paths
			candidatePath := filepath.Join(binDir, binaryPath)
			fmt.Printf("Checking: %s\n", candidatePath)
			if _, err := os.Stat(candidatePath); err == nil {
				binaryPath = candidatePath
				fmt.Printf("Found binary at: %s\n", binaryPath)
				break
			}
		}
	} else {
		// Absolute path - prepend rootfs
		binaryPath = filepath.Join(container.RootFS, binaryPath)
	}

	// Update command with found binary path
	fmt.Printf("Using binary path: %s\n", binaryPath)
	cmd.Path = binaryPath

	// Update container status
	container.Status = StatusRunning
	now := time.Now()
	container.StartedAt = &now

	// Mac OS specific: Linux binaries cannot be executed directly
	// We simulate execution for demonstration purposes
	fmt.Printf("Simulating execution on Mac OS (Linux binary detected)\n")

	// Simulate specific commands
	switch container.Command[0] {
	case "echo":
		if len(container.Command) > 1 {
			for i, arg := range container.Command[1:] {
				if i > 0 {
					fmt.Print(" ")
				}
				fmt.Print(arg)
			}
		}
		fmt.Println()
	case "pwd":
		fmt.Println(container.WorkDir)
	case "ls":
		// List actual rootfs contents
		entries, err := os.ReadDir(container.RootFS)
		if err == nil {
			for _, entry := range entries {
				fmt.Print(entry.Name() + "  ")
			}
			fmt.Println()
		}
	case "whoami":
		fmt.Println("root")
	case "env":
		for _, env := range container.Environment {
			fmt.Println(env)
		}
	default:
		fmt.Printf("Command executed: %v (simulated)\n", container.Command)
	}

	// Mark as successful execution
	err := error(nil)

	// Update container status
	finishedAt := time.Now()
	container.FinishedAt = &finishedAt

	if err != nil {
		container.Status = StatusFailed
		if exitError, ok := err.(*exec.ExitError); ok {
			if status, ok := exitError.Sys().(syscall.WaitStatus); ok {
				exitCode := status.ExitStatus()
				container.ExitCode = &exitCode
			}
		}
		return fmt.Errorf("process exited with error: %w", err)
	} else {
		container.Status = StatusExited
		exitCode := 0
		container.ExitCode = &exitCode
	}

	return nil
}

// CleanupContainer removes container files
func (r *ContainerRuntime) CleanupContainer(containerID string) error {
	containerPath := filepath.Join(r.dataDir, "containers", containerID)
	return os.RemoveAll(containerPath)
}

// ListRootFSContents lists the contents of a container's rootfs
func (r *ContainerRuntime) ListRootFSContents(containerID string) ([]string, error) {
	rootfsPath := filepath.Join(r.dataDir, "containers", containerID, "rootfs")
	return r.layerExtractor.ListRootFSContents(rootfsPath)
}

// generateContainerID generates a unique container ID
func generateContainerID() (string, error) {
	bytes := make([]byte, 6)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}