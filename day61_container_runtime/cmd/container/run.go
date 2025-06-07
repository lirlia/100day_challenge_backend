package main

import (
	"fmt"

	"github.com/spf13/cobra"
	"github.com/lirlia/100day_challenge_backend/day61_container_runtime/internal/runtime"
)

func runCmd() *cobra.Command {
	var (
		interactive bool
		tty         bool
		workdir     string
		envVars     []string
		name        string
	)

	cmd := &cobra.Command{
		Use:   "run [image:tag] [command] [args...]",
		Short: "Run a command in a new container",
		Long: `Run a command in a new container created from the specified image.

Examples:
  container run busybox:latest /bin/echo "Hello World"
  container run alpine:latest /bin/sh -c "ls -la /"
  container run --name mycontainer busybox:latest /bin/pwd
  container run -e FOO=bar -w /tmp alpine:latest /bin/env`,
		Args: cobra.MinimumNArgs(2),
		RunE: func(cmd *cobra.Command, args []string) error {
			imageName := args[0]
			command := args[1:]

			// Parse image name and tag
			imgName, tag := parseImageName(imageName)

			logVerbose("Running container from image: %s:%s", imgName, tag)
			logVerbose("Command: %v", command)

			// TODO: Implement actual container run logic
			return runContainer(imgName, tag, command, &ContainerRunOptions{
				Interactive: interactive,
				TTY:         tty,
				WorkDir:     workdir,
				EnvVars:     envVars,
				Name:        name,
			})
		},
	}

	cmd.Flags().BoolVarP(&interactive, "interactive", "i", false, "Keep STDIN open even if not attached")
	cmd.Flags().BoolVarP(&tty, "tty", "t", false, "Allocate a pseudo-TTY")
	cmd.Flags().StringVarP(&workdir, "workdir", "w", "", "Working directory inside the container")
	cmd.Flags().StringArrayVarP(&envVars, "env", "e", []string{}, "Set environment variables")
	cmd.Flags().StringVar(&name, "name", "", "Assign a name to the container")

	return cmd
}

// ContainerRunOptions contains options for running a container
type ContainerRunOptions struct {
	Interactive bool
	TTY         bool
	WorkDir     string
	EnvVars     []string
	Name        string
}

// runContainer executes a container with the given options
func runContainer(imageName, tag string, command []string, opts *ContainerRunOptions) error {
	// Phase 1: Validate inputs
	if imageName == "" {
		return fmt.Errorf("image name cannot be empty")
	}

	if len(command) == 0 {
		return fmt.Errorf("command cannot be empty")
	}

	logDebug("Starting container from %s:%s", imageName, tag)

	// Phase 2: Check if image exists locally
	storageManager := getStorageManager()
	if !storageManager.ImageExists(imageName, tag) {
		return fmt.Errorf("image %s:%s not found locally. Run 'container pull %s:%s' first",
			imageName, tag, imageName, tag)
	}

	logVerbose("Image %s:%s found locally", imageName, tag)

	// Phase 3: Create container runtime
	containerRuntime := runtime.NewContainerRuntime(getDataDir())

	// Phase 4: Setup run options
	runOpts := &runtime.RunOptions{
		WorkDir:     opts.WorkDir,
		Environment: make([]string, len(opts.EnvVars)),
		Interactive: opts.Interactive,
		TTY:         opts.TTY,
		Name:        opts.Name,
	}

	// Copy environment variables
	copy(runOpts.Environment, opts.EnvVars)

	logVerbose("Run options: WorkDir=%s, Env=%v, Name=%s", runOpts.WorkDir, runOpts.Environment, runOpts.Name)

	// Phase 5: Execute container
	fmt.Printf("Creating container from %s:%s...\n", imageName, tag)
	container, err := containerRuntime.RunContainer(imageName, tag, command, runOpts)
	if err != nil {
		return fmt.Errorf("container execution failed: %w", err)
	}

	logVerbose("Container %s finished with status: %s", container.ID, container.Status)
	if container.ExitCode != nil {
		logVerbose("Exit code: %d", *container.ExitCode)
	}

	return nil
}
