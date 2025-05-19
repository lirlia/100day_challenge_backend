package main

import (
	"fmt"
	"html/template"
	"log"
	"net/http"

	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/inference"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/parser"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/types"
)

var templates = template.Must(template.ParseFiles("templates/index.html"))

// SampleCode holds a name and the corresponding MiniLang code for UI examples.
// We need to use template.HTML for Code if it contains newlines or special HTML characters
// to prevent them from being escaped by html/template. However, since this code
// will be inserted into a textarea, it's better to pass it as a plain string
// and handle newlines with JavaScript (e.g., using backticks for template literals in JS).
// For simplicity here, we'll assume JavaScript will handle it or use simple examples without newlines in `Code`.
// Or, ensure that the textarea correctly interprets Go's `\n` if passed directly.
// Let's use plain strings for now and ensure JS handles newlines if they are present.

type SampleCode struct {
	Name     string
	Code     string
	Category string
}

type PageData struct {
	Code        string
	Result      string
	ErrorMsg    string
	SampleCodes []SampleCode
}

var sampleCodes = []SampleCode{
	{Name: "整数", Code: "123", Category: "基本"},
	{Name: "True", Code: "true", Category: "基本"},
	{Name: "False", Code: "false", Category: "基本"},
	{Name: "算術演算", Code: "1 + 2 * 3", Category: "基本"},
	{Name: "比較演算", Code: "(1 + 2) > 2", Category: "基本"},
	{Name: "論理演算", Code: "true && (false || true)", Category: "基本"},
	{Name: "コメント", Code: "# This is a comment only\n# Another comment", Category: "基本"},

	{Name: "if (数値)", Code: "if 1 > 0 then 10 else 20", Category: "制御構文"},
	{Name: "if (真偽値)", Code: "if true then false else true", Category: "制御構文"},

	{Name: "let (単純)", Code: "let x = 10 in x + 5", Category: "Let式"},
	{Name: "let (id関数)", Code: "let id = fn x => x in id 10", Category: "Let式"},
	{Name: "let (id true)", Code: "let id = fn x => x in id true", Category: "Let式"},
	{Name: "let (id id)", Code: "let id = fn x => x in id id", Category: "Let式"},

	{Name: "ラムダ (id)", Code: "fn x => x", Category: "関数"},
	{Name: "ラムダ (const)", Code: "fn x => 100", Category: "関数"},
	{Name: "適用 (id)", Code: "(fn x => x) 123", Category: "関数"},
	{Name: "適用 (カリー化)", Code: "let add = fn x => fn y => x + y in add 5 3", Category: "関数"},

	{Name: "エラー (算術)", Code: "1 + true", Category: "型エラー例"},
	{Name: "エラー (if条件)", Code: "if 1 then 10 else 20", Category: "型エラー例"},
	{Name: "エラー (if分岐)", Code: "if true then 10 else false", Category: "型エラー例"},
	{Name: "エラー (適用)", Code: "(fn x => x + 1) true", Category: "型エラー例"},
}

func main() {
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Initialize PageData with empty code, result, error and the sample codes list
		data := PageData{
			Code:        "",
			Result:      "",
			ErrorMsg:    "",
			SampleCodes: sampleCodes, // Pass the global sampleCodes slice
		}

		if r.Method == http.MethodPost {
			err := r.ParseForm()
			if err != nil {
				data.ErrorMsg = fmt.Sprintf("Failed to parse form: %v", err)
				renderTemplate(w, data)
				return
			}
			code := r.FormValue("code")
			data.Code = code // Keep the submitted code in the textarea

			if code == "" {
				data.ErrorMsg = "Please enter MiniLang code."
			} else {
				programAst, parseErr := parser.Parse(code)
				if parseErr != nil {
					data.ErrorMsg = fmt.Sprintf("Parse Error: %v", parseErr)
				} else if programAst == nil || programAst.Expression == nil {
					// This specifically handles cases like comments-only or empty input
					// that parse correctly but don't yield an inferable expression.
					data.Result = "(no type - empty or comment-only input)"
				} else {
					types.ResetTypeVarCounter()
					env := inference.BaseTypeEnv()
					inferredType, _, inferErr := inference.Infer(env, programAst.Expression)

					if inferErr != nil {
						data.ErrorMsg = fmt.Sprintf("Type Error: %v", inferErr)
					} else if inferredType == nil {
						data.ErrorMsg = "Inference resulted in a nil type without an error."
					} else {
						data.Result = inferredType.String()
					}
				}
			}
		}
		renderTemplate(w, data)
	})

	log.Println("Starting server on :3001")
	err := http.ListenAndServe(":3001", nil)
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}

func renderTemplate(w http.ResponseWriter, data PageData) {
	err := templates.ExecuteTemplate(w, "index.html", data)
	if err != nil {
		log.Printf("Error executing template: %v", err)
	}
}
