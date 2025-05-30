# PROGRESS: Day52 - 自作VPNサーバー & クライアント (Go CLI)

## フェーズ1: プロジェクト初期化と基本的なGoの骨格 (完了)
- [x] プロジェクトディレクトリ作成 (`day52_go_custom_vpn`)
- [x] Next.js関連ファイルの削除
- [x] `go mod init` の実行
- [x] ディレクトリ構造の作成 (`cmd`, `internal`, `configs`)
- [x] `README.md` と `PROGRESS.md` の初期設定

## フェーズ2: TUNデバイスとUDP通信の基本実装
- [x] `songgao/water` ライブラリの追加
- [x] TUNデバイス操作関数の実装 (`internal/network/tun.go`)
- [x] UDPソケット通信関数の実装 (`internal/network/udp.go`)

## フェーズ3: VPNコアロジック (暗号化なし、設定ファイルベース)
- [ ] 設定管理の実装 (`internal/config/config.go`, `configs/`)
- [ ] VPNサーバー コアロジックの実装 (`internal/core/server.go`, `cmd/vpnserver/main.go`)
- [ ] VPNクライアント コアロジックの実装 (`internal/core/client.go`, `cmd/vpnclient/main.go`)
- [ ] 動作テスト (暗号化なし、ping疎通確認)

## フェーズ4: 暗号化の実装
- [ ] 暗号化/復号処理の実装 (`internal/crypto/cipher.go`)
- [ ] VPNコアへの暗号化組込み
- [ ] 動作テスト (暗号化あり、ping疎通確認、パケットキャプチャでの確認)

## フェーズ5: 仕上げとドキュメンテーション
- [ ] エラーハンドリングとロギングの改善
- [ ] `README.md` の詳細化 (ビルド、実行、OS設定、テストシナリオ)
- [ ] `PROGRESS.md` の最終確認とコミット
