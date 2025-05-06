package main

import (
	"flag"
	"fmt"
	"image/color"
	"log"
	"os"
	"sync"
	"time"

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
)

// Standard CHIP-8 Keypad Mapping to Physical Keyboard (追加)
var keyMap = map[ebiten.Key]byte{
	ebiten.KeyDigit1: 0x1, ebiten.KeyDigit2: 0x2, ebiten.KeyDigit3: 0x3, ebiten.KeyDigit4: 0xC,
	ebiten.KeyQ: 0x4, ebiten.KeyW: 0x5, ebiten.KeyE: 0x6, ebiten.KeyR: 0xD,
	ebiten.KeyA: 0x7, ebiten.KeyS: 0x8, ebiten.KeyD: 0x9, ebiten.KeyF: 0xE,
	ebiten.KeyZ: 0xA, ebiten.KeyX: 0x0, ebiten.KeyC: 0xB, ebiten.KeyV: 0xF,
}

// Game implements ebiten.Game interface.
type Game struct {
	chip8       *chip8.Chip8
	needsRedraw bool
	mu          sync.Mutex
}

// NewGame creates a new Game instance.
func NewGame(c *chip8.Chip8) *Game {
	return &Game{
		chip8:       c,
		needsRedraw: true, // Start with redraw needed
	}
}

// runCPU runs the CHIP-8 CPU cycles in a separate goroutine.
func (g *Game) runCPU(cpuSpeedHz int) {
	if cpuSpeedHz <= 0 {
		log.Println("[runCPU] cpuSpeedHz is zero or negative, CPU will not run.")
		return
	}
	ticker := time.NewTicker(time.Second / time.Duration(cpuSpeedHz))
	defer ticker.Stop()

	log.Printf("[runCPU] Starting CPU loop at %d Hz", cpuSpeedHz)
	for range ticker.C {
		g.mu.Lock()
		redrawOccurredInCycle := g.chip8.Cycle() // Cycle now returns bool
		if redrawOccurredInCycle {
			// log.Println("[runCPU] Redraw occurred in Cycle, setting needsRedraw=true") // 必要に応じてログを有効化
			g.needsRedraw = true
		}
		g.mu.Unlock()
	}
	log.Println("[runCPU] CPU loop finished.")
}

// Update proceeds the game state (called at 60 TPS by Ebiten).
func (g *Game) Update() error {
	g.mu.Lock() // Lock for accessing chip8 state
	defer g.mu.Unlock()

	// --- Update Timers (DT and ST) --- (★ここに移動、Mutex内で実行)
	if g.chip8.DT > 0 {
		g.chip8.DT--
	}
	if g.chip8.ST > 0 {
		g.chip8.ST--
		if g.chip8.ST > 0 { // Still active after decrement?
			log.Println("[Game.Update] BEEP! (ST is active)") // ★残す
		}
	}
	// --- End Update Timers ---

	// Handle Fx0A wait state first (Mutex内で実行)
	if g.chip8.IsWaitingForKey() {
		for physicalKey, chip8Key := range keyMap {
			if ebiten.IsKeyPressed(physicalKey) {
				g.chip8.KeyPress(chip8Key)
				break
			}
		}
		// No Chip8 cycles or key updates needed while waiting
		return nil
	}

	// --- Regular key state update --- (Mutex内で実行)
	for physicalKey, chip8Key := range keyMap {
		isPressed := ebiten.IsKeyPressed(physicalKey)
		g.chip8.SetKey(chip8Key, isPressed)
	}

	// --- CPU Cycle Execution is now in runCPU Goroutine --- ★削除
	/*
		chip8DrawFlag := g.chip8.DrawFlag() // 一度だけ呼び出す
		if chip8DrawFlag {
			log.Printf("[Game.Update] chip8.DrawFlag() is TRUE. Setting g.needsRedraw = true. (Current g.needsRedraw: %t)", g.needsRedraw)
			g.needsRedraw = true
		} else {
			// log.Printf("[Game.Update] chip8.DrawFlag() is FALSE. g.needsRedraw remains %t.", g.needsRedraw)
		}
	*/

	return nil
}

