# Day 43: Go 製 型推論エンジン (Hindley-Milner / Algorithm W)

MiniLang という小さな関数型言語のソースコードに対して、Hindley-Milnerアルゴリズム (具体的には Algorithm W) に基づいて型推論を実行するWebアプリケーションです。
Go言語で型推論の主要なロジック (パーサー、型システム、単一化、推論器) を実装し、フロントエンドもGoの `html/template` を使用して構築しています。

## 概要

MiniLangで記述されたコードを入力すると、その式の型を推論して表示します。
型エラーがある場合は、エラーメッセージを表示します。

UIから直接コードを入力できるほか、いくつかのサンプルコードを選択して簡単に入力エリアに挿入し、型推論を試すことができます。

https://github.com/user-attachments/assets/02fdf306-5e92-4e34-abca-c34c3957339f

[100日チャレンジ day43](https://zenn.dev/gin_nazo/scraps/fbc6986f4a1afe)

## 主な機能

-   **MiniLang パーサー:**
    -   `participle` ライブラリを使用して、MiniLangのコードをAST (Abstract Syntax Tree) に変換します。
    -   対応構文: 整数/真偽値リテラル、変数、算術演算 (`+`, `-`, `*`, `/`)、比較演算 (`>`, `<`, `==`)、論理演算 (`&&`, `||`)、括弧、`let`式、`if`式、`fn` (ラムダ式)、関数適用 (カリー化対応)、コメント (`#`)。
-   **型システム:**
    -   基本的な型 (`int`, `bool`)、型変数 (`'a`, `'b`, ...)、関数型 (`t1 -> t2`) を表現します。
    -   多相性を扱うために型スキーム (`forall a. a -> a` など) をサポートします。
-   **単一化 (Unification):**
    -   2つの型が等価になるように型変数を具体化する代入 (Substitution) を見つけます。
    -   Algorithm Wの中核的なステップです。
-   **型推論 (Algorithm W):**
    -   ASTと現在の型環境 (変数と型のマッピング) を基に、式の型を推論します。
    -   `let`束縛では、式の結果の型を一般化 (generalize) し、型スキームとして環境に保存します。
    -   変数が参照される際には、型スキームをインスタンス化 (instantiate) して具体的な型を得ます。
-   **Web UI:**
    -   Goの標準パッケージ (`net/http`, `html/template`) のみを使用して構築。
    -   2カラムレイアウト:
        -   左カラム: カテゴリ分けされたサンプルコード選択ボタン。
        -   右カラム: コード入力用テキストエリア、型推論実行ボタン、結果表示エリア、エラーメッセージ表示エリア。
    -   レスポンシブデザインを採用し、画面幅に応じてレイアウトが調整されます。

## MiniLang 構文例

-   `123` (型: `int`)
-   `true` (型: `bool`)
-   `1 + 2 * 3` (型: `int`)
-   `if 1 > 0 then true else false` (型: `bool`)
-   `let x = 10 in x + x` (型: `int`)
-   `fn x => x + 1` (型: `int -> int`)
-   `(fn x => x) 100` (型: `int`)
-   `let id = fn x => x in id true` (型: `bool`)
-   `let add = fn x => fn y => x + y in add 5 3` (型: `int`)

## 技術スタック

-   **バックエンド:** Go
    -   Webフレームワーク: `net/http` (標準ライブラリ)
    -   テンプレートエンジン: `html/template` (標準ライブラリ)
    -   パーサージェネレータ: `github.com/alecthomas/participle/v2`
-   **フロントエンド:** HTML, CSS (インラインスタイルとGoテンプレート)
-   **開発ツール:** Go Modules

## 起動方法

1.  リポジトリをクローンします。
2.  `day43_type_inference_go` ディレクトリに移動します。
    ```bash
    cd day43_type_inference_go
    ```
3.  必要なGoパッケージをダウンロードします (初回のみ)。
    ```bash
    go mod tidy
    ```
4.  サーバーを起動します。
    ```bash
    go run main.go
    ```
5.  ブラウザで `http://localhost:3001` を開きます。

## 今後の展望 (オプション)

-   より詳細なエラーメッセージとエラー箇所表示
-   REPL (Read-Eval-Print Loop) インターフェースの追加
-   対応するデータ型や演算子の拡充 (例: リスト、タプル)
-   再帰関数のサポート (`let rec`)
-   より高度なデザイントレンドの適用

---
&copy; 2024 lirlia
