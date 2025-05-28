# Day47: コンテンツ配信ネットワーク (CDN) シミュレータ

これは、コンテンツ配信ネットワーク (CDN) の基本的な動作原理をシミュレートするWebアプリケーションです。
ユーザーはオリジンサーバーにコンテンツを登録し、複数の設定可能なエッジサーバーを通じて、クライアント（シミュレートされたユーザー）からのリクエストに応じてコンテンツがどのように配信されるかを視覚的に確認できます。
キャッシュ戦略 (LRU, TTL) やリクエストルーティングの基本的な概念を学ぶことを目的とします。

**デザインテーマ:** ニューモーフィズム (Neumorphism) - 柔らかい立体感と影を活用したモダンなUI

https://github.com/user-attachments/assets/40abc594-b347-4375-8626-a6a2b0d8500c

[100日チャレンジ day47](https://zenn.dev/gin_nazo/scraps/2d9aa5f2e76309)

## 学習ポイント

このプロジェクトでは以下の技術的概念を実践的に学べます：

### CDN・キャッシュ技術
- **エッジサーバーの地理的分散配置**とクライアント最適化
- **LRU (Least Recently Used)** キャッシュ退避アルゴリズム
- **TTL (Time-To-Live)** による期限切れキャッシュ管理
- **キャッシュヒット率**の計測と最適化
- **オリジンサーバー負荷軽減**の効果測定

### データベース設計・SQLite
- **外部キー制約**による参照整合性の確保
- **UNIQUE制約**による重複データ防止
- **インデックス最適化**によるクエリパフォーマンス向上
- **better-sqlite3**でのトランザクション処理
- **型安全なSQLバインド**（Number型変換、boolean→整数変換）

### Next.js・TypeScript
- **App Router**による現代的なルーティング
- **Route Handlers**でのRESTful API実装
- **Server/Client Components**の適切な使い分け
- **TypeScript型定義**による開発効率向上

### UI/UXデザイン
- **ニューモーフィズム**デザインの実装
- **Tailwind CSS**カスタムユーティリティの作成
- **レスポンシブデザイン**対応
- **リアルタイム統計表示**とデータ可視化

## 主な機能とUIコンポーネント

本アプリケーションは以下の主要な機能を提供します。

1.  **オリジンコンテンツ管理 (`OriginContentsManager.tsx`)**
    *   オリジンサーバーにコンテンツを登録（コンテンツID、データ/URL、コンテントタイプ）。
    *   登録済みコンテンツの一覧表示と削除。
    *   画像コンテンツ（Picsum Photos）とHTMLコンテンツの両方に対応。

2.  **エッジサーバー設定 (`EdgeServerManager.tsx`)**
    *   エッジサーバーの追加（サーバーID、地域、キャッシュ容量、デフォルトTTL）。
    *   設定済みエッジサーバーの一覧表示と削除。
    *   7つの地域（日本、シンガポール、米国西部・東部、欧州中央、ブラジル、オーストラリア）をサポート。

3.  **リクエストシミュレーション (`RequestSimulator.tsx`)**
    *   クライアントの地域とリクエストするコンテンツIDを選択。
    *   シミュレーションを実行し、結果（キャッシュヒット/ミス、配信元サーバー、退避されたアイテムなど）を表示。
    *   リアルタイムでキャッシュ状態の変化を確認可能。

4.  **配信プロセス視覚化 (`VisualizationLog.tsx`)**
    *   シミュレーションされたリクエストのログを時系列で表示。
    *   各ログには、リクエスト時刻、クライアント地域、コンテンツID、配信サーバー、キャッシュ状態、オリジンフェッチの有無が含まれます。
    *   色分けによる視覚的なステータス表示。

5.  **エッジサーバーキャッシュ状態表示 (`EdgeServerCacheView.tsx`)**
    *   各エッジサーバーの現在のキャッシュ内容を一覧表示。
    *   キャッシュされているアイテムのID、キャッシュ時刻、有効期限、最終アクセス時刻を確認可能。
    *   サーバーのキャッシュ使用量（現在のアイテム数 / 最大容量）も表示。
    *   LRU順序での表示により、次に退避されるアイテムを予測可能。

6.  **統計情報表示 (`StatsDisplay.tsx`)**
    *   CDN全体のパフォーマンス統計を表示。
    *   総リクエスト数、キャッシュヒット数、キャッシュヒット率。
    *   リージョン別リクエスト数、人気コンテンツ（上位10件）ランキング。
    *   統計情報は30秒ごとに自動更新。

## 技術スタック

- **フレームワーク:** Next.js 15 (App Router)
- **言語:** TypeScript
- **データベース:** SQLite
- **DBアクセス:** better-sqlite3
- **API実装:** Next.js Route Handlers
- **スタイリング:** Tailwind CSS v4 (Neumorphism カスタムデザインシステム)
- **状態管理 (UI):** React Hooks (`useState`, `useEffect`, `useCallback`)
- **Lint & Format:** Biome.js
- **パッケージ管理:** npm

## ニューモーフィズムデザインシステム

本プロジェクトでは、モダンなニューモーフィズムデザインを採用しています：

### カスタムTailwindユーティリティ
- **影効果:** `shadow-neumorphism-soft`, `shadow-neumorphism-convex`, `shadow-neumorphism-concave`
- **角丸:** `rounded-neumorphism` (1.5rem)
- **色彩:** `bg-neumorphism-bg`, `text-neumorphism-accent`, `border-neumorphism-border`

### UIコンポーネント
- **NeumorphicCard:** 浮き出し効果のあるカードコンテナ
- **NeumorphicButton:** 立体感のあるインタラクティブボタン
- **NeumorphicInput/Select/Textarea:** 沈み込み効果のあるフォーム要素

### レスポンシブ対応
- モバイル・タブレット・デスクトップでの最適表示
- グリッドレイアウトによる柔軟な画面構成

## 起動方法

```bash
# 1. プロジェクトルートに移動
cd day47_cdn_simulator

# 2. 依存関係をインストール
npm install

# 3. 開発サーバーを起動 (ポート3001で起動します)
npm run dev
```

ブラウザで `http://localhost:3001/dashboard` にアクセスしてください。

## 使い方

### 1. 基本セットアップ
1. **オリジンコンテンツを登録**
   - Content ID: `test-page-1`
   - Content Type: `text/html`
   - Data: `<h1>Hello World!</h1>`

2. **エッジサーバーを追加**
   - Server ID: `edge-tokyo-1`
   - Region: `Asia (Japan)`
   - Cache Capacity: `100`
   - Default TTL: `3600` (1時間)

### 2. シミュレーション実行
1. **Request Simulator**で地域とコンテンツを選択
2. **「Simulate Request」**ボタンをクリック
3. 結果を確認：
   - 初回: Cache MISS → オリジンから取得してキャッシュ
   - 2回目: Cache HIT → エッジサーバーから高速配信

### 3. 統計・ログ確認
- **Visualization Log**: リクエスト履歴の時系列表示
- **Cache States**: 各サーバーのキャッシュ内容
- **Statistics**: ヒット率や地域別統計

## CDNコアロジック (`app/_lib/cdn-logic.ts`)

### エッジサーバー選択アルゴリズム
```typescript
export function findBestEdgeServer(clientRegion: RegionId, allEdgeServers: EdgeServer[]): EdgeServer | null {
  // 1. 同一地域のサーバーを優先選択
  const regionalMatch = allEdgeServers.find(server => server.region === clientRegion);
  if (regionalMatch) return regionalMatch;
  
  // 2. フォールバック: 最初に利用可能なサーバー
  return allEdgeServers[0] || null;
}
```

### キャッシュ管理戦略
- **TTL (Time-To-Live):** 各エッジサーバーで設定されたTTLに基づき、キャッシュアイテムは期限切れとなる
- **LRU (Least Recently Used):** キャッシュ容量が一杯の場合、最も長い間アクセスされていないアイテムが新しいアイテムのために退避される
- **期限切れアイテム自動削除:** リクエスト時に期限切れキャッシュを自動的にクリーンアップ

### ログ記録システム
全てのリクエストとキャッシュの動作はデータベースの `request_logs` テーブルに記録され、統計分析に活用されます。

## データベーススキーマ (`lib/db.ts`)

### テーブル構成
- **`origin_contents`**: オリジンサーバーのコンテンツ情報
- **`edge_servers`**: エッジサーバーの設定情報（地域、容量、TTLなど）
- **`edge_cache_items`**: 各エッジサーバーのキャッシュ内アイテム（LRUのための最終アクセス時刻、TTLのための有効期限も含む）
- **`request_logs`**: シミュレートされた全リクエストのログ情報

### 制約・インデックス
- **外部キー制約**: データ整合性の確保
- **UNIQUE制約**: 重複キャッシュエントリの防止
- **パフォーマンスインデックス**: 高速クエリのための最適化

## 技術的な実装ポイント

### SQLiteバインドエラー対策
```typescript
// ID値の整数化
.run(Number(edgeServer.id), Number(originContent.id), ...)

// boolean値の整数変換
.run(..., cache_hit ? 1 : 0, delivered_from_origin ? 1 : 0)
```

### 期限切れキャッシュの自動削除
```typescript
// キャッシュチェック前に期限切れアイテムを削除
db.prepare('DELETE FROM edge_cache_items WHERE edge_server_id_ref = ? AND expires_at <= ?')
  .run(Number(edgeServer.id), nowISO);
```

### リアルタイム統計更新
```typescript
// 30秒ごとの自動更新
useEffect(() => {
  const interval = setInterval(fetchStats, 30000);
  return () => clearInterval(interval);
}, []);
```

## 今後の拡張可能性

- **地理的距離計算**: より精密なエッジサーバー選択アルゴリズム
- **負荷分散**: 複数サーバー間でのトラフィック分散
- **キャッシュ戦略**: LFU、FIFO等の他のアルゴリズム実装
- **ネットワーク遅延シミュレーション**: リアルな配信時間の模擬
- **コンテンツ圧縮**: gzip、Brotli等の圧縮アルゴリズム
- **セキュリティ機能**: HTTPS、認証、DDoS対策

---

_このプロジェクトは学習目的で作成されており、実際のCDNの全ての複雑さを網羅しているわけではありません。しかし、CDNの基本的な動作原理とキャッシュ戦略を理解するための実践的な教材として設計されています。_
