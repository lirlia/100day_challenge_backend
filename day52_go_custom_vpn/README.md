# Day52: 自作VPNサーバー & クライアント (Go CLI)

## 1. プロジェクト概要

Go言語を使用し、WireGuardにインスパイアされたシンプルなL3 VPNサーバーおよびクライアントのCLIアプリケーションを実装します。
TUNデバイスを介してIPパケットをキャプチャし、UDPトンネル経由で暗号化して送受信します。
最終的に、クライアントからVPN経由でサーバー側のTUNインターフェース、またはその逆方向にpingが通ることを確認します。

## 2. 学習ポイント

- Go言語によるシステムレベルプログラミング（TUNデバイス操作、ネットワークプログラミング）
- Go言語でのUDP通信、IPパケットの基本的なハンドリング
- Go言語標準ライブラリ (`net`, `crypto`, `os/exec` 等) の活用
- 設定ファイル（JSONやYAML）の扱いやコマンドライン引数の処理
- 基本的な暗号化技術（AES-GCMなど）の適用

## 3. 主要機能 (CLIベース)

- **VPNサーバー (Go CLI)**
    - 設定ファイルに基づいて動作。
    - UDPリスナー。
    - TUNデバイス作成・管理。
    - クライアント認証（事前共有鍵 - PSK）。
    - IPパケットの暗号化/復号とトンネリング。
    - クライアントへの仮想IPアドレス割り当て（設定ファイルベース）。
- **VPNクライアント (Go CLI)**
    - 設定ファイルに基づいて動作。
    - TUNデバイス作成・管理。
    - サーバーとのUDP通信。
    - IPパケットの暗号化/復号とトンネリング。
- **暗号化:** Goの `crypto` パッケージ (AES-GCMなど) を使用。

## 4. 技術スタック

- **言語:** Go
- **TUN/TAP操作:** `songgao/water` (または類似のGoライブラリ)
- **設定ファイル:** JSON (標準ライブラリ `encoding/json`)
- **UDP通信:** `net` パッケージ
- **暗号化:** `crypto/*` パッケージ

## 5. ディレクトリ構成

```plaintext
day52_go_custom_vpn/
├── cmd/
│   ├── vpnserver/
│   │   └── main.go
│   └── vpnclient/
│       └── main.go
├── internal/
│   ├── config/
│   │   └── config.go
│   ├── core/
│   │   ├── server.go
│   │   └── client.go
│   ├── crypto/
│   │   └── cipher.go
│   ├── network/
│   │   ├── tun.go
│   │   └── udp.go
│   └── utils/
│       └── logger.go
├── configs/
│   ├── server.example.json
│   └── client.example.json
├── go.mod
├── go.sum
└── README.md
└── PROGRESS.md
```

## 6. ビルド方法

```bash
# サーバー
go build -o vpnserver ./cmd/vpnserver

# クライアント
go build -o vpnclient ./cmd/vpnclient
```

## 7. 実行方法

### サーバー
```bash
sudo ./vpnserver -config ./configs/server.json
```

### クライアント
```bash
sudo ./vpnclient -config ./configs/client.json
```

**注意:**
- TUNデバイスの作成・操作には通常管理者権限が必要です。
- OSレベルでのIPフォワーディングやルーティング設定が必要になる場合があります。

## 8. OSレベルの設定例 (Linux)

### IPフォワーディングの有効化
```bash
sudo sysctl -w net.ipv4.ip_forward=1
# 恒久的に設定する場合は /etc/sysctl.conf を編集
```

### (任意) NAT設定 (クライアントがVPN経由でインターネットに出る場合など)
サーバー側で物理インターフェースが `eth0`、TUNインターフェースが `tun0` の場合:
```bash
sudo iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE
sudo iptables -A FORWARD -i tun0 -o eth0 -j ACCEPT
sudo iptables -A FORWARD -i eth0 -o tun0 -m state --state RELATED,ESTABLISHED -j ACCEPT
```

### 手動ルーティング設定
VPNトンネルの対向先へのルーティングが必要な場合があります。
例えば、クライアント側でサーバーのTUNネットワーク (`10.0.0.0/24`) への経路をVPNサーバーの物理IP (`<server_physical_ip>`) 経由で設定する場合:
```bash
# クライアント側 (例)
sudo ip route add 10.0.0.0/24 via <server_physical_ip> dev <client_physical_interface>
```
これはVPNクライアントが自動で設定すべきですが、手動で行う場合の参考です。VPNクライアントのTUNデバイスのIPアドレスに対するルーティングは通常自動で設定されます。
