# Day 40 - Go Microservices with OpenTelemetry and Grafana Stack

## 概要

このプロジェクトでは、Go言語で作成した複数のマイクロサービス（Gateway, Product, Inventory, Order）をOpenTelemetry (Otel) を用いて計装し、分散トレース、メトリクス、構造化ログを収集します。収集したテレメトリデータは、ローカル環境に Docker Compose で構築した Grafana Stack (Prometheus, Grafana, Loki, Tempo, Promtail) に送信し、可視化と分析を行います。

これにより、マイクロサービスアーキテクチャにおけるオブザーバビリティ（可観測性）の基本的な要素を実践的に学びます。

https://github.com/user-attachments/assets/7b44ade8-9a0b-49eb-9c64-fb9d79efd445

[100日チャレンジ day40](https://zenn.dev/gin_nazo/scraps/87549dc654c9f3)

## 主な機能 / 学習ポイント

-   **マイクロサービスのOpenTelemetry計装:**
    -   各GoサービスへのOtel SDKの導入と設定。
    -   HTTPサーバー/クライアントおよびgRPCサーバー/クライアントの自動計装。
    -   カスタムスパンによる手動計装の基礎。
    -   メトリクス (カウンター、ヒストグラムなど) の収集とエクスポーター設定。
    -   構造化ロギングライブラリ `slog` を使用し、ログに `trace_id` と `span_id` を自動的に付与。
-   **Grafana Stack (Docker Compose) の構築と連携:**
    -   `docker-compose.yml` を用いた監視スタックの一括起動。
    -   **Prometheus:** Goサービスから公開されるメトリクス (`/metrics` エンドポイント) の収集と保存。
    -   **Grafana:**
        -   Prometheus, Loki, Tempo をデータソースとして設定。
        -   収集したメトリクス、ログ、トレースをExplore機能で確認。
        -   (オプション) カスタムダッシュボードの作成。
    -   **Loki:** Promtail経由で収集されたGoアプリケーションのログを集約・保存。
    -   **Tempo:** 各サービスから送信されたスパンを集約し、分散トレースを構築・保存。
    -   **Promtail:** Goサービスが出力するファイルベースのJSONログを収集し、Lokiに転送。
-   **Trace to Logs 連携:**
    -   Grafana上でTempoのトレース情報から、関連するLokiのログへドリルダウンする機能の設定と確認。
-   **Makefileによる管理:**
    -   Goサービスのビルド、起動、停止を簡単に行うための `Makefile` を提供。

## ディレクトリ構成 (主要なもの)

```
.
├── Makefile
├── docker-compose.yml
├── grafana/
│   └── provisioning/  # Grafanaのプロビジョニング用 (データソースなど)
├── internal/
│   └── pkg/
│       └── observability/ # Otel初期化、slogハンドラなど共通オブザーバビリティ処理
├── promtail/
│   └── promtail-config.yml # Promtail設定ファイル
├── prometheus/
│   └── prometheus.yml   # Prometheus設定ファイル
├── tempo/
│   └── tempo.yaml       # Tempo設定ファイル
├── gateway_service/     # Gatewayサービス
├── inventory_service/   # Inventoryサービス
├── order_service/       # Orderサービス
└── product_service/     # Productサービス
```

## セットアップと実行手順

1.  **Docker Composeスタックの起動:**
    必要なイメージをプルし、各監視コンポーネント (Prometheus, Grafana, Loki, Tempo, Promtail) をバックグラウンドで起動します。
    ```bash
    cd day40_otel_grafana_go
    docker-compose up -d
    ```

2.  **Goマイクロサービスのビルドと起動:**
    `Makefile` を使用して、全てのGoサービスをビルドし、バックグラウンドで起動します。
    ```bash
    cd day40_otel_grafana_go
    make run
    ```
    これにより、各サービスが起動し、Otelエクスポーター経由でテレメトリデータを送信し始めます。ログはホストOSの `/tmp/go_app_<service_name>.log` にJSON形式で出力されます。

3.  **各種UIへのアクセス:**
    -   **Grafana:** `http://localhost:3000` (admin/admin)
    -   **Prometheus:** `http://localhost:9090`
    -   **Gateway Service (APIエンドポイント例):** `http://localhost:8080/api/products` (ブラウザまたはcurlでアクセス)
    -   **Loki API (確認用):** `http://localhost:3100/loki/api/v1/labels`
    -   **Tempo API (確認用):** `http://localhost:3200/api/traces/{traceID}`

## 確認ポイント / デバッグ

-   **Prometheus Targets:**
    Grafana (`http://localhost:9090`) の "Status" > "Targets" で、`go_services` ジョブ配下の各Goサービス (gateway, product, inventory, order) が "UP" 状態であることを確認します。
-   **Grafana Explore:**
    -   **Tempo:**
        -   データソースとして "Tempo" を選択。
        -   "Search" タブでサービス名 (`service.name`) などをキーにトレースを検索。
        -   "TraceQL" タブでTraceIDを直接指定してトレースを検索 (`{<traceID>}`)。
    -   **Loki:**
        -   データソースとして "Loki" を選択。
        -   Log browserで `{job="go_app_logs"}` や `{job="containerlogs"}` などのラベルでログをフィルタリング。
        -   `trace_id` や `span_id` ラベルが存在し、フィルタリングに利用できることを確認。
    -   **Prometheus:**
        -   データソースとして "Prometheus" を選択。
        -   `http_requests_total` や `http_request_duration_seconds_bucket` などのメトリクスをクエリしてグラフ表示。
-   **Trace to Logs連携:**
    -   Tempoでトレース詳細を表示した際に、各スパンの右側にあるログアイコン (document icon) をクリック。
    -   GrafanaのTempoデータソース設定で "Trace to logs" セクションが正しく設定されていることを確認 (Data source: Loki, Tags: `job`, `trace_id` など)。
    -   Loki側で `trace_id` ラベルを元にフィルタリングされたログが表示されることを確認。
-   **各コンポーネントのログ:**
    -   `docker-compose logs <service_name>` (例: `docker-compose logs promtail`) で各コンテナのログを確認し、エラーが出ていないかチェック。
    -   Goサービスのログはホストの `/tmp/go_app_*.log` にも出力されています。

## トラブルシューティング例

-   **"Unable to connect with Tempo (Bad Gateway)" (Grafana Tempoデータソース設定時):**
    `docker-compose.yml` の `tempo` サービスの `command` に不正なフラグ (`-search.enabled=true` など古いフラグ) が指定されていないか確認。Tempoコンテナのログ (`docker-compose logs tempo`) を見てエラー原因を特定。
-   **Lokiに `go_app_logs` が表示されない:**
    -   Promtailコンテナログ (`docker-compose logs promtail`) を確認。
        -   ターゲット (`/mnt/go_app_logs/go_app_*.log`) を正しく認識・tailしているか。
        -   Lokiへの送信エラー (`timestamp too old` など) が出ていないか。
    -   ホストOSの `/tmp/go_app_*.log` が正しく生成されているか。
    -   `promtail-config.yml` の `scrape_configs` のパス指定やパイプラインステージが正しいか確認。
    -   `docker-compose.yml` の Promtail のボリュームマウント (`/tmp:/mnt/go_app_logs:ro`) が正しいか確認。
    -   一度 `docker-compose down && docker-compose up -d` でスタック全体を再起動してみる。
-   **トレースがTempoで繋がらない:**
    -   各GoサービスでOtelのコンテキスト伝播 (HTTPヘッダー `traceparent` など) が正しく行われているか確認。
    -   Tempo API (`curl http://localhost:3200/api/traces/{traceID}`) で直接データを確認。
    -   GrafanaのExploreでTraceQLを使ってTraceIDで検索してみる。

## 注意点

-   このプロジェクトはローカルでの学習・デモンストレーションを目的としており、セキュリティ設定や永続化ストレージの本格的な設定は行っていません。
-   各コンポーネントのバージョンアップにより、設定方法や利用可能なフラグが変更される可能性があります。
