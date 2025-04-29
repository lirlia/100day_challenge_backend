package main

import (
	"fmt"
	"html/template"
	"log"
	"net/http"

	"github.com/your_username/day20_sql_parser/lexer"
	"github.com/your_username/day20_sql_parser/parser"
	"github.com/your_username/day20_sql_parser/schema"
	"github.com/your_username/day20_sql_parser/validator"
)

var tmpl *template.Template
var sampleSchema *schema.Schema

// init は main より先に実行され、テンプレートとスキーマを初期化します。
func init() {
	// アプリケーション起動時にテンプレートを一度だけパース
	tmpl = template.Must(template.ParseFiles("template.html"))
	// サンプルスキーマを初期化
	sampleSchema = schema.SampleSchema()
}

// ValidationResult はテンプレートに渡すデータ構造です。
type ValidationResult struct {
	SQL       string
	IsValid   bool
	Errors    []string // バリデーションエラー
	ParseErrs []string // パースエラー
}

// handleSQLValidate は / へのHTTPリクエストを処理します。
func handleSQLValidate(w http.ResponseWriter, r *http.Request) {
	result := ValidationResult{SQL: ""} // デフォルトは空のSQL

	if r.Method == http.MethodPost {
		err := r.ParseForm()
		if err != nil {
			http.Error(w, "Failed to parse form", http.StatusBadRequest)
			return
		}
		sql := r.FormValue("sql")
		result.SQL = sql // 入力されたSQLを結果にセット

		// --- SQL 検証プロセス --- //

		// 1. Lexing
		l := lexer.New(sql)

		// 2. Parsing
		p := parser.New(l)
		program := p.ParseProgram()
		parseErrs := p.Errors()
		result.ParseErrs = parseErrs

		// 3. Validation (パースが成功した場合のみ)
		if len(parseErrs) == 0 && program != nil {
			v := validator.NewValidator(sampleSchema)
			validationErrs := v.Validate(program)

			if len(validationErrs) == 0 {
				result.IsValid = true
			} else {
				result.IsValid = false
				for _, vErr := range validationErrs {
					result.Errors = append(result.Errors, vErr.Error())
				}
			}
		} else {
			// パースエラーがある場合はバリデーションは行わない (IsValid は false のまま)
			result.IsValid = false
            if len(parseErrs) > 0 {
                 // パースエラーメッセージは result.ParseErrs にセット済み
            } else {
                 // プログラムが nil だがパースエラーがない場合 (通常はないはずだが念のため)
                 result.ParseErrs = append(result.ParseErrs, "Parsing failed without specific errors.")
            }
		}
	}

	// --- テンプレートを描画 --- //
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	err := tmpl.Execute(w, result)
	if err != nil {
		log.Printf("Error executing template: %v", err)
		// エラー発生時も、最低限のエラーメッセージを返す
		http.Error(w, fmt.Sprintf("Internal Server Error: %v", err), http.StatusInternalServerError)
	}
}

// main はアプリケーションのエントリーポイントです。
func main() {
	// ハンドラ関数をルートパスに登録
	http.HandleFunc("/", handleSQLValidate)

	// サーバーをポート 8080 で起動
	port := "8080"
	fmt.Printf("Starting SQL Validator server on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
