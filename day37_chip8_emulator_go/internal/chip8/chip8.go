package chip8

import (
	// "embed" // Temporarily comment out due to build issue
	"fmt"
	"log" // Added for Cycle method logging
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

// fetchOpcode reads the 2-byte opcode from memory at the current PC.
// It does not advance the PC.
func (c *Chip8) fetchOpcode() uint16 {
	if c.PC+1 >= memorySize {
		// This is a critical error, likely a runaway PC or corrupted ROM.
		// For now, log and return a NOP-like opcode (e.g., 0x0000) or panic.
		// Returning 0x0000 might lead to infinite loops if not handled by SYS addr.
		log.Printf("CRITICAL: Attempted to fetch opcode out of bounds at PC=0x%X", c.PC)
		// Consider a more robust error handling strategy here, e.g., returning an error.
		// For now, let's return an opcode that might be less harmful, or let it crash.
		// For safety, we'll cause a panic to halt execution if this occurs during development.
		panic(fmt.Sprintf("Opcode fetch out of bounds: PC=0x%X", c.PC))
	}
	return uint16(c.memory[c.PC])<<8 | uint16(c.memory[c.PC+1])
}

// Cycle executes one CHIP-8 CPU cycle.
// It fetches an opcode, executes it, and updates timers (placeholder).
// Returns redraw (bool): if the screen needs to be updated.
// Returns collision (bool): if a collision occurred during a DRW operation.
// Returns halted (bool): if the CPU is waiting for a key press (Fx0A).
func (c *Chip8) Cycle() (redraw bool, collision bool, halted bool) {
	// Step 6 will fully implement Fx0A key waiting logic.
	// For now, if waitingForKey is true, we halt and do nothing else this cycle.
	// Timers should still decrement if waiting for a key (handled by UpdateTimers later).
	if c.waitingForKey {
		// Placeholder for key check. Full logic in Step 6.
		// log.Printf("CPU halted, waiting for key press for V%X", c.keyReg)
		// c.UpdateTimers() // Timers update even when halted (will be called externally per frame or here)
		return false, false, true // No redraw, no collision, but CPU is halted
	}

	opcode := c.fetchOpcode()
	rd, col := c.executeOpcode(opcode) // PC is managed by executeOpcode

	// Step 5 will implement timer updates.
	// c.UpdateTimers() // This is typically called at 60Hz, not per CPU cycle.
	// The main loop will call UpdateTimers().

	return rd, col, false // Not halted (unless Fx0A was just processed and set waitingForKey)
}

// UpdateTimers decrements the delay and sound timers if they are greater than zero.
// This method should be called at a rate of 60Hz by the main loop.
func (c *Chip8) UpdateTimers() {
	if c.DT > 0 {
		c.DT--
	}
	if c.ST > 0 {
		c.ST--
		// if c.ST == 0 { log.Println("BEEP!") } // Placeholder for actual sound output
	}
}
