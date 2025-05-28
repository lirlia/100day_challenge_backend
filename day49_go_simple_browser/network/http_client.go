package network

import (
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"strings"

	"golang.org/x/text/encoding/japanese"
)

// FetchURL は指定されたURLからコンテンツを取得し、UTF-8文字列として返します。
// 文字コードがShift_JISの場合はUTF-8に変換します。
func FetchURL(rawURL string) (string, error) {
	client := &http.Client{}

	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}
	// 標準的なブラウザのUser-Agentを設定（サイトによってはUAで挙動が変わるため）
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to fetch URL %s: %w", rawURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("failed to fetch URL %s: status code %d", rawURL, resp.StatusCode)
	}

	// Content-Typeからcharsetを取得
	contentType := resp.Header.Get("Content-Type")

	var charset string
	if contentType != "" {
		_, params, err := mime.ParseMediaType(contentType)
		if err == nil && params["charset"] != "" {
			charset = strings.ToLower(params["charset"])
		}
	}

	// まずレスポンスボディを全てバイトスライスとして読み込み
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body from %s: %w", rawURL, err)
	}

	// HTTPヘッダーでcharsetが取得できない場合、HTMLの <meta> タグから検出を試みる
	if charset == "" {
		charset = detectCharsetFromHTML(bodyBytes)
	}

	// Shift_JISまたはそのエイリアスの場合、UTF-8に変換
	if charset == "shift_jis" || charset == "sjis" || charset == "x-sjis" || charset == "shift-jis" {
		decoder := japanese.ShiftJIS.NewDecoder()
		utf8Bytes, err := decoder.Bytes(bodyBytes)
		if err != nil {
			return "", fmt.Errorf("failed to convert Shift_JIS to UTF-8 for %s: %w", rawURL, err)
		}
		bodyBytes = utf8Bytes
	} else if charset != "" && charset != "utf-8" && charset != "utf8" {
		// 他のエンコーディングの場合は警告を出力（今回はUTF-8以外はShift_JISのみ対応）
		fmt.Printf("Warning: Unsupported charset '%s' for URL %s. Attempting to read as is.\n", charset, rawURL)
	}

	return string(bodyBytes), nil
}

// FetchImage は指定されたURLから画像データを取得します。
func FetchImage(imageURL string) ([]byte, error) {
	client := &http.Client{}
	req, err := http.NewRequest("GET", imageURL, nil)
	if err != nil {
		return nil, fmt.Errorf("リクエスト作成エラー (%s): %w", imageURL, err)
	}
	req.Header.Set("User-Agent", "Go Mini Browser/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("画像取得エラー (%s): %w", imageURL, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("画像取得エラー (%s): ステータスコード %d", imageURL, resp.StatusCode)
	}

	imageData, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("画像データ読み込みエラー (%s): %w", imageURL, err)
	}

	return imageData, nil
}

// detectCharsetFromHTML は HTML の <meta> タグから charset を検出します
func detectCharsetFromHTML(htmlBytes []byte) string {
	// HTMLの最初の1024バイトから <meta> タグを検索
	searchArea := htmlBytes
	if len(searchArea) > 1024 {
		searchArea = htmlBytes[:1024]
	}

	htmlStr := strings.ToLower(string(searchArea))

	// <meta http-equiv="content-type" content="text/html; charset=shift_jis"> パターン
	if idx := strings.Index(htmlStr, "charset="); idx != -1 {
		start := idx + 8 // "charset=" の長さ
		end := start
		for end < len(htmlStr) && htmlStr[end] != '"' && htmlStr[end] != '\'' && htmlStr[end] != '>' && htmlStr[end] != ' ' {
			end++
		}
		if end > start {
			detectedCharset := htmlStr[start:end]
			// ハイフンやアンダースコアの正規化
			detectedCharset = strings.ReplaceAll(detectedCharset, "_", "-")
			return detectedCharset
		}
	}

	return ""
}

// ResolveURL は相対URLを絶対URLに変換します。
func ResolveURL(baseURL, relativeURL string) (string, error) {
	base, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("failed to parse base URL %s: %w", baseURL, err)
	}

	rel, err := url.Parse(relativeURL)
	if err != nil {
		return "", fmt.Errorf("failed to parse relative URL %s: %w", relativeURL, err)
	}

	resolved := base.ResolveReference(rel)
	return resolved.String(), nil
}
