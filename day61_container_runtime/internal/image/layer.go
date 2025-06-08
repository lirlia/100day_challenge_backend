package image

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

// LayerExtractor handles layer extraction and rootfs construction
type LayerExtractor struct {
	dataDir string
}

// NewLayerExtractor creates a new layer extractor
func NewLayerExtractor(dataDir string) *LayerExtractor {
	return &LayerExtractor{
		dataDir: dataDir,
	}
}

// ExtractLayer extracts a single layer to a target directory
func (e *LayerExtractor) ExtractLayer(layerPath, targetDir string) error {
	// fmt.Printf("  Extracting layer: %s\n", filepath.Base(layerPath))

	// Open the layer file
	file, err := os.Open(layerPath)
	if err != nil {
		return fmt.Errorf("failed to open layer file: %w", err)
	}
	defer file.Close()

	// Create gzip reader
	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return fmt.Errorf("failed to create gzip reader: %w", err)
	}
	defer gzipReader.Close()

	// Create tar reader
	tarReader := tar.NewReader(gzipReader)

	fileCount := 0
	// Extract files
	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to read tar header: %w", err)
		}

		fileCount++
		// if fileCount%100 == 0 {
		// 	fmt.Printf("    Processed %d files...\n", fileCount)
		// }

		// Clean the target path
		targetPath := filepath.Join(targetDir, header.Name)
		targetPath = filepath.Clean(targetPath)

		// Security check: prevent directory traversal
		if !strings.HasPrefix(targetPath, filepath.Clean(targetDir)+string(os.PathSeparator)) {
			// fmt.Printf("Warning: Skipping file outside target directory: %s\n", header.Name)
			continue
		}

		switch header.Typeflag {
		case tar.TypeDir:
			// Create directory
			if err := os.MkdirAll(targetPath, os.FileMode(header.Mode)); err != nil {
				return fmt.Errorf("failed to create directory %s: %w", targetPath, err)
			}

		case tar.TypeReg:
			// Create regular file
			if err := e.extractFile(tarReader, targetPath, header); err != nil {
				return fmt.Errorf("failed to extract file %s: %w", targetPath, err)
			}

		case tar.TypeSymlink:
			// Create symbolic link
			if err := e.extractSymlink(targetPath, header); err != nil {
				return fmt.Errorf("failed to create symlink %s: %w", targetPath, err)
			}

		case tar.TypeLink:
			// Create hard link
			if err := e.extractHardlink(targetDir, targetPath, header); err != nil {
				return fmt.Errorf("failed to create hardlink %s: %w", targetPath, err)
			}

		default:
			// Skip unsupported file types
			// fmt.Printf("Warning: Skipping unsupported file type %c for %s\n", header.Typeflag, header.Name)
		}
	}

	// fmt.Printf("  ✓ Extracted %d files from layer\n", fileCount)
	return nil
}

// extractFile extracts a regular file
func (e *LayerExtractor) extractFile(tarReader *tar.Reader, targetPath string, header *tar.Header) error {
	// Create parent directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create parent directory: %w", err)
	}

	// Create the file
	file, err := os.Create(targetPath)
	if err != nil {
		return fmt.Errorf("failed to create file: %w", err)
	}
	defer file.Close()

	// Copy content
	if _, err := io.Copy(file, tarReader); err != nil {
		return fmt.Errorf("failed to copy file content: %w", err)
	}

	// Set file permissions
	if err := file.Chmod(os.FileMode(header.Mode)); err != nil {
		return fmt.Errorf("failed to set file permissions: %w", err)
	}

	return nil
}

// extractSymlink creates a symbolic link
func (e *LayerExtractor) extractSymlink(targetPath string, header *tar.Header) error {
	// Create parent directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create parent directory: %w", err)
	}

	// Remove existing file if it exists
	os.Remove(targetPath)

	// Create symbolic link
	if err := os.Symlink(header.Linkname, targetPath); err != nil {
		return fmt.Errorf("failed to create symlink: %w", err)
	}

	return nil
}

// extractHardlink creates a hard link
func (e *LayerExtractor) extractHardlink(rootDir, targetPath string, header *tar.Header) error {
	// Create parent directory if it doesn't exist
	if err := os.MkdirAll(filepath.Dir(targetPath), 0755); err != nil {
		return fmt.Errorf("failed to create parent directory: %w", err)
	}

	// Calculate source path
	sourcePath := filepath.Join(rootDir, header.Linkname)

	// Remove existing file if it exists
	os.Remove(targetPath)

	// Create hard link
	if err := os.Link(sourcePath, targetPath); err != nil {
		return fmt.Errorf("failed to create hardlink: %w", err)
	}

	return nil
}

// BuildRootFS constructs a rootfs by applying layers in order
func (e *LayerExtractor) BuildRootFS(imageRepo, imageTag string, layerDigests []string, targetDir string) error {
	fmt.Printf("Building rootfs in: %s\n", targetDir)
	fmt.Printf("Layers to process: %d\n", len(layerDigests))

	// Create target directory
	if err := os.MkdirAll(targetDir, 0755); err != nil {
		return fmt.Errorf("failed to create rootfs directory: %w", err)
	}

	// Apply each layer in order
	for _, digest := range layerDigests {
		layerPath := filepath.Join(e.dataDir, "layers", digest+".tar.gz")

		// fmt.Printf("Applying layer %d/%d: %s\n", i+1, len(layerDigests), digest[:12]+"...")
		// fmt.Printf("Layer path: %s\n", layerPath)

		// Check if layer file exists
		if _, err := os.Stat(layerPath); err != nil {
			return fmt.Errorf("layer file not found: %s: %w", layerPath, err)
		}

		if err := e.ExtractLayer(layerPath, targetDir); err != nil {
			return fmt.Errorf("failed to extract layer %s: %w", digest, err)
		}

		// fmt.Printf("✓ Layer %d/%d extracted successfully\n", i+1, len(layerDigests))
	}

	// fmt.Printf("✓ RootFS constructed with %d layers\n", len(layerDigests))

	return nil
}

// CleanupRootFS removes a rootfs directory
func (e *LayerExtractor) CleanupRootFS(rootfsPath string) error {
	if strings.Contains(rootfsPath, e.dataDir) {
		return os.RemoveAll(rootfsPath)
	}
	return fmt.Errorf("refusing to cleanup directory outside data dir: %s", rootfsPath)
}

// ListRootFSContents lists the contents of a rootfs for debugging
func (e *LayerExtractor) ListRootFSContents(rootfsPath string) ([]string, error) {
	var contents []string

	err := filepath.Walk(rootfsPath, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		// Get relative path
		relPath, err := filepath.Rel(rootfsPath, path)
		if err != nil {
			return err
		}

		if relPath != "." {
			contents = append(contents, relPath)
		}

		return nil
	})

	return contents, err
}