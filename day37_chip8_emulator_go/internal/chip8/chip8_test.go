package chip8

import (
	"bytes"
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
