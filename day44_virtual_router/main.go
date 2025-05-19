package main

import (
	"fmt"
	"os"
	"time"
	"github.com/lirlia/100day_challenge_backend/day44_virtual_router/router"
)

func main() {
	mgr := router.NewRouterManager()
	// ルーター2台生成
	r1 := mgr.AddRouter("r1", "Router1", "10.0.0.1")
	r2 := mgr.AddRouter("r2", "Router2", "10.0.0.2")
	if r1 == nil || r2 == nil {
		fmt.Println("TUNデバイス作成失敗。root権限が必要な場合があります。")
		os.Exit(1)
	}
	fmt.Printf("r1 TUN: %s, r2 TUN: %s\n", r1.Tun.Name, r2.Tun.Name)

	// ルーター間リンク
	mgr.AddLink("r1", "r2")

	// 静的ルート設定（r1→r2, r2→r1）
	r1.SetStaticRoute("10.0.0.2", "r2")
	r2.SetStaticRoute("10.0.0.1", "r1")

	// r1→r2にパケット送信
	go func() {
		time.Sleep(2 * time.Second)
		pkt := router.Packet{SrcIP: r1.IP, DstIP: r2.IP, Data: []byte("test packet from r1 to r2")}
		r1.SendPacket(pkt)
		fmt.Println("r1→r2にパケット送信")
	}()

	// r2で受信確認
	go func() {
		for {
			select {
			case pkt := <-r2.Inbox():
				fmt.Printf("r2がパケット受信: %+v\n", pkt)
			case <-time.After(5 * time.Second):
				return
			}
		}
	}()

	// OSPF LSA Floodを定期実行
	go func() {
		for {
			mgr.FloodAllLSA()
			time.Sleep(5 * time.Second)
		}
	}()

	time.Sleep(7 * time.Second)

	mgr.RemoveLink("r1", "r2")
	mgr.RemoveRouter("r1")
	mgr.RemoveRouter("r2")
	fmt.Println("ルーター削除・TUNデバイスクローズ完了")
}

// router.RouterのInbox()メソッドを追加してください
