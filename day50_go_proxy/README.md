# Day50: 高機能 HTTP/HTTPS フォワードプロキシ (Go言語)

これは、100日チャレンジのDay50で作成した、Go言語による高機能HTTP/HTTPSフォワードプロキシサーバーです。HTTP通信に加え、HTTPS通信に対してもMan-in-the-Middle (MITM) 方式でトラフィックを復号し、インテリジェント・キャッシングを行います。

https://github.com/user-attachments/assets/5e55ea58-6ce7-4095-a91d-0abf74d7c35b

[100日チャレンジ day50](https://zenn.dev/gin_nazo/scraps/7fccf9623851aa)

## 主な機能

- **HTTP/1.1 フォワードプロキシ:** 通常のHTTPリクエストを中継します。
- **HTTPS (CONNECTメソッド) MITM プロキシ:**
    - クライアントからのCONNECTリクエストに対し、プロキシがオリジンサーバーになりすまします。
    - 動的にサーバー証明書を生成し、設定されたCA証明書で署名してクライアントに提示します。
    - クライアントとの間でTLS通信を確立し、HTTPSトラフィックを復号・検査・キャッシングします。
    - その後、オリジンサーバーへ通常のHTTPSリクエストとして転送します。
- **インテリジェント・キャッシング (HTTP/HTTPS):**
    - HTTP GETリクエストおよび復号化されたHTTPS GETリクエストのレスポンスをSQLiteデータベース (`db/cache.db`) にキャッシュします。
    - `Cache-Control` (max-age), `Expires` ヘッダーを解釈し、キャッシュの有効期限を決定します。
    - キャッシュヒット時には `X-Proxy-Cache: HIT` ヘッダーを付与して応答します。
    - キャッシュキーにはリクエストメソッドと正規化されたURLを使用します。
    - 設定ファイルでキャッシュの有効/無効、DBパス、デフォルトTTL、最大DBサイズを指定可能です。
    - CA証明書と秘密鍵のパスも設定ファイルで指定します。

## ディレクトリ構造 (主要部分)

```
/day50_go_proxy/
├── main.go                # メインアプリケーション
├── go.mod                 # Goモジュールファイル
├── go.sum                 # Goモジュールチェックサム
├── config/                # 設定関連
│   ├── config.go          # 設定読み込みロジック
│   ├── config.yml         # 設定ファイル (デフォルト)
│   └── config.example.yml # 設定ファイル例
├── proxy/                 # プロキシロジック
│   ├── http_handler.go    # HTTPリクエスト処理
│   ├── https_handler.go   # HTTPS (CONNECT/MITM) リクエスト処理
│   ├── cache.go           # キャッシュ関連ロジック
│   ├── cert_manager.go    # CA証明書管理、動的証明書生成
│   └── utils.go           # ヘルパー関数
├── db/                    # データベース関連 (キャッシュ用)
│   ├── database.go        # DB初期化、操作関数
│   └── schema.sql         # DBスキーマ定義 (SQLite)
├── ca.crt                 # (生成が必要) CA証明書 (クライアントの信頼ストアにインポート)
├── ca.key                 # (生成が必要) CA秘密鍵 (プロキシサーバーが使用)
├── day50_go_proxy         # ビルドされた実行ファイル (gitignored)
└── README.md              # このファイル
```

## セットアップと実行

### 前提条件

- Go言語 (バージョン 1.20 以上推奨) がインストールされていること。
- OpenSSL コマンドラインツール (CA証明書生成用)。
- (任意) `sqlite3` コマンドラインツール (キャッシュDBの内容確認用)。

### 1. CA証明書と秘密鍵の生成

HTTPS通信をMITMしキャッシングするためには、自己署名のCA証明書が必要です。
プロジェクトルート (`day50_go_proxy`) で以下のコマンドを実行して `ca.crt` と `ca.key` を生成します。

```bash
# CA秘密鍵の生成 (パスフレーズなし)
openssl genpkey -algorithm RSA -out ca.key -pkeyopt rsa_keygen_bits:2048

# CA証明書のリクエスト生成 (CSR)
# Common Name (CN) は適当な名前でOK (例: MyProxyCA)
openssl req -new -key ca.key -out ca.csr -subj "/CN=MyProxyCA/O=MyOrg/C=JP"

# CA証明書の自己署名 (例: 3650日間有効)
openssl x509 -req -days 3650 -in ca.csr -signkey ca.key -out ca.crt

# 不要になったCSRファイルを削除
rm ca.csr
```

**重要:** 生成された `ca.crt` ファイルを、プロキシを利用するクライアントマシン (ブラウザやcurlを実行する環境) の信頼されたルート認証局ストアにインポートしてください。これにより、プロキシが動的に生成するサーバー証明書が信頼されるようになります。

### 2. 設定ファイルの確認・編集

`config/config.yml` (またはコピーして作成した独自の設定ファイル) を開き、CA証明書と秘密鍵のパスが正しく設定されていることを確認します。デフォルトでは以下のようになっています。

```yaml
# ... (proxy設定)

cache:
  enabled: true
  sqlite_path: "db/cache.db"
  default_ttl_seconds: 3600
  max_size_mb: 100
  ca_cert_path: "ca.crt"   # 生成したCA証明書のパス
  ca_key_path: "ca.key"    # 生成したCA秘密鍵のパス

# ... (log設定)
```

### 3. ビルド

プロジェクトのルートディレクトリ (`day50_go_proxy`) で以下のコマンドを実行します。

```bash
go build -o day50_go_proxy main.go
```

### 4. 実行

ビルド後、以下のコマンドでプロキシサーバーを起動できます。

```bash
./day50_go_proxy [設定ファイルパス(任意)]
```

設定ファイルパスを省略した場合、デフォルトで `config/config.yml` が読み込まれます。
プロキシサーバーはデフォルトで `localhost:8080` (設定ファイルで変更可能) でリッスンします。

#### ログ
サーバーの動作ログは標準出力に出力されます。キャッシュのヒット・ミス、HTTPS接続時の証明書生成、オリジンへのアクセス状況などが確認できます。

#### 終了
プロキシサーバーを終了するには、`Ctrl+C` を押してください。

### 5. テスト (curl例)

プロキシサーバーを起動した状態で、別のターミナルから `curl` を使って動作確認できます。

**HTTPリクエスト:**
```bash
curl -v -x http://localhost:8080 http://example.com
```
最初のアクセス後、再度同じコマンドを実行すると `X-Proxy-Cache: HIT` ヘッダーが返ることを確認します。

**HTTPSリクエスト:**
**重要:** `ca.crt` をクライアントにインポートしていない場合、`--cacert` オプションでCA証明書ファイルを指定するか、`-k` (または `--insecure`) オプションで証明書検証をスキップする必要があります。本番環境での `-k` の使用は非推奨です。

```bash
# ca.crt をシステムにインポート済み、または --cacert で指定
curl -v -x http://localhost:8080 --cacert ca.crt https://httpbin.org/get
# または (非推奨、テスト目的のみ)
# curl -v -x http://localhost:8080 -k https://httpbin.org/get
```
最初のアクセス後、再度同じコマンドを実行すると `X-Proxy-Cache: HIT` ヘッダーが返ることを確認します。
プロキシサーバーのログに、対象ホスト (例: `httpbin.org`) の証明書を生成した旨のログが出力されることも確認できます。

## 設定

設定は `config/config.yml` (または起動時に指定したファイル) で行います。
主な設定項目は以下の通りです。

```yaml
proxy:
  port: 8080          # プロキシサーバーがリッスンするポート
  host: ""            # リッスンするホスト (空の場合は全インターフェース)
  # grace_shutdown_timeout_seconds: 30 # (設定例) グレースフルシャットダウンのタイムアウト

cache:
  enabled: true       # キャッシュ機能の有効/無効 (true/false)
  sqlite_path: "db/cache.db" # SQLiteデータベースファイルのパス
  default_ttl_seconds: 3600  # キャッシュのデフォルト有効期間 (秒)。オリジンがTTLを指定しない場合に使用。
  max_size_mb: 100       # キャッシュDBの最大サイズ (MB)。超過時のプルーニング機能は未実装。
  ca_cert_path: "ca.crt"   # プロキシが使用するCA証明書ファイルのパス
  ca_key_path: "ca.key"    # プロキシが使用するCA秘密鍵ファイルのパス

log:
  level: "info"       # ログレベル (debug, info, warn, error)
  # format: "json"      # ログフォーマット (text, json)
```

## 今後の拡張案

- 条件付きGET (`If-None-Match`, `If-Modified-Since`) の完全な実装。
- キャッシュプルーニング機能 (DBサイズ超過時のLRU削除など)。
- `Vary` ヘッダーの考慮。
- より詳細なロギングオプション (ファイル出力など)。
- Basic認証などのプロキシ認証機能。
- アクセス制御リスト (ACL) の実装。
- HTTP/2, HTTP/3 のサポート。

## コントリビューター

- (あなたの名前/エイリアス)

## ライセンス

(このプロジェクトに適用するライセンスがあれば記載) 
