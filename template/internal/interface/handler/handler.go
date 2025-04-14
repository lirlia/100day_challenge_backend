package handler

import (
	"net/http"
)

type Handler struct {
	mux *http.ServeMux
}

func NewHandler() *Handler {
	h := &Handler{
		mux: http.NewServeMux(),
	}

	// ルーティングの設定
	h.mux.HandleFunc("/", h.handleRoot)

	return h
}

func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h.mux.ServeHTTP(w, r)
}

func (h *Handler) handleRoot(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/" {
		http.NotFound(w, r)
		return
	}

	w.Write([]byte("Hello, World!"))
}