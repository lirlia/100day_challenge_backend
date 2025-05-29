package proxy

import (
	"net/http"
	"strings"
)

// Hop-by-hop headers. These are removed when proxying.
// http://www.w3.org/Protocols/rfc2616/rfc2616-sec13.html
// Unsevered from https://github.com/golang/go/blob/master/src/net/http/httputil/reverseproxy.go
var hopHeaders = []string{
	"Connection",
	"Proxy-Connection", // non-standard but still sent by libcurl and rejected by e.g. google
	"Keep-Alive",
	"Proxy-Authenticate",
	"Proxy-Authorization",
	"Te",              // canonicalized version of "TE"
	"Trailer",         // not Trailers per se
	"Transfer-Encoding",
	"Upgrade",
}

// RemoveHopByHopHeaders はプロキシ時に転送すべきではないホップバイホップヘッダーを削除します。
func RemoveHopByHopHeaders(header http.Header) {
	for _, h := range hopHeaders {
		header.Del(h)
	}
	// Connectionヘッダーで指定された他のヘッダーも削除
	// (例: Connection: close, X-Foo-Header -> X-Foo-Header も削除)
	if c := header.Get("Connection"); c != "" {
		for _, f := range strings.Split(c, ",") {
			if f = strings.TrimSpace(f); f != "" {
				header.Del(f)
			}
		}
	}
}

// UpdateXForwardedForHeader は X-Forwarded-For ヘッダーを更新または追加します。
func UpdateXForwardedForHeader(req *http.Request, remoteIP string) {
	// remoteIP は "IP:Port" の形式である可能性があるため、IP部分のみを抽出
	if colon := strings.LastIndex(remoteIP, ":"); colon != -1 {
		remoteIP = remoteIP[:colon]
	}

	if prior, ok := req.Header["X-Forwarded-For"]; ok {
		remoteIP = strings.Join(prior, ", ") + ", " + remoteIP
	}
	req.Header.Set("X-Forwarded-For", remoteIP)
}

// CopyHeaders は src から dst へヘッダーをコピーします。
// dst に同じキーが既に存在する場合、値は追加されます。
func CopyHeaders(dst, src http.Header) {
	for k, vv := range src {
		for _, v := range vv {
			dst.Add(k, v)
		}
	}
}

// TODO: X-Forwarded-Proto, X-Forwarded-Host などのヘッダーも設定することを検討
