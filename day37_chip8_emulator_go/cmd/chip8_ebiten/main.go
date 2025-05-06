package main

import (
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
	chip8 "github.com/lirlia/100day_challenge_backend/day37_chip8_emulator_go/internal/chip8"
)

const (
	// CHIP-8 logical screen size
	chip8Width  = 64
	chip8Height = 32

	// Window size (scaled)
	defaultScale     = 10
	defaultWinWidth  = chip8Width * defaultScale
	defaultWinHeight = chip8Height * defaultScale
)

// Game struct holds the emulator and Ebiten specific state
type Game struct {
	emulator          *chip8.Chip8
	offscreenImage    *ebiten.Image // Buffer for CHIP-8 gfx
	needsScreenUpdate bool          // Flag to redraw the offscreen image

	// Key mapping from Ebiten keys to CHIP-8 keys (0x0-0xF)
	keyMap map[ebiten.Key]byte

	// Store previous key states to detect release
	lastPressedKeys map[ebiten.Key]bool
}

func NewGame(romPath string, cyclesPerFrame uint, variantSCHIP bool) (*Game, error) {
	emu := chip8.New(cyclesPerFrame, variantSCHIP)
	if err := emu.LoadROM(romPath); err != nil {
		return nil, fmt.Errorf("failed to load ROM '%s': %w", romPath, err)
	}

	g := &Game{
		emulator:          emu,
		offscreenImage:    ebiten.NewImage(chip8Width, chip8Height),
		needsScreenUpdate: true, // Initial draw needed
		keyMap: map[ebiten.Key]byte{
			ebiten.Key1: 0x1, ebiten.Key2: 0x2, ebiten.Key3: 0x3, ebiten.Key4: 0xC,
			ebiten.KeyQ: 0x4, ebiten.KeyW: 0x5, ebiten.KeyE: 0x6, ebiten.KeyR: 0xD,
			ebiten.KeyA: 0x7, ebiten.KeyS: 0x8, ebiten.KeyD: 0x9, ebiten.KeyF: 0xE,
			ebiten.KeyZ: 0xA, ebiten.KeyX: 0x0, ebiten.KeyC: 0xB, ebiten.KeyV: 0xF,
		},
		lastPressedKeys: make(map[ebiten.Key]bool),
	}
	return g, nil
}

func (g *Game) Update() error {
	// Handle Key Input
	currentPressedKeys := make(map[ebiten.Key]bool)
	pressedEbitenKeys := inpututil.AppendPressedKeys(nil)
	for _, key := range pressedEbitenKeys {
		if chip8Key, ok := g.keyMap[key]; ok {
			g.emulator.SetKey(int(chip8Key), true)
			currentPressedKeys[key] = true
			if !g.lastPressedKeys[key] {
				// Optional: Log key press
				// log.Printf("Key Press: %v -> CHIP-8 0x%X", key, chip8Key)
			}
		}
	}

	// Check for released keys
	for key, wasPressed := range g.lastPressedKeys {
		if wasPressed && !currentPressedKeys[key] {
			if chip8Key, ok := g.keyMap[key]; ok {
				g.emulator.SetKey(int(chip8Key), false)
				// Optional: Log key release
				// log.Printf("Key Release: %v -> CHIP-8 0x%X", key, chip8Key)
			}
		}
	}
	g.lastPressedKeys = currentPressedKeys

	// Exit on Escape key
	if inpututil.IsKeyJustPressed(ebiten.KeyEscape) {
		return ebiten.Termination
	}

	// Run CHIP-8 Cycles
	for i := 0; i < int(g.emulator.CyclesPerFrame()); i++ {
		redraw, _, halted := g.emulator.Cycle()
		if redraw {
			g.needsScreenUpdate = true
		}
		if halted { // Waiting for key press (Fx0A)
			break // Stop running cycles for this frame if halted
		}
	}

	// Update Timers (at 60Hz)
	g.emulator.UpdateTimers()

	return nil
}

func (g *Game) Draw(screen *ebiten.Image) {
	// Only update the offscreen texture if the CHIP-8 graphics changed
	if g.needsScreenUpdate {
		gfx := g.emulator.Gfx()
		pixels := make([]byte, chip8Width*chip8Height*4) // RGBA buffer
		for i, v := range gfx {
			if v == 1 {
				pixels[i*4] = 0xff   // R
				pixels[i*4+1] = 0xff // G
				pixels[i*4+2] = 0xff // B
				pixels[i*4+3] = 0xff // A (White)
			} else {
				pixels[i*4] = 0x00   // R
				pixels[i*4+1] = 0x00 // G
				pixels[i*4+2] = 0x00 // B
				pixels[i*4+3] = 0xff // A (Black)
			}
		}
		g.offscreenImage.WritePixels(pixels)
		g.needsScreenUpdate = false
	}

	// Calculate scale based on window size
	winWidth, winHeight := screen.Bounds().Dx(), screen.Bounds().Dy()
	scaleX := float64(winWidth) / float64(chip8Width)
	scaleY := float64(winHeight) / float64(chip8Height)
	scale := scaleX // Assume square pixels, take the smaller scale if aspect ratios differ significantly
	if scaleY < scaleX {
		scale = scaleY
	}

	// Center the image
	opts := &ebiten.DrawImageOptions{}
	imgWidth := float64(chip8Width) * scale
	imgHeight := float64(chip8Height) * scale
	tx := (float64(winWidth) - imgWidth) / 2
	ty := (float64(winHeight) - imgHeight) / 2
	opts.GeoM.Scale(scale, scale)
	opts.GeoM.Translate(tx, ty)
	opts.Filter = ebiten.FilterNearest // Use nearest-neighbor for blocky pixels

	// Draw the scaled offscreen image to the screen
	screen.DrawImage(g.offscreenImage, opts)
}

func (g *Game) Layout(outsideWidth, outsideHeight int) (int, int) {
	// Returns the logical screen size CHIP-8 uses
	// Ebiten scales this to the window size based on Draw options
	// For simplicity, let's return the base size. Window scaling is handled in Draw.
	// Alternatively, could return outsideWidth, outsideHeight for pixel-perfect scaling control.
	return chip8Width, chip8Height
}

func main() {
	romPath := flag.String("rom", "", "Path to the CHIP-8 ROM file")
	cycles := flag.Uint("cycles", 10, "CPU cycles per frame")
	schip := flag.Bool("schip", false, "Enable SCHIP variant behavior")
	scale := flag.Float64("scale", defaultScale, "Window scale factor")
	flag.Parse()

	if *romPath == "" {
		fmt.Println("Usage: go run ./cmd/chip8_ebiten -rom <path_to_rom>")
		flag.PrintDefaults()
		os.Exit(1)
	}

	game, err := NewGame(*romPath, *cycles, *schip)
	if err != nil {
		log.Fatal(err)
	}

	winWidth := int(chip8Width * (*scale))
	winHeight := int(chip8Height * (*scale))
	ebiten.SetWindowSize(winWidth, winHeight)
	ebiten.SetWindowTitle(fmt.Sprintf("CHIP-8 Emulator (%s)", *romPath))
	ebiten.SetMaxTPS(60)
	ebiten.SetScreenClearedEveryFrame(false) // Important for performance and avoiding flicker

	log.Printf("Starting emulator for %s... Press ESC to quit.", *romPath)
	if err := ebiten.RunGame(game); err != nil {
		log.Fatal(err)
	}
}
