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

type PageData struct {
	Code     string
	Result   string
	ErrorMsg string
}

func main() {
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		data := PageData{Code: "", Result: "", ErrorMsg: ""}

		if r.Method == http.MethodPost {
			err := r.ParseForm()
			if err != nil {
				data.ErrorMsg = fmt.Sprintf("Failed to parse form: %v", err)
				// Try to render template even on form parse error to show the message
				renderTemplate(w, data)
				return
			}
			code := r.FormValue("code")
			data.Code = code

			if code == "" {
				data.ErrorMsg = "Please enter MiniLang code."
			} else {
				// 1. Parse the code
				// Assuming program.Expression is the entry point for inference for now.
				// If program itself is an ast.Expression, that would be simpler.
				// For now, we need to handle program.Expression possibly being nil if parsing yields an empty but valid AST.
				programAst, parseErr := parser.Parse(code)
				if parseErr != nil {
					data.ErrorMsg = fmt.Sprintf("Parse Error: %v", parseErr)
				} else if programAst == nil || programAst.Expression == nil {
					// This case might occur if the input is empty or only comments,
					// and the parser returns a non-nil program with a nil Expression.
					// Or if parsing was successful but resulted in no actual expression to infer.
					data.ErrorMsg = "No expression found to infer type from. Input might be empty or comments only."
				} else {
					// 2. Perform type inference
					types.ResetTypeVarCounter()    // Reset for fresh type variables
					env := inference.BaseTypeEnv() // Get a base environment

					// programAst.Expression is *ast.TopLevelExpression, which implements ast.Expression
					inferredType, _, inferErr := inference.Infer(env, programAst.Expression)

					if inferErr != nil {
						data.ErrorMsg = fmt.Sprintf("Type Error: %v", inferErr)
					} else if inferredType == nil {
						// This shouldn't happen if inferErr is nil, but as a safeguard.
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
		// If template execution fails, we might have already written to the response,
		// so sending another http.Error might not work or might corrupt the response.
		// This is a common issue with Go's http handlers.
		// For simplicity, we log and don't try to send another error to the client here.
	}
}
