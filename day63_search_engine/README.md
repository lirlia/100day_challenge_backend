# Day63 - 検索エンジン

本格的な検索エンジンの実装により、情報検索理論・転置インデックス・TF-IDFアルゴリズム・日本語自然言語処理を学習するアプリケーション。

https://github.com/user-attachments/assets/ec32d39f-6d1d-4b9a-a4f2-6c08f3c622f1

[100日チャレンジ day63](https://zenn.dev/gin_nazo/scraps/d7b62fb44a70b3)

## 📝 実装済み機能

### 🔍 検索コアエンジン
- ✅ **転置インデックス構築**: 単語→文書IDリストのマッピング
- ✅ **TF-IDF計算**: Term Frequency × Inverse Document Frequency
- ✅ **PageRankアルゴリズム**: 文書間リンクによる重要度スコア
- ✅ **日本語形態素解析**: ひらがな・カタカナ・漢字の適切な分割
- ✅ **ストップワード除去**: 助詞・助動詞等の不要語除去

### 📚 文書管理システム
- ✅ 青空文庫テキスト、Wikipedia記事、技術記事の格納・管理
- ✅ 文書メタデータ（タイトル、作者、カテゴリ、URL）管理
- ✅ 文書間のリンク関係追跡

### 🎨 検索インターフェース
- ✅ リアルタイム検索機能（13-20ms 高速レスポンス）
- ✅ 検索結果ランキング表示（関連度・権威性スコア）
- ✅ 検索キーワードハイライト表示
- ✅ ファセット検索（カテゴリ・作者フィルタ）
- ✅ 検索統計・パフォーマンス表示

### ⚙️ 管理者機能
- ✅ 文書登録・更新・削除
- ✅ インデックス再構築
- ✅ PageRank再計算・可視化
- ✅ 検索ログ・統計分析

## 🛠️ 技術スタック

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **データベース**: SQLite + better-sqlite3
- **日本語処理**: 自作シンプル分割器 + 正規表現
- **UI**: Tailwind CSS v4 (テクノロジカル・ミニマリズム)
- **コンポーネント**: Server/Client Component 適切分離

## 🚀 セットアップ & 使用方法

```bash
cd day63_search_engine
npm install
npm run dev
```

**アクセス先:**
- 🔍 **検索エンジン**: http://localhost:3001/
- 🔍 **検索ページ**: http://localhost:3001/search
- ⚙️ **管理画面**: http://localhost:3001/admin
- 📊 **統計情報**: http://localhost:3001/stats

## 📊 現在のデータセット

| カテゴリ  | 文書数  | 代表作品/記事                                |
| --------- | ------- | -------------------------------------------- |
| 青空文庫  | 2件     | 夏目漱石「こころ」、宮沢賢治「銀河鉄道の夜」 |
| Wikipedia | 2件     | 「東京」「人工知能」                         |
| 技術記事  | 2件     | Next.js App Router、データベース設計         |
| **合計**  | **6件** | **1,025ユニーク単語、1,053投稿**             |

## 🔥 検索例

**すぐに試せる検索キーワード:**
- 🤖 `人工知能` → Wikipedia記事がヒット（関連度326.5%）
- 🏙️ `東京` → Wikipedia記事がヒット（関連度291.3%）
- 📚 `夏目漱石` → 青空文庫作品がヒット
- 🚂 `銀河鉄道` → 宮沢賢治作品がヒット
- ⚡ `Next.js` → 技術記事がヒット

## 📁 プロジェクト構成

```
app/
├── api/
│   ├── documents/         # 文書管理API
│   ├── search/           # 検索API (✅実装済み)
│   ├── index/            # インデックス管理API
│   ├── pagerank/         # PageRank管理API
│   └── admin/            # 管理者API
├── search/               # 検索ページ (✅実装済み)
├── admin/                # 管理者ページ (✅実装済み)
├── stats/                # 統計ページ (✅実装済み)
└── components/
    └── SearchHero.tsx    # 検索UIコンポーネント (Client Component)
lib/
├── search-engine.ts      # 検索エンジンコア (✅実装済み)
├── japanese-analyzer.ts  # 日本語分析 (✅実装済み)
├── indexing.ts           # インデックス構築 (✅実装済み)
├── pagerank.ts           # PageRankアルゴリズム (✅実装済み)
└── db.ts                 # データベース管理 (✅実装済み)
```

## 🎯 学習ポイント

1. ✅ **情報検索理論**: TF-IDF、逆文書頻度の実装
2. ✅ **アルゴリズム**: PageRank、転置インデックス
3. ✅ **自然言語処理**: 日本語の特性を考慮した分割・解析
4. ✅ **データ構造**: 効率的なインデックス設計
5. ✅ **パフォーマンス**: 大量データの高速検索実現（13-20ms）
6. ✅ **フロントエンド**: Next.js Server/Client Component 分離

## 📊 検索アルゴリズム詳細

### TF-IDF スコア計算
```typescript
score = TF(term, doc) × IDF(term, corpus)
TF = log(1 + 単語の出現回数) / 文書の総単語数
IDF = log(総文書数 / 単語を含む文書数)
```

### PageRank スコア
```typescript
PR(A) = (1-d) + d × Σ(PR(T)/C(T))
d: ダンピング係数 (0.85)
T: ページAにリンクするページ
C(T): ページTの外部リンク数
```

### 複合スコアリング
```typescript
最終スコア = TF-IDFスコア × 0.8 + PageRankスコア × 0.2
```

## 🧪 API仕様

### 検索API
```bash
GET /api/search?q=検索クエリ&page=1&limit=10&category=カテゴリ

レスポンス例:
{
  "success": true,
  "data": {
    "documents": [...],
    "totalResults": 1,
    "executionTimeMs": 20
  }
}
```

### インデックス再構築API
```bash
POST /api/index/rebuild

レスポンス:
{
  "success": true,
  "statistics": {
    "totalDocuments": 6,
    "totalWords": 1025,
    "totalPostings": 1053
  }
}
```

## 🎨 UI/UX 特徴

- **デザインシステム**: テクノロジカル・ミニマリズム
- **レスポンシブ**: モバイル・デスクトップ対応
- **インタラクション**: ホバー効果・アニメーション
- **アクセシビリティ**: キーボードナビゲーション対応
- **パフォーマンス**: Server/Client Component最適化

## 🚀 本番環境での拡張案

1. **データセット拡張** (100-1000文書)
2. **同義語辞書** (検索精度向上)
3. **機械学習ランキング** (クリックデータ学習)
4. **Elasticsearch統合** (大規模データ対応)
5. **リアルタイム更新** (WebSocket)

---

**🏆 100日チャレンジ Day63 完了！** 
情報検索理論の実装により、検索エンジンの内部動作を深く理解できました。
