# Day32 - ユーザースペースネットワークスタック（Go）

## 概要
Goで実装したユーザースペースTCP/IP/TLS/HTTP2スタックです。TUNデバイスを用いてIPパケットを受信し、IP/TCP/TLS/HTTP2の各層を自前でパース・処理します。

https://github.com/user-attachments/assets/b9c37838-3951-49be-8005-3305b8044953

[100日チャレンジ day32](https://zenn.dev/gin_nazo/scraps/2ab7b49d1166ea)

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
   # 独自の IP/TCP/TLS/HTTP/HTTP2 スタック
   sudo PAUSE_LAYER=ip,tcp,tls go run *.go

   # go標準の net/http を使ったサーバ
   sudo go run *.go -mode tcp
   ```
4. curlやブラウザでアクセスし、各層のログや一時停止を確認
   ```sh
   curl --http1.1 http://10.0.0.2
   curl --cacert cert.pem --http2 https://10.0.0.2:443/
   ```

## 残作業・今後のTODO
- HTTP2層の一時停止ポイント追加
- より詳細なエラーハンドリング
- コード整理・リファクタリング

## 仕組み・シーケンス詳細

本スタックは、TUNデバイスで受信したIPパケットを自前でパースし、IP→TCP→TLS→HTTP/2の順に各層で処理・状態管理を行います。

### 全体フロー
1. **TUNデバイスでIPパケット受信**
2. **IP層**: IPv4ヘッダをパースし、プロトコル番号で分岐（TCPのみ処理）
3. **TCP層**: TCPヘッダ・シーケンス管理、SYN/SYN-ACK/ACKの3way handshake、状態遷移
4. **TLS層**: TCP上のデータをTLSレコードとしてパースし、ClientHello→ServerHello→証明書→鍵交換→CCS→Finishedの順でハンドシェイク
   - ECDHEによる鍵交換、ALPNによるプロトコル選択
   - ハンドシェイク完了後はApplication Dataを復号し上位層へ
5. **HTTP/2層**: TLS Application DataをHTTP/2フレームとしてパースし、ストリーム管理・レスポンス生成

### 各層の役割・ポイント
- **IP層**
  - 受信: IPv4ヘッダをパースし、TCP/UDP/ICMPで分岐
  - 送信: buildIPv4Headerでヘッダ生成、checksum計算
  - ログ: `[IP]` シアン色
  - 一時停止: `pauseIfNeeded("ip")` で主要受信時に停止

- **TCP層**
  - 受信: TCPヘッダ・シーケンス番号・フラグをパース
  - 状態: SYN/SYN-ACK/ACKの3way handshake、ESTABLISHED、FIN/ACKによる切断
  - 送信: buildTCPHeaderでヘッダ生成、checksum計算
  - ログ: `  [TCP]` 青色
  - 一時停止: handshake完了時などで `pauseIfNeeded("tcp")`

- **TLS層**
  - 受信: TLSレコードをパースし、ハンドシェイク/暗号化/復号
  - ハンドシェイク: ClientHello→ServerHello→Certificate→ServerKeyExchange→ServerHelloDone→ClientKeyExchange→CCS→Finished
  - 鍵交換: ECDHE（P-256）+ RSA署名
  - ALPN: HTTP/2優先、なければHTTP/1.1
  - ログ: `    [TLS]` オレンジ色
  - 一時停止: ハンドシェイク完了時などで `pauseIfNeeded("tls")`

- **HTTP/2層**
  - 受信: TLS Application DataをHTTP/2フレームとしてパース
  - ストリーム管理、レスポンス生成
  - ログ: `      [H2]` マゼンタ色
  - 一時停止: 主要リクエスト受信時に `pauseIfNeeded("http2")`（今後追加予定）

### ログ・一時停止の例
```
[IP] 10.0.0.2 -> 10.0.0.1 Proto: 6(TCP) ...
  [TCP]RCV: 10.0.0.2:12345 -> 10.0.0.1:443 Seq: ... Flags: [SYN]
    [TLS]Received ClientHello ...
    [TLS]ServerHello sent. ...
      [H2]Received HTTP/2 preface ...
```

### シーケンス図（簡易）

```
Client         TUN/GoStack
  |  SYN  --->
  | <--- SYN-ACK
  |  ACK  --->
  | TLS ClientHello --->
  | <--- TLS ServerHello/Cert/SKE/Done
  | TLS ClientKeyExchange/CCS/Finished --->
  | <--- TLS CCS/Finished
  | HTTP/2 preface/frames <->
```

---

## ファイル構成
- `main.go` ... 起動・共通定義・一時停止機能
- `ip.go` ... IP層のパース・送信
- `tcp.go` ... TCP層のパース・状態管理
- `tls.go` ... TLS1.2ハンドシェイク・暗号化
- `http2.go` ... HTTP/2フレーム処理
- `crypto.go` ... 鍵交換・暗号処理
