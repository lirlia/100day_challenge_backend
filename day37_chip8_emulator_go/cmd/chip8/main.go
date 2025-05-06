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
	chip8          *chip8.Chip8 // CHIP-8 instance (確認: 存在)
	cyclesPerFrame int
	needsRedraw    bool
}

// NewGame creates a new Game instance.
func NewGame(c *chip8.Chip8, speed int) *Game {
	return &Game{
		chip8:          c,
		cyclesPerFrame: speed,
		needsRedraw:    true, // Start with redraw needed
	}
}

// Update proceeds the game state.
func (g *Game) Update() error {
	// log.Println("[Game.Update] Update function called") // ログが多いためコメントアウト

	// Handle Fx0A wait state first (追加)
	if g.chip8.IsWaitingForKey() {
		// log.Println("[Game.Update] Chip8 is waiting for a key press (Fx0A).") // ログは後で調整
		for physicalKey, chip8Key := range keyMap {
			if ebiten.IsKeyPressed(physicalKey) {
				// log.Printf("[Game.Update-Fx0A] Key pressed: Physical=%s, Chip8=0x%X", physicalKey, chip8Key) // ログは後で調整
				g.chip8.KeyPress(chip8Key) // ★ コメントを解除
				// log.Printf("[TEMP] KeyPress(0x%X) would be called here.", chip8Key) // 仮ログを削除
				break // 最初のキー入力で処理を抜ける
			}
		}
		// 待機中は CHIP-8 サイクル実行や通常のキー更新は行わない
		return nil
	}

	// --- Regular key state update ---
	// log.Println("[Game.Update] Not waiting for key. Entering regular key processing loop...") // ログが多いためコメントアウト
	for physicalKey, chip8Key := range keyMap {
		isPressed := ebiten.IsKeyPressed(physicalKey)
		// CHIP-8内部のキー状態と比較し、変化があった場合のみSetKeyとログ出力を実行
		// if g.chip8.IsKeyPressed(chip8Key) != isPressed { // IsKeyPressed は chip8 側の状態なので、ここでは使わない
		// log.Printf("[Game.Update] PhysicalKey: %s (Chip8Key: 0x%X) state is now: %t", physicalKey, chip8Key, isPressed)
		g.chip8.SetKey(chip8Key, isPressed) // 状態が変わっていなくても毎フレーム呼ぶ (chip8側で変化を検知)
		// }
	}

	// --- Update Timers (DT and ST) --- (追加)
	if g.chip8.DT > 0 {
		g.chip8.DT--
		// log.Printf("[Game.Update] DT decremented to %d", g.chip8.DT) // 必要ならログ追加
	}
	if g.chip8.ST > 0 {
		g.chip8.ST--
		if g.chip8.ST > 0 { // デクリメント後も ST > 0 ならBEEP
			log.Println("[Game.Update] BEEP! (ST is active)") // 仮のビープ音
		}
		// log.Printf("[Game.Update] ST decremented to %d", g.chip8.ST) // 必要ならログ追加
	}
	// --- End Update Timers ---

	// Execute CHIP-8 cycles
	// log.Printf("[Game.Update] Executing %d CHIP-8 cycles.", g.cpuSpeed) // ログが多いためコメントアウト
	for i := 0; i < g.cyclesPerFrame; i++ {
		g.chip8.Cycle()
		// if g.chip8.DrawFlag() { // このチェックは cycle 内の DXYN 命令で行われる
		// g.needsRedraw = true
		// log.Println("[Game.Update] Chip8 drawFlag set during cycle execution. Setting Game.needsRedraw = true")
		// }
	}
	if g.chip8.DrawFlag() { // Cycle実行後にまとめてDrawFlagをチェック
		g.needsRedraw = true
		// log.Println("[Game.Update] Chip8 drawFlag is set after cycles. Setting Game.needsRedraw = true")
	}

	return nil
}

// Draw draws the game screen.
func (g *Game) Draw(screen *ebiten.Image) {
	// Only redraw if needed
	if !g.needsRedraw {
		return
	}
	screen.Fill(color.Black) // Clear screen
	gfx := g.chip8.Gfx()
	for y := 0; y < chip8Height; y++ {
		for x := 0; x < chip8Width; x++ {
			if gfx[y*chip8Width+x] == 1 {
				vector.DrawFilledRect(
					screen,
					float32(x),
					float32(y),
					1,
					1,
					color.White,
					false,
				)
			}
		}
	}
	g.needsRedraw = false // Reset flag after drawing
}

// Layout returns the logical screen size.
func (g *Game) Layout(outsideWidth, outsideHeight int) (int, int) {
	return chip8Width, chip8Height
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

	romPath := flag.String("rom", "roms/keyboard.ch8", "Path to the CHIP-8 ROM file") // Default を keyboard.ch8 に変更
	cpuSpeed := flag.Int("speed", 5, "CHIP-8 CPU speed in cycles per frame")          // Default を 5 に変更
	flag.Parse()

	log.Printf("[main] Using ROM Path: '%s', CPU Speed: %d cycles/frame", *romPath, *cpuSpeed)

	// Initialize CHIP-8 system
	c8 := chip8.New()

	// Load ROM
	if err := c8.LoadROM(*romPath); err != nil {
		log.Fatalf("[main] CRITICAL: Error loading ROM '%s': %v", *romPath, err)
	}

	// Create game instance
	game := NewGame(c8, *cpuSpeed)

	// Setup ebiten window
	ebiten.SetWindowSize(screenWidth, screenHeight)
	ebiten.SetWindowTitle(fmt.Sprintf("CHIP-8 Emulator (Go) - %s", *romPath))
	ebiten.SetTPS(60)
	ebiten.SetWindowResizingMode(ebiten.WindowResizingModeEnabled)

	// Run the game loop
	log.Println("[main] Starting Ebiten game loop via ebiten.RunGame()...")
	if err := ebiten.RunGame(game); err != nil {
		log.Fatalf("[main] CRITICAL: Ebiten run failed: %v", err)
	}
	log.Println("[main] CHIP-8 emulation stopped.")
}
