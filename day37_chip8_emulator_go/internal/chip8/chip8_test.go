package chip8

import (
	"bytes"
	"os"
	"path/filepath"
	"testing"
)

func TestNew(t *testing.T) {
	tests := []struct {
		name            string
		cyclesPerFrame  uint
		variantSCHIP    bool
		expectedPC      uint16
		expectedSP      uint8
		expectedDT      byte
		expectedST      byte
		expectedWaiting bool
		expectedKeyReg  byte
		expectedCycles  uint
		expectedSCHIP   bool
		checkFontSet    bool
		checkRegisters  bool
		checkStack      bool
		checkGfx        bool
	}{
		{
			name:            "Default Initialization",
			cyclesPerFrame:  10,
			variantSCHIP:    false,
			expectedPC:      romOffset,
			expectedSP:      0,
			expectedDT:      0,
			expectedST:      0,
			expectedWaiting: false,
			expectedKeyReg:  0,
			expectedCycles:  10,
			expectedSCHIP:   false,
			checkFontSet:    true,
			checkRegisters:  true,
			checkStack:      true,
			checkGfx:        true,
		},
		{
			name:            "SCHIP Variant Initialization",
			cyclesPerFrame:  20,
			variantSCHIP:    true,
			expectedPC:      romOffset,
			expectedSP:      0,
			expectedDT:      0,
			expectedST:      0,
			expectedWaiting: false,
			expectedKeyReg:  0,
			expectedCycles:  20,
			expectedSCHIP:   true,
			checkFontSet:    true,
		},
		{
			name:            "Zero CyclesPerFrame (defaults to 10)",
			cyclesPerFrame:  0, // Should default to 10
			variantSCHIP:    false,
			expectedPC:      romOffset,
			expectedSP:      0,
			expectedDT:      0,
			expectedST:      0,
			expectedWaiting: false,
			expectedKeyReg:  0,
			expectedCycles:  10, // Default value
			expectedSCHIP:   false,
			checkFontSet:    true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := New(tt.cyclesPerFrame, tt.variantSCHIP)

			if c.PC != tt.expectedPC {
				t.Errorf("Expected PC %X, got %X", tt.expectedPC, c.PC)
			}
			if c.SP != tt.expectedSP {
				t.Errorf("Expected SP %d, got %d", tt.expectedSP, c.SP)
			}
			if c.DT != tt.expectedDT {
				t.Errorf("Expected DT %d, got %d", tt.expectedDT, c.DT)
			}
			if c.ST != tt.expectedST {
				t.Errorf("Expected ST %d, got %d", tt.expectedST, c.ST)
			}
			if c.waitingForKey != tt.expectedWaiting {
				t.Errorf("Expected waitingForKey %t, got %t", tt.expectedWaiting, c.waitingForKey)
			}
			if c.keyReg != tt.expectedKeyReg {
				t.Errorf("Expected keyReg %d, got %d", tt.expectedKeyReg, c.keyReg)
			}
			if c.cyclesPerFrame != tt.expectedCycles {
				t.Errorf("Expected cyclesPerFrame %d, got %d", tt.expectedCycles, c.cyclesPerFrame)
			}
			if c.variantSCHIP != tt.expectedSCHIP {
				t.Errorf("Expected variantSCHIP %t, got %t", tt.expectedSCHIP, c.variantSCHIP)
			}

			if tt.checkFontSet {
				expectedFont := fontSet[:]
				actualFont := c.memory[fontOffset : fontOffset+len(fontSet)]
				if !bytes.Equal(expectedFont, actualFont) {
					t.Errorf("FontSet not loaded correctly into memory")
					// Optionally, print diff for debugging, but can be verbose
					// t.Logf("Expected: %X\nGot:      %X", expectedFont, actualFont)
				}
			}

			if tt.checkRegisters {
				for i, val := range c.V {
					if val != 0 {
						t.Errorf("V[%d] not initialized to 0, got %d", i, val)
					}
				}
			}

			if tt.checkStack {
				for i, val := range c.stack {
					if val != 0 {
						t.Errorf("stack[%d] not initialized to 0, got %d", i, val)
					}
				}
			}

			if tt.checkGfx {
				for i, val := range c.gfx {
					if val != 0 {
						t.Errorf("gfx[%d] not initialized to 0, got %d", i, val)
					}
				}
			}

			if c.rng == nil {
				t.Errorf("rng not initialized")
			}
		})
	}
}

