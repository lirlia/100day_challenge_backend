# Day 20 - SQL Parser & Validator (Go)

Go言語でSQLクエリ（主にSELECT文のサブセット）をパースし、AST（抽象構文木）を生成し、基本的なスキーマ定義に基づいてバリデーションを行うシンプルなツールです。
バリデーションはリアルタイムで行われ、Web UI上で結果を確認できます。

https://github.com/user-attachments/assets/3555b690-dc55-4d7b-981e-18c6821abf99

[100日チャレンジ day20](https://zenn.dev/gin_nazo/scraps/47f9e612a3609b)

## 主な機能

- **SQL パース:** `SELECT`, `FROM`, `WHERE`, `ORDER BY`, `LIMIT` 句を含む単純なSELECT文を解析。
- **AST 生成:** パース結果をGoの構造体で表現した抽象構文木に変換。
- **スキーマ定義:** Goのコード内にサンプルスキーマ（users, products, orders テーブル）を定義。
- **バリデーション:** ASTを走査し、以下の基本的な検証を実施。
    - テーブル、カラムの存在確認。
    - 演算子の型チェック（算術演算、比較演算、論理演算）。
    - `ORDER BY` や `LIMIT` 句の値の型チェック。
- **Web UI:** SQL入力用のテキストエリアと、リアルタイムでバリデーション結果（成功/失敗、エラー内容）を表示するエリアを提供。
- **API:** Web UIからのリクエストを受け付け、バリデーション結果をJSONで返すAPIエンドポイント (`/validate`)。

## 技術スタック

- 言語: Go
- Webフレームワーク: Go 標準の `net/http` パッケージ
- テンプレートエンジン: Go 標準の `html/template` パッケージ
- フロントエンド: HTML, CSS, JavaScript (`fetch` API)

## 構造

- `lexer/`: 字句解析器（SQL文字列をトークンに分割）
- `token/`: トークンの種類を定義
- `ast/`: 抽象構文木のノード型を定義
- `parser/`: 構文解析器（トークン列からASTを構築）
- `schema/`: データベーススキーマの定義と操作
- `validator/`: ASTを検証（意味解析）
- `main.go`: Webサーバー、APIハンドラー
- `template.html`: Web UIのHTMLテンプレート

## 開始方法

1. **Go環境のセットアップ:** Go言語 (1.20以降推奨) をインストールしてください。
2. **リポジトリのクローン:** (必要であれば)
3. **ディレクトリ移動:**
   ```bash
   cd day20_sql_parser
   ```
4. **サーバーの起動:**
   ```bash
   go run main.go
   ```
   コンソールに `Starting SQL Validator server on http://localhost:8080` と表示されます。
5. **ブラウザでアクセス:**
   [http://localhost:8080](http://localhost:8080) を開きます。
6. **SQL入力:**
   テキストエリアにSQL文を入力すると、入力後少し待つとバリデーション結果が下に表示されます。

## サンプルスキーマ

以下のテーブルが利用可能です。

- `users` (id INTEGER, name TEXT, email TEXT, is_active BOOLEAN)
- `products` (id INTEGER, name TEXT, price INTEGER)
- `orders` (id INTEGER, user_id INTEGER, product_id INTEGER, quantity INTEGER, total_amount INTEGER, status TEXT)

## 既知の問題/制限事項

- パーサー/バリデーターが対応しているSQL構文は非常に限定的です（JOIN, サブクエリ, 集計関数(COUNT以外), INSERT/UPDATE/DELETEなどは未対応）。
- エラー報告が完璧でない場合があります（例：演算子の優先順位の問題が残っている可能性）。
- スキーマはハードコードされており、外部DBとの連携はありません。
- FLOAT型の扱いは簡略化されています。
