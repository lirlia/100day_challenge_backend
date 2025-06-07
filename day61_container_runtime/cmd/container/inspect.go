package main

import (
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/lirlia/100day_challenge_backend/day61_container_runtime/internal/storage"
)

func inspectCmd() *cobra.Command {
	var format string

	cmd := &cobra.Command{
		Use:   "inspect [image:tag]",
		Short: "Display detailed information about an image",
		Long: `Display detailed information about a Docker image.
Shows image metadata, configuration, layers, and other details.

Examples:
  container inspect busybox:latest
  container inspect --format json alpine:3.18`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			imageName := args[0]

			// Parse image name and tag
			name, tag := parseImageName(imageName)

			logVerbose("Inspecting image: %s:%s", name, tag)

			return inspectImage(name, tag, format)
		},
	}

	cmd.Flags().StringVar(&format, "format", "table", "Output format (table, json, yaml)")

	return cmd
}

// ImageInfo contains detailed information about an image
type ImageInfo struct {
	Repository    string            `json:"repository"`
	Tag           string            `json:"tag"`
	Digest        string            `json:"digest"`
	Size          int64             `json:"size"`
	Architecture  string            `json:"architecture"`
	OS            string            `json:"os"`
	Created       string            `json:"created"`
	Author        string            `json:"author"`
	Config        *ImageConfig      `json:"config"`
	RootFS        *RootFSInfo       `json:"rootfs"`
	Layers        []LayerInfo       `json:"layers"`
	Labels        map[string]string `json:"labels"`
	Environment   []string          `json:"environment"`
	ExposedPorts  []string          `json:"exposedPorts"`
	WorkingDir    string            `json:"workingDir"`
	Entrypoint    []string          `json:"entrypoint"`
	Cmd           []string          `json:"cmd"`
}

// ImageConfig contains image configuration
type ImageConfig struct {
	User       string            `json:"user"`
	Memory     int64             `json:"memory"`
	CPUShares  int64             `json:"cpuShares"`
	CPUQuota   int64             `json:"cpuQuota"`
	Labels     map[string]string `json:"labels"`
}

// RootFSInfo contains rootfs information
type RootFSInfo struct {
	Type   string   `json:"type"`
	Layers []string `json:"layers"`
}

// LayerInfo contains layer information
type LayerInfo struct {
	Digest string `json:"digest"`
	Size   int64  `json:"size"`
	Type   string `json:"type"`
}

// inspectImage displays detailed information about an image
func inspectImage(name, tag, format string) error {
	logDebug("Loading image information for %s:%s", name, tag)

	storageManager := getStorageManager()

	// Load image from storage
	localImage, err := storageManager.LoadImage(name, tag)
	if err != nil {
		return fmt.Errorf("failed to load image: %w", err)
	}

	if localImage == nil {
		return fmt.Errorf("image %s:%s not found locally", name, tag)
	}

	// Convert to ImageInfo format
	imageInfo := convertToImageInfo(localImage)

	switch format {
	case "json":
		return printJSON(imageInfo)
	case "yaml":
		return printYAML(imageInfo)
	case "table":
		fallthrough
	default:
		return printTable(imageInfo)
	}
}

// convertToImageInfo converts storage.LocalImage to ImageInfo for display
func convertToImageInfo(localImage *storage.LocalImage) *ImageInfo {
	// Convert layers
	var layers []LayerInfo
	var exposedPorts []string
	var environment []string
	var entrypoint []string
	var cmd []string
	var workingDir string
	var labels map[string]string

	// Extract information from image config if available
	if localImage.Config != nil && localImage.Config.Config != nil {
		environment = localImage.Config.Config.Env
		cmd = localImage.Config.Config.Cmd
		workingDir = localImage.Config.Config.WorkingDir
		entrypoint = localImage.Config.Config.Entrypoint
		labels = localImage.Config.Config.Labels

		// Convert exposed ports
		for port := range localImage.Config.Config.ExposedPorts {
			exposedPorts = append(exposedPorts, port)
		}
	}

	// Convert manifest layers to LayerInfo
	if localImage.Manifest != nil {
		for _, layer := range localImage.Manifest.Layers {
			layers = append(layers, LayerInfo{
				Digest: layer.Digest,
				Size:   layer.Size,
				Type:   layer.MediaType,
			})
		}
	}

	// Create rootfs info
	var rootfsLayers []string
	if localImage.Config != nil && localImage.Config.RootFS != nil {
		rootfsLayers = localImage.Config.RootFS.DiffIDs
	}

	return &ImageInfo{
		Repository:   localImage.Repository,
		Tag:          localImage.Tag,
		Digest:       localImage.Digest,
		Size:         localImage.Size,
		Architecture: localImage.Architecture,
		OS:           localImage.OS,
		Created:      localImage.Created,
		Author:       localImage.Author,
		Config: &ImageConfig{
			User:      "",
			Memory:    0,
			CPUShares: 0,
			CPUQuota:  0,
			Labels:    labels,
		},
		RootFS: &RootFSInfo{
			Type:   "layers",
			Layers: rootfsLayers,
		},
		Layers:       layers,
		Labels:       labels,
		Environment:  environment,
		ExposedPorts: exposedPorts,
		WorkingDir:   workingDir,
		Entrypoint:   entrypoint,
		Cmd:          cmd,
	}
}

// printJSON prints image info in JSON format
func printJSON(info *ImageInfo) error {
	data, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal JSON: %w", err)
	}
	fmt.Println(string(data))
	return nil
}

// printYAML prints image info in YAML format (simplified)
func printYAML(info *ImageInfo) error {
	// TODO: Implement proper YAML output
	fmt.Printf("repository: %s\n", info.Repository)
	fmt.Printf("tag: %s\n", info.Tag)
	fmt.Printf("digest: %s\n", info.Digest)
	fmt.Printf("size: %d\n", info.Size)
	fmt.Printf("architecture: %s\n", info.Architecture)
	fmt.Printf("os: %s\n", info.OS)
	fmt.Printf("created: %s\n", info.Created)
	return nil
}

// printTable prints image info in table format
func printTable(info *ImageInfo) error {
	fmt.Printf("Image: %s:%s\n", info.Repository, info.Tag)
	fmt.Printf("Digest: %s\n", info.Digest)
	fmt.Printf("Size: %.2f MB\n", float64(info.Size)/1024/1024)
	fmt.Printf("Architecture: %s\n", info.Architecture)
	fmt.Printf("OS: %s\n", info.OS)
	fmt.Printf("Created: %s\n", info.Created)
	fmt.Printf("Author: %s\n", info.Author)

	if info.Config != nil && len(info.Config.Labels) > 0 {
		fmt.Printf("\nLabels:\n")
		for key, value := range info.Config.Labels {
			fmt.Printf("  %s: %s\n", key, value)
		}
	}

	if len(info.Environment) > 0 {
		fmt.Printf("\nEnvironment:\n")
		for _, env := range info.Environment {
			fmt.Printf("  %s\n", env)
		}
	}

	if len(info.Cmd) > 0 {
		fmt.Printf("\nDefault Command: %v\n", info.Cmd)
	}

	if info.WorkingDir != "" {
		fmt.Printf("Working Directory: %s\n", info.WorkingDir)
	}

	fmt.Printf("\nLayers (%d):\n", len(info.Layers))
	for i, layer := range info.Layers {
		fmt.Printf("  %d. %s (%.2f MB)\n", i+1,
			truncateString(layer.Digest, 20),
			float64(layer.Size)/1024/1024)
	}

	return nil
}