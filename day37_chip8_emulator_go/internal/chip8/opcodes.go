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

	case 0x8000: // Arithmetic and Logic opcodes (8xy0 - 8xy7, 8xyE)
		x := (opcode & 0x0F00) >> 8
		y := (opcode & 0x00F0) >> 4
		switch opcode & 0x000F {
		case 0x0000: // LD Vx, Vy (8xy0) - Set Vx = Vy.
			c.V[x] = c.V[y]
		case 0x0001: // OR Vx, Vy (8xy1) - Set Vx = Vx OR Vy.
			c.V[x] |= c.V[y]
		case 0x0002: // AND Vx, Vy (8xy2) - Set Vx = Vx AND Vy.
			c.V[x] &= c.V[y]
		case 0x0003: // XOR Vx, Vy (8xy3) - Set Vx = Vx XOR Vy.
			c.V[x] ^= c.V[y]
		case 0x0004: // ADD Vx, Vy (8xy4) - Set Vx = Vx + Vy, set VF = carry.
			// Cast to uint16 to detect overflow for carry
			sum := uint16(c.V[x]) + uint16(c.V[y])
			c.V[x] = byte(sum & 0xFF) // Lower 8 bits are the result
			if sum > 0xFF {           // If sum is greater than 255, a carry occurred
				c.V[0xF] = 1
			} else {
				c.V[0xF] = 0
			}
		case 0x0005: // SUB Vx, Vy (8xy5) - Set Vx = Vx - Vy, set VF = NOT borrow.
			// If Vx > Vy, then VF is 1; otherwise 0.
			borrow := byte(0)
			if c.V[x] >= c.V[y] { // Note: NOT borrow means Vx >= Vy for VF=1
				borrow = 1
			}
			c.V[x] -= c.V[y]
			c.V[0xF] = borrow
		case 0x0006: // SHR Vx {, Vy} (8xy6) - Set Vx = Vx SHR 1.
			// If variantSCHIP is true, Vx = Vy SHR 1. VF = LSB of Vy.
			// Otherwise, Vx = Vx SHR 1. VF = LSB of Vx.
			var lsb byte
			if c.variantSCHIP {
				lsb = c.V[y] & 0x1
				c.V[x] = c.V[y] >> 1
			} else {
				lsb = c.V[x] & 0x1
				c.V[x] >>= 1
			}
			c.V[0xF] = lsb
		case 0x0007: // SUBN Vx, Vy (8xy7) - Set Vx = Vy - Vx, set VF = NOT borrow.
			// If Vy > Vx, then VF is 1; otherwise 0.
			borrow := byte(0)
			if c.V[y] >= c.V[x] { // Note: NOT borrow means Vy >= Vx for VF=1
				borrow = 1
			}
			c.V[x] = c.V[y] - c.V[x]
			c.V[0xF] = borrow
		case 0x000E: // SHL Vx {, Vy} (8xyE) - Set Vx = Vx SHL 1.
			// If variantSCHIP is true, Vx = Vy SHL 1. VF = MSB of Vy.
			// Otherwise, Vx = Vx SHL 1. VF = MSB of Vx.
			var msb byte
			if c.variantSCHIP {
				msb = (c.V[y] & 0x80) >> 7 // Get MSB (0x80 is 10000000b)
				c.V[x] = c.V[y] << 1
			} else {
				msb = (c.V[x] & 0x80) >> 7
				c.V[x] <<= 1
			}
			c.V[0xF] = msb
		default:
			log.Printf("Unknown 8xxx opcode: 0x%X (PC: 0x%X)", opcode, c.PC)
		}
		c.PC += 2
		return false, false // Most 8xxx opcodes do not affect redraw

	case 0xE000:
		x := (opcode & 0x0F00) >> 8
		switch opcode & 0x00FF {
		case 0x009E: // SKP Vx (Ex9E) - Skip next instruction if key with the value of Vx is pressed.
			if c.IsKeyPressed(c.V[x]) {
				c.PC += 2 // Skip the original PC += 2 by doing it here
			}
			c.PC += 2
		case 0x00A1: // SKNP Vx (ExA1) - Skip next instruction if key with the value of Vx is not pressed.
			if !c.IsKeyPressed(c.V[x]) {
				c.PC += 2 // Skip the original PC += 2 by doing it here
			}
			c.PC += 2
		default:
			log.Printf("Unknown Ex opcode: 0x%X (PC: 0x%X)", opcode, c.PC)
			c.PC += 2
			return false, false
		}
		return false, false

	case 0xF000:
		x := (opcode & 0x0F00) >> 8 // Common for many Fx opcodes
		switch opcode & 0x00FF {
		case 0x0007: // LD Vx, DT (Fx07) - Set Vx = delay timer value.
			c.V[x] = c.DT
			c.PC += 2
		case 0x000A: // LD Vx, K (Fx0A) - Wait for a key press, store the value of the key in Vx.
			c.waitingForKey = true
			c.keyReg = byte(x) // Store which register Vx to put the key value into
			// PC does NOT advance here. It will be advanced in Cycle() when a key is pressed.
			return false, false // Redraw false, Halted will be true via Cycle()
		case 0x0015: // LD DT, Vx (Fx15) - Set delay timer = Vx.
			c.DT = c.V[x]
			c.PC += 2
		case 0x0018: // LD ST, Vx (Fx18) - Set sound timer = Vx.
			c.ST = c.V[x]
			c.PC += 2
		// Other Fx opcodes (Fx0A, Fx1E, Fx29, Fx33, Fx55, Fx65) will be added later.
		default:
			log.Printf("Unknown Fx opcode: 0x%X (PC: 0x%X)", opcode, c.PC)
			c.PC += 2
			return false, false // Default for unknown Fx opcodes
		}
		return false, false // Default for Fx opcodes (redraw typically false unless specified)

	default:
		log.Printf("Unknown opcode: 0x%X (PC: 0x%X)", opcode, c.PC)
		c.PC += 2 // For unknown opcodes, just skip and continue
		return false, false
	}
}
