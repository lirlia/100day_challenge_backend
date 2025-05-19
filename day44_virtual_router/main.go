package main

import (
	"fmt"
	"time"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
)

func main() {
	mgr := router.NewRouterManager()
	// ルーター生成
	r1 := mgr.AddRouter("r1", "Router1", "10.0.0.1")
	r2 := mgr.AddRouter("r2", "Router2", "10.0.0.2")
	fmt.Println("ルーター生成完了")
	// リンク接続
	mgr.AddLink("r1", "r2")
	fmt.Println("リンク接続完了")
	// テスト: r1→r2にパケット送信
	go func() {
		time.Sleep(1 * time.Second)
		pkt := router.Packet{SrcIP: r1.IP, DstIP: r2.IP, Data: []byte("hello")}
		if l, ok := r1.Links["r2"]; ok {
			l.Outbox <- pkt
		}
	}()
	// r2で受信確認
	go func() {
		for {
			select {
			case pkt := <-r2.Inbox():
				fmt.Printf("r2がパケット受信: %+v\n", pkt)
			case <-time.After(3 * time.Second):
				return
			}
		}
	}()
	time.Sleep(4 * time.Second)
	// リンク削除
	mgr.RemoveLink("r1", "r2")
	fmt.Println("リンク削除完了")
	// ルーター削除
	mgr.RemoveRouter("r1")
	mgr.RemoveRouter("r2")
	fmt.Println("ルーター削除完了")
}

// router.RouterのInbox()メソッドを追加してください
