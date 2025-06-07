package main

import (
	"fmt"
	"io"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"github.com/lirlia/100day_challenge_backend/day61_container_runtime/internal/registry"
	"github.com/lirlia/100day_challenge_backend/day61_container_runtime/internal/storage"
)

func pullCmd() *cobra.Command {
	var force bool

	cmd := &cobra.Command{
		Use:   "pull [image:tag]",
		Short: "Pull a Docker image from registry",
		Long: `Pull a Docker image from Docker Hub or other registries.
Supports standard Docker image naming conventions.

Examples:
  container pull busybox:latest
  container pull alpine:3.18
  container pull ubuntu:22.04`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			imageName := args[0]

			// Parse image name and tag
			name, tag := parseImageName(imageName)

			logVerbose("Pulling image: %s:%s", name, tag)

			if force {
				logVerbose("Force pull enabled - will overwrite existing image")
			}

			// TODO: Implement actual pull logic
			return pullImage(name, tag, force)
		},
	}

	cmd.Flags().BoolVar(&force, "force", false, "Force pull even if image exists locally")

	return cmd
}

// parseImageName parses Docker image name into name and tag
func parseImageName(imageName string) (name, tag string) {
	parts := strings.Split(imageName, ":")
	if len(parts) == 1 {
		return parts[0], "latest"
	}
	return parts[0], parts[1]
}

// pullImage implements the pull logic
func pullImage(name, tag string, force bool) error {
	// Phase 1: Basic validation and logging
	if name == "" {
		return fmt.Errorf("image name cannot be empty")
	}

	logDebug("Starting pull process for %s:%s", name, tag)

	// Initialize storage manager
	storageManager := getStorageManager()

	// Check if image already exists (unless force is specified)
	if !force {
		if storageManager.ImageExists(name, tag) {
			fmt.Printf("Image %s:%s already exists locally. Use --force to re-pull.\n", name, tag)
			return nil
		}
	}

	// Phase 2: Registry authentication and manifest retrieval
	fmt.Printf("Pulling %s:%s...\n", name, tag)

	return pullImageFromRegistry(name, tag, storageManager)
}

// pullImageFromRegistry implements the actual pull logic using registry API
func pullImageFromRegistry(name, tag string, storageManager *storage.Manager) error {
	// Parse repository name for Docker Hub
	repository := registry.ParseRepository(name)

	// Create registry client
	client := registry.NewClient("")

	// Get authentication token
	logVerbose("Getting authentication token...")
	if err := client.GetAuthToken(repository); err != nil {
		return fmt.Errorf("failed to get auth token: %w", err)
	}

	// Get manifest
	logVerbose("Fetching image manifest...")
	manifest, err := client.GetManifest(repository, tag)
	if err != nil {
		return fmt.Errorf("failed to get manifest: %w", err)
	}
	fmt.Printf("✓ Manifest downloaded\n")

	// Get image config
	logVerbose("Fetching image configuration...")
	config, err := client.GetImageConfig(repository, manifest.Config.Digest)
	if err != nil {
		return fmt.Errorf("failed to get image config: %w", err)
	}

	// Download layers
	logVerbose("Downloading %d layers...", len(manifest.Layers))
	var layerDigests []string
	var totalSize int64

	for i, layer := range manifest.Layers {
		// Check if layer already exists
		if storageManager.LayerExists(layer.Digest) {
			logVerbose("Layer %d/%d already exists: %s", i+1, len(manifest.Layers), truncateDigest(layer.Digest))
			layerDigests = append(layerDigests, layer.Digest)
			totalSize += layer.Size
			continue
		}

		logVerbose("Downloading layer %d/%d: %s (%.2f MB)", i+1, len(manifest.Layers),
			truncateDigest(layer.Digest), float64(layer.Size)/1024/1024)

		// Download layer
		layerReader, size, err := client.DownloadLayer(repository, layer.Digest)
		if err != nil {
			return fmt.Errorf("failed to download layer %s: %w", layer.Digest, err)
		}

		// Read layer data
		layerData, err := io.ReadAll(layerReader)
		layerReader.Close()
		if err != nil {
			return fmt.Errorf("failed to read layer data: %w", err)
		}

		// Save layer to storage
		if _, err := storageManager.SaveLayer(layer.Digest, layerData); err != nil {
			return fmt.Errorf("failed to save layer: %w", err)
		}

		layerDigests = append(layerDigests, layer.Digest)
		totalSize += size

		fmt.Printf("✓ Layer %s downloaded (%.2f MB)\n",
			truncateDigest(layer.Digest), float64(len(layerData))/1024/1024)
	}

	// Create and save image metadata
	localImage := &storage.LocalImage{
		Repository:   name,
		Tag:          tag,
		Digest:       manifest.Config.Digest,
		Size:         totalSize,
		Architecture: config.Architecture,
		OS:           config.OS,
		Created:      config.Created,
		Author:       config.Author,
		Config:       config,
		Manifest:     manifest,
		Layers:       layerDigests,
		PulledAt:     time.Now(),
	}

	if err := storageManager.SaveImage(localImage); err != nil {
		return fmt.Errorf("failed to save image metadata: %w", err)
	}

	fmt.Printf("✓ Image %s:%s pulled successfully (%.2f MB)\n", name, tag, float64(totalSize)/1024/1024)

	return nil
}

// truncateDigest truncates a digest for display
func truncateDigest(digest string) string {
	if len(digest) > 12 {
		return digest[:12] + "..."
	}
	return digest
}