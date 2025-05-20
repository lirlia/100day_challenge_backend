package main

import (
	"log"
	"net/http"
)

func main() {
	http.HandleFunc("/api/router", func(w http.ResponseWriter, r *http.Request) {
		log.Printf("MINIMAL SERVER: Method: %s, Path: %s, Headers: %v", r.Method, r.URL.Path, r.Header)
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Origin", "*")
			w.Header().Set("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
			w.WriteHeader(http.StatusOK) // または http.StatusNoContent
			log.Println("MINIMAL SERVER: OPTIONS request processed and CORS headers set.")
			return
		}
		if r.Method == http.MethodPost {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("Access-Control-Allow-Origin", "*") // POSTにも念のため
			w.WriteHeader(http.StatusCreated)
			w.Write([]byte("{\"message\":\"created via minimal server\"}"))
			log.Println("MINIMAL SERVER: POST request processed.")
			return
		}
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		log.Printf("MINIMAL SERVER: Method %s not allowed for /api/router", r.Method)
	})

	log.Println("Minimal test server starting on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil { // 第2引数 nil で DefaultServeMux を使用
		log.Fatalf("Failed to start minimal server: %v", err)
	}
}
