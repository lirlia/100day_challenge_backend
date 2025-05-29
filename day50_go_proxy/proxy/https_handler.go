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

// HandleHTTPS はクライアントからの CONNECT リクエストを処理し、指定されたホストとの間で
// Man-in-the-Middle (MITM) プロキシとして動作します。
// この関数は、クライアントが特定のホストとの新しいHTTPSセッションを開始しようとするたびに呼び出されます。
func HandleHTTPS(w http.ResponseWriter, r *http.Request, certManager *CertManager, cacheConfig *config.CacheConfig) {
	// r.Host には、クライアントが接続しようとしているターゲットホスト名（例: "example.com:443"）が含まれます。
	// r.RemoteAddr はクライアントのIPアドレスとポートです。
	log.Printf("[HTTPS-MITM] Received CONNECT request for: %s from %s", r.Host, r.RemoteAddr)

	// STEP 1: HTTPコネクションのハイジャック
	// Hijackerインターフェースを取得して、HTTPサーバーの管理下からTCPコネクションの直接制御を奪います。
	// これにより、プロキシは生のTCPストリームを直接操作できるようになります。
	hijacker, ok := w.(http.Hijacker)
	if !ok {
		log.Printf("[HTTPS-MITM] Hijacking not supported for %s", r.Host)
		http.Error(w, "Hijacking not supported", http.StatusInternalServerError)
		return
	}

	// クライアントに対して "200 Connection Established" を送信します。
	// これにより、クライアントはプロキシとの間でTCPトンネルが確立されたと認識します。
	// この後、クライアントはこのトンネル上でTLSハンドシェイクを開始します。
	// w.WriteHeader(http.StatusOK) を使わずに直接コネクションに書き込むのは、
	// ハイジャック後の書き込みに関する潜在的な問題を避けるためです。
	rawClientConn, _, err := hijacker.Hijack() // ここで生のTCPコネクション (net.Conn) を取得
	if err != nil {
		log.Printf("[HTTPS-MITM] Hijack error for %s: %v", r.Host, err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rawClientConn.Close() // 関数終了時にこの生のTCPコネクションをクローズ

	_, err = rawClientConn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))
	if err != nil {
		log.Printf("[HTTPS-MITM] Error writing 200 OK to client for %s: %v", r.Host, err)
		return
	}
	log.Printf("[HTTPS-MITM] Sent 200 OK to client for %s", r.Host)

	// STEP 2: プロキシとクライアント間でのTLSハンドシェイク
	// プロキシは、クライアントが接続しようとしているオリジンサーバーになりすまします。
	// CertManager を使用して、リクエストされたホスト名 (SNIから取得) に基づいて
	// 動的にサーバー証明書を生成（またはキャッシュから取得）し、CA証明書で署名します。
	tlsConfig := &tls.Config{
		GetCertificate: certManager.GetCertificate, // ホスト名に基づいて証明書を動的に提供
		NextProtos:     []string{"http/1.1"},      // ALPN (Application-Layer Protocol Negotiation) で HTTP/1.1 を使用することを示す
	}

	// ハイジャックした生のTCPコネクションを、TLSサーバーサイドのコネクションとしてラップします。
	// これにより、このコネクション上での通信がTLSで暗号化・復号されるようになります。
	tlsClientConn := tls.Server(rawClientConn, tlsConfig)
	defer tlsClientConn.Close() // 関数終了時にTLSコネクションをクローズ

	// クライアントとのTLSハンドシェイクを実行します。
	// これが成功すると、クライアントとプロキシ間で暗号化されたTLSセッションが確立されます。
	err = tlsClientConn.Handshake()
	if err != nil {
		log.Printf("[HTTPS-MITM] TLS handshake error with client for host %s: %v", r.Host, err)
		if strings.Contains(err.Error(), "SNI (Server Name Indication) がクライアントから提供されていません") {
			log.Printf("[HTTPS-MITM] TLS Handshake failed due to missing SNI from client: %s", r.RemoteAddr)
		}
		return
	}
	log.Printf("[HTTPS-MITM] TLS handshake with client successful for %s", r.Host)

	// STEP 3: 暗号化されたTLSセッション上でのHTTPリクエストの読み取り
	// クライアントは、プロキシとのTLSセッションが確立された後（クライアントはオリジンサーバーと通信しているつもり）、
	// 本来のHTTPリクエスト（GET, POSTなど）を送信します。
	// このリクエストはTLSで暗号化されているため、tlsClientConnから読み取る必要があります。
	clientReqReader := bufio.NewReader(tlsClientConn) // TLSコネクションから読み取るためのリーダー
	clientHTTPReq, err := http.ReadRequest(clientReqReader) // TLSペイロードからHTTPリクエストをパース
	if err != nil {
		if err == io.EOF || err == io.ErrUnexpectedEOF { // クライアントがリクエスト送信前に接続を閉じた場合
			log.Printf("[HTTPS-MITM] Client %s closed connection before sending request for %s: %v", r.RemoteAddr, r.Host, err)
		} else {
			log.Printf("[HTTPS-MITM] Error reading request from client %s for %s: %v", r.RemoteAddr, r.Host, err)
		}
		return
	}
	// リクエストボディは必ずクローズします。後続の処理で必要に応じて再利用されることがあります。
	// 特に RoundTrip に渡す場合などは、クローズされていないと問題が起きることがあります。
	defer clientHTTPReq.Body.Close()

	log.Printf("[HTTPS-MITM] Received from client (%s): %s %s%s",
		r.RemoteAddr, clientHTTPReq.Method, clientHTTPReq.Host, clientHTTPReq.URL.String())

	// STEP 4: オリジンサーバーへのリクエスト準備
	// クライアントから読み取ったHTTPリクエストを、オリジンサーバーへ転送する準備をします。
	// clientHTTPReq.URL は通常、パスのみ (例: "/path/to/resource") になっています。
	// これにスキーム ("https") とホスト名 (CONNECTリクエストで指定されたもの) を付加して完全なURLを再構築します。
	originHost := clientHTTPReq.Host // HTTP/1.1ではHostヘッダが優先される
	if originHost == "" {
		originHost = r.Host // CONNECTリクエスト時のターゲットホスト (r.URL.Host ではない)
	}

	clientHTTPReq.URL.Scheme = "https"
	clientHTTPReq.URL.Host = originHost

	// プロキシとして動作するために不要なホップバイホップヘッダーを削除します。
	RemoveHopByHopHeaders(clientHTTPReq.Header)
	// X-Forwarded-For ヘッダーを追加または更新して、クライアントのIPアドレスをオリジンサーバーに伝えます。
	UpdateXForwardedForHeader(clientHTTPReq, r.RemoteAddr)

	// STEP 5: キャッシュ処理 (キャッシュが有効な場合)
	cacheKey := GenerateRequestKey(clientHTTPReq) // リクエストに基づいてキャッシュキーを生成
	log.Printf("[HTTPS-MITM Cache] Cache key for %s %s: %s", clientHTTPReq.Method, clientHTTPReq.URL.String(), cacheKey)

	if cacheConfig.Enabled {
		cachedItem, found, err := RetrieveResponseFromCache(cacheKey, clientHTTPReq, cacheConfig)
		if err != nil {
			log.Printf("[HTTPS-MITM Cache] Error retrieving from cache for %s: %v", cacheKey, err)
		} else if found {
			if IsCacheFresh(cachedItem, clientHTTPReq, cacheConfig) { // キャッシュが新鮮か確認
				log.Printf("[HTTPS-MITM Cache] HIT and FRESH for %s. Serving from cache.", cacheKey)
				// キャッシュされたレスポンスボディを http.Response オブジェクトにパース
				cachedResp, readErr := http.ReadResponse(bufio.NewReader(bytes.NewReader(cachedItem.ResponseBody)), clientHTTPReq)
				if readErr != nil {
					log.Printf("[HTTPS-MITM Cache] Error reading cached response for %s: %v", cacheKey, readErr)
				} else {
					defer cachedResp.Body.Close()
					RemoveHopByHopHeaders(cachedResp.Header) // ホップバイホップヘッダーを削除
					cachedResp.Header.Set("X-Proxy-Cache", "HIT") // キャッシュヒットを示すヘッダーを追加
					cachedResp.Header.Set("X-Cache-Key", cacheKey)
					if !cachedItem.ExpiresAt.IsZero() {
						cachedResp.Header.Set("Expires", cachedItem.ExpiresAt.Format(time.RFC1123))
					}

					// キャッシュされたレスポンスをクライアントに送信 (TLSコネクション経由)
					err = cachedResp.Write(tlsClientConn)
					if err != nil {
						log.Printf("[HTTPS-MITM Cache] Error writing cached response to client for %s: %v", cacheKey, err)
					}
					return // キャッシュから提供したので、このリクエスト処理はここで終了
				}
			} else {
				log.Printf("[HTTPS-MITM Cache] STALE for key: %s. Fetching from origin.", cacheKey)
				// TODO: キャッシュが古いが存在する場合、条件付きGET (If-None-Match, If-Modified-Since) を
				//       オリジンへのリクエストに付加する実装が考えられる。
			}
		}
	} else {
		log.Printf("[HTTPS-MITM Cache] Cache disabled.")
	}

	// STEP 6: オリジンサーバーへのリクエスト転送 (キャッシュミスまたはキャッシュ無効の場合)
	log.Printf("[HTTPS-MITM Origin] Requesting from origin: %s %s", clientHTTPReq.Method, clientHTTPReq.URL.String())

	// オリジンサーバーと通信するためのトランスポートを設定。
	// 通常は http.DefaultTransport を使用できますが、ここではタイムアウトなどを明示的に設定しています。
	transport := &http.Transport{
		DialContext: (&net.Dialer{
			Timeout:   15 * time.Second, // TCP接続のタイムアウト
			KeepAlive: 30 * time.Second, // TCPキープアライブ
		}).DialContext,
		TLSHandshakeTimeout: 10 * time.Second, // オリジンサーバーとのTLSハンドシェイクのタイムアウト
		// TLSClientConfig: &tls.Config{InsecureSkipVerify: true}, // テスト用にオリジンサーバーの証明書検証をスキップする場合 (本番非推奨)
	}

	// clientHTTPReq をオリジンサーバーに送信し、レスポンスを取得します。
	// RoundTrip はリクエストを送信し、レスポンスを受信するまでブロックします。
	originResp, err := transport.RoundTrip(clientHTTPReq)
	if err != nil {
		log.Printf("[HTTPS-MITM Origin] Error forwarding request to origin %s: %v", clientHTTPReq.URL.Host, err)
		// オリジンへの接続に失敗した場合、クライアントにエラーレスポンス (例: 502 Bad Gateway) を返します。
		errResp := &http.Response{
			StatusCode: http.StatusBadGateway,
			ProtoMajor: 1, ProtoMinor: 1,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(fmt.Sprintf("Proxy error: could not connect to origin server %s. Error: %v", clientHTTPReq.URL.Host, err))),
			Request:    clientHTTPReq,
		}
		errResp.Header.Set("Content-Type", "text/plain; charset=utf--8")
		errResp.Header.Set("X-Proxy-Error", "Origin connection failed")
		writeErr := errResp.Write(tlsClientConn) // エラーレスポンスをクライアントに送信
		if writeErr != nil {
			log.Printf("[HTTPS-MITM Origin] Error writing error response to client: %v", writeErr)
		}
		return
	}
	defer originResp.Body.Close() // オリジンからのレスポンスボディをクローズ

	log.Printf("[HTTPS-MITM Origin] Received response from origin %s: %s", clientHTTPReq.URL.Host, originResp.Status)

	// STEP 7: オリジンからのレスポンスのキャッシュ保存 (キャッシュが有効かつキャッシュ可能な場合)
	// レスポンスヘッダーにキャッシュミスを示す情報を追加 (デバッグ用)
	originResp.Header.Set("X-Proxy-Cache", "MISS")
	originResp.Header.Set("X-Cache-Key", cacheKey)

	if cacheConfig.Enabled && CanCacheResponse(originResp, clientHTTPReq, cacheConfig) {
		log.Printf("[HTTPS-MITM Cache] Caching response for %s", cacheKey)
		// レスポンス全体 (ヘッダーとボディ) をバイト列としてダンプします。
		// これは、後でキャッシュから読み出す際に http.ReadResponse でパースするためです。
		respBytes, dumpErr := httputil.DumpResponse(originResp, true)
		if dumpErr != nil {
			log.Printf("[HTTPS-MITM Cache] Error dumping response for caching %s: %v", cacheKey, dumpErr)
		} else {
			// キャッシュ保存処理は時間がかかる可能性があるため、非同期 (goroutine) で実行することも検討できます。
			// ただし、現在の実装では同期的に行っています。
			// DumpResponse でBodyが消費されるため、キャッシュ保存用にレスポンスを複製する
			clonedResp, readErr := http.ReadResponse(bufio.NewReader(bytes.NewReader(respBytes)), clientHTTPReq)
			if readErr != nil {
				log.Printf("[HTTPS-MITM Cache] Error re-reading dumped response for %s: %v", cacheKey, readErr)
			} else {
				// StoreResponseInCache はレスポンスボディを読み取るため、goroutine で実行する場合は
				// clonedResp の Body を適切に扱う（例：再度複製するか、goroutine 内で閉じる）必要がある。
				// ここでは、StoreResponseInCache が同期的に実行され、その中で Body が閉じられることを期待。
				// -> StoreResponseInCache に渡す前に clonedResp.Body.Close() を defer で呼ぶべきではない。
				//    StoreResponseInCache の中で処理される。
				//    ただし、StoreResponseInCache が goroutine で実行される場合、この clonedResp は goroutine に所有権が移る。
				//    現在のコードでは、goroutine 内で clonedResp.Body.Close() を呼んでいる。
				go func(key string, respToCache *http.Response, reqForCache *http.Request, cfg *config.CacheConfig, fullRespBytesToStore []byte) {
					defer respToCache.Body.Close() // この goroutine 専用のレスポンスボディを閉じる
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

	// STEP 8: オリジンからのレスポンスをクライアントに送信
	// ホップバイホップヘッダーは、オリジンからのレスポンスに含まれている場合、クライアントに送る前に削除するのが一般的。
	// RemoveHopByHopHeaders(originResp.Header) // ここで再度呼ぶか、キャッシュ処理の前に一度だけ呼ぶか検討。
	// 現在は、キャッシュヒット時とオリジンからのレスポンス時で個別に RemoveHopByHopHeaders を呼んでいる。
	// オリジンからのレスポンスをそのままクライアントに書き戻します。
	err = originResp.Write(tlsClientConn) // originResp の内容は変更されていないはず (ヘッダーは追加したが)
	if err != nil {
		log.Printf("[HTTPS-MITM Origin] Error writing origin response to client for %s: %v", cacheKey, err)
	}

	// このリクエスト処理サイクルの完了
	log.Printf("[HTTPS-MITM] Completed request for %s %s%s", clientHTTPReq.Method, clientHTTPReq.Host, clientHTTPReq.URL.String())

	// 注意: 現状の実装では、1つのCONNECTセッションに対して1つのHTTPリクエストを処理して終了します。
	// クライアントがHTTP Keep-Aliveを期待して同じTLSセッション上で連続してリクエストを送信する場合に対応するには、
	// STEP 3 (HTTPリクエストの読み取り) から STEP 8 (レスポンスの送信) までをループ処理にする必要があります。
	// ループは、クライアントが接続を閉じるか、タイムアウトするか、エラーが発生するまで継続します。
}
