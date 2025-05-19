package router

import (
	"testing"
	"time"
)

func TestRouterManager(t *testing.T) {
	mgr := NewRouterManager()

	// ルーター追加
	r1 := mgr.AddRouter("test_r1", "TestRouter1", "10.0.1.1")
	if r1 == nil {
		t.Fatal("ルーターr1の作成に失敗")
	}
	r2 := mgr.AddRouter("test_r2", "TestRouter2", "10.0.1.2")
	if r2 == nil {
		t.Fatal("ルーターr2の作成に失敗")
	}
	if len(mgr.Routers) != 2 {
		t.Errorf("ルーター数が期待値と異なる: got %d, want 2", len(mgr.Routers))
	}

	// リンク追加
	mgr.AddLink("test_r1", "test_r2")
	if _, ok := r1.Links["test_r2"]; !ok {
		t.Error("r1にr2へのリンクが存在しない")
	}
	if _, ok := r2.Links["test_r1"]; !ok {
		t.Error("r2にr1へのリンクが存在しない")
	}

	// 静的ルート設定とパケット転送
	r1.SetStaticRoute(r2.IP, "test_r2")
	r2.SetStaticRoute(r1.IP, "test_r1")

	pktData := []byte("test packet data")
	sentPkt := Packet{SrcIP: r1.IP, DstIP: r2.IP, Data: pktData}

	go r1.SendPacket(sentPkt)

	select {
	case receivedPkt := <-r2.Inbox():
		if receivedPkt.SrcIP != sentPkt.SrcIP || receivedPkt.DstIP != sentPkt.DstIP || string(receivedPkt.Data) != string(sentPkt.Data) {
			t.Errorf("受信パケットが期待値と異なる: got %+v, want %+v", receivedPkt, sentPkt)
		}
	case <-time.After(2 * time.Second):
		t.Error("パケット受信タイムアウト")
	}

	// リンク削除
	mgr.RemoveLink("test_r1", "test_r2")
	if _, ok := r1.Links["test_r2"]; ok {
		t.Error("r1にr2へのリンクが残っている")
	}

	// ルーター削除
	mgr.RemoveRouter("test_r1")
	mgr.RemoveRouter("test_r2")
	if len(mgr.Routers) != 0 {
		t.Errorf("ルーター数が期待値と異なる: got %d, want 0", len(mgr.Routers))
	}
}
