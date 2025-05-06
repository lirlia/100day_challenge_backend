package chip8

import (
	"log"
)

// executeOpcode decodes and executes a single CHIP-8 opcode.
// It returns whether the screen needs to be redrawn and if a collision occurred (for DRW).
// PC is managed within this function: incremented by 2 for most opcodes,
// or set directly for jump/call opcodes.
func (c *Chip8) executeOpcode(opcode uint16) (redraw bool, collision bool) {
	// Extract common opcode parts for readability if needed, or extract inside cases.
	// x := (opcode & 0x0F00) >> 8
	// y := (opcode & 0x00F0) >> 4
	// nnn := opcode & 0x0FFF
	// kk := byte(opcode & 0x00FF)
	// n := byte(opcode & 0x000F)

	switch opcode & 0xF000 {
	case 0x0000:
		switch opcode & 0x00FF { // More specific mask for 0x00E0 and 0x00EE
		case 0x00E0: // CLS: Clear the display.
			for i := range c.gfx {
				c.gfx[i] = 0
			}
			c.PC += 2
			return true, false // redraw = true, collision = false
		case 0x00EE: // RET: Return from a subroutine.
			// (To be implemented in a later step)
			// c.SP--
			// c.PC = c.stack[c.SP]
			c.PC += 2 // Placeholder, will be correctly set by RET logic
			log.Printf("Opcode 00EE (RET) not fully implemented yet.")
			return false, false
		default:
			// SYS addr (0nnn) - Jump to machine code routine at nnn (ignored on modern interpreters)
			log.Printf("Ignoring SYS opcode: 0x%X", opcode)
			c.PC += 2
			return false, false
		}
	case 0x1000: // JP addr (1nnn): Jump to location nnn.
		c.PC = opcode & 0x0FFF
		return false, false
	case 0x6000: // LD Vx, byte (6xkk): Set Vx = kk.
		x := (opcode & 0x0F00) >> 8
		kk := byte(opcode & 0x00FF)
		c.V[x] = kk
		c.PC += 2
		return false, false
	case 0x7000: // ADD Vx, byte (7xkk): Set Vx = Vx + kk.
		x := (opcode & 0x0F00) >> 8
		kk := byte(opcode & 0x00FF)
		c.V[x] += kk // VF is not affected
		c.PC += 2
		return false, false
	case 0xD000: // DRW Vx, Vy, nibble (Dxyn)
		// Display n-byte sprite starting at memory location I at (Vx, Vy), set VF = collision.
		xReg := (opcode & 0x0F00) >> 8
		yReg := (opcode & 0x00F0) >> 4
		n := byte(opcode & 0x000F) // Height of the sprite (number of rows)

		vx := c.V[xReg] // X coordinate from Vx
		vy := c.V[yReg] // Y coordinate from Vy

		c.V[0xF] = 0          // Reset collision flag VF.
		pixelChanged := false // Track if any pixel was actually flipped for redraw status

		for yLine := byte(0); yLine < n; yLine++ {
			// Prevent reading out of memory bounds for sprite data
			if c.I+uint16(yLine) >= memorySize {
				log.Printf("DRW: Attempted to read sprite data out of memory bounds at I=0x%X, yLine=%d", c.I, yLine)
				continue // Skip this line of the sprite
			}
			spriteByte := c.memory[c.I+uint16(yLine)]
			screenY := (vy + yLine) // Actual Y on screen, wrap around with %

			for xBit := byte(0); xBit < 8; xBit++ { // Each byte is 8 pixels wide
				// Check if the current bit in spriteByte is set (pixel is on)
				// (0x80 >> xBit) creates masks 10000000, 01000000, ..., 00000001
				if (spriteByte & (0x80 >> xBit)) != 0 {
					screenX := (vx + xBit) // Actual X on screen, wrap around with %

					// Wrap around X and Y coordinates for screen
					wrappedX := uint16(screenX % gfxWidth)
					wrappedY := uint16(screenY % gfxHeight)
					gfxIndex := wrappedY*gfxWidth + wrappedX

					if gfxIndex < gfxSize { // Should always be true due to modulo
						if c.gfx[gfxIndex] == 1 { // If pixel on screen is already set
							c.V[0xF] = 1 // Collision detected
						}
						c.gfx[gfxIndex] ^= 1 // XOR the pixel on the screen buffer
						if !pixelChanged {
							pixelChanged = true // A pixel was flipped, so screen needs redraw
						}
					}
				}
			}
		}
		c.PC += 2
		return pixelChanged, c.V[0xF] == 1

	default:
		log.Printf("Unknown opcode: 0x%X (PC: 0x%X)", opcode, c.PC)
		c.PC += 2 // For unknown opcodes, just skip and continue
		return false, false
	}
}
