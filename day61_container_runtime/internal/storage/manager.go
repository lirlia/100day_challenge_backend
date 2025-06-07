package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/lirlia/100day_challenge_backend/day61_container_runtime/internal/registry"
)

// Manager handles local storage of images and layers
type Manager struct {
	dataDir string
}

// NewManager creates a new storage manager
func NewManager(dataDir string) *Manager {
	return &Manager{
		dataDir: dataDir,
	}
}

// LocalImage represents a locally stored image
type LocalImage struct {
	Repository   string                  `json:"repository"`
	Tag          string                  `json:"tag"`
	Digest       string                  `json:"digest"`
	Size         int64                   `json:"size"`
	Architecture string                  `json:"architecture"`
	OS           string                  `json:"os"`
	Created      string                  `json:"created"`
	Author       string                  `json:"author"`
	Config       *registry.ImageConfig   `json:"config"`
	Manifest     *registry.Manifest      `json:"manifest"`
	Layers       []string                `json:"layers"`
	PulledAt     time.Time               `json:"pulledAt"`
}

// Layer represents a locally stored layer
type Layer struct {
	Digest   string    `json:"digest"`
	Size     int64     `json:"size"`
	Path     string    `json:"path"`
	PulledAt time.Time `json:"pulledAt"`
}

// SaveImage saves image metadata to local storage
func (m *Manager) SaveImage(image *LocalImage) error {
	imagePath := filepath.Join(m.dataDir, "images", fmt.Sprintf("%s_%s.json", image.Repository, image.Tag))

	// Create directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(imagePath), 0755); err != nil {
		return fmt.Errorf("failed to create image directory: %w", err)
	}

	data, err := json.MarshalIndent(image, "", "  ")
	if err != nil {
		return fmt.Errorf("failed to marshal image metadata: %w", err)
	}

	if err := os.WriteFile(imagePath, data, 0644); err != nil {
		return fmt.Errorf("failed to write image metadata: %w", err)
	}

	return nil
}

// LoadImage loads image metadata from local storage
func (m *Manager) LoadImage(repository, tag string) (*LocalImage, error) {
	imagePath := filepath.Join(m.dataDir, "images", fmt.Sprintf("%s_%s.json", repository, tag))

	data, err := os.ReadFile(imagePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // Image not found
		}
		return nil, fmt.Errorf("failed to read image metadata: %w", err)
	}

	var image LocalImage
	if err := json.Unmarshal(data, &image); err != nil {
		return nil, fmt.Errorf("failed to unmarshal image metadata: %w", err)
	}

	return &image, nil
}

// ListImages lists all locally stored images
func (m *Manager) ListImages() ([]*LocalImage, error) {
	imagesDir := filepath.Join(m.dataDir, "images")

	entries, err := os.ReadDir(imagesDir)
	if err != nil {
		if os.IsNotExist(err) {
			return []*LocalImage{}, nil // No images directory yet
		}
		return nil, fmt.Errorf("failed to read images directory: %w", err)
	}

	var images []*LocalImage
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".json" {
			imagePath := filepath.Join(imagesDir, entry.Name())

			data, err := os.ReadFile(imagePath)
			if err != nil {
				continue // Skip files we can't read
			}

			var image LocalImage
			if err := json.Unmarshal(data, &image); err != nil {
				continue // Skip files we can't parse
			}

			images = append(images, &image)
		}
	}

	return images, nil
}

// ImageExists checks if an image exists in local storage
func (m *Manager) ImageExists(repository, tag string) bool {
	imagePath := filepath.Join(m.dataDir, "images", fmt.Sprintf("%s_%s.json", repository, tag))
	_, err := os.Stat(imagePath)
	return err == nil
}

// SaveLayer saves a layer to local storage
func (m *Manager) SaveLayer(digest string, layerData []byte) (string, error) {
	layerPath := filepath.Join(m.dataDir, "layers", digest+".tar.gz")

	// Create directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(layerPath), 0755); err != nil {
		return "", fmt.Errorf("failed to create layer directory: %w", err)
	}

	if err := os.WriteFile(layerPath, layerData, 0644); err != nil {
		return "", fmt.Errorf("failed to write layer data: %w", err)
	}

	// Save layer metadata
	layer := &Layer{
		Digest:   digest,
		Size:     int64(len(layerData)),
		Path:     layerPath,
		PulledAt: time.Now(),
	}

	metadataPath := filepath.Join(m.dataDir, "layers", digest+".json")
	metadataData, err := json.MarshalIndent(layer, "", "  ")
	if err != nil {
		return "", fmt.Errorf("failed to marshal layer metadata: %w", err)
	}

	if err := os.WriteFile(metadataPath, metadataData, 0644); err != nil {
		return "", fmt.Errorf("failed to write layer metadata: %w", err)
	}

	return layerPath, nil
}

// LoadLayer loads layer metadata from local storage
func (m *Manager) LoadLayer(digest string) (*Layer, error) {
	metadataPath := filepath.Join(m.dataDir, "layers", digest+".json")

	data, err := os.ReadFile(metadataPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // Layer not found
		}
		return nil, fmt.Errorf("failed to read layer metadata: %w", err)
	}

	var layer Layer
	if err := json.Unmarshal(data, &layer); err != nil {
		return nil, fmt.Errorf("failed to unmarshal layer metadata: %w", err)
	}

	return &layer, nil
}

// LayerExists checks if a layer exists in local storage
func (m *Manager) LayerExists(digest string) bool {
	layerPath := filepath.Join(m.dataDir, "layers", digest+".tar.gz")
	_, err := os.Stat(layerPath)
	return err == nil
}

// GetLayerPath returns the path to a layer file
func (m *Manager) GetLayerPath(digest string) string {
	return filepath.Join(m.dataDir, "layers", digest+".tar.gz")
}

// DeleteImage removes an image from local storage
func (m *Manager) DeleteImage(repository, tag string) error {
	imagePath := filepath.Join(m.dataDir, "images", fmt.Sprintf("%s_%s.json", repository, tag))

	if err := os.Remove(imagePath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete image metadata: %w", err)
	}

	return nil
}

// DeleteLayer removes a layer from local storage
func (m *Manager) DeleteLayer(digest string) error {
	layerPath := filepath.Join(m.dataDir, "layers", digest+".tar.gz")
	metadataPath := filepath.Join(m.dataDir, "layers", digest+".json")

	// Remove layer data
	if err := os.Remove(layerPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete layer data: %w", err)
	}

	// Remove layer metadata
	if err := os.Remove(metadataPath); err != nil && !os.IsNotExist(err) {
		return fmt.Errorf("failed to delete layer metadata: %w", err)
	}

	return nil
}

// GetStorageStats returns storage statistics
func (m *Manager) GetStorageStats() (map[string]interface{}, error) {
	images, err := m.ListImages()
	if err != nil {
		return nil, fmt.Errorf("failed to list images: %w", err)
	}

	layersDir := filepath.Join(m.dataDir, "layers")
	entries, err := os.ReadDir(layersDir)
	if err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to read layers directory: %w", err)
	}

	var totalSize int64
	layerCount := 0

	for _, entry := range entries {
		if filepath.Ext(entry.Name()) == ".tar.gz" {
			layerCount++
			info, err := entry.Info()
			if err == nil {
				totalSize += info.Size()
			}
		}
	}

	for _, image := range images {
		totalSize += image.Size
	}

	stats := map[string]interface{}{
		"images":     len(images),
		"layers":     layerCount,
		"totalSize":  totalSize,
		"dataDir":    m.dataDir,
	}

	return stats, nil
}