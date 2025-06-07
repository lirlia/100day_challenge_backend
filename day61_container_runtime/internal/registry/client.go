package registry

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// Client represents a Docker Registry API client
type Client struct {
	baseURL    string
	httpClient *http.Client
	userAgent  string
	authToken  string
}

// NewClient creates a new Docker Registry client
func NewClient(baseURL string) *Client {
	if baseURL == "" {
		baseURL = "https://registry-1.docker.io"
	}

	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 30 * time.Second,
		},
		userAgent: "container-runtime/0.1.0",
	}
}

// AuthConfig contains authentication configuration
type AuthConfig struct {
	Token     string `json:"token"`
	ExpiresIn int    `json:"expires_in"`
	IssuedAt  string `json:"issued_at"`
}

// Manifest represents a Docker image manifest
type Manifest struct {
	SchemaVersion int                `json:"schemaVersion"`
	MediaType     string             `json:"mediaType"`
	Config        DescriptorConfig   `json:"config"`
	Layers        []LayerDescriptor  `json:"layers"`
}

// ImageIndex represents an OCI image index (multi-architecture)
type ImageIndex struct {
	SchemaVersion int                    `json:"schemaVersion"`
	MediaType     string                 `json:"mediaType"`
	Manifests     []ManifestDescriptor   `json:"manifests"`
}

// ManifestDescriptor represents a manifest descriptor in an index
type ManifestDescriptor struct {
	MediaType string           `json:"mediaType"`
	Size      int64            `json:"size"`
	Digest    string           `json:"digest"`
	Platform  *PlatformInfo    `json:"platform,omitempty"`
}

// PlatformInfo represents platform information
type PlatformInfo struct {
	Architecture string `json:"architecture"`
	OS           string `json:"os"`
	Variant      string `json:"variant,omitempty"`
}

// DescriptorConfig represents the config descriptor
type DescriptorConfig struct {
	MediaType string `json:"mediaType"`
	Size      int64  `json:"size"`
	Digest    string `json:"digest"`
}

// LayerDescriptor represents a layer descriptor
type LayerDescriptor struct {
	MediaType string `json:"mediaType"`
	Size      int64  `json:"size"`
	Digest    string `json:"digest"`
}

// ImageConfig represents the image configuration
type ImageConfig struct {
	Architecture string            `json:"architecture"`
	OS           string            `json:"os"`
	Config       *ContainerConfig  `json:"config"`
	RootFS       *RootFS           `json:"rootfs"`
	History      []HistoryEntry    `json:"history"`
	Created      string            `json:"created"`
	Author       string            `json:"author"`
}

// ContainerConfig represents container configuration
type ContainerConfig struct {
	User         string            `json:"User"`
	ExposedPorts map[string]struct{} `json:"ExposedPorts"`
	Env          []string          `json:"Env"`
	Cmd          []string          `json:"Cmd"`
	WorkingDir   string            `json:"WorkingDir"`
	Entrypoint   []string          `json:"Entrypoint"`
	Labels       map[string]string `json:"Labels"`
}

// RootFS represents the rootfs information
type RootFS struct {
	Type    string   `json:"type"`
	DiffIDs []string `json:"diff_ids"`
}

// HistoryEntry represents a history entry
type HistoryEntry struct {
	Created   string `json:"created"`
	CreatedBy string `json:"created_by"`
	Comment   string `json:"comment"`
	EmptyLayer bool  `json:"empty_layer,omitempty"`
}

