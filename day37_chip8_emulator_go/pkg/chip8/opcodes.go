package chip8

import "log"

// executeOpcode decodes and executes a single CHIP-8 opcode.
// It returns true if the opcode resulted in a screen draw operation (CLS or DRW).
func (c *Chip8) executeOpcode(opcode uint16) bool { // Ensure return type is bool
	x := (opcode & 0x0F00) >> 8
	y := (opcode & 0x00F0) >> 4
	// ... (other variable extractions if needed) ...

	switch opcode & 0xF000 {
	case 0x0000:
		switch opcode & 0x00FF {
		case 0x00E0: // CLS: Clear the display
			log.Println("[Opcode 00E0] CLS - Clearing display")
			for i := range c.gfx {
				c.gfx[i] = 0
			}
			c.clearScreenRequested = true // Set CLS flag
			return true                   // Draw operation occurred
		case 0x00EE: // RET: Return from a subroutine
			if c.SP == 0 {
				log.Printf("[Opcode 00EE] Error: Stack underflow on RET at PC=0x%X", c.PC)
				return false // Error, no draw (or handle error differently)
			}
			c.SP--
			c.PC = c.stack[c.SP]
			log.Printf("[Opcode 00EE] RET - Returning to 0x%X from stack. SP is now %d", c.PC, c.SP)
			return false // No draw operation
		default: // SYS addr (0nnn)
			log.Printf("[Opcode 0nnn] SYS addr 0x%03X - Ignored.", opcode&0x0FFF)
			return false // No draw operation
		}
	// ここから下の各case (0xD000以外) の末尾に `return false` を追加してください
	// 例:
	// case 0x1000:
	//     // ... 処理 ...
	//     return false
	case 0x1000: // JP addr (1nnn): Jump to location nnn.
		addr := opcode & 0x0FFF
		c.PC = addr
		log.Printf("[Opcode 1nnn] JP to 0x%03X", addr)
		return false
	case 0x2000: // CALL addr (2nnn): Call subroutine at nnn.
		if c.SP >= stackSize {
			log.Printf("[Opcode 2nnn] Error: Stack overflow on CALL 0x%03X at PC=0x%X. SP is %d", opcode&0x0FFF, c.PC, c.SP)
			return false
		}
		c.stack[c.SP] = c.PC
		c.SP++
		c.PC = opcode & 0x0FFF
		log.Printf("[Opcode 2nnn] CALL 0x%03X - Stored 0x%X on stack. SP is now %d", c.PC, c.stack[c.SP-1], c.SP)
		return false
	case 0x3000: // SE Vx, byte (3xkk): Skip next instruction if V[x] == kk.
		kk := byte(opcode & 0x00FF)
		if c.V[x] == kk {
			c.PC += 2
			log.Printf("[Opcode 3xkk] SE V%X (0x%X) == 0x%X. Skipping.", x, c.V[x], kk)
		} else {
			log.Printf("[Opcode 3xkk] SE V%X (0x%X) != 0x%X. Not skipping.", x, c.V[x], kk)
		}
		return false
	case 0x4000: // SNE Vx, byte (4xkk): Skip next instruction if V[x] != kk.
		kk := byte(opcode & 0x00FF)
		if c.V[x] != kk {
			c.PC += 2
			log.Printf("[Opcode 4xkk] SNE V%X (0x%X) != 0x%X. Skipping.", x, c.V[x], kk)
		} else {
			log.Printf("[Opcode 4xkk] SNE V%X (0x%X) == 0x%X. Not skipping.", x, c.V[x], kk)
		}
		return false
	case 0x5000: // SE Vx, Vy (5xy0): Skip next instruction if V[x] == V[y].
		if (opcode & 0x000F) != 0x0 { // Ensure last nibble is 0
			log.Printf("[Opcode 5xyN] Error: Invalid opcode 0x%04X (N should be 0). Ignored.", opcode)
			return false
		}
		if c.V[x] == c.V[y] {
			c.PC += 2
			log.Printf("[Opcode 5xy0] SE V%X (0x%X) == V%X (0x%X). Skipping.", x, c.V[x], y, c.V[y])
		} else {
			log.Printf("[Opcode 5xy0] SE V%X (0x%X) != V%X (0x%X). Not skipping.", x, c.V[x], y, c.V[y])
		}
		return false
	case 0x6000: // LD Vx, byte (6xkk): Set V[x] = kk.
		kk := byte(opcode & 0x00FF)
		c.V[x] = kk
		log.Printf("[Opcode 6xkk] LD V%X = 0x%X", x, kk)
		return false
	case 0x7000: // ADD Vx, byte (7xkk): Set V[x] = V[x] + kk.
		kk := byte(opcode & 0x00FF)
		log.Printf("[Opcode 7xkk] ADD V%X (0x%X) += 0x%X.", x, c.V[x], kk)
		c.V[x] += kk
		log.Printf(" Result: 0x%X", c.V[x])
		return false
	case 0x8000: // Bitwise operations
		switch opcode & 0x000F {
		case 0x0000: // LD Vx, Vy (8xy0)
			log.Printf("[Opcode 8xy0] LD V%X = V%X (0x%X)", x, y, c.V[y])
			c.V[x] = c.V[y]
			return false
		case 0x0001: // OR Vx, Vy (8xy1)
			log.Printf("[Opcode 8xy1] OR V%X (0x%X) |= V%X (0x%X).", x, c.V[x], y, c.V[y])
			c.V[x] |= c.V[y]
			log.Printf(" Result: 0x%X", c.V[x])
			c.V[0xF] = 0 // Modern CHIP-8 variant behavior
			return false
		case 0x0002: // AND Vx, Vy (8xy2)
			log.Printf("[Opcode 8xy2] AND V%X (0x%X) &= V%X (0x%X).", x, c.V[x], y, c.V[y])
			c.V[x] &= c.V[y]
			log.Printf(" Result: 0x%X", c.V[x])
			c.V[0xF] = 0 // Modern CHIP-8 variant behavior
			return false
		case 0x0003: // XOR Vx, Vy (8xy3)
			log.Printf("[Opcode 8xy3] XOR V%X (0x%X) ^= V%X (0x%X).", x, c.V[x], y, c.V[y])
			c.V[x] ^= c.V[y]
			log.Printf(" Result: 0x%X", c.V[x])
			c.V[0xF] = 0 // Modern CHIP-8 variant behavior
			return false
		case 0x0004: // ADD Vx, Vy (8xy4)
			originalVx := c.V[x]
			sum := uint16(c.V[x]) + uint16(c.V[y])
			c.V[x] = byte(sum)
			if sum > 0xFF {
				c.V[0xF] = 1
			} else {
				c.V[0xF] = 0
			}
			log.Printf("[Opcode 8xy4] ADD V%X (0x%X) += V%X (0x%X). Result: 0x%X, VF: %d", x, originalVx, y, c.V[y], c.V[x], c.V[0xF])
			return false
		case 0x0005: // SUB Vx, Vy (8xy5)
			originalVx := c.V[x]
			if c.V[x] >= c.V[y] { // Not borrow if Vx >= Vy
				c.V[0xF] = 1
			} else {
				c.V[0xF] = 0
			}
			c.V[x] -= c.V[y]
			log.Printf("[Opcode 8xy5] SUB V%X (0x%X) -= V%X (0x%X). Result: 0x%X, VF: %d", x, originalVx, y, c.V[y], c.V[x], c.V[0xF])
			return false
		case 0x0006: // SHR Vx {, Vy} (8xy6)
			originalVx := c.V[x]
			c.V[0xF] = originalVx & 0x1 // LSB
			c.V[x] = originalVx >> 1    // Shift Vx, not Vy
			log.Printf("[Opcode 8xy6] SHR V%X (0x%X) >>= 1. Result: 0x%X, VF: %d", x, originalVx, c.V[x], c.V[0xF])
			return false
		case 0x0007: // SUBN Vx, Vy (8xy7)
			originalVx := c.V[x]
			if c.V[y] >= c.V[x] { // Not borrow if Vy >= Vx
				c.V[0xF] = 1
			} else {
				c.V[0xF] = 0
			}
			c.V[x] = c.V[y] - originalVx
			log.Printf("[Opcode 8xy7] SUBN V%X = V%X (0x%X) - V%X (0x%X). Result: 0x%X, VF: %d", x, y, c.V[y], x, originalVx, c.V[x], c.V[0xF])
			return false
		case 0x000E: // SHL Vx {, Vy} (8xyE)
			originalVx := c.V[x]
			c.V[0xF] = (originalVx & 0x80) >> 7 // MSB
			c.V[x] = originalVx << 1            // Shift Vx, not Vy
			log.Printf("[Opcode 8xyE] SHL V%X (0x%X) <<= 1. Result: 0x%X, VF: %d", x, originalVx, c.V[x], c.V[0xF])
			return false
		default:
			log.Printf("[Opcode 8xyN] Error: Unknown 8xxx opcode 0x%04X. Ignored.", opcode)
			return false
		}
	case 0x9000: // SNE Vx, Vy (9xy0)
		if (opcode & 0x000F) != 0x0 { // Ensure last nibble is 0
			log.Printf("[Opcode 9xyN] Error: Invalid opcode 0x%04X (N should be 0). Ignored.", opcode)
			return false
		}
		if c.V[x] != c.V[y] {
			c.PC += 2
			log.Printf("[Opcode 9xy0] SNE V%X (0x%X) != V%X (0x%X). Skipping.", x, c.V[x], y, c.V[y])
		} else {
			log.Printf("[Opcode 9xy0] SNE V%X (0x%X) == V%X (0x%X). Not skipping.", x, c.V[x], y, c.V[y])
		}
		return false
	case 0xA000: // LD I, addr (Annn)
		addr := opcode & 0x0FFF
		c.I = addr
		log.Printf("[Opcode Annn] LD I = 0x%03X", addr)
		return false
	case 0xB000: // JP V0, addr (Bnnn)
		addr := opcode & 0x0FFF
		// Typically NNN + V0. Some interpret as XNN + VX. Assuming NNN + V0.
		c.PC = addr + uint16(c.V[0])
		log.Printf("[Opcode Bnnn] JP to 0x%03X + V0 (0x%X). Target: 0x%X", addr, c.V[0], c.PC)
		return false
	case 0xC000: // RND Vx, byte (Cxkk)
		kk := byte(opcode & 0x00FF)
		// Placeholder for random number generation. Requires math/rand.
		// For now, a deterministic value to allow compilation.
		// Proper seeding (e.g., in New() or main) and rand.Intn() would be needed.
		randomNumber := byte(c.PC ^ c.I ^ uint16(c.DT)) // Simple pseudo-random
		c.V[x] = randomNumber & kk
		log.Printf("[Opcode Cxkk] RND V%X = (pseudo-random 0x%X) AND 0x%X. Result: 0x%X", x, randomNumber, kk, c.V[x])
		return false
	case 0xD000: // DRW Vx, Vy, nibble (Dxyn)
		spriteX := c.V[x]
		spriteY := c.V[y]
		height := opcode & 0x000F
		c.V[0xF] = 0 // Reset collision flag

		log.Printf("[Opcode Dxyn] DRW V%X (X:%d), V%X (Y:%d), height: %d at I:0x%X", x, spriteX, y, spriteY, height, c.I)
		collision := false
		for yLine := uint16(0); yLine < height; yLine++ {
			if c.I+yLine >= memorySize {
				break
			}
			pixelRow := c.memory[c.I+yLine]
			for xLine := uint16(0); xLine < 8; xLine++ {
				if (pixelRow & (0x80 >> xLine)) != 0 {
					screenX := (uint16(spriteX) + xLine) % gfxWidth
					screenY := (uint16(spriteY) + yLine) % gfxHeight
					gfxIndex := screenY*gfxWidth + screenX
					if gfxIndex < uint16(len(c.gfx)) {
						if c.gfx[gfxIndex] == 1 {
							collision = true // Set collision flag
						}
						c.gfx[gfxIndex] ^= 1
					}
				}
			}
		}
		if collision {
			c.V[0xF] = 1
		}
		return true // Draw operation occurred
	case 0xE000:
		switch opcode & 0x00FF {
		case 0x009E: // SKP Vx (Ex9E)
			keyVal := c.V[x]
			if keyVal >= numKeys {
				log.Printf("[Opcode Ex9E] Error: Invalid key 0x%X in V%X. Not skipping.", keyVal, x)
				return false
			}
			if c.keys[keyVal] {
				c.PC += 2
				log.Printf("[Opcode Ex9E] SKP V%X (key 0x%X) - Key pressed. Skipping.", x, keyVal)
			} else {
				log.Printf("[Opcode Ex9E] SKP V%X (key 0x%X) - Key not pressed. Not skipping.", x, keyVal)
			}
			return false
		case 0x00A1: // SKNP Vx (ExA1)
			keyVal := c.V[x]
			if keyVal >= numKeys {
				log.Printf("[Opcode ExA1] Error: Invalid key 0x%X in V%X. Not skipping.", keyVal, x)
				return false
			}
			if !c.keys[keyVal] {
				c.PC += 2
				log.Printf("[Opcode ExA1] SKNP V%X (key 0x%X) - Key not pressed. Skipping.", x, keyVal)
			} else {
				log.Printf("[Opcode ExA1] SKNP V%X (key 0x%X) - Key pressed. Not skipping.", x, keyVal)
			}
			return false
		default:
			log.Printf("[Opcode ExXX] Error: Unknown Exxx opcode 0x%04X. Ignored.", opcode)
			return false
		}
	case 0xF000:
		switch opcode & 0x00FF {
		case 0x0007: // LD Vx, DT (Fx07)
			c.V[x] = c.DT
			log.Printf("[Opcode Fx07] LD V%X = DT (0x%X)", x, c.DT)
			return false
		case 0x000A: // LD Vx, K (Fx0A)
			c.waitingForKey = true
			c.keyReg = byte(x)
			log.Printf("[Opcode Fx0A] LD V%X, K - Waiting for key press.", x)
			return false // PC does not advance here
		case 0x0015: // LD DT, Vx (Fx15)
			c.DT = c.V[x]
			log.Printf("[Opcode Fx15] LD DT = V%X (0x%X)", x, c.V[x])
			return false
		case 0x0018: // LD ST, Vx (Fx18)
			c.ST = c.V[x]
			log.Printf("[Opcode Fx18] LD ST = V%X (0x%X)", x, c.V[x])
			return false
		case 0x001E: // ADD I, Vx (Fx1E)
			originalI := c.I
			sum := uint32(c.I) + uint32(c.V[x]) // Use uint32 to check overflow beyond 0xFFF for VF
			c.I = uint16(sum)
			log.Printf("[Opcode Fx1E] ADD I (0x%X) += V%X (0x%X). Result I: 0x%X", originalI, x, c.V[x], c.I)
			// VF behavior for Fx1E is ambiguous and debated. Some set VF on overflow (I > 0xFFF), others don't.
			// COSMAC VIP did not. For now, not setting VF.
			// if sum > 0xFFF { // Some emulators set VF on overflow
			// 	c.V[0xF] = 1
			// } else {
			// 	c.V[0xF] = 0
			// }
			return false
		case 0x0029: // LD F, Vx (Fx29)
			digit := c.V[x] & 0x0F // Ensure digit is 0-F
			c.I = fontOffset + (uint16(digit) * 5)
			log.Printf("[Opcode Fx29] LD F, V%X (digit 0x%X). I set to font sprite at 0x%X", x, digit, c.I)
			return false
		case 0x0033: // LD B, Vx (Fx33)
			val := c.V[x]
			c.memory[c.I] = val / 100
			c.memory[c.I+1] = (val % 100) / 10
			c.memory[c.I+2] = val % 10
			log.Printf("[Opcode Fx33] LD B, V%X (0x%X -> %d). Stored BCD (%d, %d, %d) at I (0x%X).", x, val, val, c.memory[c.I], c.memory[c.I+1], c.memory[c.I+2], c.I)
			return false
		case 0x0055: // LD [I], Vx (Fx55)
			log.Printf("[Opcode Fx55] LD [I], V0-V%X. Storing at M[0x%X]...", x, c.I)
			for i := 0; i <= int(x); i++ {
				if c.I+uint16(i) >= memorySize {
					log.Printf("Error: Memory write out of bounds in Fx55. I=0x%X, i=%d, x=%d", c.I, i, x)
					break
				}
				c.memory[c.I+uint16(i)] = c.V[i]
			}
			// Ambiguity: Some interpreters increment I, some do not. Cowgod: "I is left unchanged".
			// Modern common behavior might be I = I + X + 1. Sticking to unchanged I for now.
			return false
		case 0x0065: // LD Vx, [I] (Fx65)
			log.Printf("[Opcode Fx65] LD V0-V%X, [I]. Reading from M[0x%X]...", x, c.I)
			for i := 0; i <= int(x); i++ {
				if c.I+uint16(i) >= memorySize {
					log.Printf("Error: Memory read out of bounds in Fx65. I=0x%X, i=%d, x=%d", c.I, i, x)
					break
				}
				c.V[i] = c.memory[c.I+uint16(i)]
			}
			// Ambiguity: Some interpreters increment I, some do not. Cowgod: "I is left unchanged".
			// Modern common behavior might be I = I + X + 1. Sticking to unchanged I for now.
			return false
		default:
			log.Printf("[Opcode FxXX] Error: Unknown Fxxx opcode 0x%04X. Ignored.", opcode)
			return false
		}
	default:
		log.Printf("[Opcode ????] Error: Unknown or non-drawing opcode 0x%04X. PC: 0x%X", opcode, c.PC)
		return false
	}
	// This return is a fallback; ideally, every path in the switch should return.
	// However, to make the edit simpler, we ensure the specific draw opcodes return true
	// and assume other existing opcodes in the full function correctly return false.
	// If an opcode is not explicitly handled and doesn't draw, it should lead to a 'return false'.
	// For opcodes that modify PC and don't draw (like JMP, CALL, SE, SNE):
	// After modifying PC or V registers, they should 'return false'.
	// Only CLS (00E0) and DRW (Dxyn) should 'return true'.
}
