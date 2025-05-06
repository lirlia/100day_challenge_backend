package main

import (
	"fmt"
	"image/color"
	"log"
	"math/rand"
	"time"

	"github.com/hajimehoshi/ebiten/v2"
	"github.com/hajimehoshi/ebiten/v2/ebitenutil"
	"github.com/hajimehoshi/ebiten/v2/inpututil"
	"github.com/hajimehoshi/ebiten/v2/text"
	"golang.org/x/image/font/basicfont"
)

const (
	windowWidth    = 640 // Scaled window width
	windowHeight   = 320 // Scaled window height
	chip8Width     = 64  // Logical width
	chip8Height    = 32  // Logical height
	offscreenScale = 10  // Scale factor for offscreen buffer
)

type Game struct {
	count                  int
	keys                   []ebiten.Key
	offscreenImage         *ebiten.Image // For testing efficient drawing
	offscreenPixels        []byte        // Simulate CHIP-8 gfx buffer
	needsRedraw            bool
	simpleRectX            float32
	lastMouseX, lastMouseY int
	rand                   *rand.Rand
}

func NewGame() *Game {
	g := &Game{
		offscreenImage:  ebiten.NewImage(chip8Width, chip8Height),
		offscreenPixels: make([]byte, chip8Width*chip8Height),
		needsRedraw:     true,                                            // Initial draw
		rand:            rand.New(rand.NewSource(time.Now().UnixNano())), // Use local rand
	}
	// Initialize offscreenPixels with some pattern
	for i := range g.offscreenPixels {
		if g.rand.Intn(2) == 0 {
			g.offscreenPixels[i] = 1
		}
	}
	return g
}

var gameRand *rand.Rand // Use a package-level RNG for consistency across restarts if needed, or keep it instance-level

func init() {
	gameRand = rand.New(rand.NewSource(time.Now().UnixNano()))
}

func (g *Game) Update() error {
	g.count++

	// Move the simple rectangle
	g.simpleRectX += 1
	if g.simpleRectX > windowWidth {
		g.simpleRectX = -50 // Reset position off-screen left
	}

	// Check for key presses
	g.keys = inpututil.AppendPressedKeys(g.keys[:0])
	if len(g.keys) > 0 {
		fmt.Printf("Keys pressed: %v\n", g.keys)
	}

	// Check mouse position
	x, y := ebiten.CursorPosition()
	if x != g.lastMouseX || y != g.lastMouseY {
		fmt.Printf("Mouse position: (%d, %d)\n", x, y)
		g.lastMouseX, g.lastMouseY = x, y
	}

	// Simulate occasional changes to the offscreen buffer to test redraw
	if g.count%30 == 0 { // Every half second approx
		idx := gameRand.Intn(len(g.offscreenPixels))
		g.offscreenPixels[idx] ^= 1 // Flip a random pixel
		g.needsRedraw = true
		fmt.Println("Flipped a pixel in offscreen buffer - needsRedraw=true")
	}

	// Test window title change
	if g.count%120 == 0 {
		ebiten.SetWindowTitle(fmt.Sprintf("Ebiten Sandbox (%d)", g.count))
	}

	// Exit on Q press
	if inpututil.IsKeyJustPressed(ebiten.KeyQ) {
		return ebiten.Termination
	}

	return nil
}

func (g *Game) Draw(screen *ebiten.Image) {
	// Fill background (optional, helps see transparency if any)
	screen.Fill(color.NRGBA{R: 0x40, G: 0x40, B: 0x60, A: 0xff})

	// Draw a simple moving rectangle directly on screen
	ebitenutil.DrawRect(screen, float64(g.simpleRectX), 50, 50, 50, color.RGBA{R: 0xff, G: 0x00, B: 0x00, A: 0xff})

	// --- Efficient Drawing Test ---
	if g.needsRedraw {
		fmt.Println("Drawing offscreen buffer...")
		// 1. Update the offscreen *ebiten.Image* from our pixel data buffer
		pixels := make([]byte, chip8Width*chip8Height*4) // RGBA
		for i, v := range g.offscreenPixels {
			if v == 1 {
				pixels[i*4] = 0xff   // R
				pixels[i*4+1] = 0xff // G
				pixels[i*4+2] = 0xff // B
				pixels[i*4+3] = 0xff // A
			} else {
				pixels[i*4] = 0x00   // R
				pixels[i*4+1] = 0x00 // G
				pixels[i*4+2] = 0x00 // B
				pixels[i*4+3] = 0xff // A
			}
		}
		g.offscreenImage.WritePixels(pixels)
		g.needsRedraw = false
	}

	// 2. Draw the (potentially cached) offscreen image scaled up
	opts := &ebiten.DrawImageOptions{}
	opts.GeoM.Scale(offscreenScale, offscreenScale)
	opts.GeoM.Translate(50, 100) // Position the scaled image
	// Use FilterNearest for blocky pixel look, FilterLinear for smoother look
	opts.Filter = ebiten.FilterNearest
	screen.DrawImage(g.offscreenImage, opts)

	// Draw text
	msg := fmt.Sprintf("Frame: %d\nPress Q to quit.\nKeys: %v\nMouse: (%d, %d)",
		g.count, g.keys, g.lastMouseX, g.lastMouseY)
	text.Draw(screen, msg, basicfont.Face7x13, 10, 10, color.White)

	// Draw debug info directly
	ebitenutil.DebugPrint(screen, fmt.Sprintf("\n\nTPS: %.2f\nFPS: %.2f", ebiten.ActualTPS(), ebiten.ActualFPS()))
}

func (g *Game) Layout(outsideWidth, outsideHeight int) (screenWidth, screenHeight int) {
	// This is the logical size Ebiten works with internally for drawing.
	// We set it to our desired window size.
	return windowWidth, windowHeight
}

func main() {
	ebiten.SetWindowSize(windowWidth, windowHeight)
	ebiten.SetWindowTitle("Ebiten Sandbox")
	ebiten.SetMaxTPS(60) // Limit updates to 60 per second

	game := NewGame()

	if err := ebiten.RunGame(game); err != nil {
		log.Fatal(err)
	}
}