// GetAuthToken retrieves an authentication token for the given repository
func (c *Client) GetAuthToken(repository string) error {
	// For Docker Hub, we need to get a token from auth.docker.io
	authURL := fmt.Sprintf("https://auth.docker.io/token?service=registry.docker.io&scope=repository:%s:pull", repository)

	resp, err := c.httpClient.Get(authURL)
	if err != nil {
		return fmt.Errorf("failed to get auth token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("auth request failed with status: %d", resp.StatusCode)
	}

	var authConfig AuthConfig
	if err := json.NewDecoder(resp.Body).Decode(&authConfig); err != nil {
		return fmt.Errorf("failed to decode auth response: %w", err)
	}

	c.authToken = authConfig.Token
	return nil
}

// GetManifest retrieves the manifest for a given image
func (c *Client) GetManifest(repository, tag string) (*Manifest, error) {
	url := fmt.Sprintf("%s/v2/%s/manifests/%s", c.baseURL, repository, tag)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set required headers
	req.Header.Set("Authorization", "Bearer "+c.authToken)
	req.Header.Set("Accept", "application/vnd.docker.distribution.manifest.v2+json, application/vnd.docker.distribution.manifest.list.v2+json")
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get manifest: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("manifest request failed with status %d: %s", resp.StatusCode, string(body))
	}

	// Read and debug the response body
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read manifest response: %w", err)
	}

	contentType := resp.Header.Get("Content-Type")
	fmt.Printf("[DEBUG] Manifest response content type: %s\n", contentType)
	maxLen := 200
	if len(body) < maxLen {
		maxLen = len(body)
	}
	fmt.Printf("[DEBUG] Manifest response body (first 200 chars): %s\n", string(body)[:maxLen])

	// Check if this is an image index (multi-architecture)
	if strings.Contains(contentType, "application/vnd.oci.image.index.v1+json") ||
		strings.Contains(contentType, "application/vnd.docker.distribution.manifest.list.v2+json") {

		fmt.Printf("[DEBUG] Received image index, selecting amd64 manifest...\n")

		var index ImageIndex
		if err := json.Unmarshal(body, &index); err != nil {
			return nil, fmt.Errorf("failed to decode image index: %w", err)
		}

		// Find amd64/linux manifest
		var selectedDigest string
		for _, manifest := range index.Manifests {
			if manifest.Platform != nil &&
				manifest.Platform.Architecture == "amd64" &&
				manifest.Platform.OS == "linux" {
				selectedDigest = manifest.Digest
				fmt.Printf("[DEBUG] Selected manifest digest: %s\n", selectedDigest)
				break
			}
		}

		if selectedDigest == "" {
			return nil, fmt.Errorf("no amd64/linux manifest found in index")
		}

		// Recursively get the specific manifest
		return c.GetManifest(repository, selectedDigest)
	}

	var manifest Manifest
	if err := json.Unmarshal(body, &manifest); err != nil {
		return nil, fmt.Errorf("failed to decode manifest: %w", err)
	}

	// Debug output
	fmt.Printf("[DEBUG] Manifest schema version: %d\n", manifest.SchemaVersion)
	fmt.Printf("[DEBUG] Config digest: %s\n", manifest.Config.Digest)
	fmt.Printf("[DEBUG] Number of layers: %d\n", len(manifest.Layers))

	return &manifest, nil
}

// GetImageConfig retrieves the image configuration
func (c *Client) GetImageConfig(repository string, configDigest string) (*ImageConfig, error) {
	url := fmt.Sprintf("%s/v2/%s/blobs/%s", c.baseURL, repository, configDigest)

	// Debug output
	fmt.Printf("[DEBUG] Config URL: %s\n", url)
	fmt.Printf("[DEBUG] Config Digest: %s\n", configDigest)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.authToken)
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to get config: %w", err)
	}
	defer resp.Body.Close()

	fmt.Printf("[DEBUG] Config response status: %d\n", resp.StatusCode)

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("config request failed with status %d: %s", resp.StatusCode, string(body))
	}

	var config ImageConfig
	if err := json.NewDecoder(resp.Body).Decode(&config); err != nil {
		return nil, fmt.Errorf("failed to decode config: %w", err)
	}

	return &config, nil
}

// DownloadLayer downloads a layer blob and returns a reader
func (c *Client) DownloadLayer(repository string, layerDigest string) (io.ReadCloser, int64, error) {
	url := fmt.Sprintf("%s/v2/%s/blobs/%s", c.baseURL, repository, layerDigest)

	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.authToken)
	req.Header.Set("User-Agent", c.userAgent)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("failed to download layer: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		return nil, 0, fmt.Errorf("layer download failed with status %d: %s", resp.StatusCode, string(body))
	}

	return resp.Body, resp.ContentLength, nil
}

// ParseRepository parses a repository name to handle Docker Hub's special cases
func ParseRepository(repository string) string {
	// Handle Docker Hub official images (e.g., "busybox" -> "library/busybox")
	if !strings.Contains(repository, "/") {
		return "library/" + repository
	}
	return repository
}