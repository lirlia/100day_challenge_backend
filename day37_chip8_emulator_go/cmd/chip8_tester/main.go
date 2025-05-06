package main

import (
	"flag"
	"image"
	"image/color"
	"image/png"
	"log"
	"os"
	"time"

	chip8 "github.com/lirlia/100day_challenge_backend/day37_chip8_emulator_go/internal/chip8"
)

const (
	screenWidth  = 64
	screenHeight = 32
)

func main() {
	// コマンドラインフラグ
	romPath := flag.String("rom", "", "Path to the CHIP-8 ROM file")
	cyclesPerFrame := flag.Uint("cycles", 10, "CPU cycles per frame (adjust for speed)")
	variantSCHIP := flag.Bool("schip", false, "Enable SCHIP variant behavior")
	duration := flag.Duration("duration", 5*time.Second, "Duration to run the emulation for snapshot")
	outputFile := flag.String("output", "snapshot.png", "Output PNG file name")
	flag.Parse()

	if *romPath == "" {
		log.Fatal("ROM path must be specified with -rom flag")
	}

	// CHIP-8 インスタンスの作成
	// New() uses time-based seed, good for general testing.
	// Use NewWithSeed() for deterministic runs if needed.
	emulator := chip8.New(*cyclesPerFrame, *variantSCHIP)

	// ROMのロード
	if err := emulator.LoadROM(*romPath); err != nil {
		log.Fatalf("Failed to load ROM '%s': %v", *romPath, err)
	}

	log.Printf("Loaded ROM: %s", *romPath)
	log.Printf("Running emulation for %s...", *duration)

	startTime := time.Now()
	frameTicker := time.NewTicker(time.Second / 60)
	defer frameTicker.Stop()

	frameCount := 0

	// メインループ (指定時間実行)
loop:
	for {
		select {
		case <-frameTicker.C:
			// フレームごとの処理
			// 1. CPUサイクル実行
			for i := 0; i < int(emulator.CyclesPerFrame()); i++ {
				_, _, halted := emulator.Cycle()
				if halted {
					// Fx0Aでキー入力待ち。テスターではキー入力がないので、
					// ここでループを抜けるか、一定時間でタイムアウトするか。
					// ここでは実行時間で制限するので、そのまま続ける。
					break // このフレームの残りのサイクルはスキップ
				}
			}

			// 2. タイマー更新
			emulator.UpdateTimers()

			frameCount++

			// 3. 終了判定
			if time.Since(startTime) >= *duration {
				log.Printf("Emulation finished after %d frames.", frameCount)
				break loop
			}

			// case <-time.After(*duration + 1*time.Second): // Safety break if ticker somehow fails
			// 	log.Println("Safety timeout reached.")
			// 	break loop
		}
	}

	// スナップショットの生成
	generateSnapshot(emulator, *outputFile)

	log.Printf("Snapshot saved to %s", *outputFile)
}

// generateSnapshot generates a PNG image from the CHIP-8 Gfx buffer.
func generateSnapshot(emulator *chip8.Chip8, filename string) {
	gfx := emulator.Gfx() // [64*32]byte
	img := image.NewRGBA(image.Rect(0, 0, screenWidth, screenHeight))

	for y := 0; y < screenHeight; y++ {
		for x := 0; x < screenWidth; x++ {
			index := y*screenWidth + x
			if gfx[index] == 1 {
				img.Set(x, y, color.White) // On pixel
			} else {
				img.Set(x, y, color.Black) // Off pixel
			}
		}
	}

	file, err := os.Create(filename)
	if err != nil {
		log.Fatalf("Failed to create snapshot file '%s': %v", filename, err)
	}
	defer file.Close()

	if err := png.Encode(file, img); err != nil {
		log.Fatalf("Failed to encode snapshot PNG '%s': %v", filename, err)
	}
}
