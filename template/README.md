# 100日間チャレンジバックエンド

このプロジェクトは、100日間で異なるアプリケーションを開発するチャレンジのバックエンドテンプレートです。

## プロジェクト構造

プロジェクトの構造と各ディレクトリの役割については、[rules/directory_layout.md](rules/directory_layout.md)を参照してください。

## 必要条件

- Go 1.24以上
- Docker
- Task

## セットアップ

1. 依存関係のインストール
```bash
go mod download
```

2. MySQLコンテナの起動
```bash
task docker-compose
```

3. アプリケーションの起動
```bash
task run
```

## 開発

### コード生成

OpenAPIスキーマからコードを生成する場合：
```bash
task generate
```

### テスト

テストを実行する場合：
```bash
task test
```

## 使用技術

- Go
- MySQL
- OpenAPI
- GORM
- ogen
- TailwindCSS 