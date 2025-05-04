# Day32 - ユーザースペースネットワークスタック（Go）

## 概要
Goで実装したユーザースペースTCP/IP/TLS/HTTP2スタックです。TUNデバイスを用いてIPパケットを受信し、IP/TCP/TLS/HTTP2の各層を自前でパース・処理します。

## 主な特徴
- **IP/TCP/TLS/HTTP2 各層をGoで自作**
- **各層ごとに色分け・インデント・Prefix統一のログ出力**
- **レイヤーごとに一時停止（Enterで進行）できるデモ用機能**
- **TLS 1.2 ECDHE_RSA_WITH_AES_128_GCM_SHA256 のみ対応（簡易実装）**
- **ALPNによるHTTP/2/HTTP1.1の切り替え**
- **TUNモード/通常TCPモード両対応**

## ログ出力の仕様
- IP=シアン, TCP=青, TLS=オレンジ, HTTP2=マゼンタ で色分け
- インデント・Prefix例: `[IP]`, `  [TCP]`, `    [TLS]`, `      [H2]`
- ログ末尾は必ずColorResetで色リセット
- linterエラーも都度修正

## 一時停止機能
- `PAUSE_LAYER` 環境変数で `ip,tcp,tls,http2` など指定可能
- 各層の主要ポイントで `pauseIfNeeded("ip")` などを呼び出し、Enterで進行
- デモや動画撮影時に便利

## 使い方
1. サーバ証明書(cert.pem)・秘密鍵(key.pem)を用意
2. TUNデバイスを作成し、必要に応じて権限付与
3. 起動例:
   ```sh
   sudo PAUSE_LAYER=ip,tcp,tls go run *.go -mode tun -dev utun4 -localIP 10.0.0.1 -remoteIP 10.0.0.2
   ```
4. curlやブラウザでアクセスし、各層のログや一時停止を確認

## 残作業・今後のTODO
- HTTP2層の一時停止ポイント追加
- より詳細なエラーハンドリング
- コード整理・リファクタリング

---

## ファイル構成
- `main.go` ... 起動・共通定義・一時停止機能
- `ip.go` ... IP層のパース・送信
- `tcp.go` ... TCP層のパース・状態管理
- `tls.go` ... TLS1.2ハンドシェイク・暗号化
- `http2.go` ... HTTP/2フレーム処理
- `crypto.go` ... 鍵交換・暗号処理

---

何か不明点・追加要望があれば issue/PR でご連絡ください。 
