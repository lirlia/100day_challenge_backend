package main

import (
	"flag"
	"fmt"
	"image/color"
	"log"
	"os"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/vector"
	"github.com/lirlia/100day_challenge_backend/day37_chip8_emulator_go/pkg/chip8"
)

const (
	// ebiten window size
	screenWidth  = 640
	screenHeight = 320
	// CHIP-8 logical screen size
	chip8Width  = 64
	chip8Height = 32

	// Scale factor for drawing CHIP-8 pixels
	scaleFactor = 10
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
	screen.Fill(color.Black) // Clear screen with black background
	gfx := g.chip8.Gfx()

	for y := 0; y < chip8Height; y++ {
		for x := 0; x < chip8Width; x++ {
			if gfx[y*chip8Width+x] == 1 {
				// Draw a white rectangle for each set pixel, scaled up
				vector.DrawFilledRect(
					screen,
					float32(x*scaleFactor),
					float32(y*scaleFactor),
					float32(scaleFactor),
					float32(scaleFactor),
					color.White,
					false, // anti-alias off for sharp pixels
				)
			}
		}
	}
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
	ebiten.SetWindowSize(chip8Width*scaleFactor, chip8Height*scaleFactor)
	ebiten.SetWindowTitle("Day 37 - CHIP-8 Emulator (Go + Ebiten)")
	// Set window resizable so Layout works as intended with scaling
	ebiten.SetWindowResizingMode(ebiten.WindowResizingModeEnabled)

	// Run the game loop
	fmt.Printf("Starting CHIP-8 emulation for ROM: %s\n", *romPath)
	if err := ebiten.RunGame(game); err != nil {
		log.Fatalf("Ebiten run failed: %v\n", err)
	}

	fmt.Println("CHIP-8 emulation stopped.")
}
