# Day 41: ブラウザセキュリティ・プレイグラウンド

このアプリケーションは、主要なブラウザセキュリティ機能（CSP, CORS, HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy, Permissions-Policy）の動作をインタラクティブに学習・体験するためのプレイグラウンドです。

## アプリケーション概要

ユーザーは各セキュリティ機能のデモページにアクセスし、そこで提示されるUIを通じてHTTPヘッダーの設定値を変更できます。
設定を適用するとページがリロードされ、Next.js Middleware を介して実際のHTTPレスポンスヘッダーが書き換えられます。
これにより、各セキュリティ機能がブラウザの挙動（リソース読み込み、スクリプト実行、外部APIアクセス、iframe埋め込み、リファラ送信、機能アクセスなど）にどのような影響を与えるかを体験的に学習できます。
ルートページでは、現在Cookieに保存されている全セキュリティ設定の概要を確認したり、全ての設定をクリアしたりできます。

**デザインテーマ:** モダンで教育的。グラスモーフィズムを部分的に採用し、設定パネルや情報表示を視覚的に分かりやすく表現します。

## 対象とするセキュリティ機能とデモ概要

1.  **Content Security Policy (CSP):**
    *   信頼できるコンテンツソースを定義しXSS等を緩和。デモではCSP文字列を直接編集し、インラインスクリプトの実行や画像読み込みがポリシーに従うかを確認。
2.  **Cross-Origin Resource Sharing (CORS):**
    *   異なるオリジン間でのリソース共有制御。デモでは外部APIへのリクエスト試行を通じて、`middleware.ts` でのCORS関連ヘッダー (例: `Access-Control-Allow-Origin`) 設定の効果を確認。
3.  **HTTP Strict Transport Security (HSTS):**
    *   HTTPS接続を強制。デモではHSTSヘッダーの各ディレクティブを設定し、レスポンスヘッダーへの反映を確認。ローカルHTTP環境での完全な動作再現は限定的であるため解説も重視。
4.  **X-Content-Type-Options:**
    *   `nosniff`によるMIMEスニッフィング抑止。デモでは`nosniff`の有無で、サーバーが意図的に誤ったContent-Typeで返すリソース（例:画像として送信されたHTML）のブラウザ解釈がどう変わるかを確認。
5.  **X-Frame-Options:**
    *   クリックジャッキング対策としてiframe埋め込みを制御。デモでは`DENY`, `SAMEORIGIN`を設定し、ページ自身のiframe埋め込みがブロックされるかを確認。(CSP `frame-ancestors` との関連も解説)
6.  **Referrer-Policy:**
    *   リファラ情報の送信ポリシー制御。デモでは各種ポリシーを設定し、専用APIエンドポイントへの遷移時に実際に送信される`Referer`ヘッダーの内容を確認。
7.  **Permissions-Policy (Feature-Policy):**
    *   ブラウザ機能へのアクセス制御。デモではポリシー文字列を編集し、Geolocation, Camera, Microphoneなどの機能へのアクセスが許可/拒否されるかをJavaScript APIを通じて確認。

## 主要機能

-   各セキュリティデモページでの専用UIによるヘッダー設定変更機能。
-   設定変更はAPI経由でCookieに保存され、Next.js Middlewareによってレスポンスヘッダーに適用。
-   各デモページでの具体的なテストシナリオと、期待される動作の解説。
-   `SecurityHeaderController` コンポーネントによる、現在の適用ヘッダー値（Cookieから取得）の表示と、個別または全設定のクリア機能。

## 使用技術スタック

-   フレームワーク: Next.js (App Router)
-   言語: TypeScript
-   スタイリング: Tailwind CSS (グラスモーフィズムを一部採用)
-   API実装: Next.js Route Handlers
-   ヘッダー制御: Next.js Middleware, Cookies
-   パッケージ管理: npm
-   コード品質: Biome (Lint & Format)

## 開始方法

1.  **依存パッケージをインストール**
    ```bash
    npm install
    ```

2.  **開発サーバーを起動**
    ```bash
    npm run dev -- -p 3001
    ```
    ブラウザで [http://localhost:3001](http://localhost:3001) を開くとアプリケーションが表示されます。

## ディレクトリ構成

```
/day41_browser_security_playground/
├── app/
│   ├── api/
│   │   ├── demos/                     # 各デモ用の補助APIエンドポイント
│   │   │   ├── referrer-policy/
│   │   │   │   └── inspect-referrer/route.ts
│   │   │   └── x-content-type-options/
│   │   │       ├── image-as-html/route.ts
│   │   │       └── text-as-script/route.ts
│   │   └── set-security-headers/      # セキュリティヘッダ設定用API
│   │       └── route.ts
│   ├── (demos)/                     # 各セキュリティ機能のデモページ群
│   │   ├── csp/page.tsx
│   │   ├── cors/page.tsx
│   │   ├── hsts/page.tsx
│   │   ├── x-content-type-options/page.tsx
│   │   ├── x-frame-options/page.tsx
│   │   ├── referrer-policy/page.tsx
│   │   └── permissions-policy/page.tsx
│   ├── _components/                 # プレイグラウンド共通UIコンポーネント
│   │   └── SecurityHeaderController.tsx
│   ├── layout.tsx
│   ├── globals.css
│   └── page.tsx                     # メインページ（各デモへのナビゲーション）
├── middleware.ts                    # HTTPヘッダー書き換え用ミドルウェア
├── public/
├── next.config.mjs
├── package.json
├── postcss.config.mjs
├── tailwind.config.ts
├── tsconfig.json
└── README.md
```

## 実装済みステップ

1.  **プロジェクト初期化**
2.  **基本レイアウトとナビゲーション作成**
3.  **セキュリティヘッダー制御APIの実装 (`app/api/set-security-headers/route.ts`)**
4.  **Next.js Middleware の作成 (`middleware.ts`) でのヘッダー適用**
5.  **各セキュリティ機能のデモページと設定UIの実装**
    -   CSPデモページと設定UI、テストエリア
    -   CORSデモページと外部APIリクエストテスト
    -   HSTSデモページと設定UI、解説
    -   X-Content-Type-Optionsデモページと設定UI、MIMEスニッフィングテスト用API及び表示エリア
    -   X-Frame-Optionsデモページと設定UI、iframe埋め込みテストエリア
    -   Referrer-Policyデモページと設定UI、リファラ検査API及び表示エリア
    -   Permissions-Policyデモページと設定UI、権限テストエリア
6.  **テストと調整 (基本的な動作確認)**
7.  **ドキュメント最終化 (このREADMEの更新)**