// Draw draws the game screen.
func (g *Game) Draw(screen *ebiten.Image) {
	g.mu.Lock()
	needsFullClear := g.chip8.WasClearScreenRequestedAndReset()
	currentNeedsRedraw := g.needsRedraw                                                                             // Capture current state of needsRedraw
	log.Printf("[Game.Draw] Start. needsFullClear: %t, currentNeedsRedraw: %t", needsFullClear, currentNeedsRedraw) // ★追加

	if !currentNeedsRedraw && !needsFullClear {
		// log.Println("[Game.Draw] No redraw needed.") // ★必要なら追加
		g.mu.Unlock()
		return
	}

	prevDrawnGfx := g.chip8.DrawnGfx() // Get the state that *was* on screen

	// Unlock *after* getting necessary state but *before* heavy drawing logic
	g.mu.Unlock() // ★Mutex解放タイミング変更

	// Full clear if CLS was requested
	if needsFullClear {
		log.Println("[Game.Draw] CLS requested. Clearing screen.")
		screen.Fill(color.Black)
		// ★ CLSの場合、drawnGfxもクリアされた状態に合わせる必要がある。
		//    UpdateDrawnGfxを呼ぶのは描画後なので、ここでは何もしない。
		//    CLS後の描画は下のcurrentNeedsRedrawのロジックでカバーされる（はず）
	}

	currentGfx := g.chip8.Gfx() // ★ Lock 外で Gfx() を呼ぶ (コピーが返ると仮定)

	// Actual drawing logic
	scaleX := float32(screenWidth) / float32(chip8Width)
	scaleY := float32(screenHeight) / float32(chip8Height)

	anythingActuallyDrawnThisFrame := false

	// ★ CLSでも差分描画でも、最終的に画面に描画すべき内容を決定する
	//    needsFullClear または currentNeedsRedraw のいずれかが true なら描画処理へ
	if needsFullClear || currentNeedsRedraw {
		log.Println("[Game.Draw] Drawing loop starting...") // ★追加
		pixelDrawnCount := 0                                // ★追加
		for y := 0; y < chip8Height; y++ {
			for x := 0; x < chip8Width; x++ {
				idx := y*chip8Width + x
				currentPixel := currentGfx[idx]
				prevPixel := prevDrawnGfx[idx] // CLSの場合は prevPixel は実質0扱い

				// CLS時、またはピクセルが変わった場合に描画
				if needsFullClear && currentPixel == 1 || (!needsFullClear && currentPixel != prevPixel) {
					anythingActuallyDrawnThisFrame = true
					pixelDrawnCount++ // ★追加
					rectX := float32(x) * scaleX
					rectY := float32(y) * scaleY
					pixelColor := color.Black // デフォルトは黒 (0にする場合)
					if currentPixel == 1 {
						pixelColor = color.White
					}
					vector.DrawFilledRect(screen, rectX, rectY, scaleX, scaleY, pixelColor, false)
				}
			}
		}
		log.Printf("[Game.Draw] Drawing loop finished. Pixels drawn/cleared: %d", pixelDrawnCount) // ★追加
	} else {
		log.Println("[Game.Draw] No drawing condition met (should not happen if already checked).") // ★追加
	}

	g.mu.Lock()                                           // ★ 再度Lock
	if anythingActuallyDrawnThisFrame || needsFullClear { // 描画があった場合のみdrawnGfxを更新
		log.Println("[Game.Draw] Updating drawnGfx.") // ★追加
		g.chip8.UpdateDrawnGfx()                      // Store the just-drawn state as the new "previous" state
	}
	// log.Println("[Game.Draw] Resetting needsRedraw flag.") // ★必要なら追加
	g.needsRedraw = false // Reset game's redraw flag regardless of whether anything was drawn this frame
	g.mu.Unlock()
	log.Println("[Game.Draw] End.") // ★追加
}

// Layout returns the logical screen size.
func (g *Game) Layout(outsideWidth, outsideHeight int) (int, int) {
	// Keep the logical size fixed, Ebiten handles scaling the rendering
	return screenWidth, screenHeight // ★Ebitenのウィンドウサイズを返すように変更
}

func main() {
	// --- Log file setup --- (現状維持)
	logFilePath := "log"
	f, err := os.OpenFile(logFilePath, os.O_RDWR|os.O_CREATE|os.O_TRUNC, 0666)
	if err != nil {
		panic(fmt.Sprintf("CRITICAL: Failed to open log file '%s': %v", logFilePath, err))
	}
	defer f.Close()
	log.SetOutput(f)
	// --- End Log file setup ---

	romPath := flag.String("rom", "roms/keyboard.ch8", "Path to the CHIP-8 ROM file")
	cpuSpeed := flag.Int("speed", 500, "CHIP-8 CPU speed in Hz") // ★Hzに変更、デフォルト500Hz
	flag.Parse()

	log.Printf("[main] Using ROM Path: '%s', CPU Speed: %d Hz", *romPath, *cpuSpeed)

	// Initialize CHIP-8 system
	c8 := chip8.New()

	// Load ROM
	if err := c8.LoadROM(*romPath); err != nil {
		log.Fatalf("[main] CRITICAL: Error loading ROM '%s': %v", *romPath, err)
	}

	// Create game instance
	game := NewGame(c8) // ★speed引数削除

	// Start the CPU goroutine (★追加)
	go game.runCPU(*cpuSpeed)

	// Setup ebiten window
	ebiten.SetWindowSize(screenWidth, screenHeight)
	ebiten.SetWindowTitle(fmt.Sprintf("CHIP-8 Emulator (Go) - %s @ %dHz", *romPath, *cpuSpeed)) // ★タイトル変更
	ebiten.SetTPS(60)                                                                           // Ebiten Update/Draw runs at 60 FPS
	ebiten.SetWindowResizingMode(ebiten.WindowResizingModeEnabled)

	// Run the game loop
	log.Println("[main] Starting Ebiten game loop via ebiten.RunGame()...")
	if err := ebiten.RunGame(game); err != nil {
		log.Fatalf("[main] CRITICAL: Ebiten run failed: %v", err)
	}
	log.Println("[main] CHIP-8 emulation stopped.")
}
