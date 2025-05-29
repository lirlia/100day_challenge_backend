# Day51 - DocBase 月別記事数CLI

DocBase API を使用して、指定されたチームの月別記事数を取得するCLIツールです。

## 概要

- 指定された期間（デフォルト: 2024年1月〜2025年12月）の各月の記事数を表示します。
- チーム名とAPIトークンは、コマンドライン引数または環境変数で指定可能です。
- DocBase API のレートリミットを考慮し、各リクエスト間に200ミリ秒のウェイトを入れています。

## 必要環境

- Go 1.18 以上 (推奨)

## セットアップとビルド

```bash
# リポジトリをクローン (または該当ディレクトリに移動)
# git clone ...
# cd day51_docbase_cli

# 依存関係の取得 (通常は不要)
# go mod tidy

# ビルド
go build -o docbase_counter main.go
```

## 使用方法

実行ファイル (`docbase_counter`) または `go run main.go` を使用します。

### 環境変数で設定する場合

```bash
export DOCBASE_TEAM="your_team_name"
export DOCBASE_TOKEN="your_api_token"

# 2024年1月から2024年3月までの記事数を取得
./docbase_counter -start-year 2024 -start-month 1 -end-year 2024 -end-month 3

# デフォルト期間 (2024/01 - 2025/12) で取得
./docbase_counter 
```

### コマンドライン引数で指定する場合

```bash
# 2024年1月から2024年3月までの記事数を取得
./docbase_counter -team your_team_name -token your_api_token -start-year 2024 -start-month 1 -end-year 2024 -end-month 3

# go run で直接実行も可能
go run main.go -team your_team_name -token your_api_token -start-year 2024 -start-month 1 -end-year 2024 -end-month 3
```

### ヘルプ表示

```bash
./docbase_counter -h
```

出力例:
```
使用法: ./docbase_counter [options]
オプション:
  -end-month int
        End month for fetching posts (1-12) (default 12)
  -end-year int
        End year for fetching posts (default 2025)
  -start-month int
        Start month for fetching posts (1-12) (default 1)
  -start-year int
        Start year for fetching posts (default 2024)
  -team string
        DocBase team name (or DOCBASE_TEAM env var)
  -token string
        DocBase API token (or DOCBASE_TOKEN env var)

環境変数:
  DOCBASE_TEAM: DocBase team name
  DOCBASE_TOKEN: DocBase API token
```

## API仕様

DocBase API の詳細は以下のドキュメントを参照してください。

- [DocBase API ドキュメント](https://help.docbase.io/posts/92984)
