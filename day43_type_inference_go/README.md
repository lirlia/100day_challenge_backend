# Day 43: Go言語による型推論エンジン

このプロジェクトでは、Go言語を使用してHindley-Milner型システムに基づくシンプルな型推論エンジンを実装します。
対象とするのは、基本的な算術演算、論理演算、let束縛、if式、関数定義（ラムダ式）、関数適用を含む小さな関数型言語 (MiniLang) です。

パーサーには `github.com/alecthomas/participle/v2` を利用し、それ以外の型推論のコアロジック（AST定義、型表現、単一化、推論アルゴリズム）はスクラッチで実装します。

Web UIはGoの `html/template` を使用して作成し、ユーザーがMiniLangのコードを入力してその型が推論される過程を確認できるようにします。

## MiniLang 文法概要

- **データ型**: `int`, `bool`
- **リテラル**: 整数 (例: `10`), 真偽値 (`true`, `false`)
- **変数**: (例: `x`, `myVar`)
- **演算**:
    - 算術: `+`, `-`, `*`, `/`
    - 比較: `>`, `<`, `==`
    - 論理: `&&`, `||`
    - 括弧: `()`
- **式**:
    - `let <var> = <expr1> in <expr2>`
    - `if <cond> then <expr_true> else <expr_false>`
    - `fn <param> => <expr_body>`
    - `<func_expr> (<arg_expr>)`
- **コメント**: `#` から行末まで

## 実行方法

```bash
cd day43_type_inference_go
go run main.go
```

その後、ブラウザで `http://localhost:3001` にアクセスしてください。 (ポート番号は仮。`main.go` で指定)

## ディレクトリ構成

```
day43_type_inference_go/
├── go.mod
├── go.sum
├── main.go                 # HTTPサーバー、ルーティング
├── ast/
│   └── ast.go              # ASTノード定義
│   └── ast_test.go
├── parser/
│   └── parser.go           # パーサー実装
│   └── parser_test.go
├── types/
│   └── types.go            # 型表現定義
│   └── types_test.go
├── unification/
│   └── unification.go      # 単一化アルゴリズム
│   └── unification_test.go
├── inference/
│   └── inference.go        # 型推論アルゴリズム
│   └── inference_test.go
├── templates/
│   └── index.html          # UIテンプレート
├── static/
│   └── style.css           # (任意) スタイルシート
├── README.md
└── PROGRESS.md
```