func TestLoadROM(t *testing.T) {
	tempDir := t.TempDir() // Creates a temporary directory for test files

	createTempROMFile := func(name string, content []byte, size int) string {
		path := filepath.Join(tempDir, name)
		data := content
		if data == nil && size > 0 {
			data = make([]byte, size)
			for i := 0; i < size; i++ {
				data[i] = byte(i % 256)
			}
		} else if data == nil && size == 0 {
			// Handle case where content is nil and size is 0, perhaps create empty file
			data = []byte{}
		}
		if err := os.WriteFile(path, data, 0644); err != nil {
			t.Fatalf("Failed to create temp ROM file %s: %v", name, err)
		}
		return path
	}

	tests := []struct {
		name        string
		setup       func() (c *Chip8, romPath string, romData []byte)
		expectError bool
		checkMemory bool // whether to check if memory content matches romData
	}{
		{
			name: "Valid ROM load",
			setup: func() (*Chip8, string, []byte) {
				c := New(10, false)
				romData := []byte{0x12, 0x34, 0x56, 0x78}
				romPath := createTempROMFile("valid.ch8", romData, 0)
				return c, romPath, romData
			},
			expectError: false,
			checkMemory: true,
		},
		{
			name: "ROM too large",
			setup: func() (*Chip8, string, []byte) {
				c := New(10, false)
				// Max ROM size is memorySize - romOffset (4096 - 512 = 3584)
				romPath := createTempROMFile("toolarge.ch8", nil, memorySize-romOffset+1)
				return c, romPath, nil // romData is nil as we don't care about its content for this error case
			},
			expectError: true,
			checkMemory: false,
		},
		{
			name: "Non-existent ROM",
			setup: func() (*Chip8, string, []byte) {
				c := New(10, false)
				return c, filepath.Join(tempDir, "nonexistent.ch8"), nil
			},
			expectError: true,
			checkMemory: false,
		},
		{
			name: "ROM exactly max size",
			setup: func() (*Chip8, string, []byte) {
				c := New(10, false)
				romData := make([]byte, memorySize-romOffset)
				for i := range romData {
					romData[i] = byte(i % 255) // Fill with some pattern
				}
				romPath := createTempROMFile("maxsize.ch8", romData, 0)
				return c, romPath, romData
			},
			expectError: false,
			checkMemory: true,
		},
		{
			name: "Empty ROM file",
			setup: func() (*Chip8, string, []byte) {
				c := New(10, false)
				romData := []byte{}
				romPath := createTempROMFile("empty.ch8", romData, 0)
				return c, romPath, romData
			},
			expectError: false,
			checkMemory: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c, romPath, romData := tt.setup()
			err := c.LoadROM(romPath)

			if tt.expectError {
				if err == nil {
					t.Errorf("Expected error, got nil")
				}
			} else {
				if err != nil {
					t.Errorf("Expected no error, got %v", err)
				}
				if tt.checkMemory {
					// Ensure romData is not nil before checking memory if we expect no error
					// For some non-error cases like loading an empty ROM, romData might be an empty slice but not nil.
					if romData != nil {
						loadedData := c.memory[romOffset : romOffset+len(romData)]
						if !bytes.Equal(romData, loadedData) {
							t.Errorf("ROM data not loaded correctly into memory.\nExpected: %X\nGot:      %X", romData, loadedData)
						}
					}
				}
			}
		})
	}
}

