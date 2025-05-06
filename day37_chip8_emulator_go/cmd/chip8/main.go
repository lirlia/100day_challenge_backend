package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/lirlia/100day_challenge_backend/day37_chip8_emulator_go/pkg/chip8"
)

const (
	// ebiten window size
	screenWidth  = 640
	screenHeight = 320
	// CHIP-8 logical screen size
	chip8Width  = 64
	chip8Height = 32
)

// Game implements ebiten.Game interface.
type Game struct {
	chip8 *chip8.Chip8
}

// Update proceeds the game state. Update is called every tick (1/60 [s] by default).
func (g *Game) Update() error {
	// TODO: Implement CHIP-8 cycle execution
	return nil
}

// Draw draws the game screen. Draw is called every frame (typically 1/60[s] for 60Hz display).
func (g *Game) Draw(screen *ebiten.Image) {
	// TODO: Implement CHIP-8 screen drawing
}

// Layout takes the outside size (e.g., window size) and returns the (logical) screen size.
// If you don't have to adjust the screen size with the outside size, just return a fixed size.
func (g *Game) Layout(outsideWidth, outsideHeight int) (int, int) {
	// Return the logical CHIP-8 screen size
	// Ebiten will scale this up to the window size
	return chip8Width, chip8Height
}

func main() {
	// Define command-line flag for ROM path
	romPath := flag.String("rom", "", "Path to the CHIP-8 ROM file")
	flag.Parse()

	if *romPath == "" {
		fmt.Println("Usage: go run ./cmd/chip8 -rom <path_to_rom>")
		flag.PrintDefaults()
		os.Exit(1)
	}

	// Initialize CHIP-8 system
	c8 := chip8.New()

	// Load ROM
	err := c8.LoadROM(*romPath)
	if err != nil {
		log.Fatalf("Error loading ROM: %v\n", err)
	}

	// Create game instance
	game := &Game{
		chip8: c8,
	}

	// Set ebiten window properties
	ebiten.SetWindowSize(screenWidth, screenHeight)
	ebiten.SetWindowTitle("Day 37 - CHIP-8 Emulator (Go + Ebiten)")

	// Run the game loop
	fmt.Printf("Starting CHIP-8 emulation for ROM: %s\n", *romPath)
	if err := ebiten.RunGame(game); err != nil {
		log.Fatalf("Ebiten run failed: %v\n", err)
	}

	fmt.Println("CHIP-8 emulation stopped.")
}
