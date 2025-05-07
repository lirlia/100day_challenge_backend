# Day 39: Kubernetes Language Server (KLS)

## 概要

Kubernetes のマニフェストファイル (YAML) のための Language Server Protocol (LSP) 実装です。

## 対象 Kubernetes バージョン

* v1.30.2

## 対象リソース

* `Deployment` (apps/v1)
* `Service` (core/v1)
* `Ingress` (networking.k8s.io/v1)
* 上記に強く関連するリソース (例: `PodTemplateSpec`)

## 主な機能 (予定)

* YAML フォーマット
* Lint 機能 (構文エラー、スキーマ違反、ベストプラクティスからの逸脱)
* コード補完 (予測変換)
* ホバー時の情報表示 (フィールドドキュメント)
* CRD (Custom Resource Definition) のスキーマ読み込みによる拡張性

## ビルド方法

```bash
cd day39_k8s_language_server
go build -o kls cmd/kls/main.go
```

## LSPクライアント設定例 (VS Code - settings.json)

```json
{
  "yaml.customTags": [
    "!And !Ref !Sub !FindInMap !Base64 !Cidr !GetAZs !GetAtt !If !Join !Equals !Not !Or !Select !Split !Transform"
  ],
  "yaml.validate": true,
  "yaml.schemas": {},
  "languageserver": {
    "kubernetes": {
      "command": ["/path/to/your/kls"], // ビルドした kls 実行ファイルのパス
      "filetypes": ["yaml"],
      "initializationOptions": {
        // 初期化オプション (もしあれば)
      }
    }
  }
}
```

(注: 上記の VS Code 設定は一例です。LSPクライアントによっては設定方法が異なります。また、`languageserver` の部分は利用するLSPクライアント拡張機能によってキー名が異なる場合があります。例えば `coc.nvim` であれば `languageservers` と複数形になったりします。) 
