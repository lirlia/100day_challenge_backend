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

	gfx                  [gfxWidth * gfxHeight]byte // Graphics buffer (64x32 pixels, 1 byte per pixel, 0 or 1)
	drawnGfx             [gfxWidth * gfxHeight]byte // Previously drawn graphics buffer
	clearScreenRequested bool                       // Flag for CLS instruction

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
	// Clear drawn graphics buffer as well
	for i := range c.drawnGfx {
		c.drawnGfx[i] = 0
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
	c.waitingForKey = false
	c.keyReg = 0
	c.clearScreenRequested = false // Initialize clearScreenRequested

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

// DrawnGfx returns the previously drawn graphics buffer.
// Used for differential rendering.
func (c *Chip8) DrawnGfx() [gfxWidth * gfxHeight]byte {
	return c.drawnGfx
}

// UpdateDrawnGfx copies the current gfx buffer to the drawnGfx buffer.
// Should be called after a successful draw operation in the main loop.
func (c *Chip8) UpdateDrawnGfx() {
	copy(c.drawnGfx[:], c.gfx[:])
	log.Println("[Chip8.UpdateDrawnGfx] drawnGfx updated with current gfx content.")
}

// WasClearScreenRequestedAndReset checks if a CLS (00E0) instruction was executed
// and resets the flag.
func (c *Chip8) WasClearScreenRequestedAndReset() bool {
	requested := c.clearScreenRequested
	if requested {
		c.clearScreenRequested = false
		log.Println("[Chip8.WasClearScreenRequestedAndReset] clearScreenRequested was true, now reset to false.")
	}
	return requested
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
// Returns true if a draw operation occurred (CLS or DRW).
func (c *Chip8) Cycle() bool {
	log.Println("[Cycle] Starting cycle.")
	if c.waitingForKey {
		log.Println("[Cycle] Waiting for key press, halting.")
		// Check if a key has been pressed
		for i, pressed := range c.keys {
			if pressed {
				log.Printf("[Cycle] Key %X pressed while waiting. Storing in V%X.", i, c.keyReg)
				c.V[c.keyReg] = byte(i)
				c.waitingForKey = false
				// Consume the key press event immediately, should not trigger redraw
				c.keys[i] = false
				break
			}
		}
		if c.waitingForKey { // Still waiting if no key was found pressed
			return false
		}
	}

	// Fetch opcode
	opcode := c.fetchOpcode()
	log.Printf("[Cycle] Fetched opcode: 0x%X", opcode)

	// Decode and execute opcode
	// The executeOpcode function now returns true if a draw operation occurred
	drawOccurred := c.executeOpcode(opcode)
	log.Printf("[Cycle] Executed opcode: 0x%X, drawOccurred: %t", opcode, drawOccurred)

	// Update timers
	// Timers are decremented at a rate of 60Hz.
	// This logic might need adjustment if Cycle is called at a different frequency.
	// For now, assume Cycle is called frequently enough that timers update smoothly.
	if c.DT > 0 {
		// log.Printf("[Cycle] Decrementing DT from %d", c.DT) // Too verbose
		c.DT--
	}
	if c.ST > 0 {
		// log.Printf("[Cycle] Decrementing ST from %d", c.ST) // Too verbose
		if c.ST == 1 {
			log.Println("[Cycle] Sound timer reached 0! (BEEP)")
			// TODO: Implement actual sound output if desired
		}
		c.ST--
	}
	log.Printf("[Cycle] Ending cycle. DT: %d, ST: %d", c.DT, c.ST)
	return drawOccurred
}

// fetchOpcode fetches the next opcode from memory at PC.
func (c *Chip8) fetchOpcode() uint16 {
	if c.PC+1 >= memorySize {
		fmt.Println("Error: Program Counter out of bounds!")
		return 0
	}
	return uint16(c.memory[c.PC])<<8 | uint16(c.memory[c.PC+1])
}

// executeOpcode decodes and executes a single CHIP-8 opcode.
// Returns true if a draw-related operation (CLS, DRW) occurred, false otherwise.
func (c *Chip8) executeOpcode(opcode uint16) bool {
	// log.Printf("[Opcode] Executing 0x%X at PC=0x%X", opcode, c.PC-2) // PC already advanced by fetchOpcode

	// Decode opcode (Common patterns)
	// ... existing code ...
	// Switch on the first nibble (highest 4 bits)
	switch opcode & 0xF000 {
	case 0x0000:
		switch opcode & 0x00FF {
		case 0x00E0: // 00E0: CLS - Clear the display
			log.Printf("[Opcode 00E0] CLS - Clearing display. PC: 0x%X", c.PC-2)
			for i := range c.gfx {
				c.gfx[i] = 0
			}
			c.clearScreenRequested = true // Signal that a full clear is needed
			log.Println("[Opcode 00E0] gfx buffer cleared, clearScreenRequested set to true.")
			return true // Redraw needed
		// ... existing code ...
		default:
			log.Printf("[Opcode] Unknown opcode 0x0XXX: 0x%X", opcode)
			return false
		}
	// ... existing code ...
	case 0xD000: // Dxyn: DRW Vx, Vy, nibble - Display n-byte sprite starting at memory I at (Vx, Vy), set VF = collision.
		vx := (opcode & 0x0F00) >> 8
		vy := (opcode & 0x00F0) >> 4
		n := opcode & 0x000F
		x := int(c.V[vx]) % gfxWidth
		y := int(c.V[vy]) % gfxHeight
		log.Printf("[Opcode DxyN] DRW V%X=%d, V%X=%d, N=%d. I=0x%X. Drawing at (%d, %d)", vx, c.V[vx], vy, c.V[vy], n, c.I, x, y)

		c.V[0xF] = 0 // Reset collision flag
		pixelChanged := false

		for row := 0; row < int(n); row++ {
			if y+row >= gfxHeight {
				// log.Printf("[Opcode DxyN] Row %d out of bounds (y=%d, gfxHeight=%d)", row, y+row, gfxHeight)
				break // Stop if row is out of bounds vertically
			}
			spriteByte := c.memory[c.I+uint16(row)]
			// log.Printf("[Opcode DxyN] Row %d: Sprite byte 0x%X from M[0x%X]", row, spriteByte, c.I+uint16(row))

			for col := 0; col < 8; col++ {
				if x+col >= gfxWidth {
					// log.Printf("[Opcode DxyN] Col %d out of bounds (x=%d, gfxWidth=%d)", col, x+col, gfxWidth)
					break // Stop if col is out of bounds horizontally
				}
				// Check if the current sprite pixel is set (1)
				if (spriteByte & (0x80 >> col)) != 0 {
					// log.Printf("[Opcode DxyN] Sprite pixel at (%d, %d) is ON", x+col, y+row)
					gfxIdx := (y+row)*gfxWidth + (x + col)
					originalGfxPixel := c.gfx[gfxIdx]
					// XOR the pixel onto the screen
					c.gfx[gfxIdx] ^= 1
					newGfxPixel := c.gfx[gfxIdx]

					if originalGfxPixel == 1 && newGfxPixel == 0 { // If pixel was turned off (collision)
						// log.Printf("[Opcode DxyN] Collision detected at (%d, %d)! Setting VF=1.", x+col, y+row)
						c.V[0xF] = 1
					}
					if originalGfxPixel != newGfxPixel {
						// log.Printf("[Opcode DxyN] Pixel at (%d, %d) changed from %d to %d.", x+col, y+row, originalGfxPixel, newGfxPixel)
						pixelChanged = true
					}
				}
			}
		}
		if pixelChanged {
			log.Printf("[Opcode DxyN] Finished drawing. pixelChanged: %t, VF (collision): %d", pixelChanged, c.V[0xF])
			return true // Redraw needed as gfx buffer was modified
		}
		log.Printf("[Opcode DxyN] Finished drawing. No pixels changed. VF (collision): %d", c.V[0xF])
		return false // No redraw needed if no pixels actually changed state
	// ... existing code ...
	default:
		log.Printf("[Opcode] Unknown opcode prefix: 0x%X (Full: 0x%X)", opcode&0xF000, opcode)
		return false
	}
	// Should be unreachable if all cases return, but as a fallback:
	// log.Println("[Opcode] Reached end of executeOpcode without explicit return, this might be an error.")
	// return false
}
