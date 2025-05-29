# Monkey 言語コンパイラ - 作業進捗

## 作業工程

### 1/10: プロジェクト初期化と基本型定義 ✅
- [x] プロジェクトディレクトリ `day51_monkey_compiler_go` 作成
- [x] Go Module 初期化 (`go mod init`)
- [x] 必要なディレクトリ構造作成
- [x] `token/token.go` - Monkey言語のトークン定義
- [x] `ast/ast.go` - AST ノード定義 (簡略版)
- [x] `object/object.go` - VM用オブジェクトシステム定義
- [x] `README.md` - プロジェクト概要ドキュメント作成
- [x] `PROGRESS.md` - この作業進捗ファイル作成

### 2/10: 字句解析器 (Lexer) の実装とテスト ✅
- [x] `lexer/lexer.go` - 字句解析器の実装
- [x] `lexer/lexer_test.go` - 字句解析器のテストケース
- [x] テスト実行と確認
- [x] Git コミット

### 3/10: AST ノードの拡充 ✅
- [x] `ast/ast_test.go` - AST関連のテスト (主にString()メソッドなど)
- [x] テスト実行と確認
- [x] Git コミット

### 4/10: 構文解析器 (Parser) の実装とテスト - 基本部分 ✅
- [x] `parser/parser.go` - パーサー構造体、let文、return文、式文の解析ロジック
- [x] `parser/parser_test.go` - 対応するテストケース
- [x] テスト実行と確認
- [x] Git コミット

### 5/10: 構文解析器 (Parser) の実装とテスト - 式の解析 ✅
- [x] `parser/parser.go` - 前置・中置演算子、真偽値、グループ化された式、if式、puts呼び出しの解析ロジック (ステップ4で統合)
- [x] `parser/parser_test.go` - 対応するテストケース (ステップ4で統合)
- [x] テスト実行と確認
- [x] Git コミット

### 6/10: バイトコード (Opcode) 定義と命令生成
- [ ] `code/code.go` - オペコードの定義、命令フォーマット、Make関数
- [ ] `code/code_test.go` - Make関数のテスト、命令のエンコード・デコードテスト
- [ ] テスト実行と確認
- [ ] Git コミット

### 7/10: コンパイラの実装とテスト - 基本式とシンボルテーブル
- [ ] `compiler/symbol_table.go` - シンボルテーブル (グローバルスコープのみ)
- [ ] `compiler/symbol_table_test.go` - シンボルテーブルのテスト
- [ ] `compiler/compiler.go` - コンパイラ構造体、整数・真偽値リテラル、二項演算子、前置演算子、if式のコンパイル
- [ ] `object/object.go` - バイトコードを保持するオブジェクト追加
- [ ] `compiler/compiler_test.go` - 対応するテストケース
- [ ] テスト実行と確認
- [ ] Git コミット

### 8/10: コンパイラの実装とテスト - 変数束縛と puts
- [ ] `compiler/compiler.go` - let文、識別子参照、puts関数のコンパイル
- [ ] `compiler/compiler_test.go` - 対応するテストケース
- [ ] テスト実行と確認
- [ ] Git コミット

### 9/10: 仮想マシン (VM) の実装とテスト
- [ ] `vm/vm.go` - VM構造体、スタック、Run メソッド、各オペコードの処理
- [ ] `vm/vm_test.go` - VM のテストケース
- [ ] テスト実行と確認
- [ ] Git コミット

### 10/10: REPL の実装と全体統合
- [ ] `repl/repl.go` - REPL の実装 (コンパイラとVMを使用)
- [ ] `main.go` - REPL 起動処理
- [ ] 手動での動作確認
- [ ] README の更新
- [ ] `knowledge.mdc` の更新
- [ ] 最終コミット

## 実装ログ

### 2024年12月22日
- **ステップ 1/10 完了**: プロジェクト初期化と基本型定義
  - プロジェクトの基盤となるディレクトリ構造とファイルを作成
  - トークン、AST、オブジェクトシステムの基本定義が完了
  - 次のステップで字句解析器の実装に進む予定 
