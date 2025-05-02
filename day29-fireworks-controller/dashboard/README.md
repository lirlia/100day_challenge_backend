# Day 29: Fireworks Dashboard (within Controller Project)

Kubernetes カスタムコントローラー (Fireworks Controller) によって管理される `FireworksShow` カスタムリソースと、それによって生成される Pod の状態をリアルタイムに表示するダッシュボードです。

**Note:** このダッシュボードは `day29-fireworks-controller` プロジェクトのサブディレクトリとして配置されています。

## 主な機能

- 現在クラスタに存在する `FireworksShow` リソースの一覧表示
- 各 `FireworksShow` の詳細 (Spec, Status)
- 選択した `FireworksShow` に関連付けられた Pod の一覧と状態 (Phase) をリアルタイム更新
- Pod のログ表示 (オプション)

## 技術スタック

- Next.js (App Router)
- TypeScript
- Tailwind CSS
- @kubernetes/client-node (Kubernetes API クライアント)
- Server-Sent Events (SSE) または WebSocket (リアルタイム更新用)

## アプリケーション概要

*ここに、この日に作成するアプリケーションの簡単な説明を記述します。*

## 機能一覧

*ここに、実装した機能の一覧を記述します。*

- 機能1
- 機能2
- ...

## ER図

*ここに、Mermaid 形式で ER 図を記述します。*

```mermaid
erDiagram
    // 例: User モデル
    User {
        int id PK
        string name
        datetime createdAt
        datetime updatedAt
    }
```

## シーケンス図 (オプション)

*必要であれば、主要な処理フローのシーケンス図を Mermaid 形式で記述します。*

```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant API
    participant Database

    User->>Frontend: 操作
    Frontend->>API: リクエスト
    API->>Database: データ操作
    Database-->>API: 結果
    API-->>Frontend: レスポンス
    Frontend-->>User: 表示更新
```

## データモデル

*ここに、主要なデータモデルの概要を記述します。*

- モデル1: 説明
- モデル2: 説明
- ...

## 画面構成

*ここに、作成する主要な画面とその概要を記述します。*

- 画面1: 説明
- 画面2: 説明
- ...

## 使用技術スタック (テンプレート標準)

- フレームワーク: Next.js (App Router)
- 言語: TypeScript
- DB: SQLite
- ORM: Prisma
- API実装: Next.js Route Handlers
- スタイリング: Tailwind CSS
- パッケージ管理: npm
- コード品質: Biome (Lint & Format)

## 開始方法

1. **依存パッケージをインストール**
   ```bash
   npm install
   ```

2. **データベースの準備**
   ```bash
   # 初回またはスキーマ変更時
   npm run db:seed
   ```

3. **開発サーバーを起動**
   ```bash
   npm run dev
   ```
   ブラウザで [http://localhost:3001](http://localhost:3001) を開くと結果が表示されます。

## 注意事項

- このテンプレートはローカル開発環境を主眼としています。
- 本番デプロイには追加の考慮が必要です。
- エラーハンドリングやセキュリティは簡略化されています。
