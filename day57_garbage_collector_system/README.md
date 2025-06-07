# Day57 - ガベージコレクタ実装システム (Frontend-only)

## 概要

ブラウザ内で動作する**ガベージコレクタ実装システム**です。
Mark-and-Sweep、Generational GC、Tri-color markingを完全にフロントエンドで実装し、
リアルタイム可視化によってメモリ管理の深い理解を提供します。

https://github.com/user-attachments/assets/5e32c7f2-5900-4da8-a155-c67d46bfea99

[100日チャレンジ day57](https://zenn.dev/gin_nazo/scraps/cbeb0dcde1c3b6)

## 🎯 学習目標

- **Mark-and-Sweep アルゴリズム**の実装と動作理解
- **Generational GC**（世代別）の概念と実装  
- **Tri-color marking**による並行GCの基礎
- **メモリ管理**の低レベル制御とヒープ構造
- **GCパフォーマンス**測定と最適化手法
- **オブジェクト参照グラフ**の管理と解析

## 🏗️ アーキテクチャ

### ✅ 実装済み機能

#### **ガベージコレクタエンジン**
- **カスタムヒープ管理** - Young/Old世代の分離管理
- **Mark-and-Sweep GC** - 完全なGCアルゴリズム実装
- **Tri-color marking** - Gray/Black/Whiteマーキング
- **オブジェクトプロモーション** - 条件付き世代間移動
- **Root Set管理** - GCルートオブジェクトの動的管理

#### **リアルタイム可視化**
- **統計ダッシュボード** - メモリ使用量、GC実行回数、効率性
- **世代別メモリ状況** - Young/Old世代の詳細情報
- **メモリ使用量チャート** - 時系列グラフ + 分布円グラフ
- **最近作成オブジェクト一覧** - ID、サイズ、世代情報
- **リアルタイムログ** - GC実行ログとイベント

#### **インタラクティブ操作**
- **オブジェクト割り当て** - 個別 + 一括作成
- **GC手動実行** - Young世代、Full GC
- **デバッグ機能** - Root Set管理、デバッグ情報表示
- **強制Mark-and-Sweep** - 全世代対象の強制GC

## 🔧 技術スタック

- **フレームワーク**: Next.js 15 (App Router) - フロントエンド専用
- **言語**: TypeScript - 型安全なGC実装
- **スタイリング**: Tailwind CSS v4 (テクノロジカル・ミニマリズム)
- **視覚化**: Chart.js + react-chartjs-2
- **リアルタイム更新**: setInterval による定期統計更新
- **状態管理**: React Hooks + useRef によるGCインスタンス管理

## 🚀 セットアップ

```bash
# 依存関係のインストール
npm install

# 開発サーバー起動
npm run dev
```

サーバーは http://localhost:3002 で起動します。

## 🎨 デザインコンセプト

**テクノロジカル・ミニマリズム**
- **ダークテーマ** - 目に優しい暗い背景
- **ネオングリーン** - システム状態の直感的な視覚化
- **グリッドレイアウト** - 整理された情報配置
- **グロー効果** - 重要な要素のハイライト
- **リアルタイムアニメーション** - 生きたシステムの表現

## 📊 GCアルゴリズム詳細

### Mark-and-Sweep実装
```typescript
// マーキングフェーズ
async markPhase(generations) {
  // Root Setから開始
  for (rootId of this.heap.getRootSet()) {
    await this.markObject(rootId, generations);
  }
  
  // Tri-color marking
  while (this.grayObjects.size > 0) {
    const objectId = this.grayObjects.next();
    // 参照先をマーキング
    for (refId of object.refs) {
      await this.markObject(refId, generations);
    }
    this.blackObjects.add(objectId);
  }
}

// スイープフェーズ
async sweepPhase(generations) {
  for (generation of generations) {
    // マークされていないオブジェクトを削除
    for ([id, object] of generation.objects) {
      if (!object.header.marked) {
        generation.removeObject(id);
      }
    }
  }
}
```

### Generational GC
- **Young世代**: 新しく作成されたオブジェクト
- **Old世代**: 複数回のGCを生き残ったオブジェクト
- **プロモーション**: 条件付き世代間移動（年齢 + 確率）

## 🧪 操作方法

### 基本操作
1. **Allocate Object** - ランダムサイズのオブジェクトを作成
2. **Create 10 Objects** - 一括でオブジェクトを作成
3. **Trigger Young GC** - Young世代のGCを実行
4. **Trigger Full GC** - 全世代のGCを実行

### デバッグ機能
5. **Clear Root Objects** - すべてのルートオブジェクトをクリア
6. **Force Mark-and-Sweep** - 強制的にフル GC実行
7. **Show Debug Info** - 詳細なデバッグ情報を表示

### GCの効果を確認する手順
```bash
1. Create 10 Objects を数回クリック
2. Show Debug Info でRoot Objects数を確認
3. Clear Root Objects でルートをクリア
4. Force Mark-and-Sweep でGC実行
5. 統計を確認してオブジェクト数の変化を観察
```

## 📈 学習ポイント

### 実装で学べること
- **メモリ管理の基礎** - ヒープ、スタック、参照の概念
- **GCアルゴリズム** - Mark-and-Sweep、Generational の動作原理
- **並行処理** - Tri-color marking による並行GC
- **パフォーマンス最適化** - GC効率、メモリ使用量の最適化
- **データ構造** - オブジェクトグラフ、参照関係の管理

### 実際のGCシステムとの関連
- **V8 (Chrome)**: Generational GC + Mark-Sweep + Scavenge
- **HotSpot (Java)**: G1GC、ZGC、Shenandoah
- **Go GC**: Tri-color concurrent mark-and-sweep
- **.NET**: Generational GC with compaction

## 🔍 実装詳細

### ファイル構成
```
lib/
├── gc-types.ts          # 型定義と設定
├── heap.ts              # ヒープ管理 + HeapGeneration
├── garbage-collector.ts # メインGCエンジン
└── (削除済み)
    ├── db.ts            # データベース (不要)
    └── api/             # APIルート (不要)
```

### 主要クラス
- **GarbageCollector**: メインGCエンジン
- **Heap**: ヒープ管理とRoot Set
- **HeapGeneration**: 世代別メモリ管理
- **GCObject**: オブジェクト構造（header + data）

---

**Day57: フロントエンドで学ぶガベージコレクション** 🗑️⚡

完全にブラウザ内で動作するガベージコレクタの実装により、
低レベルシステムプログラミングの理解を深めることができます。

---
© 2025 Day57 Garbage Collector System Implementation  
Created: 2025年6月7日
