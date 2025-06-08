# Day62 - Rust JIT コンパイラ with Web Dashboard

## 概要

Rustで実装したJITコンパイラと、その動作を可視化するWeb Dashboard のプロジェクです。簡単な式言語をサポートし、ホットスポット検出によるJITコンパイレーション、リアルタイムパフォーマンス監視機能を提供します。

## 🚀 主な機能

### JIT コンパイラ
- **ホットスポット検出**: 同一式を10回以上実行すると自動的にJITコンパイル
- **x86-64 機械語生成**: 高速なネイティブコード実行
- **キャッシュ機構**: 式のハッシュベースキャッシュで重複コンパイル防止
- **パフォーマンス統計**: 実行時間・コンパイル時間の詳細測定

### Web ダッシュボード
- **リアルタイム監視**: 2秒間隔でJIT統計情報を自動更新
- **インタラクティブ実行**: ブラウザから直接式を実行・結果確認
- **統計可視化**: 実行回数、JITコンパイル率、パフォーマンス推移
- **サイバーパンクデザイン**: モダンなグラデーション・アニメーション

### 対応言語機能
```javascript
// 数値リテラル・変数
x = 42
y = x + 10

// 算術・比較演算
result = (x * 2 + y) / 3
condition = x > y

// 条件分岐
value = if(x > 10, x * 2, x + 5)

// 組み込み関数
fibonacci = fib(10)    // フィボナッチ数列
factorial = fact(5)    // 階乗計算
power = pow(2, 8)      // べき乗計算
```

## 🏗️ アーキテクチャ

### システム構成
```
┌─────────────────┐    HTTP API    ┌─────────────────┐
│   Frontend      │◄──────────────►│   Backend       │
│   (Next.js)     │   Port 3002    │   (Rust)        │
│                 │                │   Port 3001     │
└─────────────────┘                └─────────────────┘
│                                  │
├─ Dashboard UI                    ├─ JIT Compiler
├─ Real-time Stats                 ├─ Interpreter  
├─ Interactive Execution           ├─ x86-64 Codegen
└─ Performance Charts              └─ HTTP Server
```

### バックエンド (Rust)
```
src/
├── main.rs              # エントリーポイント
├── lexer/mod.rs         # 字句解析器
├── parser/mod.rs        # 構文解析器  
├── ast/mod.rs           # AST定義
├── interpreter/mod.rs   # インタープリター
├── jit/
│   ├── mod.rs          # JITコンパイラ
│   └── codegen.rs      # x86-64コード生成
└── api/mod.rs          # Web API
```

### フロントエンド (Next.js)
```
app/
├── page.tsx                    # メインダッシュボード
├── components/
│   ├── ExecutionPanel.tsx      # 式実行パネル
│   ├── StatsPanel.tsx          # 統計情報表示
│   ├── PerformanceChart.tsx    # パフォーマンスチャート
│   └── CachePanel.tsx          # キャッシュ情報表示
└── globals.css                 # スタイル定義
```

## 🛠️ セットアップ・実行

### 前提条件
- Rust 1.57+ (x86-64 アーキテクチャ)
- Node.js 18+
- npm または yarn

### 1. バックエンド起動
```bash
cd backend
cargo run server
# → http://localhost:3001 で起動
```

### 2. フロントエンド起動
```bash
cd frontend
npm install
npm run dev
# → http://localhost:3002 で起動
```

### 3. ダッシュボードアクセス
ブラウザで `http://localhost:3002` にアクセス

## 🧪 テスト

### E2Eテスト実行
```bash
cd frontend
npm run test:e2e        # ヘッドレス実行
npm run test:e2e:ui     # UI付き実行
```

### テスト内容
- **ダッシュボード機能**: UI表示、接続状態、実行フロー
- **JIT動作**: コンパイルトリガー、統計更新
- **API統合**: 全エンドポイント動作確認
- **エラーハンドリング**: 無効入力、接続エラー

## 📊 API エンドポイント

### POST /api/execute
式を実行し、結果とJIT情報を返します。
```json
// リクエスト
{
  "code": "x = 42; x * 2 + 10"
}

// レスポンス
{
  "result": 94,
  "execution_time_ns": 1250,
  "was_jit_compiled": true,
  "message": "JIT compiled"
}
```

### GET /api/stats
JIT統計情報を取得します。
```json
{
  "total_executions": 33,
  "jit_compilations": 2,
  "total_execution_time_ns": 45000,
  "average_execution_time_ns": 1363,
  "cache_entries": 5
}
```

### GET /api/cache
JITキャッシュ情報を取得します。
```json
{
  "total_entries": 3,
  "entries": [
    {
      "hash": "0x95689e1a1252fbea",
      "execution_count": 12,
      "is_compiled": true
    }
  ]
}
```

### その他
- `GET /api/health` - ヘルスチェック
- `POST /api/reset` - 統計リセット

## ⚡ パフォーマンス特性

### JIT vs インタープリター
| 実行方式         | 実行時間  | 初期コスト           |
| ---------------- | --------- | -------------------- |
| インタープリター | 2-5μs     | なし                 |
| JIT (初回)       | 2-5μs     | 10-50μs (コンパイル) |
| JIT (2回目以降)  | 100-500ns | なし                 |

### JITコンパイル例
```
🔥 ホットスポット検出: JITコンパイル開始 (実行回数: 10回)
✅ JITコンパイル完了: 34バイトのマシンコード生成 (5041ns)
⚡ JIT実行: 約10倍高速化 (500ns vs 5000ns)
```

## 🔧 技術スタック

### バックエンド
- **言語**: Rust 1.57+
- **HTTP**: 標準ライブラリベース
- **JIT**: x86-64 機械語生成
- **メモリ管理**: mmap実行可能メモリ

### フロントエンド  
- **フレームワーク**: Next.js 15 (App Router)
- **言語**: TypeScript
- **スタイリング**: Tailwind CSS v4
- **グラフ**: Chart.js + react-chartjs-2
- **テスト**: Playwright

## 🚧 今後の拡張可能性

### 言語機能
- [ ] ループ構文 (for, while)
- [ ] 関数定義・クロージャ
- [ ] 配列・構造体
- [ ] 型システム・型推論

### JIT最適化
- [ ] レジスタ割り当て最適化
- [ ] 定数畳み込み・デッドコード除去
- [ ] インライン展開
- [ ] SIMD命令対応

### システム機能
- [ ] 永続化ストレージ
- [ ] マルチユーザー対応
- [ ] 分散実行・クラスタリング
- [ ] WebAssembly対応

## 📝 ライセンス

MIT License

---

**Day62 Challenge**: Rust JIT コンパイラ with Web Dashboard  
**作成日**: 2024年6月8日

## パフォーマンス最適化 (追加)

システムの応答性とメモリ使用量を最適化するため、以下の改善を実装しました：

### フロントエンド最適化

- **ポーリング頻度調整**: 定期更新を2秒→10秒間隔に変更
- **パフォーマンス履歴制限**: 50件→30件に削減してメモリ使用量抑制
- **デバウンス処理**: 連続実行防止（500msクールダウン）
- **メモリリーククリーンアップ**: useEffectでタイマーを適切にクリーンアップ

### バックエンド最適化

- **JITキャッシュサイズ制限**: 最大100エントリまでに制限
- **LRU型キャッシュ管理**: 制限到達時に実行回数最少エントリを自動削除
- **リリースビルド**: `cargo build --release` での最適化

### 効果

- 連続実行時のレスポンス遅延を大幅に改善
- メモリ使用量の安定化
- JITキャッシュの効率的な管理
