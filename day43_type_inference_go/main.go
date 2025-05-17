package main

import (
	"html/template"
	"log"
	"net/http"
)

var templates = template.Must(template.ParseFiles("templates/index.html"))

type PageData struct {
	Code   string
	Result string
}

func main() {
	fs := http.FileServer(http.Dir("static"))
	http.Handle("/static/", http.StripPrefix("/static/", fs))

	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			err := r.ParseForm()
			if err != nil {
				http.Error(w, "Failed to parse form", http.StatusBadRequest)
				return
			}
			code := r.FormValue("code")
			// TODO: Implement actual type inference
			result := "Type inference not implemented yet."

			data := PageData{Code: code, Result: result}
			err = templates.ExecuteTemplate(w, "index.html", data)
			if err != nil {
				log.Printf("Error executing template: %v", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		} else {
			data := PageData{Code: "", Result: ""}
			err := templates.ExecuteTemplate(w, "index.html", data)
			if err != nil {
				log.Printf("Error executing template: %v", err)
				http.Error(w, "Internal Server Error", http.StatusInternalServerError)
			}
		}
	})

	log.Println("Starting server on :3001")
	err := http.ListenAndServe(":3001", nil)
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
