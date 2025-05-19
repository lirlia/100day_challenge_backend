package router

import (
	"github.com/songgao/water"
	"log"
)

// TUNデバイスラッパー
type TunDevice struct {
	If   *water.Interface
	Name string
}

// TUNデバイス作成
func NewTunDevice(name string) (*TunDevice, error) {
	cfg := water.Config{
		DeviceType: water.TUN,
	}
	cfg.Name = name
	ifce, err := water.New(cfg)
	if err != nil {
		return nil, err
	}
	return &TunDevice{If: ifce, Name: ifce.Name()}, nil
}

// TUNデバイスからパケットを読み込む
func (t *TunDevice) ReadPacket(buf []byte) (int, error) {
	return t.If.Read(buf)
}

// TUNデバイスにパケットを書き込む
func (t *TunDevice) WritePacket(pkt []byte) (int, error) {
	return t.If.Write(pkt)
}

// TUNデバイスをクローズ
func (t *TunDevice) Close() {
	if err := t.If.Close(); err != nil {
		log.Printf("TUNデバイスクローズ失敗: %v", err)
	}
}