func TestOpcodes(t *testing.T) {
	type testCase struct {
		name       string
		opcode     uint16
		setupChip  func(c *Chip8) // Setup initial state (registers, memory, I, PC etc.)
		assertChip func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool)
	}

	createChipWithOpcode := func(opcode uint16) *Chip8 {
		c := New(1, false)
		c.memory[romOffset] = byte(opcode >> 8)
		c.memory[romOffset+1] = byte(opcode & 0x00FF)
		c.PC = romOffset
		return c
	}

	testCases := []testCase{
		{
			name:   "00E0 - CLS",
			opcode: 0x00E0,
			setupChip: func(c *Chip8) {
				for i := range c.gfx {
					c.gfx[i] = 1
				}
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if !redraw {
					t.Error("CLS should set redraw to true")
				}
				if collision {
					t.Error("CLS should not cause collision")
				}
				if halted {
					t.Error("CLS should not halt CPU")
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC after CLS: expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
				for i, pixel := range c.gfx {
					if pixel != 0 {
						t.Errorf("gfx[%d] not cleared after CLS, got %d", i, pixel)
						break
					}
				}
			},
		},
		{
			name:   "1NNN - JP addr",
			opcode: 0x1ABC,
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if redraw {
					t.Error("JP should not set redraw")
				}
				if halted {
					t.Error("JP should not halt CPU")
				}
				if c.PC != 0x0ABC {
					t.Errorf("PC after JP: expected 0xABC, got 0x%X", c.PC)
				}
			},
		},
		{
			name:   "6XKK - LD Vx, byte",
			opcode: 0x63AB,
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if redraw {
					t.Error("LD Vx, byte should not set redraw")
				}
				if halted {
					t.Error("LD Vx, byte should not halt CPU")
				}
				if c.V[3] != 0xAB {
					t.Errorf("V[3] after LD: expected 0xAB, got 0x%X", c.V[3])
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC after LD: expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
			},
		},
		{
			name:      "7XKK - ADD Vx, byte",
			opcode:    0x7405,
			setupChip: func(c *Chip8) { c.V[4] = 0x10 },
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if redraw {
					t.Error("ADD Vx, byte should not set redraw")
				}
				if c.V[4] != 0x15 {
					t.Errorf("V[4] after ADD: expected 0x15, got 0x%X", c.V[4])
				}
				initialVF := c.V[0xF]
				if c.V[0xF] != initialVF {
					t.Errorf("V[0xF] changed after 7XKK: expected 0x%X, got 0x%X", initialVF, c.V[0xF])
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC after ADD: expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
			},
		},
		{
			name:   "DXYN - DRW (no collision)",
			opcode: 0xD011,
			setupChip: func(c *Chip8) {
				c.V[0] = 0
				c.V[1] = 0
				c.I = 0x300
				c.memory[c.I] = 0b11000011
				for i := range c.gfx {
					c.gfx[i] = 0
				}
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if !redraw {
					t.Error("DRW should set redraw if pixels changed")
				}
				if collision {
					t.Error("DRW reported collision when none should occur")
				}
				if c.V[0xF] != 0 {
					t.Errorf("V[0xF] after DRW (no collision): expected 0, got %d", c.V[0xF])
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC after DRW: expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
				if c.gfx[0] != 1 || c.gfx[1] != 1 || c.gfx[2] != 0 || c.gfx[6] != 1 || c.gfx[7] != 1 {
					t.Error("DRW no collision pixel check failed")
				}
			},
		},
		{
			name:   "DXYN - DRW (with collision)",
			opcode: 0xD011,
			setupChip: func(c *Chip8) {
				c.V[0] = 0
				c.V[1] = 0
				c.I = 0x300
				c.memory[c.I] = 0b10000000
				c.gfx[0] = 1
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if !redraw {
					t.Error("DRW should set redraw if pixels changed (even if to 0)")
				}
				if !collision {
					t.Error("DRW should report collision")
				}
				if c.V[0xF] != 1 {
					t.Errorf("V[0xF] after DRW (collision): expected 1, got %d", c.V[0xF])
				}
				if c.gfx[0] != 0 {
					t.Error("gfx[0] expected 0 after XOR collision")
				}
			},
		},
		{
			name:   "DXYN - DRW (wrapping)",
			opcode: 0xD011,
			setupChip: func(c *Chip8) {
				c.V[0] = gfxWidth - 4
				c.V[1] = gfxHeight - 1
				c.I = 0x300
				c.memory[c.I] = 0b11111111
				for i := range c.gfx {
					c.gfx[i] = 0
				}
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if !redraw {
					t.Error("DRW wrapping should set redraw")
				}
				lastRowBase := uint16((gfxHeight - 1) * gfxWidth)
				pixelsOk := c.gfx[lastRowBase+60] == 1 && c.gfx[lastRowBase+61] == 1 &&
					c.gfx[lastRowBase+62] == 1 && c.gfx[lastRowBase+63] == 1 &&
					c.gfx[lastRowBase+0] == 1 && c.gfx[lastRowBase+1] == 1 &&
					c.gfx[lastRowBase+2] == 1 && c.gfx[lastRowBase+3] == 1
				if !pixelsOk {
					t.Error("DRW wrapping pixel check failed")
				}
			},
		},
		{
			name:      "Cycle - waitingForKey should halt",
			opcode:    0x0000,
			setupChip: func(c *Chip8) { c.waitingForKey = true; c.PC = romOffset },
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if !halted {
					t.Error("CPU should be halted if waitingForKey is true")
				}
				if redraw {
					t.Error("Halted CPU should not cause redraw")
				}
				if collision {
					t.Error("Halted CPU should not cause collision")
				}
				if c.PC != romOffset {
					t.Errorf("PC should not advance if halted, got 0x%X", c.PC)
				}
			},
		},
		{
			name:      "Fx07 - LD Vx, DT",
			opcode:    0xF307, // LD V3, DT
			setupChip: func(c *Chip8) { c.DT = 0xAB },
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if redraw {
					t.Error("Fx07 should not cause redraw")
				}
				if c.V[3] != 0xAB {
					t.Errorf("V[3] after Fx07: expected 0xAB, got 0x%X", c.V[3])
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC after Fx07: expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
			},
		},
		{
			name:      "Fx15 - LD DT, Vx",
			opcode:    0xF515, // LD DT, V5
			setupChip: func(c *Chip8) { c.V[5] = 0xCD },
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if redraw {
					t.Error("Fx15 should not cause redraw")
				}
				if c.DT != 0xCD {
					t.Errorf("DT after Fx15: expected 0xCD, got 0x%X", c.DT)
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC after Fx15: expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
			},
		},
		{
			name:      "Fx18 - LD ST, Vx",
			opcode:    0xF818, // LD ST, V8
			setupChip: func(c *Chip8) { c.V[8] = 0xEF },
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if redraw {
					t.Error("Fx18 should not cause redraw")
				}
				if c.ST != 0xEF {
					t.Errorf("ST after Fx18: expected 0xEF, got 0x%X", c.ST)
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC after Fx18: expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
			},
		},
		// Key Opcodes
		{
			name:   "Ex9E - SKP Vx (key pressed)",
			opcode: 0xE29E, // SKP V2
			setupChip: func(c *Chip8) {
				c.V[2] = 0x5 // Key 5
				c.SetKey(0x5, true)
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if c.PC != romOffset+4 {
					t.Errorf("PC after SKP (pressed): expected 0x%X, got 0x%X", romOffset+4, c.PC)
				}
			},
		},
		{
			name:   "Ex9E - SKP Vx (key not pressed)",
			opcode: 0xE29E, // SKP V2
			setupChip: func(c *Chip8) {
				c.V[2] = 0x5 // Key 5
				c.SetKey(0x5, false)
				c.SetKey(0x6, true) // Press a different key
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if c.PC != romOffset+2 {
					t.Errorf("PC after SKP (not pressed): expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
			},
		},
		{
			name:   "ExA1 - SKNP Vx (key not pressed)",
			opcode: 0xE2A1, // SKNP V2
			setupChip: func(c *Chip8) {
				c.V[2] = 0x5 // Key 5
				c.SetKey(0x5, false)
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if c.PC != romOffset+4 {
					t.Errorf("PC after SKNP (not pressed): expected 0x%X, got 0x%X", romOffset+4, c.PC)
				}
			},
		},
		{
			name:   "ExA1 - SKNP Vx (key pressed)",
			opcode: 0xE2A1, // SKNP V2
			setupChip: func(c *Chip8) {
				c.V[2] = 0x5 // Key 5
				c.SetKey(0x5, true)
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if c.PC != romOffset+2 {
					t.Errorf("PC after SKNP (pressed): expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
			},
		},
		{
			name:   "Fx0A - LD Vx, K (wait for key)",
			opcode: 0xF10A, // LD V1, K
			setupChip: func(c *Chip8) {
				// Ensure no keys are pressed initially
				for i := 0; i < 16; i++ {
					c.SetKey(i, false)
				}
				c.PC = romOffset            // Set PC for the Fx0A opcode
				c.memory[c.PC] = byte(0xF1) // Load Fx0A into memory at PC
				c.memory[c.PC+1] = byte(0x0A)
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if !c.waitingForKey {
					t.Error("Fx0A should set waitingForKey to true")
				}
				if c.keyReg != 1 {
					t.Errorf("Fx0A should set keyReg to 1, got %d", c.keyReg)
				}
				if c.PC != romOffset {
					t.Errorf("PC should not advance on Fx0A itself, got 0x%X", c.PC)
				}
				if !halted {
					t.Error("Cycle should return halted=true when waiting for key after Fx0A")
				}

				// Simulate key press and next cycle
				c.SetKey(0x7, true) // Press key 7
				// Simulate timer update that would happen between frames/cycles
				initialDT := c.DT
				c.UpdateTimers()
				if c.DT == initialDT && initialDT > 0 {
					t.Error("DT should decrement even when waiting for key (tested via manual UpdateTimers call)")
				}

				r, col, h := c.Cycle() // Next cycle after key press

				if c.waitingForKey {
					t.Error("waitingForKey should be false after key press cycle")
				}
				if c.V[1] != 0x7 {
					t.Errorf("V[1] should be 0x7 after key 7 pressed, got 0x%X", c.V[1])
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC should advance by 2 after key press completed Fx0A, got 0x%X", c.PC)
				}
				if h {
					t.Error("Cycle should not be halted after key press processed for Fx0A")
				}
				if r {
					t.Error("Key press processing for Fx0A should not cause redraw by itself")
				}
				if col {
					t.Error("Key press processing for Fx0A should not cause collision by itself")
				}
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			c := createChipWithOpcode(tc.opcode)
			if tc.setupChip != nil {
				tc.setupChip(c)
				// Simplified PC adjustment logic for tests
				if tc.opcode&0xF000 != 0x1000 && // Not a JP instruction
					!(tc.opcode == 0x0000 && c.waitingForKey) { // Not a HLT check
					// Ensure opcode is at PC if setup didn't change it to where opcode should be
					c.memory[c.PC] = byte(tc.opcode >> 8)
					c.memory[c.PC+1] = byte(tc.opcode & 0x00FF)
				}
			}
			redraw, collision, halted := c.Cycle()
			tc.assertChip(t, c, redraw, collision, halted)
		})
	}
}

func TestUpdateTimers(t *testing.T) {
	c := New(1, false)
	c.DT = 5
	c.ST = 3
	t.Run("Initial decrement", func(t *testing.T) {
		c.UpdateTimers()
		if c.DT != 4 {
			t.Errorf("DT expected 4, got %d", c.DT)
		}
		if c.ST != 2 {
			t.Errorf("ST expected 2, got %d", c.ST)
		}
	})
	t.Run("Decrement to zero", func(t *testing.T) {
		c.DT = 1
		c.ST = 1
		c.UpdateTimers()
		if c.DT != 0 {
			t.Errorf("DT expected 0, got %d", c.DT)
		}
		if c.ST != 0 {
			t.Errorf("ST expected 0, got %d", c.ST)
		}
	})
	t.Run("No decrement below zero", func(t *testing.T) {
		c.DT = 0
		c.ST = 0
		c.UpdateTimers()
		if c.DT != 0 {
			t.Errorf("DT expected 0 (not below), got %d", c.DT)
		}
		if c.ST != 0 {
			t.Errorf("ST expected 0 (not below), got %d", c.ST)
		}
	})
}
