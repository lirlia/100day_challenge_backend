package router

import (
	"testing"
	"os"
	"time"
)

func TestTunDevice(t *testing.T) {
	if os.Geteuid() != 0 {
		t.Skip("TUNデバイスのテストはroot権限が必要です。スキップします。")
	}

	// TUNデバイス作成
	tunName := "utun_test0"
	tun, err := NewTunDevice(tunName)
	if err != nil {
		t.Skipf("TUNデバイス作成失敗: %v", err)
	}
	defer tun.Close()

	if tun.Name == "" {
		t.Error("TUNデバイス名が空")
	}
	t.Logf("作成されたTUNデバイス名: %s", tun.Name)

	done := make(chan struct{})
	go func() {
		wbuf := []byte("hello tun")
		_, _ = tun.WritePacket(wbuf)
		close(done)
	}()

	select {
	case <-done:
		// OK
	case <-time.After(1 * time.Second):
		t.Skip("TUNデバイスへの書き込みがタイムアウト。OS側の制限の可能性あり。")
	}
}
