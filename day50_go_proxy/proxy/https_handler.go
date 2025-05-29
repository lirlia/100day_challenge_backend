package proxy

import (
	"bufio"
	"bytes"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"strings"
//	"sync" // 未使用のためコメントアウト
	"time"

	"github.com/lirlia/100day_challenge_backend/day50_go_proxy/config"
)

// HandleHTTPS はCONNECTメソッドによるHTTPSリクエストを処理し、MITMプロキシとして動作します。
func HandleHTTPS(w http.ResponseWriter, r *http.Request, certManager *CertManager, cacheConfig *config.CacheConfig) {
	log.Printf("[HTTPS-MITM] Received CONNECT request for: %s from %s", r.Host, r.RemoteAddr)

	hijacker, ok := w.(http.Hijacker)
	if !ok {
		log.Printf("[HTTPS-MITM] Hijacking not supported for %s", r.Host)
		http.Error(w, "Hijacking not supported", http.StatusInternalServerError)
		return
	}

	// 200 Connection established をクライアントに送信
	// ハイジャックする前にヘッダーを書き込む必要がある
	// しかし、w.WriteHeader(http.StatusOK) を呼ぶと、その後の Hijack() が
	// "http: response.Write on hijacked connection" というエラーになる場合があるため、
	// 直接コネクションに書き込むアプローチを取る。
	rawClientConn, _, err := hijacker.Hijack()
	if err != nil {
		log.Printf("[HTTPS-MITM] Hijack error for %s: %v", r.Host, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rawClientConn.Close()

	_, err = rawClientConn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))
	if err != nil {
		log.Printf("[HTTPS-MITM] Error writing 200 OK to client for %s: %v", r.Host, err)
		return
	}
	log.Printf("[HTTPS-MITM] Sent 200 OK to client for %s", r.Host)

	// クライアントとの接続をTLSでラップ
	tlsConfig := &tls.Config{
		GetCertificate: certManager.GetCertificate, // CertManagerを使用
		NextProtos:     []string{"http/1.1"},      // ALPN
	}

	tlsClientConn := tls.Server(rawClientConn, tlsConfig)
	defer tlsClientConn.Close()

	err = tlsClientConn.Handshake()
	if err != nil {
		log.Printf("[HTTPS-MITM] TLS handshake error with client for host %s: %v", r.Host, err)
		// SNIがない場合などに certManager.GetCertificate がエラーを返すことがある
		if strings.Contains(err.Error(), "SNI (Server Name Indication) がクライアントから提供されていません") {
			log.Printf("[HTTPS-MITM] TLS Handshake failed due to missing SNI from client: %s", r.RemoteAddr)
		}
		return
	}
	log.Printf("[HTTPS-MITM] TLS handshake with client successful for %s", r.Host)

	// クライアントからのリクエストを読み込む (TLS接続上)
	// bufio.NewReader を使って、コネクションから直接リクエストを読み取る
	clientReqReader := bufio.NewReader(tlsClientConn)
	clientHTTPReq, err := http.ReadRequest(clientReqReader)
	if err != nil {
		if err == io.EOF || err == io.ErrUnexpectedEOF {
			log.Printf("[HTTPS-MITM] Client %s closed connection before sending request for %s: %v", r.RemoteAddr, r.Host, err)
		} else {
			log.Printf("[HTTPS-MITM] Error reading request from client %s for %s: %v", r.RemoteAddr, r.Host, err)
		}
		return
	}
	defer clientHTTPReq.Body.Close() // 重要: リクエストボディをクローズする

	// リクエスト情報をログに出力
	log.Printf("[HTTPS-MITM] Received from client (%s): %s %s%s",
		r.RemoteAddr, clientHTTPReq.Method, clientHTTPReq.Host, clientHTTPReq.URL.String())

	// オリジンサーバーへのリクエストを準備
	// clientHTTPReq.URL は通常パスのみ (/foo/bar) なので、スキームとホストを付与する
	// clientHTTPReq.Host は CONNECT で指定されたものを使うのが基本
	// ただし、HTTP/1.1ではHostヘッダが優先される
	originHost := clientHTTPReq.Host
	if originHost == "" {
		originHost = r.Host // CONNECT時のターゲットホスト
	}

	// URLを再構築
	clientHTTPReq.URL.Scheme = "https"
	clientHTTPReq.URL.Host = originHost

	// プロキシとしてのヘッダーを削除または修正
	RemoveHopByHopHeaders(clientHTTPReq.Header)
	// X-Forwarded-For ヘッダーを追加または更新
	UpdateXForwardedForHeader(clientHTTPReq, r.RemoteAddr)

	// キャッシュキーを生成
	cacheKey := GenerateRequestKey(clientHTTPReq)
	log.Printf("[HTTPS-MITM Cache] Cache key for %s %s: %s", clientHTTPReq.Method, clientHTTPReq.URL.String(), cacheKey)

	// キャッシュからレスポンスを取得試行
	if cacheConfig.Enabled {
		cachedItem, found, err := RetrieveResponseFromCache(cacheKey, clientHTTPReq, cacheConfig)
		if err != nil {
			log.Printf("[HTTPS-MITM Cache] Error retrieving from cache for %s: %v", cacheKey, err)
		} else if found {
			if IsCacheFresh(cachedItem, clientHTTPReq, cacheConfig) {
				log.Printf("[HTTPS-MITM Cache] HIT and FRESH for %s. Serving from cache.", cacheKey)
				cachedResp, readErr := http.ReadResponse(bufio.NewReader(bytes.NewReader(cachedItem.ResponseBody)), clientHTTPReq)
				if readErr != nil {
					log.Printf("[HTTPS-MITM Cache] Error reading cached response for %s: %v", cacheKey, readErr)
				} else {
					defer cachedResp.Body.Close()
					// キャッシュから取り出したレスポンスのホップバイホップヘッダーを削除
					RemoveHopByHopHeaders(cachedResp.Header)
					// レスポンスヘッダーにキャッシュヒット情報を追加 (デバッグ用)
					cachedResp.Header.Set("X-Proxy-Cache", "HIT")
					cachedResp.Header.Set("X-Cache-Key", cacheKey)
					if !cachedItem.ExpiresAt.IsZero() { // ExpiresAt が設定されていればそれを使う
						cachedResp.Header.Set("Expires", cachedItem.ExpiresAt.Format(time.RFC1123))
					}
					// キャッシュされたレスポンスをクライアントに送信
					err = cachedResp.Write(tlsClientConn)
					if err != nil {
						log.Printf("[HTTPS-MITM Cache] Error writing cached response to client for %s: %v", cacheKey, err)
					}
					return // キャッシュから提供したので終了
				}
			} else {
				log.Printf("[HTTPS-MITM Cache] STALE for key: %s. Fetching from origin.", cacheKey)
				// TODO: 条件付きGETの実装
			}
		}
	} else {
		log.Printf("[HTTPS-MITM Cache] Cache disabled.")
	}

	// キャッシュミスまたはキャッシュ無効の場合、オリジンサーバーにリクエスト
	log.Printf("[HTTPS-MITM Origin] Requesting from origin: %s %s", clientHTTPReq.Method, clientHTTPReq.URL.String())

	// オリジンサーバーへのトランスポート設定
	// ここではデフォルトのトランスポートを使用するが、必要に応じてカスタマイズ可能
	// (例: TLS設定、タイムアウトなど)
	transport := &http.Transport{
		// Proxy: http.ProxyFromEnvironment, // もしこのプロキシがさらに別のプロキシを経由する場合
		DialContext: (&net.Dialer{
			Timeout:   15 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout: 10 * time.Second,
		// (重要) オリジンが自己署名証明書などを使っている場合、テスト用にInsecureSkipVerifyをtrueにすることもできるが、本番では非推奨
		// TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
	}

	// リクエストをオリジンに送信
	originResp, err := transport.RoundTrip(clientHTTPReq)
	if err != nil {
		log.Printf("[HTTPS-MITM Origin] Error forwarding request to origin %s: %v", clientHTTPReq.URL.Host, err)
		// エラーレスポンスをクライアントに返す (例: 502 Bad Gateway)
		errResp := &http.Response{
			StatusCode: http.StatusBadGateway,
			ProtoMajor: 1,
			ProtoMinor: 1,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(fmt.Sprintf("Proxy error: could not connect to origin server %s. Error: %v", clientHTTPReq.URL.Host, err))),
			Request:    clientHTTPReq,
		}
		errResp.Header.Set("Content-Type", "text/plain; charset=utf-8")
		errResp.Header.Set("X-Proxy-Error", "Origin connection failed")
		writeErr := errResp.Write(tlsClientConn)
		if writeErr != nil {
			log.Printf("[HTTPS-MITM Origin] Error writing error response to client: %v", writeErr)
		}
		return
	}
	defer originResp.Body.Close()

	log.Printf("[HTTPS-MITM Origin] Received response from origin %s: %s", clientHTTPReq.URL.Host, originResp.Status)

	// レスポンスヘッダーにキャッシュ情報を追加 (デバッグ用)
	originResp.Header.Set("X-Proxy-Cache", "MISS")
	originResp.Header.Set("X-Cache-Key", cacheKey)

	// レスポンスをキャッシュに保存 (もし可能なら)
	if cacheConfig.Enabled && CanCacheResponse(originResp, clientHTTPReq, cacheConfig) {
		log.Printf("[HTTPS-MITM Cache] Caching response for %s", cacheKey)
		respBytes, dumpErr := httputil.DumpResponse(originResp, true)
		if dumpErr != nil {
			log.Printf("[HTTPS-MITM Cache] Error dumping response for caching %s: %v", cacheKey, dumpErr)
		} else {
			clonedResp, readErr := http.ReadResponse(bufio.NewReader(bytes.NewReader(respBytes)), clientHTTPReq)
			if readErr != nil {
				log.Printf("[HTTPS-MITM Cache] Error re-reading dumped response for %s: %v", cacheKey, readErr)
			} else {
				go func(key string, respToCache *http.Response, reqForCache *http.Request, cfg *config.CacheConfig, fullRespBytesToStore []byte) {
					defer respToCache.Body.Close()
					storeErr := StoreResponseInCache(key, respToCache, reqForCache, cfg, fullRespBytesToStore)
					if storeErr != nil {
						log.Printf("[HTTPS-MITM Cache] Error storing response for %s in cache: %v", key, storeErr)
					} else {
						log.Printf("[HTTPS-MITM Cache] Successfully stored response for %s in cache.", key)
					}
				}(cacheKey, clonedResp, clientHTTPReq, cacheConfig, respBytes)
			}
		}
	}

	// オリジンからのレスポンスをクライアントに送信
	err = originResp.Write(tlsClientConn)
	if err != nil {
		log.Printf("[HTTPS-MITM Origin] Error writing origin response to client for %s: %v", cacheKey, err)
	}
	log.Printf("[HTTPS-MITM] Completed request for %s %s%s", clientHTTPReq.Method, clientHTTPReq.Host, clientHTTPReq.URL.String())
}
