# Day67: CRDT (Conflict-free Replicated Data Types) システム

## 🎯 プロジェクト概要

**CRDT (Conflict-free Replicated Data Types)** を実装し、分散システムでの無競合データレプリケーションを体験できるインタラクティブなシステムです。Google Docs、Figma、Notionなどの協調編集で使われている核心技術を学習できます。

## 🏗️ 実装するCRDTタイプ

### 基本CRDTデータ型
1. **G-Counter** (Grow-only Counter) - 増加専用カウンター
2. **PN-Counter** (Positive-Negative Counter) - 増減可能カウンター
3. **G-Set** (Grow-only Set) - 追加専用セット
4. **OR-Set** (Observed-Remove Set) - 追加・削除可能セット
5. **LWW-Register** (Last-Write-Wins Register) - 最後書き込み勝利レジスタ
6. **RGA** (Replicated Growable Array) - 文字列・配列操作用
7. **AWORMap** (Add-Wins Observed-Remove Map) - キー・バリューマップ

## 🎮 デモアプリケーション

1. **協調テキストエディタ** - リアルタイム文書編集 (RGA使用)
2. **共有カウンターダッシュボード** - 分散カウンター集計 (G-Counter, PN-Counter使用)
3. **協調TODOリスト** - チーム作業管理 (OR-Set使用)
4. **分散投票システム** - リアルタイム投票・集計 (AWORMap使用)
5. **共有設定管理** - 分散設定同期 (LWW-Register使用)

## 🌐 システム機能

- **マルチノードシミュレーション** (3-5個のレプリカノード)
- **ネットワーク分断シミュレーション** (パーティション耐性テスト)
- **遅延・パケットロスシミュレーション**
- **操作履歴とマージプロセス可視化**
- **ベクタークロック・因果関係表示**
- **リアルタイム同期状況モニタリング**

## 📚 学習ポイント

- **無競合レプリケーション**: 分散環境でのデータ整合性保証
- **収束性 (Convergence)**: 異なる操作順序でも同じ最終状態
- **可換性 (Commutativity)**: 操作順序に依存しない結果
- **冪等性 (Idempotency)**: 同じ操作の重複適用
- **ベクタークロック**: 因果関係の追跡
- **分散システム理論**: CAP定理、結果整合性

## 🎨 デザイン

**サイバーパンク・テクノロジカル**
- ネオンアクセント (#00ff88, #ff0088, #0088ff)
- 暗い背景 (#0a0a0f, #1a1a2e)
- ノード間接続の動的可視化
- データフロー・マージプロセスのアニメーション
- グリッド・回路パターン

## 🚀 セットアップ & 起動

```bash
# 依存パッケージインストール
npm install

# 開発サーバー起動 (localhost:3001)
npm run dev

# データベース初期化
# db/dev.db は起動時に自動生成されます
```

## 📁 ディレクトリ構成

```
day67_crdt_system/
├── app/
│   ├── api/
│   │   ├── crdt/           # CRDT操作API
│   │   ├── nodes/          # ノード管理API
│   │   └── sync/           # 同期API
│   ├── components/         # UIコンポーネント
│   │   ├── crdt/          # CRDT操作UI
│   │   ├── network/       # ネットワーク可視化
│   │   └── demos/         # デモアプリ
│   ├── demos/             # 各デモページ
│   │   ├── counter/       # カウンターデモ
│   │   ├── text-editor/   # テキストエディタデモ
│   │   ├── todo/          # TODOリストデモ
│   │   ├── voting/        # 投票システムデモ
│   │   └── settings/      # 設定管理デモ
│   └── lib/
│       ├── crdt/          # CRDTコアライブラリ
│       ├── network/       # ネットワークシミュレーター
│       └── utils/         # ユーティリティ
├── lib/
│   ├── db.ts              # データベース設定
│   └── types.ts           # 型定義
└── db/
    └── dev.db             # SQLite データベース
```

## 🧪 テスト方法

1. **基本CRDT操作テスト** - 各データ型の操作・マージ
2. **ネットワーク分断テスト** - パーティション耐性確認
3. **収束性テスト** - 異なる操作順序での結果一致
4. **パフォーマンステスト** - 大量操作時の性能
5. **協調編集テスト** - 複数ユーザー同時操作

## 📖 参考文献

- [CRDTs: Consistency without consensus](https://hal.inria.fr/inria-00609399v1/document)
- [A comprehensive study of Convergent and Commutative Replicated Data Types](https://hal.inria.fr/inria-00555588/document)
- [Conflict-Free Replicated Data Types (Wikipedia)](https://en.wikipedia.org/wiki/Conflict-free_replicated_data_type)

## 🔧 使用技術

- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **データベース**: SQLite + better-sqlite3
- **スタイリング**: Tailwind CSS v4
- **状態管理**: Zustand
- **可視化**: Custom Canvas + CSS Animations
- **リアルタイム**: Server-Sent Events (SSE)
