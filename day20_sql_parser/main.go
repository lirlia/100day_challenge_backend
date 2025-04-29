package main

import (
	"encoding/json"
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

// ValidationRequest は /validate エンドポイントへのリクエストボディです。
type ValidationRequest struct {
	SQL string `json:"sql"`
}

// ValidationResponse は /validate エンドポイントからのレスポンスです。
// ValidationResult から SQL フィールドを除いたもの + エラーメッセージ
type ValidationResponse struct {
	IsValid   bool     `json:"isValid"`
	Errors    []string `json:"errors,omitempty"`    // バリデーションエラー
	ParseErrs []string `json:"parseErrors,omitempty"` // パースエラー
	Message   string   `json:"message,omitempty"` // 汎用メッセージ (例: サーバーエラー)
}

// handleIndex は / へのGETリクエストを処理し、HTMLページを表示します。
func handleIndex(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}
	// 初期表示用の空のデータを渡す
	data := struct{ SQL string }{ SQL: "" }
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	err := tmpl.Execute(w, data)
	if err != nil {
		log.Printf("Error executing template: %v", err)
		http.Error(w, "Internal Server Error", http.StatusInternalServerError)
	}
}

// handleValidate は /validate へのPOSTリクエストを処理し、JSONレスポンスを返します。
func handleValidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method Not Allowed", http.StatusMethodNotAllowed)
		return
	}

	// リクエストボディをデコード
	var req ValidationRequest
	decoder := json.NewDecoder(r.Body)
	err := decoder.Decode(&req)
	if err != nil {
		log.Printf("Error decoding request body: %v", err)
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	sql := req.SQL
	response := ValidationResponse{}

	// --- SQL 検証プロセス --- //
	// 1. Lexing
	l := lexer.New(sql)

	// 2. Parsing
	p := parser.New(l)
	program := p.ParseProgram()
	parseErrs := p.Errors()
	response.ParseErrs = parseErrs

	// 3. Validation (パースが成功した場合のみ)
	if len(parseErrs) == 0 && program != nil {
		v := validator.NewValidator(sampleSchema)
		validationErrs := v.Validate(program)

		if len(validationErrs) == 0 {
			response.IsValid = true
		} else {
			response.IsValid = false
			for _, vErr := range validationErrs {
				response.Errors = append(response.Errors, vErr.Error())
			}
		}
	} else {
		response.IsValid = false
		// パースエラーは response.ParseErrs にセット済み
		if len(parseErrs) == 0 {
			response.ParseErrs = append(response.ParseErrs, "Parsing failed without specific errors.")
		}
	}

	// --- JSONレスポンスを返す --- //
	w.Header().Set("Content-Type", "application/json")
	err = json.NewEncoder(w).Encode(response)
	if err != nil {
		log.Printf("Error encoding response: %v", err)
		// クライアントにはエラーを返さない (ログには残す)
	}
}

// main はアプリケーションのエントリーポイントです。
func main() {
	// ハンドラ関数をルートパスと検証パスに登録
	http.HandleFunc("/", handleIndex)
	http.HandleFunc("/validate", handleValidate)

	// サーバーをポート 8080 で起動
	port := "8080"
	fmt.Printf("Starting SQL Validator server on http://localhost:%s\n", port)
	log.Fatal(http.ListenAndServe(":"+port, nil))
}
