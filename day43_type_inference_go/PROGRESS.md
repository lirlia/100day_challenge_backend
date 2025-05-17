# Day 43: Go言語による型推論エンジン - 進捗

## 作業手順

- [ ] 0. **プロジェクトの仕様決定**
    - [X] ディレクトリレイアウトと作成するファイル一覧定義
    - [ ] 各ファイルは300行以内を目標
    - [ ] 各ステップごとにテスト (Goのユニットテスト) を作成し実施
    - [ ] テスト通過後はステップ名を含むコミット
- [X] 1. **プロジェクト初期化**
    - [X] `template` ディレクトリの内容を `day43_type_inference_go` にコピー
    - [X] `cd day43_type_inference_go` で移動
    - [X] `package.json` を削除
    - [X] `go mod init github.com/lirlia/100day_challenge_backend/day43_type_inference_go` を実行
    - [X] `go get github.com/alecthomas/participle/v2` を実行
    - [X] ディレクトリ構造を作成 (`ast`, `parser`, `types`, `unification`, `inference`, `templates`, `static`)
    - [X] `README.md` に今回のアプリ設計概要を記載
    - [X] `PROGRESS.md` に作業工程を追記・更新
- [ ] 2. **基本HTTPサーバーとUIテンプレート設定**
    - [ ] `main.go`: ルート (`/`) で `templates/index.html` をレンダリングするハンドラと、`/infer` (POST) でリクエストボディからコードを受け取り、結果を `index.html` に渡して再レンダリングするハンドラを実装。
    - [ ] `templates/index.html`: コード入力用 `<textarea name="code">`、送信ボタン、結果表示エリア (`{{ .Result }}`) を持つHTMLを作成。前回入力したコードも表示されるように (`<textarea name="code">{{ .Code }}</textarea>`)。
    - [ ] (任意) `static/style.css`: 基本的なスタイルを追加。`main.go` で `/static/` パスへのリクエストを処理できるようにする (`http.StripPrefix` と `http.FileServer`)。
    - [ ] テスト: サーバーを起動し、ブラウザで `/` にアクセスしてフォームが表示されることを確認。フォーム送信後、入力値と空の結果が表示されることを確認。
- [ ] 3. **AST定義 (`ast/ast.go`)**
    - [ ] MiniLangの各構文要素に対応するGoの構造体を定義。
    - [ ] 各構造体は `participle` のタグを利用してパースルールを指定。
    - [ ] テスト (`ast/ast_test.go`): AST構造体定義の基本的なテスト。
- [ ] 4. **パーサー実装 (`parser/parser.go`)**
    - [ ] `participle.New[MiniLangRootNode]` を使用してパーサーを構築。
    - [ ] `Parse(code string) (*ast.MiniLangRootNode, error)` 関数を実装。
    - [ ] テスト (`parser/parser_test.go`): 各構文要素のパーステスト、エラーケーステスト。
- [ ] 5. **型表現定義 (`types/types.go`)**
    - [ ] `Type` インターフェースと具象型 (`TInt`, `TBool`, `TVar`, `TFunc`)、型スキーム (`TScheme`) を定義。
    - [ ] テスト (`types/types_test.go`): 型表現の文字列表現や型変数生成ロジックのテスト。
- [ ] 6. **単一化アルゴリズム実装 (`unification/unification.go`)**
    - [ ] `Unify(t1 Type, t2 Type) (Substitution, error)` 関数を実装。
    - [ ] 型代入を適用するヘルパー関数を実装。
    - [ ] テスト (`unification/unification_test.go`): 様々な型ペアの単一化テスト、occurs checkテスト。
- [ ] 7. **型推論アルゴリズム実装 (`inference/inference.go`)**
    - [ ] 型環境 `TypeEnvironment` を定義。
    - [ ] `Infer(env TypeEnvironment, expr ast.Expression) (Type, Substitution, error)` 関数 (またはヘルパー群) を実装。
    - [ ] テスト (`inference/inference_test.go`): 各種式の型推論テスト、型エラーケーステスト。
- [ ] 8. **API連携とUI表示 (`main.go`, `templates/index.html`)**
    - [ ] `/infer` ハンドラでパーサーと型推論器を呼び出し、結果をUIに表示。
    - [ ] エラーハンドリング。
- [ ] 9. **デバッグと総合テスト**
    - [ ] ブラウザからの総合的な動作確認。
- [ ] 10. **ドキュメント作成**
    - [X] `README.md` 更新。
    - [ ] `PROGRESS.md` 完了タスクにチェック。
    - [ ] `.cursor/rules/knowledge.mdc` 更新。

以下に進捗を記載してください。


- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
- [ ] 
