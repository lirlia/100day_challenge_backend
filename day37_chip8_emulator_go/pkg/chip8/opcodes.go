package chip8

import (
	"fmt"
	// "log" // log パッケージの import を削除 (またはコメントアウト)
)

// executeOpcode decodes and executes a single CHIP-8 opcode.
// It should handle PC modification for jumps, calls, skips, and returns.
// For other instructions, PC will be incremented by 2 in the Cycle function.
func (c *Chip8) executeOpcode(opcode uint16) {
	// Extract parts of the opcode
	x := byte((opcode & 0x0F00) >> 8)
	y := byte((opcode & 0x00F0) >> 4)
	n := byte(opcode & 0x000F)
	kk := byte(opcode & 0x00FF)
	nnn := opcode & 0x0FFF

	// fmt.Printf("  Executing Opcode: 0x%X (PC=0x%X)\n", opcode, c.PC) // DEBUG 削除

	// Decode and execute based on the first nibble
	switch opcode & 0xF000 {
	case 0x0000:
		switch opcode & 0x00FF {
		case 0x00E0: // 00E0: CLS - Clear the display
			// fmt.Println("  -> Opcode 00E0: CLS") // DEBUG 削除
			c.clearScreen()
		// Note: 00EE (RET) will be handled later
		default:
			// Typically 0nnn - SYS addr, ignored
			// fmt.Printf("  -> Opcode 0x%X: Ignoring SYS or unknown 0x00xx\n", opcode) // DEBUG 削除
			// PC incremented in Cycle
		}
	case 0x1000: // 1nnn: JP addr - Jump to location nnn
		// fmt.Printf("  -> Opcode 1nnn: JP 0x%X\n", nnn) // DEBUG 削除
		c.PC = nnn // Set PC directly
	// case 0x2000: // 2nnn: CALL addr - To be implemented later
	// case 0x3000: // 3xkk: SE Vx, byte - To be implemented later
	// case 0x4000: // 4xkk: SNE Vx, byte - To be implemented later
	// case 0x5000: // 5xy0: SE Vx, Vy - To be implemented later
	case 0x6000: // 6xkk: LD Vx, byte - Set Vx = kk
		// fmt.Printf("  -> Opcode 6xkk: LD V[%X], 0x%X\n", x, kk) // DEBUG 削除
		c.V[x] = kk
		// PC incremented in Cycle
	// case 0x7000: // 7xkk: ADD Vx, byte - To be implemented later
	// case 0x8000: // 8xyN opcodes - To be implemented later
	// case 0x9000: // 9xy0: SNE Vx, Vy - To be implemented later
	case 0xA000: // Annn: LD I, addr - Set I = nnn
		// fmt.Printf("  -> Opcode Annn: LD I, 0x%X\n", nnn) // DEBUG 削除
		c.I = nnn
		// PC incremented in Cycle
	// case 0xB000: // Bnnn: JP V0, addr - To be implemented later
	// case 0xC000: // Cxkk: RND Vx, byte - To be implemented later
	case 0xD000: // Dxyn: DRW Vx, Vy, nibble - Display n-byte sprite
		// fmt.Printf("  -> Opcode Dxyn: DRW V[%X](=0x%X), V[%X](=0x%X), %d at I=0x%X\n", x, c.V[x], y, c.V[y], n, c.I) // DEBUG 削除
		c.drawSprite(x, y, n)
		// PC incremented in Cycle
	// case 0xE000: // ExNN opcodes - To be implemented later
	// case 0xF000: // FxNN opcodes - To be implemented later
	default:
		fmt.Printf("Opcode 0x%X: Unknown or unimplemented pattern\n", opcode) // Unknown は残す
		// PC incremented in Cycle for unknown opcodes
	}
}

// clearScreen clears the graphics buffer and sets the draw flag.
func (c *Chip8) clearScreen() {
	for i := range c.gfx {
		c.gfx[i] = 0
	}
	c.SetDrawFlag()
}

// drawSprite draws a sprite at coordinates (Vx, Vy) with height n.
// Sets VF to 1 if any screen pixels are flipped from set to unset, 0 otherwise.
func (c *Chip8) drawSprite(x, y byte, n byte) {
	vx := c.V[x] % gfxWidth
	vy := c.V[y] % gfxHeight
	c.V[0xF] = 0 // Reset VF (collision flag)

	// log.Printf("drawSprite: Drawing sprite at (%d, %d), height: %d, I: 0x%X", vx, vy, n, c.I) // Debug log removed

	for row := byte(0); row < n; row++ {
		if c.I+uint16(row) >= uint16(len(c.memory)) {
			// log.Printf("drawSprite: Error - Trying to read sprite data out of memory bounds at I=0x%X, row=%d", c.I, row) // Debug log removed
			break
		}
		spriteByte := c.memory[c.I+uint16(row)]
		currentY := (vy + row) % gfxHeight

		// log.Printf("drawSprite: Row %d, Sprite byte: 0b%08b, Y coordinate: %d", row, spriteByte, currentY) // Debug log removed

		for col := byte(0); col < 8; col++ {
			currentX := (vx + col) % gfxWidth
			gfxIndex := uint16(currentY)*gfxWidth + uint16(currentX)

			if gfxIndex >= uint16(len(c.gfx)) {
				// log.Printf("drawSprite: Error - Calculated gfx index %d out of bounds (screen %dx%d)", gfxIndex, gfxWidth, gfxHeight) // Debug log removed
				continue // Skip drawing this pixel if index is out of bounds
			}

			// Check if the current sprite pixel is set (1)
			if (spriteByte & (0x80 >> col)) != 0 {
				// log.Printf("drawSprite: Pixel at (%d, %d) [gfxIndex: %d]. Sprite pixel is ON.", currentX, currentY, gfxIndex) // Debug log removed
				// Check for collision: if the screen pixel is already set (1)
				if c.gfx[gfxIndex] == 1 {
					// log.Printf("drawSprite: Collision detected at (%d, %d)! Setting VF=1.", currentX, currentY) // Debug log removed
					c.V[0xF] = 1
				}
				// XOR the pixel onto the screen buffer
				// before := c.gfx[gfxIndex] // Debug log removed
				c.gfx[gfxIndex] ^= 1
				// after := c.gfx[gfxIndex] // Debug log removed
				// log.Printf("drawSprite: Toggling pixel at (%d, %d) [gfxIndex: %d]. Before: %d, After: %d", currentX, currentY, gfxIndex, before, after) // Debug log removed
			} else {
				//log.Printf("drawSprite: Pixel at (%d, %d) [gfxIndex: %d]. Sprite pixel is OFF. No change.", currentX, currentY, gfxIndex) // Debug log removed
			}
		}
	}
	c.SetDrawFlag() // Screen has changed, set draw flag
	// log.Printf("drawSprite: Finished drawing sprite. Setting drawFlag=true.") // Debug log removed
}
