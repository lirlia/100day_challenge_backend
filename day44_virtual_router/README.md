# Day44: Go仮想ルーター

## 概要

Go言語で仮想ルーターを実装するプロジェクトです。
TUNデバイスを用いて仮想NICを作成し、IPパケットの送受信を行います。
サーバープロセスは1台のみで、各ルーターはgoroutineとして動的に生成・管理されます。
OSPF風のダイナミックルーティング（独自実装）でルーティングテーブルを自動更新します。
管理画面（Goのhtml/template＋Tailwind CDN）でルーターの追加・削除・ルーティング制御が可能です。

## 主な機能

-   仮想ルーター管理 (追加・削除・リンク設定)
-   静的・動的 (OSPF風) ルーティング
-   IPパケット転送
-   Webベースの管理画面

## 技術スタック

-   Go 1.21+
-   TUNデバイス制御: `github.com/songgao/water`
-   Webサーバ: `net/http`
-   テンプレートエンジン: `html/template`
-   CSSフレームワーク: Tailwind CSS (CDN)

## ディレクトリ構成 (予定)

```
day44_virtual_router/
├── main.go                # エントリポイント
├── router/                # 仮想ルーター本体
│   ├── router.go
│   ├── tun.go
│   ├── ospf.go
│   └── packet.go
├── web/                   # 管理画面
│   ├── handler.go
│   ├── templates/
│   │   ├── layout.html
│   │   ├── index.html
│   │   └── router_detail.html
│   └── static/
│       └── tailwind.min.css (CDN利用想定だったが、Tailwind CDNのため不要の可能性)
├── internal/              # 補助ライブラリ
│   └── util.go
├── go.mod
├── go.sum
└── README.md
```

## セットアップと実行

（ここにビルド方法や実行方法を記述）

## 注意事項

-   TUNデバイスの作成にはroot権限が必要な場合があります。
-   OSPFは学習用の簡易実装であり、本家プロトコルとは互換性がありません。
-   IPv4のみ対応します。

---
© 2024 YOUR_NAME (これは後で更新します)
