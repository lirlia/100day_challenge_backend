package proxy

import (
	"bytes"
	// "database/sql" // 不要になった
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/lirlia/100day_challenge_backend/day50_go_proxy/config"
	"github.com/lirlia/100day_challenge_backend/day50_go_proxy/db"
)

// CachedResponse はキャッシュされたHTTPレスポンスの情報を保持します。
// DBのhttp_cacheテーブルの行に対応します。
type CachedResponse struct {
	ID               int64
	RequestKey       string // METHOD:URL
	Method           string
	RequestURL       string
	StatusCode       int
	ResponseHeaders  http.Header // DB保存時はJSON文字列
	ResponseBody     []byte
	CreatedAt        time.Time
	ExpiresAt        time.Time
	ETag             string
	LastModified     string
	LastAccessedAt   time.Time
}

// GenerateRequestKey はリクエストからキャッシュキーを生成します。
func GenerateRequestKey(r *http.Request) string {
	// クエリパラメータの順序を正規化するためにURLをパースして再構築
	u, err := url.Parse(r.URL.String())
	if err != nil {
		// パース失敗時は元のURLを使用 (キーの正規化は諦める)
		return fmt.Sprintf("%s:%s", r.Method, r.URL.String())
	}
	q := u.Query()
	u.RawQuery = q.Encode() // これでクエリパラメータがアルファベット順ソートされる
	return fmt.Sprintf("%s:%s", r.Method, u.String())
}

// StoreResponseInCache はHTTPレスポンスをキャッシュに保存します。
// オリジンサーバーからのレスポンスと、それに対応するリクエスト、およびレスポンス全体のバイト列を受け取ります。
func StoreResponseInCache(requestKey string, resp *http.Response, req *http.Request, cacheCfg *config.CacheConfig, fullRespBytes []byte) error {
	if !CanCacheResponse(resp, req, cacheCfg) { // req を渡すように変更
		log.Printf("[Cache Store] Response for %s (%s) is not cacheable.", req.URL.String(), requestKey)
		return nil // キャッシュしない場合はエラーではなくnilを返す
	}

	// レスポンスボディは fullRespBytes に含まれているので、ここで再度読み取る必要はない
	// resp.Body は既に StoreResponseInCache を呼び出す前に適切に扱われている（または閉じられている）前提

	now := time.Now()
	headersJSON, err := json.Marshal(resp.Header.Clone())
	if err != nil {
		log.Printf("[Cache Store] Error marshalling response headers for %s: %v", req.URL.String(), err)
		return fmt.Errorf("failed to marshal response headers: %w", err)
	}

	dbItem := db.CachedResponseForDB{
		RequestKey:      requestKey, // 引数で受け取ったキーを使用
		Method:          req.Method,
		RequestURL:      req.URL.String(),
		StatusCode:      resp.StatusCode,
		ResponseHeaders: string(headersJSON),
		ResponseBody:    fullRespBytes, // レスポンスヘッダも含んだバイト列を保存
		CreatedAt:       now,
		ExpiresAt:       CalculateExpirationTime(resp.Header, now, cacheCfg),
		ETag:            db.ToNullString(resp.Header.Get("ETag")),
		LastModified:    db.ToNullString(resp.Header.Get("Last-Modified")),
		LastAccessedAt:  now,
	}

	err = db.InsertOrUpdateCache(dbItem)
	if err != nil {
		log.Printf("[Cache Store] Error saving response for %s to cache: %v", req.URL.String(), err)
		return fmt.Errorf("failed to insert/update cache in DB: %w", err)
	}

	log.Printf("[Cache Store] Stored response for %s in cache. Expires: %s Key: %s", req.URL.String(), dbItem.ExpiresAt.Format(time.RFC1123), requestKey)
	return nil
}

