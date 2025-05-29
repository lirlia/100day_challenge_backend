package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

// apiEndpointFormat は const から var に変更
var apiEndpointFormat = "https://%s.docbase.io/api/v1/posts"

const (
	// apiEndpointFormat = "https://%s.docbase.io/api/v1/posts" // こちらは削除
	defaultStartYear  = 2024
	defaultStartMonth = 1
	defaultEndYear    = 2025
	defaultEndMonth   = 12
)

// Config はCLIの引数や環境変数を保持します。
type Config struct {
	TeamName string
	Token    string
	StartYear int
	StartMonth int
	EndYear   int
	EndMonth  int
}

// DocBaseClient はDocBase APIと通信するためのクライアントです。
type DocBaseClient struct {
	TeamName string
	Token    string
	Client   *http.Client
}

// PostMeta は記事のメタ情報を表します。
type PostMeta struct {
	TotalCount int `json:"total_count"`
}

// PostResponse は記事一覧APIのレスポンスを表します。
type PostResponse struct {
	Meta PostMeta `json:"meta"`
}

func main() {
	config, err := parseArgs()
	if err != nil {
		fmt.Fprintf(os.Stderr, "引数のパースに失敗しました: %v\n", err)
		flag.Usage()
		os.Exit(1)
	}

	client := NewDocBaseClient(config.TeamName, config.Token)

	fmt.Printf("%d年%d月から%d年%d月までの記事数を取得します...\n", config.StartYear, config.StartMonth, config.EndYear, config.EndMonth)

	currentYear := config.StartYear
	currentMonth := config.StartMonth

	for {
		if currentYear > config.EndYear || (currentYear == config.EndYear && currentMonth > config.EndMonth) {
			break
		}

		count, err := client.GetMonthlyPostCount(currentYear, currentMonth)
		if err != nil {
			fmt.Fprintf(os.Stderr, "%d年%02d月の記事数取得に失敗: %v\n", currentYear, currentMonth, err)
		} else {
			fmt.Printf("%d-%02d: %d記事\n", currentYear, currentMonth, count)
		}

		currentMonth++
		if currentMonth > 12 {
			currentMonth = 1
			currentYear++
		}
		time.Sleep(200 * time.Millisecond) // APIレートリミットを考慮
	}

	fmt.Println("記事数の取得が完了しました。")
}

func parseArgs() (*Config, error) {
	conf := &Config{}

	flag.StringVar(&conf.TeamName, "team", os.Getenv("DOCBASE_TEAM"), "DocBase team name (or DOCBASE_TEAM env var)")
	flag.StringVar(&conf.Token, "token", os.Getenv("DOCBASE_TOKEN"), "DocBase API token (or DOCBASE_TOKEN env var)")
	flag.IntVar(&conf.StartYear, "start-year", defaultStartYear, "Start year for fetching posts")
	flag.IntVar(&conf.StartMonth, "start-month", defaultStartMonth, "Start month for fetching posts (1-12)")
	flag.IntVar(&conf.EndYear, "end-year", defaultEndYear, "End year for fetching posts")
	flag.IntVar(&conf.EndMonth, "end-month", defaultEndMonth, "End month for fetching posts (1-12)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "使用法: %s [options]\n", os.Args[0])
		fmt.Fprintln(os.Stderr, "オプション:")
		flag.PrintDefaults()
		fmt.Fprintln(os.Stderr, "\n環境変数:")
		fmt.Fprintln(os.Stderr, "  DOCBASE_TEAM: DocBase team name")
		fmt.Fprintln(os.Stderr, "  DOCBASE_TOKEN: DocBase API token")
	}

	flag.Parse()

	if conf.TeamName == "" {
		return nil, fmt.Errorf("チーム名が指定されていません。-team オプションまたは DOCBASE_TEAM 環境変数を設定してください。")
	}
	if conf.Token == "" {
		return nil, fmt.Errorf("APIトークンが指定されていません。-token オプションまたは DOCBASE_TOKEN 環境変数を設定してください。")
	}
	if conf.StartMonth < 1 || conf.StartMonth > 12 {
		return nil, fmt.Errorf("開始月は1から12の間で指定してください。")
	}
	if conf.EndMonth < 1 || conf.EndMonth > 12 {
		return nil, fmt.Errorf("終了月は1から12の間で指定してください。")
	}
	if conf.StartYear > conf.EndYear || (conf.StartYear == conf.EndYear && conf.StartMonth > conf.EndMonth) {
		return nil, fmt.Errorf("開始年月が終了年月より後になっています。")
	}

	return conf, nil
}

// NewDocBaseClient は新しいDocBaseClientを作成します。
func NewDocBaseClient(teamName, token string) *DocBaseClient {
	return &DocBaseClient{
		TeamName: teamName,
		Token:    token,
		Client:   &http.Client{Timeout: 10 * time.Second},
	}
}

// GetMonthlyPostCount は指定された年月の記事数を取得します。
func (c *DocBaseClient) GetMonthlyPostCount(year int, month int) (int, error) {
	endpoint := fmt.Sprintf(apiEndpointFormat, c.TeamName)
	u, err := url.Parse(endpoint)
	if err != nil {
		return 0, fmt.Errorf("APIエンドポイントURLのパースに失敗: %w", err)
	}

	q := u.Query()
	q.Set("q", fmt.Sprintf("created_at:%d-%02d", year, month))
	q.Set("per_page", "1") // 記事数だけ知りたいので1件で十分
	u.RawQuery = q.Encode()

	req, err := http.NewRequest("GET", u.String(), nil)
	if err != nil {
		return 0, fmt.Errorf("リクエストの作成に失敗: %w", err)
	}
	req.Header.Set("X-DocBaseToken", c.Token)
	req.Header.Set("Content-Type", "application/json")

	// fmt.Printf("Requesting: %s\n", u.String()) // デバッグ用
	resp, err := c.Client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("APIリクエストに失敗: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		bodyBytes, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("APIリクエストエラー: status code %d, body: %s", resp.StatusCode, string(bodyBytes))
	}

	var postResponse PostResponse
	if err := json.NewDecoder(resp.Body).Decode(&postResponse); err != nil {
		// ボディの内容を読んでみる
		// _, errRead := io.Copy(io.Discard, resp.Body) // すでに閉じてる可能性
		// fmt.Printf("Read error: %v\n", errRead)
		return 0, fmt.Errorf("レスポンスJSONのデコードに失敗: %w", err)
	}

	return postResponse.Meta.TotalCount, nil
}
