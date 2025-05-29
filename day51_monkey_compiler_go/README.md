# Day51 - Monkey 言語コンパイラ & VM (Go)

**これは [Thorsten Ball の "Writing A Compiler In Go"](https://compilerbook.com/) に触発された、教育目的のプロジェクトです。**

## 概要

Go言語を使用してMonkeyプログラミング言語のコンパイラとスタックベースの仮想マシン(VM)を実装するプロジェクトです。
オリジナルのMonkey言語からいくつかの機能を簡略化し、コンパイラとVMの基本的な仕組みを学ぶことに焦点を当てています。

## 主な学習ポイント

- プログラミング言語のコンパイラとVMの内部構造
- 字句解析、構文解析の基礎
- 抽象構文木 (AST) の構築
- バイトコードの設計と生成
- スタックベースの仮想マシンの実装
- Go によるデータ構造とアルゴリズムの実装

## 機能要件 (実装済)

- **リテラル:** 整数、真偽値 (`true`, `false`), `null`
- **演算子:**
    - 算術演算: `+`, `-`, `*`, `/`
    - 比較演算: `<`, `>`, `==`, `!=`
    - 論理演算 (前置): `!`
- **変数束縛:** `let` 文 (グローバルスコープのみ)
- **制御フロー:** `if`/`else` 式 (値は返しますが、主に分岐として使用)
- **組み込み関数:** `puts(...)` (引数を標準出力に出力し、`null` を返します)
- **REPL:** インタラクティブな実行環境

## アーキテクチャ

```
Monkey ソースコード (文字列)
      ↓
    Lexer (lexer/lexer.go)
      ↓
    Token 列 (token/token.go)
      ↓
    Parser (parser/parser.go)
      ↓
    AST (ast/ast.go)
      ↓
   Compiler (compiler/compiler.go, compiler/symbol_table.go)
      ↓
   Bytecode (code/code.go, object/object.go の一部)
      ↓
     VM (vm/vm.go)
      ↓
    実行結果 (object/object.go)
```

## ディレクトリ構成

- `main.go`: プログラムのエントリポイント、REPLの起動
- `token/`: トークンの定義 (`token.go`)
- `lexer/`: 字句解析器 (`lexer.go`, `lexer_test.go`)
- `ast/`: 抽象構文木の定義 (`ast.go`, `ast_test.go`)
- `parser/`: 構文解析器 (`parser.go`, `parser_test.go`)
- `code/`: バイトコードのオペコード定義とヘルパー関数 (`code.go`, `code_test.go`)
- `compiler/`: コンパイラ (`compiler.go`, `compiler_test.go`) とシンボルテーブル (`symbol_table.go`, `symbol_table_test.go`)
- `object/`: VMが扱うオブジェクトシステム (`object.go`)
- `vm/`: 仮想マシン (`vm.go`, `vm_test.go`)
- `repl/`: REPLの実装 (`repl.go`)
- `PROGRESS.md`: 詳細な実装ステップと進捗
- `README.md`: このファイル

## 使用方法

### 1. ビルド

プロジェクトのルートディレクトリ (`day51_monkey_compiler_go`) で以下のコマンドを実行してコンパイラをビルドします。
実行ファイル名 `monkeyc` (またはお好みの名前) で生成されます。

```bash
cd day51_monkey_compiler_go
go build -o monkeyc .
```

### 2. REPL (Read-Eval-Print Loop) の起動

ビルドした実行ファイルを引数なしで実行すると、REPLが起動します。

```bash
./monkeyc
```

REPL が起動すると、プロンプト `>>` が表示されます。Monkeyのコードを入力して Enter キーを押すと、コンパイル・実行され結果が表示されます。

**REPLの例:**

```
>> let a = 5;
5
>> let b = 10;
10
>> puts(a + b);
15
>> if (a > b) { puts("a is greater"); } else { puts("b is greater or equal"); }
b is greater or equal
```

### 3. (オプション) ファイルからの実行

現在の `main.go` はファイル実行を直接サポートしていませんが、将来的に拡張する可能性があります。
現時点では、REPL経由での実行が主な方法です。

## 技術仕様

- **言語:** Go (Go Modules を使用)
- **テスト:** Go 標準の `testing` パッケージ
- **VM アーキテクチャ:** スタックベース
- **バイトコード:** カスタム設計
- **対象Monkey言語:** 書籍「Writing A Compiler In Go」のMonkey言語から、関数定義、クロージャ、文字列、配列、ハッシュなどの高度な機能を除いた簡略版。

---
&copy; 2025 lirlia. Inspired by "Writing A Compiler In Go" by Thorsten Ball.
