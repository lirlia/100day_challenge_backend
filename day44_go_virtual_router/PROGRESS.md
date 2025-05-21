# PROGRESS

## Day44: Go仮想ルーター

### 0. プロジェクト初期化
- [x] `day44_go_virtual_router` ディレクトリ作成
- [x] `template` ディレクトリを `day44_go_virtual_router/next_admin` にコピー
- [x] `day44_go_virtual_router/next_admin/package.json` の `name` を `day44-go-virtual-router-admin` に変更
- [x] `day44_go_virtual_router/PROGRESS.md` を作成し、上記の全ステップを記述
- [x] `day44_go_virtual_router/README.md` を作成し、アプリケーションの概要を記述
- [x] `day44_go_virtual_router/go_router` ディレクトリ作成
- [x] `day44_go_virtual_router/go_router/go.mod` ファイル作成 (`module github.com/lirlia/100day_challenge_backend/day44_go_virtual_router/go_router`)
- [x] `day44_go_virtual_router/go_router/main.go` ファイル作成 (基本的な HTTP サーバーと WebSocket サーバーの雛形)
- [x] `day44_go_virtual_router/next_admin` で `npm install` を実行
- [x] `day44_go_virtual_router/next_admin/app/layout.tsx` の基本的なレイアウト作成 (ヘッダー、メインコンテンツエリア)
- [x] `day44_go_virtual_router/next_admin/app/page.tsx` でルーター管理画面の初期表示作成 (空の描画エリアなど)

### 1. Go: ルーターコア機能実装
- [x] **TUNデバイス操作:**
    - [x] TUNデバイス作成・設定 (`water` ライブラリ使用)
    - [x] IPパケット送受信 (基本的なRead/Write機能)
- [x] **ルーター管理:**
    - [x] ルーターインスタンス (goroutine) の動的生成・削除 (Manager経由)
    - [x] ルーターごとのルーティングテーブル (メモリ内、直接接続ルートのみ)
- [x] **ルーティングプロトコル (OSPF風独自実装):**
    - [x] Hello パケット交換によるネイバー発見
    - [x] LSU (Link State Update) パケット交換によるリンク状態共有
    - [x] SPF (Shortest Path First) アルゴリズムによるルーティングテーブル計算
    - [x] 定期的なルーティングテーブル更新

### 2. Go: API実装 (WebSocket & HTTP)
- [x] **WebSocket API (`/ws`):**
    - [x] クライアント接続管理の基本実装
    - [x] RouterManagerからのイベントをブロードキャストする雛形 (broadcastチャネル)
    - [ ] ルーター情報のリアルタイム送信 (トポロジー、ルーティングテーブル更新など)
- [x] **HTTP API:**
    - [x] ルーター一覧取得 (`GET /api/routers`)
    - [x] ルーター作成 (`POST /api/routers`)
    - [x] ルーター削除 (`DELETE /api/routers/:routerId`)
    - [ ] ルーター設定変更 (`PUT /api/routers/:routerId`) (例: IPアドレス、メトリック)
    - [ ] ルーター間接続の作成・削除 (例: `POST /api/connections`)

### 3. Next.js: UIコンポーネント実装
- [x] **基本レイアウト:**
    - [x] ネットワーク図表示エリア (プレースホルダ)
    - [x] ルーター操作パネル (作成フォームのプレースホルダ)
    - [x] ログ表示エリア (WebSocketログ表示)
    - [x] ニューモーフィズムスタイル適用
- [x] **React Flow連携:**
    - [x] `reactflow` ライブラリインストール
    - [x] ネットワーク図エリアに `ReactFlow` コンポーネント組込 (ダミーノード・エッジ表示)
    - [x] MiniMap, Controls, Background追加
    - [x] ノードドラッグ有効化 (デフォルトで有効)
- [x] **ルーター操作UI:**
    - [ ] ルーター追加フォーム
    - [ ] ルーター設定編集モーダル
    - [ ] 接続作成UI (ノード間をドラッグして接続など)
- [x] **情報表示エリア:**
    - [ ] 選択ルーターのルーティングテーブル表示
    - [ ] イベントログ表示エリア

### 4. Next.js: API連携と状態管理
- [x] **WebSocket接続とイベント処理:**
    - [x] WebSocketクライアント実装 (`useEffect` で接続、クリーンアップ)
    - [x] 受信イベントに基づいたUI状態更新 (例: トポロジー、ルーティングテーブル)
- [x] **HTTP API呼び出し:**
    - [x] ルーター操作APIの呼び出し (`fetch` または SWR/React Query)
    - [x] フォーム送信処理
- [x] **状態管理 (`zustand` または `jotai`):**
    - [x] ネットワークトポロジー状態
    - [x] 選択中ルーター情報
    - [x] UI操作に関連する状態

### 5. Next.js: 主要業務フロー実装
- [x] **ルーター追加フロー:** UI から追加 → API 経由でGo側でルーター作成 → WebSocketでUI更新
- [x] **ルーター削除フロー:** UI から削除 → API 経由でGo側でルーター削除 → WebSocketでUI更新
- [x] **ルーター接続フロー:** UI で接続操作 → API 経由でGo側で接続情報更新 → WebSocketでUI更新
- [x] **ルーティングテーブル表示フロー:** ルーター選択 → WebSocket経由で最新テーブル表示

### 6. テストとデバッグ
- [ ] **Go:**
    - [ ] ユニットテスト (各モジュール: TUN操作、ルーティング計算など)
    - [ ] 統合テスト (複数ルーター連携、ルーティング更新)
- [ ] **Next.js:**
    - [ ] コンポーネントテスト (`@testing-library/react`)
    - [ ] E2Eテスト (Playwright / Cypress) による主要フロー確認
- [ ] **全体:**
    - [ ] 複数ブラウザでの動作確認
    - [ ] 負荷テスト (Go側のルーター数増加、APIリクエスト数増加)

### 7. ドキュメント作成
- [ ] `day44_go_virtual_router/README.md` の詳細化
- [ ] `.cursor/rules/knowledge.mdc` の更新


- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
