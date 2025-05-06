package chip8

import (
	"fmt"
	"log"
	"os"
)

const (
	memorySize = 4096
	gfxWidth   = 64
	gfxHeight  = 32
	stackSize  = 16
	numKeys    = 16
	numRegs    = 16
	fontOffset = 0x050 // Start address of the font set in memory
	romOffset  = 0x200 // Start address for ROM loading
)

// Font set (0-F)
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

// Chip8 represents the state of the CHIP-8 virtual machine.
type Chip8 struct {
	memory [memorySize]byte // 4K memory
	V      [numRegs]byte    // 16 general purpose 8-bit registers (V0-VF)
	I      uint16           // Index register (16-bit)
	PC     uint16           // Program counter (16-bit)

	stack [stackSize]uint16 // Stack (16 levels)
	SP    uint8             // Stack pointer

	gfx      [gfxWidth * gfxHeight]byte // Graphics buffer (64x32 pixels, 1 byte per pixel, 0 or 1)
	drawFlag bool                       // Flag indicating screen redraw needed

	DT byte // Delay timer
	ST byte // Sound timer

	keys [numKeys]bool // Keypad state (true if pressed)

	// For Fx0A (LD Vx, K) - Halts execution until key press
	waitingForKey bool
	keyReg        byte // Register to store the pressed key
}

// New creates and initializes a new Chip8 instance.
func New() *Chip8 {
	c := &Chip8{}
	c.initialize()
	return c
}

// initialize resets the Chip8 state to its default values.
func (c *Chip8) initialize() {
	// Clear memory
	for i := range c.memory {
		c.memory[i] = 0
	}
	// Clear registers V0-VF
	for i := range c.V {
		c.V[i] = 0
	}
	// Clear stack
	for i := range c.stack {
		c.stack[i] = 0
	}
	// Clear graphics buffer
	for i := range c.gfx {
		c.gfx[i] = 0
	}
	// Clear keys
	for i := range c.keys {
		c.keys[i] = false
	}

	// Reset index register, program counter, and stack pointer
	c.I = 0
	c.PC = romOffset // Program counter starts at 0x200 where ROM is loaded
	c.SP = 0

	// Reset timers
	c.DT = 0
	c.ST = 0

	// Reset flags
	c.drawFlag = false
	c.waitingForKey = false
	c.keyReg = 0

	// Load font set into memory (0x050-0x0A0)
	copy(c.memory[fontOffset:], fontSet[:])

	fmt.Println("CHIP-8 Initialized. PC set to 0x200.")
}

// LoadROM loads the program from the specified file path into memory.
func (c *Chip8) LoadROM(filePath string) error {
	file, err := os.Open(filePath)
	if err != nil {
		return fmt.Errorf("failed to open ROM file %s: %w", filePath, err)
	}
	defer file.Close()

	stats, err := file.Stat()
	if err != nil {
		return fmt.Errorf("failed to get file stats for %s: %w", filePath, err)
	}

	romSize := stats.Size()
	if romSize > int64(memorySize-romOffset) {
		return fmt.Errorf("ROM file %s is too large (%d bytes), max size is %d bytes", filePath, romSize, memorySize-romOffset)
	}

	buffer := make([]byte, romSize)
	bytesRead, err := file.Read(buffer)
	if err != nil {
		return fmt.Errorf("failed to read ROM file %s: %w", filePath, err)
	}
	if int64(bytesRead) != romSize {
		return fmt.Errorf("could not read the entire ROM file %s: read %d bytes, expected %d", filePath, bytesRead, romSize)
	}

	// Copy ROM data into memory starting at romOffset (0x200)
	copy(c.memory[romOffset:], buffer)

	fmt.Printf("Loaded ROM '%s' (%d bytes) into memory starting at 0x%X.\n", filePath, romSize, romOffset)
	return nil
}

// Gfx returns the current graphics buffer.
func (c *Chip8) Gfx() [gfxWidth * gfxHeight]byte {
	return c.gfx
}

