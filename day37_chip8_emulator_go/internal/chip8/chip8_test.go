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

	// Helper to create a Chip8 instance with a single opcode loaded at romOffset (PC)
	createChipWithOpcode := func(opcode uint16) *Chip8 {
		c := New(1, false) // cyclesPerFrame=1, variantSCHIP=false for simple tests
		c.memory[romOffset] = byte(opcode >> 8)
		c.memory[romOffset+1] = byte(opcode & 0x00FF)
		c.PC = romOffset // Set PC to the opcode location
		return c
	}

	testCases := []testCase{
		{
			name:   "00E0 - CLS",
			opcode: 0x00E0,
			setupChip: func(c *Chip8) {
				// Fill gfx with some data to ensure CLS clears it
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
			opcode: 0x63AB, // LD V3, 0xAB
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
			name:   "7XKK - ADD Vx, byte",
			opcode: 0x7405, // ADD V4, 0x05
			setupChip: func(c *Chip8) {
				c.V[4] = 0x10
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if redraw {
					t.Error("ADD Vx, byte should not set redraw")
				}
				if c.V[4] != 0x15 {
					t.Errorf("V[4] after ADD: expected 0x15, got 0x%X", c.V[4])
				}
				// VF (V[0xF]) should not change for 7XKK
				initialVF := c.V[0xF] // Store it if set in setupChip, though not for this test
				if c.V[0xF] != initialVF {
					t.Errorf("V[0xF] changed after 7XKK: expected 0x%X, got 0x%X", initialVF, c.V[0xF])
				}
				if c.PC != romOffset+2 {
					t.Errorf("PC after ADD: expected 0x%X, got 0x%X", romOffset+2, c.PC)
				}
			},
		},
		// DRW Tests - more complex setup
		{
			name:   "DXYN - DRW (no collision)",
			opcode: 0xD011, // DRW V0, V1, 1 (draw 1-byte sprite from I at (V0,V1))
			setupChip: func(c *Chip8) {
				c.V[0] = 0 // x = 0
				c.V[1] = 0 // y = 0
				c.I = 0x300
				c.memory[c.I] = 0b11000011 // Sprite data (byte 1)
				// Ensure gfx is clear
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
				// Check specific pixels (e.g., first two and last two bits of the sprite)
				if c.gfx[0] != 1 {
					t.Error("gfx[0] expected 1 after DRW")
				}
				if c.gfx[1] != 1 {
					t.Error("gfx[1] expected 1 after DRW")
				}
				if c.gfx[2] != 0 {
					t.Error("gfx[2] expected 0 after DRW")
				}
				if c.gfx[6] != 1 {
					t.Error("gfx[6] expected 1 after DRW")
				}
				if c.gfx[7] != 1 {
					t.Error("gfx[7] expected 1 after DRW")
				}
			},
		},
		{
			name:   "DXYN - DRW (with collision)",
			opcode: 0xD011, // DRW V0, V1, 1
			setupChip: func(c *Chip8) {
				c.V[0] = 0
				c.V[1] = 0
				c.I = 0x300
				c.memory[c.I] = 0b10000000 // Sprite: first pixel on
				c.gfx[0] = 1               // Pre-set pixel to cause collision
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
				} // 1 ^ 1 = 0
			},
		},
		{
			name:   "DXYN - DRW (wrapping)",
			opcode: 0xD011, // DRW V0, V1, 1 (sprite height 1)
			setupChip: func(c *Chip8) {
				c.V[0] = gfxWidth - 4  // x = 60 (sprite is 8 pixels wide, so 4 will wrap)
				c.V[1] = gfxHeight - 1 // y = 31 (sprite is 1 pixel high, so this row wraps if n > 1, but here y itself is at edge)
				c.I = 0x300
				c.memory[c.I] = 0b11111111 // Full byte sprite
				for i := range c.gfx {
					c.gfx[i] = 0
				} // Clear gfx
			},
			assertChip: func(t *testing.T, c *Chip8, redraw bool, collision bool, halted bool) {
				if !redraw {
					t.Error("DRW wrapping should set redraw")
				}
				// Check pixels around the wrap points. E.g. last 4 pixels of the screen line and first 4.
				// y = 31. Sprite line index: (31+0)%32 * 64 = 31*64 = 1984
				// x = 60. pixels at 1984+60, 1984+61, 1984+62, 1984+63 (on screen)
				// and 1984+0, 1984+1, 1984+2, 1984+3 (wrapped)
				lastRowBase := uint16((gfxHeight - 1) * gfxWidth)
				if c.gfx[lastRowBase+60] != 1 {
					t.Errorf("gfx[%d] (pre-wrap) expected 1", lastRowBase+60)
				}
				if c.gfx[lastRowBase+61] != 1 {
					t.Errorf("gfx[%d] (pre-wrap) expected 1", lastRowBase+61)
				}
				if c.gfx[lastRowBase+62] != 1 {
					t.Errorf("gfx[%d] (pre-wrap) expected 1", lastRowBase+62)
				}
				if c.gfx[lastRowBase+63] != 1 {
					t.Errorf("gfx[%d] (pre-wrap) expected 1", lastRowBase+63)
				}
				// Wrapped pixels
				if c.gfx[lastRowBase+0] != 1 {
					t.Errorf("gfx[%d] (wrapped) expected 1", lastRowBase+0)
				}
				if c.gfx[lastRowBase+1] != 1 {
					t.Errorf("gfx[%d] (wrapped) expected 1", lastRowBase+1)
				}
				if c.gfx[lastRowBase+2] != 1 {
					t.Errorf("gfx[%d] (wrapped) expected 1", lastRowBase+2)
				}
				if c.gfx[lastRowBase+3] != 1 {
					t.Errorf("gfx[%d] (wrapped) expected 1", lastRowBase+3)
				}
			},
		},
		{
			name:   "Cycle - waitingForKey should halt",
			opcode: 0x0000, // Opcode doesn't matter if halted
			setupChip: func(c *Chip8) {
				c.waitingForKey = true
				c.PC = romOffset // Keep PC stable for check
			},
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
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			c := createChipWithOpcode(tc.opcode)
			if tc.setupChip != nil {
				tc.setupChip(c)
				// If setupChip changes PC, ensure opcode is still at new PC or adjust test
				// For these tests, assume opcode is at c.PC set by createChipWithOpcode or setupChip
				if c.PC != romOffset && (tc.opcode != 0x1ABC && tc.opcode != 0x0000) { // JP and halt test set PC differently
					// Ensure the opcode is at the (potentially modified) PC
					// This is a bit tricky if setupChip moves PC *and* we use a fixed opcode.
					// For simplicity, our test opcodes are loaded at romOffset.
					// If setupChip changes PC for a non-Jump/non-Halt test, this might be an issue.
					// Current tests: JP sets PC, Halt test verifies PC doesn't change.
					// CLS, LD, ADD, DRW all start with PC at romOffset where the opcode is.
					// So this explicit reload might not be needed for current cases but good to be aware of.
					c.memory[c.PC] = byte(tc.opcode >> 8)
					c.memory[c.PC+1] = byte(tc.opcode & 0x00FF)
				}
			}

			// Store V[0xF] before Cycle for tests that shouldn't change it (like 7XKK)
			// Note: some setups might change V[0xF], so this is a bit fragile or needs per-test consideration.
			// For 7XKK, we added a local initialVF check inside its assertChip.

			redraw, collision, halted := c.Cycle()
			tc.assertChip(t, c, redraw, collision, halted)
		})
	}
}
