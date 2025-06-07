package main

import (
	"fmt"
	"text/tabwriter"
	"os"
	"time"

	"github.com/spf13/cobra"
)

func listCmd() *cobra.Command {
	var showAll bool

	cmd := &cobra.Command{
		Use:   "list",
		Short: "List local Docker images",
		Long: `List all Docker images stored locally.

Examples:
  container list
  container list --all`,
		Aliases: []string{"ls", "images"},
		RunE: func(cmd *cobra.Command, args []string) error {
			logVerbose("Listing local images")

			return listImages(showAll)
		},
	}

	cmd.Flags().BoolVarP(&showAll, "all", "a", false, "Show all images including intermediate layers")

	return cmd
}

// Image represents a local image
type LocalImage struct {
	Repository string
	Tag        string
	Digest     string
	Size       string
	Pulled     string
}

// listImages lists all local images
func listImages(showAll bool) error {
	logDebug("Scanning local image storage")

	images := getLocalImages(showAll)

	if len(images) == 0 {
		fmt.Println("No images found locally.")
		fmt.Println("Use 'container pull <image>' to download images.")
		return nil
	}

	// Print images in table format
	printImagesTable(images)

	return nil
}

// getLocalImages retrieves images from local storage
func getLocalImages(showAll bool) []LocalImage {
	storageManager := getStorageManager()

	// Get images from storage
	localImages, err := storageManager.ListImages()
	if err != nil {
		logDebug("Error loading local images: %v", err)
		return []LocalImage{}
	}

	// Convert to display format
	var images []LocalImage
	for _, img := range localImages {
		// Calculate relative time
		pulled := formatRelativeTime(img.PulledAt)

		images = append(images, LocalImage{
			Repository: img.Repository,
			Tag:        img.Tag,
			Digest:     img.Digest,
			Size:       formatSize(img.Size),
			Pulled:     pulled,
		})
	}

	logDebug("Found %d local images", len(images))

	// Filter out intermediate layers if not showing all
	if !showAll {
		// TODO: Implement filtering logic for intermediate layers
	}

	return images
}

// formatSize formats bytes as human readable size
func formatSize(bytes int64) string {
	const unit = 1024
	if bytes < unit {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(unit), 0
	for n := bytes / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	return fmt.Sprintf("%.1f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}

// formatRelativeTime formats time as relative time string
func formatRelativeTime(t time.Time) string {
	now := time.Now()
	diff := now.Sub(t)

	if diff < time.Minute {
		return "just now"
	} else if diff < time.Hour {
		minutes := int(diff.Minutes())
		if minutes == 1 {
			return "1 minute ago"
		}
		return fmt.Sprintf("%d minutes ago", minutes)
	} else if diff < 24*time.Hour {
		hours := int(diff.Hours())
		if hours == 1 {
			return "1 hour ago"
		}
		return fmt.Sprintf("%d hours ago", hours)
	} else {
		days := int(diff.Hours() / 24)
		if days == 1 {
			return "1 day ago"
		}
		return fmt.Sprintf("%d days ago", days)
	}
}

// printImagesTable prints images in a formatted table
func printImagesTable(images []LocalImage) {
	w := tabwriter.NewWriter(os.Stdout, 0, 8, 2, ' ', 0)

	// Print header
	fmt.Fprintln(w, "REPOSITORY\tTAG\tDIGEST\tSIZE\tPULLED")

	// Print each image
	for _, img := range images {
		fmt.Fprintf(w, "%s\t%s\t%s\t%s\t%s\n",
			img.Repository,
			img.Tag,
			truncateString(img.Digest, 12),
			img.Size,
			img.Pulled)
	}

	w.Flush()
}

// truncateString truncates a string to the specified length
func truncateString(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}