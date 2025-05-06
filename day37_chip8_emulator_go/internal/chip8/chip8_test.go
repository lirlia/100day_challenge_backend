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
