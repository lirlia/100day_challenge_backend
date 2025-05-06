package chip8

import (
	// "embed" // Temporarily comment out due to build issue
	"fmt"
	"math/rand"
	"os"
	"time"
)

// //go:embed ../../assets/fonts/chip8_font.bin // Temporarily comment out due to build issue
// var embeddedFontSet []byte // Temporarily comment out due to build issue

const (
	memorySize   = 4096
	numRegisters = 16
	stackSize    = 16
	gfxWidth     = 64
	gfxHeight    = 32
	gfxSize      = gfxWidth * gfxHeight
	fontOffset   = 0x050
	romOffset    = 0x200
)

// Standard CHIP-8 font set. Each character is 5 bytes.
var fontSet = [80]byte{
	0xF0, 0x90, 0x90, 0x90, 0xF0, // 0
	0x20, 0x60, 0x20, 0x20, 0x70, // 1
	0xF0, 0x10, 0xF0, 0x80, 0xF0, // 2
	0xF0, 0x10, 0xF0, 0x10, 0xF0, // 3
	0x90, 0x90, 0xF0, 0x10, 0x10, // 4
	0xF0, 0x80, 0xF0, 0x10, 0xF0, // 5
	0xF0, 0x80, 0xF0, 0x90, 0xF0, // 6
	0xF0, 0x10, 0x20, 0x40, 0x40, // 7
	0xF0, 0x90, 0xF0, 0x90, 0xF0, // 8
	0xF0, 0x90, 0xF0, 0x10, 0xF0, // 9
	0xF0, 0x90, 0xF0, 0x90, 0x90, // A
	0xE0, 0x90, 0xE0, 0x90, 0xE0, // B
	0xF0, 0x80, 0x80, 0x80, 0xF0, // C
	0xE0, 0x90, 0x90, 0x90, 0xE0, // D
	0xF0, 0x80, 0xF0, 0x80, 0xF0, // E
	0xF0, 0x80, 0xF0, 0x80, 0x80, // F
}

type Chip8 struct {
	memory [memorySize]byte
	V      [numRegisters]byte
	I      uint16
	PC     uint16
	stack  [stackSize]uint16
	SP     uint8
	gfx    [gfxSize]byte // 1 for on, 0 for off
	DT     byte          // Delay Timer
	ST     byte          // Sound Timer
	keys   [numRegisters]bool

	waitingForKey bool
	keyReg        byte // Register to store the key press in (for Fx0A)

	rng *rand.Rand

	// Configuration
	cyclesPerFrame uint // How many CPU cycles to run per display frame (e.g., per 1/60th second)
	variantSCHIP   bool // Flag for SCHIP specific behaviors (e.g. Fx55/Fx65, SHL/SHR)
}

func New(cyclesPerFrame uint, variantSCHIP bool) *Chip8 {
	if cyclesPerFrame == 0 {
		cyclesPerFrame = 10 // Default if 0 is passed
	}

	c := &Chip8{
		PC:             romOffset, // Program Counter starts at 0x200
		cyclesPerFrame: cyclesPerFrame,
		variantSCHIP:   variantSCHIP,
		rng:            rand.New(rand.NewSource(time.Now().UnixNano())),
	}

	// Clear memory, registers, stack, gfx, keys
	// Default Go initialization to zero is fine for most, but explicit for clarity/safety.
	for i := range c.memory {
		c.memory[i] = 0
	}
	for i := range c.V {
		c.V[i] = 0
	}
	for i := range c.stack {
		c.stack[i] = 0
	}
	for i := range c.gfx {
		c.gfx[i] = 0
	}
	for i := range c.keys {
		c.keys[i] = false
	}

	c.I = 0
	c.SP = 0
	c.DT = 0
	c.ST = 0
	c.waitingForKey = false
	c.keyReg = 0

	// Load font set into memory
	// We use the hardcoded fontSet for now.
	// The embeddedFontSet is prepared for Step 3 if we want to load from an external file.
	copy(c.memory[fontOffset:], fontSet[:])

	return c
}

// Gfx returns a copy of the graphics buffer.
func (c *Chip8) Gfx() [gfxSize]byte {
	// Return a copy to prevent direct modification from outside
	var gfxCopy [gfxSize]byte
	copy(gfxCopy[:], c.gfx[:])
	return gfxCopy
}

// CyclesPerFrame returns the configured cycles per frame.
func (c *Chip8) CyclesPerFrame() uint {
	return c.cyclesPerFrame
}

// LoadROM loads a CHIP-8 ROM from the given path into memory.
func (c *Chip8) LoadROM(romPath string) error {
	romData, err := os.ReadFile(romPath)
	if err != nil {
		return fmt.Errorf("failed to read ROM file '%s': %w", romPath, err)
	}

	// ROMs are loaded starting at address 0x200 (romOffset)
	// Available memory for ROM is memorySize - romOffset
	if len(romData) > (memorySize - romOffset) {
		return fmt.Errorf("ROM file '%s' is too large: %d bytes (max %d bytes)",
			romPath, len(romData), memorySize-romOffset)
	}

	// Copy ROM data into memory
	// Note: New() already initializes memory to 0, so no need to clear here.
	copy(c.memory[romOffset:], romData)

	// According to Cowgod's technical reference, after loading a ROM,
	// the PC should still be at 0x200 (which is its initial state from New()).
	// So, no change to PC here needed after loading.

	return nil
}
