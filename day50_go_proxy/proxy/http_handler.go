package proxy

import (
	"bufio"
	"bytes"
	"io"
	"log"
	"net/http"
	"net/http/httputil"
	"time"

	"github.com/lirlia/100day_challenge_backend/day50_go_proxy/config"
)

// HandleHTTP は通常のHTTPリクエストを処理します。
func HandleHTTP(w http.ResponseWriter, r *http.Request, cacheCfg *config.CacheConfig) {
	log.Printf("[HTTP] Received request for: %s %s%s from %s", r.Method, r.Host, r.URL.Path, r.RemoteAddr)

	requestKey := GenerateRequestKey(r)

	if cacheCfg.Enabled && r.Method == http.MethodGet { // GETリクエストのみキャッシュ対象
		log.Printf("[HTTP Cache] Checking cache for key: %s", requestKey)
		cachedItem, found, err := RetrieveResponseFromCache(requestKey, r, cacheCfg)

		if err != nil {
			log.Printf("[HTTP Cache] Error retrieving cache for key %s: %v. Fetching from origin.", requestKey, err)
		} else if found {
			if IsCacheFresh(cachedItem, r, cacheCfg) {
				log.Printf("[HTTP Cache] HIT and FRESH for %s. Serving from cache.", requestKey)
				cachedResp, readErr := http.ReadResponse(bufio.NewReader(bytes.NewReader(cachedItem.ResponseBody)), r)
				if readErr != nil {
					log.Printf("[HTTP Cache] Error reading cached response for %s: %v. Fetching from origin.", requestKey, readErr)
				} else {
					defer cachedResp.Body.Close()
					RemoveHopByHopHeaders(cachedResp.Header)
					CopyHeaders(w.Header(), cachedResp.Header)
					w.Header().Set("X-Proxy-Cache", "HIT")
					w.Header().Set("X-Cache-Key", requestKey)
					w.WriteHeader(cachedResp.StatusCode)
					written, copyErr := io.Copy(w, cachedResp.Body)
					if copyErr != nil {
						log.Printf("[HTTP Cache] Error copying cached response body to client for %s: %v", requestKey, copyErr)
					}
					log.Printf("[HTTP Cache] Copied %d bytes from cached response to client for %s", written, requestKey)
					return
				}
			} else {
				log.Printf("[HTTP Cache] STALE for key: %s. Fetching from origin.", requestKey)
				// TODO: 条件付きGETリクエストの実装 (If-None-Match, If-Modified-Since)
			}
		} else {
			log.Printf("[HTTP Cache] MISS for key: %s. Fetching from origin.", requestKey)
		}
	}

	// --- ここから下はオリジンサーバーへのアクセス ---
	log.Printf("[HTTP Origin] Preparing request to origin for %s %s%s", r.Method, r.Host, r.URL.Path)

	r.RequestURI = ""
	originalHost := r.Host
	RemoveHopByHopHeaders(r.Header)
	UpdateXForwardedForHeader(r, r.RemoteAddr)

	client := &http.Client{
		Timeout: 30 * time.Second,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	if r.URL.Scheme == "" {
		r.URL.Scheme = "http"
	}
	if r.URL.Host == "" {
		r.URL.Host = originalHost
	}

	reqToOrigin, err := http.NewRequest(r.Method, r.URL.String(), r.Body)
	if err != nil {
		log.Printf("[HTTP Origin] Error creating new request: %v", err)
		http.Error(w, "Error creating request to origin", http.StatusInternalServerError)
		return
	}
	reqToOrigin.Header = r.Header.Clone()

	respFromOrigin, err := client.Do(reqToOrigin)
	if err != nil {
		log.Printf("[HTTP Origin] Error forwarding request to %s: %v", r.URL.String(), err)
		http.Error(w, "Error forwarding request to origin server", http.StatusBadGateway)
		return
	}
	defer respFromOrigin.Body.Close()

	log.Printf("[HTTP Origin] Received response from %s: %d %s", r.URL.String(), respFromOrigin.StatusCode, respFromOrigin.Status)

	bodyBytes, err := io.ReadAll(respFromOrigin.Body)
	if err != nil {
		log.Printf("[HTTP Origin] Error reading response body from origin for %s: %v", r.URL.String(), err)
		RemoveHopByHopHeaders(respFromOrigin.Header)
		CopyHeaders(w.Header(), respFromOrigin.Header)
		w.WriteHeader(respFromOrigin.StatusCode)
		return
	}
	respFromOrigin.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

	if cacheCfg.Enabled && CanCacheResponse(respFromOrigin, reqToOrigin, cacheCfg) {
		log.Printf("[HTTP Cache] Attempting to cache response for %s (key: %s)", reqToOrigin.URL.String(), requestKey)
		dumpedRespBytes, dumpErr := httputil.DumpResponse(respFromOrigin, true)
		if dumpErr != nil {
			log.Printf("[HTTP Cache] Error dumping response for key %s: %v", requestKey, dumpErr)
		} else {
			go func(key string, respToStore *http.Response, reqToStore *http.Request, cfg *config.CacheConfig, fullBytesToStore []byte) {
				storeErr := StoreResponseInCache(key, respToStore, reqToStore, cfg, fullBytesToStore)
				if storeErr != nil {
					log.Printf("[HTTP Cache] Error storing response for key %s in cache: %v", key, storeErr)
				} else {
					log.Printf("[HTTP Cache] Successfully stored response for key %s in cache.", key)
				}
			}(requestKey, respFromOrigin, reqToOrigin, cacheCfg, dumpedRespBytes)
		}
	}

	RemoveHopByHopHeaders(respFromOrigin.Header)
	CopyHeaders(w.Header(), respFromOrigin.Header)
	w.Header().Set("X-Proxy-Cache", "MISS")
	w.Header().Set("X-Cache-Key", requestKey)
	w.WriteHeader(respFromOrigin.StatusCode)

	written, err := io.Copy(w, respFromOrigin.Body)
	if err != nil {
		log.Printf("[HTTP Origin] Error copying response body to client for %s: %v", r.URL.String(), err)
	}
	log.Printf("[HTTP Origin] Copied %d bytes to client for %s", written, r.URL.String())
}