// DrawFlag returns the draw flag status and resets it.
func (c *Chip8) DrawFlag() bool {
	if c.drawFlag {
		c.drawFlag = false
		return true
	}
	return false
}

// SetDrawFlag sets the draw flag.
func (c *Chip8) SetDrawFlag() {
	c.drawFlag = true
}

// SetKey updates the state of a specific key.
// Called from the main loop based on Ebiten input.
func (c *Chip8) SetKey(key byte, isPressed bool) {
	if key < numKeys { // Check if key index is valid
		c.keys[key] = isPressed
	} else {
		// Optionally log an error for invalid key index
		// log.Printf("SetKey: Invalid key index %d", key)
	}
}

// IsKeyPressed checks if a specific key is currently pressed.
// Used by opcodes Ex9E and ExA1.
func (c *Chip8) IsKeyPressed(key byte) bool {
	if key < numKeys {
		return c.keys[key]
	} else {
		// Optionally log an error for invalid key index
		// log.Printf("IsKeyPressed: Invalid key index %d", key)
		return false // Treat invalid keys as not pressed
	}
}

// IsWaitingForKey returns true if the CHIP-8 is waiting for a key press (Fx0A).
// Called from the main loop (Update function).
func (c *Chip8) IsWaitingForKey() bool {
	return c.waitingForKey
}

// KeyPress handles a key press event when the emulator is waiting for one (Fx0A).
// Called from the main loop (Update function).
func (c *Chip8) KeyPress(key byte) {
	if c.waitingForKey {
		if c.keyReg < numRegs { // Ensure the target register index is valid
			c.V[c.keyReg] = key
			c.waitingForKey = false // Stop waiting
			log.Printf("[Chip8.KeyPress] Key 0x%X pressed. Stored in V%X. Stopped waiting.", key, c.keyReg)
			// PC will naturally increment in the *next* cycle because waitingForKey is now false
		} else {
			log.Printf("[Chip8.KeyPress] Error: Invalid register V%X specified by Fx0A.", c.keyReg)
			c.waitingForKey = false // Stop waiting even on error to prevent deadlock
		}
	} else {
		// This shouldn't normally be called if not waiting, but good to handle.
		log.Println("[Chip8.KeyPress] Warning: KeyPress called but not waitingForKey.")
	}
}

// Cycle executes a single CHIP-8 instruction cycle.
func (c *Chip8) Cycle() {
	// If waiting for key press (Fx0A), halt execution
	if c.waitingForKey {
		// log.Println("[Chip8.Cycle] Waiting for key press (Fx0A). Halting cycle.") // 必要ならログ追加
		return // Do nothing until a key is pressed and waitingForKey becomes false
	}

	// Fetch Opcode (2 bytes starting at PC)
	if c.PC+1 >= memorySize {
		fmt.Println("Error: Program Counter out of bounds!")
		// TODO: Implement proper halting mechanism
		return
	}
	opcode := uint16(c.memory[c.PC])<<8 | uint16(c.memory[c.PC+1])
	// fmt.Printf("  Fetched Opcode: 0x%X\n", opcode) // DEBUG 削除

	// Store PC before execution to check if it was modified by a jump/call/skip instruction
	originalPC := c.PC

	// Decode and Execute Opcode
	c.executeOpcode(opcode)
	// fmt.Printf("  PC after execute: 0x%X\n", c.PC) // DEBUG 削除

	// Increment Program Counter only if it wasn't modified by the instruction itself
	// (e.g., jumps, calls, returns, skips handle their own PC logic).
	if c.PC == originalPC {
		// fmt.Println("  Incrementing PC by 2") // DEBUG 削除
		c.PC += 2
	} else {
		// fmt.Printf("  PC was modified by opcode, not incrementing. New PC: 0x%X\n", c.PC) // DEBUG 削除
	}

	// TODO: Update timers (DT and ST) - might move to main loop
	// fmt.Printf("Cycle End: PC=0x%X\n", c.PC) // DEBUG 削除
}
