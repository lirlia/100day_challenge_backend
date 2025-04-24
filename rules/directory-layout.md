## ディレクトリ構成

Next.js App Router の標準的な構成をベースに、シンプルさを保ちます。

```plaintext
/
├── app/                  # App Router ディレクトリ (ルーティングとUIの中心)
│   ├── api/              # API Route Handlers (バックエンドAPI)
│   │   └── [entity]/     # 例: /api/users
│   │       └── route.ts  # 各HTTPメソッド(GET, POST, PUT, DELETE)に対応する処理
│   ├── (pages)/          # UIページ (ルート以外、例: /dashboard)
│   │   └── [page_name]/  # 例: /users
│   │       ├── page.tsx    # ページのUI (Server/Client Component)
│   │       └── components/ # そのページ固有のUIコンポーネント
│   ├── _actions/         # Server Actions (サーバーサイド専用ロジック)
│   ├── _lib/             # サーバーサイド専用のヘルパー関数やビジネスロジックなど
│   ├── layout.tsx        # 全体の共通レイアウト
│   ├── globals.css       # グローバルCSS
│   └── page.tsx          # ルート('/')のページ
├── components/           # アプリケーション全体で共有するUIコンポーネント (クライアント中心)
│   └── ui/               # (オプション) shadcn/ui などのベースコンポーネント置き場
├── prisma/               # Prisma関連ファイル
│   ├── schema.prisma     # DBスキーマ定義、データモデル定義
│   ├── migrations/       # Prisma Migrateによって自動生成されるマイグレーション履歴
│   └── dev.db            # SQLite データベースファイル (開発用)
├── lib/                  # クライアント/サーバー共通で使う可能性のあるモジュール
│   ├── db.ts             # Prisma Client インスタンス生成・管理
│   ├── utils.ts          # 共通ユーティリティ関数
│   └── types/            # 共通の型定義
├── public/               # 静的ファイル (画像など)
├── .env                  # 環境変数 (DATABASE_URLなど、.gitignore対象)
├── .gitignore            # Git の無視ファイルリスト
├── next.config.mjs       # Next.js の設定ファイル
├── package.json          # プロジェクト情報、依存パッケージ、npm scripts
├── postcss.config.mjs    # PostCSS 設定 (Tailwind CSS用)
├── tailwind.config.ts    # Tailwind CSS 設定
├── tsconfig.json         # TypeScript の設定ファイル
└── README.md             # プロジェクトの説明
```

### 主要ディレクトリ/ファイルの説明

- `app/`: ルーティング、UI、APIエンドポイント、サーバーサイドロジックを配置します。
  - `app/api/`: バックエンドAPIのロジックを記述します。
  - `app/(pages)/`: ルート('/')以外のフロントエンドページコンポーネントを配置します。ディレクトリ名がURLパスになります (例: `app/(pages)/dashboard/page.tsx` は `/dashboard`)。
  - `app/page.tsx`: ルート('/')に対応するページコンポーネント。
  - `app/_actions/`: Server Actions など、主にサーバーサイドで実行されるアクションを配置します。`_` プレフィックスによりルーティング対象外。
  - `app/_lib/`: サーバーサイド固有のヘルパー関数やビジネスロジックなどを配置します。`_` プレフィックスによりルーティング対象外。
- `components/`: アプリケーション全体で共有されるUIコンポーネント (主にクライアントコンポーネント) を配置します。
- `prisma/`: データベース関連のファイルを管理します。
  - `schema.prisma`: データベースのテーブル構造（モデル）やリレーションを定義します。
  - `migrations/`: `prisma migrate` によって生成されたSQLファイルが格納され、データベーススキーマの変更履歴を管理します。
  - `dev.db`: SQLite のデータベースファイル本体です（開発環境用）。
- `lib/`: アプリケーション全体で使用する共通関数や設定、Prisma Client のインスタンスなどを配置します。
- `public/`: 画像ファイルなど、ビルドプロセスを経ずにそのまま配信される静的ファイルを配置します。
