package cli

import (
	"testing"
)

func TestCLI_Demo(t *testing.T) {
	tmpDir := t.TempDir()

	cli, err := NewCLI(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create CLI: %v", err)
	}

	// Run demo
	if err := cli.Demo(); err != nil {
		t.Errorf("Demo failed: %v", err)
	}
}

func TestCLI_FormatBytes(t *testing.T) {
	tests := []struct {
		bytes    int64
		expected string
	}{
		{0, "0 B"},
		{512, "512 B"},
		{1024, "1.0 KB"},
		{1536, "1.5 KB"},
		{1048576, "1.0 MB"},
		{1073741824, "1.0 GB"},
		{1099511627776, "1.0 TB"},
	}

	for _, test := range tests {
		result := formatBytes(test.bytes)
		if result != test.expected {
			t.Errorf("formatBytes(%d) = %s, expected %s", test.bytes, result, test.expected)
		}
	}
}

func TestCLI_New(t *testing.T) {
	tmpDir := t.TempDir()

	cli, err := NewCLI(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create CLI: %v", err)
	}

	if cli.engine == nil {
		t.Error("Engine should be initialized")
	}

	if cli.reader == nil {
		t.Error("Reader should be initialized")
	}

	// Test engine functionality
	err = cli.engine.Put("test_key", []byte("test_value"))
	if err != nil {
		t.Errorf("Failed to put data: %v", err)
	}

	value, found, err := cli.engine.Get("test_key")
	if err != nil {
		t.Errorf("Failed to get data: %v", err)
	}
	if !found {
		t.Error("Key should be found")
	}
	if string(value) != "test_value" {
		t.Errorf("Expected 'test_value', got '%s'", string(value))
	}

	// Close engine
	cli.engine.Close()
}