// RetrieveResponseFromCache はリクエストキーに一致するキャッシュされたレスポンスを取得します。
// originalReq は将来的な条件付きGETのために渡されますが、現在は未使用です。
func RetrieveResponseFromCache(requestKey string, originalReq *http.Request, cacheCfg *config.CacheConfig) (*CachedResponse, bool, error) {
	dbItem, err := db.GetCacheByKey(requestKey)
	if err != nil {
		log.Printf("[Cache Retrieve] Error getting cache for key %s: %v", requestKey, err)
		return nil, false, fmt.Errorf("DB error while getting cache by key %s: %w", requestKey, err)
	}
	if dbItem == nil {
		log.Printf("[Cache Retrieve] No cache found for key %s", requestKey)
		return nil, false, nil // Not found, not an error
	}

	var httpHeaders http.Header
	if dbItem.ResponseHeaders != "" {
		err = json.Unmarshal([]byte(dbItem.ResponseHeaders), &httpHeaders)
		if err != nil {
			log.Printf("[Cache Retrieve] Error unmarshalling response headers from JSON for key %s: %v", requestKey, err)
			// エラーでも処理を続けるが、ヘッダーは空になる
			httpHeaders = make(http.Header)
		}
	}

	cachedResp := &CachedResponse{
		ID:              dbItem.ID,
		RequestKey:      dbItem.RequestKey,
		Method:          dbItem.Method,
		RequestURL:      dbItem.RequestURL,
		StatusCode:      dbItem.StatusCode,
		ResponseHeaders: httpHeaders,
		ResponseBody:    dbItem.ResponseBody, // これが httputil.DumpResponse でダンプした生のバイト列
		CreatedAt:       dbItem.CreatedAt,
		ExpiresAt:       dbItem.ExpiresAt,
		ETag:            db.FromNullString(dbItem.ETag),
		LastModified:    db.FromNullString(dbItem.LastModified),
		LastAccessedAt:  dbItem.LastAccessedAt,
	}

	// 鮮度チェック
	fresh := IsCacheFresh(cachedResp, originalReq, cacheCfg) // originalReq を渡す
	if !fresh {
		log.Printf("[Cache Retrieve] Cache for key %s is stale.", requestKey)
		// stale な場合でもアイテム自体は返す。呼び出し元が条件付きGETなどを行うか判断する。
		// 現状の HandleHTTPS/HandleHTTP では、stale ならオリジンアクセス。
	}

	log.Printf("[Cache Retrieve] Cache hit for key %s. Freshness: %t.", requestKey, fresh)
	// アクセス日時更新 (goroutine で非同期に)
	go func(key string) {
		if err := db.UpdateCacheAccessTime(key, time.Now()); err != nil {
			log.Printf("[Cache Retrieve] Failed to update access time for %s: %v", key, err)
		}
	}(requestKey) // requestKey をキャプチャ

	return cachedResp, true, nil // Found
}

// CanCacheResponse はレスポンスがキャッシュ可能かどうかを判断します。
func CanCacheResponse(resp *http.Response, req *http.Request, cacheCfg *config.CacheConfig) bool {
	// GETリクエストのみキャッシュ (今回は)
	if req.Method != http.MethodGet { // resp.Request.Method から req.Method に変更
		return false
	}

	// Cache-Control ヘッダーの確認
	ccHeader := resp.Header.Get("Cache-Control")
	if ccHeader != "" {
		directives := parseCacheControl(ccHeader)
		if _, noStore := directives["no-store"]; noStore {
			log.Printf("[CanCache] Cache-Control: no-store for %s", req.URL.String())
			return false
		}
		if _, noCache := directives["no-cache"]; noCache {
			log.Printf("[CanCache] Cache-Control: no-cache for %s (will require revalidation)", req.URL.String())
			// no-cache はキャッシュはするが、常に再検証が必要。今回は単純化のためキャッシュしない扱いにするか、
			// または IsCacheFresh で常に stale と判断するようにする。
			// 今回はキャッシュしない。
			return false
		}
		// private は共有キャッシュには保存しないが、今回はローカルプロキシなので許容しても良い。
		// public は明示的にキャッシュ可能。
	}

	// Varyヘッダーは今回は考慮しない (複雑になるため)
	if resp.Header.Get("Vary") != "" {
		log.Printf("[CanCache] Vary header found for %s, not caching for simplicity.", req.URL.String())
		// return false
	}

	// 200 OK, 203 Non-Authoritative Information, 300 Multiple Choices, 301 Moved Permanently, 410 Gone のような
	// キャッシュ可能なステータスコードを考慮。今回は200 OKのみ対象とする（単純化）。
	if resp.StatusCode != http.StatusOK {
		log.Printf("[CanCache] Non-OK status code %d for %s, not caching.", resp.StatusCode, req.URL.String())
		return false
	}

	// TODO: 他の条件 (Authorizationヘッダがある場合はキャッシュしないなど)
	return true
}

