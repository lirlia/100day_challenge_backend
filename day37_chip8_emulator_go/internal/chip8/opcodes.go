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
			if c.SP == 0 {
				log.Printf("Stack underflow on RET (00EE) at PC 0x%X! SP is 0.", c.PC-2) // PC already advanced if this was fetched
				// Behavior on stack underflow can vary. Some emulators halt, some corrupt.
				// For now, we'll log and attempt to continue, PC will likely be invalid.
				// Or, a more robust approach: treat as a halt or error state.
				// For now, we'll log and attempt to continue, PC will likely be invalid.
				// Or, a more robust approach: treat as a halt or error state.
				c.PC += 2 // Default behavior if we don't halt
				return false, false
			}
			c.SP--
			c.PC = c.stack[c.SP]
			// Note: RET should also advance PC by 2 after popping from stack to point to the instruction *after* the CALL.
			// The PC stored on stack is the address of the instruction *after* the 2nnn CALL opcode.
			// So, when we do c.PC = c.stack[c.SP], it's already the correct next instruction.
			// The common `c.PC += 2` at the end of each opcode block should NOT be applied here. No, wait.
			// When 2NNN is called, PC (address of 2NNN) + 2 is pushed. So c.stack[c.SP] is the address of the instruction *after* 2NNN.
			// So, c.PC = c.stack[c.SP] is correct. No further PC increment needed for RET itself.
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
	case 0x2000: // CALL addr (2nnn): Call subroutine at nnn.
		if c.SP >= stackSize {
			log.Printf("Stack overflow on CALL (2nnn) at PC 0x%X! SP is %d.", c.PC, c.SP)
			// Behavior on stack overflow can vary.
			// For now, log and potentially overwrite last stack entry or halt.
			// Let's overwrite the top of the stack if full, mimicking some hardware or just log.
			// Or a more robust error: treat as a halt state.
			// For now, we will not push if stack is full, and PC will just jump.
			// This is not ideal. A better way is to define behavior (e.g. halt or error).
			// Let's allow it to overwrite for now, but cap SP to prevent out of bounds write if strict.
			// Actually, let's prevent SP from going out of bounds and log. This will cause RET to fail later.
			log.Printf("Stack is full. CALL to 0x%X will proceed without pushing PC.", opcode&0x0FFF)
			c.PC = opcode & 0x0FFF // Jump anyway
			return false, false
		}
		c.stack[c.SP] = c.PC + 2 // Store next instruction's address (current PC + 2 since current opcode is 2 bytes)
		c.SP++
		c.PC = opcode & 0x0FFF // Set PC to nnn
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

	case 0x9000: // SNE Vx, Vy (9xy0) - Skip next instruction if Vx != Vy.
		// Ensure last nibble is 0 for this opcode
		if opcode&0x000F != 0x0000 {
			log.Printf("Unknown 9xxx opcode (last nibble not 0): 0x%X", opcode)
			c.PC += 2
			return false, false
		}
		x := (opcode & 0x0F00) >> 8
		y := (opcode & 0x00F0) >> 4
		if c.V[x] != c.V[y] {
			c.PC += 2 // Skip additional 2 bytes
		}
		c.PC += 2 // Base increment
		return false, false

	case 0xA000: // LD I, addr (Annn) - Set I = nnn.
		c.I = opcode & 0x0FFF
		c.PC += 2
		return false, false

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
		case 0x0018: // LD ST, Vx (Fx18) - Set sound timer = Vx.
			c.ST = c.V[x]
			c.PC += 2
		case 0x001E: // ADD I, Vx (Fx1E)
			c.I += uint16(c.V[x])
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
		case 0x0007: // LD Vx, DT (Fx07)
			c.V[x] = c.DT
			c.PC += 2
			return false, false // Added return
		case 0x000A: // LD Vx, K (Fx0A)
			c.waitingForKey = true
			c.keyReg = byte(x)
			// PC does NOT advance here.
			return false, false // No redraw, Halted state determined by Cycle()
		case 0x0015: // LD DT, Vx (Fx15)
			c.DT = c.V[x]
			c.PC += 2
			return false, false // Added return
		case 0x0018: // LD ST, Vx (Fx18)
			c.ST = c.V[x]
			c.PC += 2
			return false, false // Added return
		case 0x001E: // ADD I, Vx (Fx1E)
			// VF not affected
			c.I += uint16(c.V[x])
			c.PC += 2
			return false, false
		case 0x0029: // LD F, Vx (Fx29) - Set I = location of sprite for digit Vx.
			digit := c.V[x] & 0x0F
			c.I = uint16(fontOffset + (int(digit) * 5))
			c.PC += 2
			return false, false
		case 0x0033: // LD B, Vx (Fx33) - Store BCD representation of Vx.
			if c.I+2 >= memorySize {
				log.Printf("Memory out of bounds on LD B, Vx (Fx33) at PC 0x%X. I=0x%X", c.PC, c.I)
			} else {
				val := c.V[x]
				c.memory[c.I] = val / 100
				c.memory[c.I+1] = (val / 10) % 10
				c.memory[c.I+2] = val % 10
			}
			c.PC += 2
			return false, false
		case 0x0055: // LD [I], Vx (Fx55) - Store V0..Vx to memory starting at I.
			// Check bounds before copy
			if c.I+uint16(x) >= memorySize {
				log.Printf("Memory out of bounds on LD [I], Vx (Fx55) at PC 0x%X. I=0x%X, x=%d", c.PC, c.I, x)
			} else {
				// copy(dst, src)
				copy(c.memory[c.I:c.I+uint16(x)+1], c.V[:x+1])
				if c.variantSCHIP {
					c.I += uint16(x) + 1
				}
			}
			c.PC += 2
			return false, false
		case 0x0065: // LD Vx, [I] (Fx65) - Read V0..Vx from memory starting at I.
			// Check bounds before copy
			if c.I+uint16(x) >= memorySize {
				log.Printf("Memory out of bounds on LD Vx, [I] (Fx65) at PC 0x%X. I=0x%X, x=%d", c.PC, c.I, x)
			} else {
				// copy(dst, src)
				copy(c.V[:x+1], c.memory[c.I:c.I+uint16(x)+1])
				if c.variantSCHIP {
					c.I += uint16(x) + 1
				}
			}
			c.PC += 2
			return false, false
		default:
			log.Printf("Unknown Fx opcode: 0x%X (PC: 0x%X)", opcode, c.PC)
			c.PC += 2
			return false, false // Return for default case too
		}
		// This final return is now unreachable if all cases return, which is good.
		// return false, false

	case 0x3000: // SE Vx, byte (3xkk) - Skip next instruction if Vx = kk.
		x := (opcode & 0x0F00) >> 8
		kk := byte(opcode & 0x00FF)
		if c.V[x] == kk {
			c.PC += 2 // Skip additional 2 bytes
		}
		c.PC += 2 // Base increment
		return false, false
	case 0x4000: // SNE Vx, byte (4xkk) - Skip next instruction if Vx != kk.
		x := (opcode & 0x0F00) >> 8
		kk := byte(opcode & 0x00FF)
		if c.V[x] != kk {
			c.PC += 2 // Skip additional 2 bytes
		}
		c.PC += 2 // Base increment
		return false, false
	case 0x5000: // SE Vx, Vy (5xy0) - Skip next instruction if Vx = Vy.
		// Ensure last nibble is 0 for this opcode
		if opcode&0x000F != 0x0000 {
			log.Printf("Unknown 5xxx opcode (last nibble not 0): 0x%X", opcode)
			c.PC += 2
			return false, false
		}
		x := (opcode & 0x0F00) >> 8
		y := (opcode & 0x00F0) >> 4
		if c.V[x] == c.V[y] {
			c.PC += 2 // Skip additional 2 bytes
		}
		c.PC += 2 // Base increment
		return false, false

	default:
		log.Printf("Unknown opcode: 0x%X (PC: 0x%X)", opcode, c.PC)
		c.PC += 2 // For unknown opcodes, just skip and continue
		return false, false
	}
}