// CalculateExpirationTime はレスポンスヘッダーと設定からキャッシュの有効期限を計算します。
func CalculateExpirationTime(headers http.Header, now time.Time, cacheCfg *config.CacheConfig) time.Time {
	// Cache-Control: max-age=seconds
	ccHeader := headers.Get("Cache-Control")
	if ccHeader != "" {
		directives := parseCacheControl(ccHeader)
		if maxAgeStr, ok := directives["max-age"]; ok {
			if maxAgeSec, err := strconv.Atoi(maxAgeStr); err == nil && maxAgeSec > 0 {
				return now.Add(time.Duration(maxAgeSec) * time.Second)
			}
		}
		// s-maxage も共有キャッシュのTTLとして考慮できるが今回は省略
	}

	// Expires ヘッダー
	if expiresStr := headers.Get("Expires"); expiresStr != "" {
		if expiresTime, err := http.ParseTime(expiresStr); err == nil {
			if expiresTime.After(now) { // 過去の日付は無効
				return expiresTime
			}
		}
	}

	// デフォルトTTL
	return now.Add(time.Duration(cacheCfg.DefaultTTLSeconds) * time.Second)
}

// IsCacheFresh はキャッシュされたアイテムがまだ新鮮かどうかを判断します。
// originalReq は将来的な条件付きGETのために渡されます。
func IsCacheFresh(cachedItem *CachedResponse, originalReq *http.Request, cacheCfg *config.CacheConfig) bool {
	now := time.Now()
	if cachedItem.ExpiresAt.Before(now) {
		log.Printf("[Cache Freshness] Cache for %s expired at %s (current: %s)", cachedItem.RequestKey, cachedItem.ExpiresAt.Format(time.RFC1123), now.Format(time.RFC1123))
		return false
	}

	// Cache-Control: no-cache など、常に再検証が必要な場合の考慮 (CanCacheResponseで対応済み)
	// Cache-Control: must-revalidate, proxy-revalidate も考慮するとより厳密
	// 今回は ExpiresAt のみで判断

	return true
}

// parseCacheControl は Cache-Control ヘッダー文字列をパースしてディレクティブのマップを返します。
// 簡単な実装であり、全てのケースを網羅するものではありません。
func parseCacheControl(headerValue string) map[string]string {
	directives := make(map[string]string)
	parts := strings.Split(headerValue, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		nameValue := strings.SplitN(part, "=", 2)
		if len(nameValue) == 1 {
			directives[strings.ToLower(nameValue[0])] = "" // 値なしディレクティブ (例: no-store)
		} else if len(nameValue) == 2 {
			directives[strings.ToLower(nameValue[0])] = strings.Trim(nameValue[1], "\"")
		}
	}
	return directives
}

// ServeFromCache はキャッシュされたレスポンスをクライアントに返します。
func ServeFromCache(w http.ResponseWriter, r *http.Request, cachedItem *CachedResponse) {
	log.Printf("[Serve From Cache] Serving %s for %s from cache.", cachedItem.RequestKey, r.RemoteAddr)

	// ヘッダーをコピー
	CopyHeaders(w.Header(), cachedItem.ResponseHeaders)
	// キャッシュから提供したことを示すヘッダーを追加しても良い (X-Cache: HITなど)
	w.Header().Set("X-Proxy-Cache", "HIT")

	w.WriteHeader(cachedItem.StatusCode)

	_, err := io.Copy(w, bytes.NewReader(cachedItem.ResponseBody))
	if err != nil {
		log.Printf("[Serve From Cache] Error writing response body for %s: %v", cachedItem.RequestKey, err)
	}
}
