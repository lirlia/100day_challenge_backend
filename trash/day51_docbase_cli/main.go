package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"time"
)

var apiEndpointFormat = "https://api.docbase.io/teams/%s/posts" // ユーザー提示の仕様に合わせる

const (
	defaultStartYear  = 2024
	defaultStartMonth = 1
	defaultEndYear    = 2025
	defaultEndMonth   = 12
	maxPerPage        = 100 // DocBase APIのper_page最大値
)

type Config struct {
	TeamName   string
	Token      string
	StartYear  int
	StartMonth int
	EndYear    int
	EndMonth   int
}

// DocBase APIのレスポンス構造体
type Post struct {
	ID        int       `json:"id"`
	CreatedAt time.Time `json:"created_at"` // time.Timeとして直接パース
}

type PostMeta struct {
	Total      int     `json:"total"`
	NextPage   *string `json:"next_page"` // nullの場合があるのでポインタ型
	PrevPage   *string `json:"previous_page"`
}

type PostResponse struct {
	Posts []Post   `json:"posts"`
	Meta  PostMeta `json:"meta"`
}

type DocBaseClient struct {
	TeamName      string
	Token         string
	Client        *http.Client
	SleepDuration time.Duration
}

func main() {
	config, err := parseArgs()
	if err != nil {
		fmt.Fprintf(os.Stderr, "引数のパースに失敗しました: %v\n", err)
		flag.Usage()
		os.Exit(1)
	}

	client := NewDocBaseClient(config.TeamName, config.Token)

	fmt.Printf("%s チームの %d年%d月から%d年%d月までの記事数を取得します...\n", config.TeamName, config.StartYear, config.StartMonth, config.EndYear, config.EndMonth)

	monthlyCounts, err := client.GetMonthlyPostCountsViaPagination(config.StartYear, config.StartMonth, config.EndYear, config.EndMonth)
	if err != nil {
		fmt.Fprintf(os.Stderr, "記事数の取得に失敗しました: %v\n", err)
		os.Exit(1)
	}

	// 表示期間の準備
	startDate := time.Date(config.StartYear, time.Month(config.StartMonth), 1, 0, 0, 0, 0, time.UTC)
	endDate := time.Date(config.EndYear, time.Month(config.EndMonth), 1, 0, 0, 0, 0, time.UTC)

	fmt.Println("月別記事数:")
	current := startDate
	for !current.After(endDate) {
		monthKey := current.Format("2006-01")
		count := 0
		if c, ok := monthlyCounts[monthKey]; ok {
			count = c
		}
		fmt.Printf("%s: %d記事\n", monthKey, count)
		current = current.AddDate(0, 1, 0)
	}

	fmt.Println("記事数の集計が完了しました。")
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
		return nil, fmt.Errorf("チーム名が指定されていません。-team オプションまたは DOCBASE_TEAM 環境変数を設定してください")
	}
	if conf.Token == "" {
		return nil, fmt.Errorf("APIトークンが指定されていません。-token オプションまたは DOCBASE_TOKEN 環境変数を設定してください")
	}
	if conf.StartMonth < 1 || conf.StartMonth > 12 || conf.EndMonth < 1 || conf.EndMonth > 12 {
		return nil, fmt.Errorf("月は1から12の間で指定してください")
	}
	if conf.StartYear > conf.EndYear || (conf.StartYear == conf.EndYear && conf.StartMonth > conf.EndMonth) {
		return nil, fmt.Errorf("開始年月が終了年月より後になっています")
	}
	return conf, nil
}

func NewDocBaseClient(teamName, token string) *DocBaseClient {
	return &DocBaseClient{
		TeamName:      teamName,
		Token:         token,
		Client:        &http.Client{Timeout: 20 * time.Second},
		SleepDuration: 13 * time.Second,
	}
}

// GetMonthlyPostCountsViaPagination はページネーションを使って全記事を取得し、月別に集計します。
func (c *DocBaseClient) GetMonthlyPostCountsViaPagination(startYear, startMonth, endYear, endMonth int) (map[string]int, error) {
	monthlyCounts := make(map[string]int)
	currentPage := 1
	requestCount := 0 // APIリクエスト回数のカウント（デバッグ用）

	// 集計対象の期間を設定
	filterStartDate := time.Date(startYear, time.Month(startMonth), 1, 0, 0, 0, 0, time.UTC)
	// endMonthの最終日までを範囲に含めるため、翌月の初日未満とする
	filterEndDate := time.Date(endYear, time.Month(endMonth), 1, 0, 0, 0, 0, time.UTC).AddDate(0, 1, 0)


	for {
		requestCount++
		// fmt.Printf("DEBUG: Requesting page %d...\n", currentPage) // デバッグ用

		endpoint := fmt.Sprintf(apiEndpointFormat, c.TeamName)
		u, err := url.Parse(endpoint)
		if err != nil {
			return nil, fmt.Errorf("APIエンドポイントURLのパースに失敗: %w", err)
		}

		q := u.Query()
		q.Set("per_page", fmt.Sprintf("%d", maxPerPage))
		q.Set("page", fmt.Sprintf("%d", currentPage))
		// q.Set("q", "created:>=2024-01-01 created:<=2024-01-31") // もし期間指定可能なら検討
		u.RawQuery = q.Encode()

		req, err := http.NewRequest("GET", u.String(), nil)
		if err != nil {
			return nil, fmt.Errorf("リクエストの作成に失敗: %w", err)
		}
		req.Header.Set("X-DocBaseToken", c.Token)
		req.Header.Set("Content-Type", "application/json")

		resp, err := c.Client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("APIリクエストに失敗 (page %d): %w", currentPage, err)
		}

		// レスポンスボディをデバッグ出力 (必要な場合のみ有効化)
		bodyBytesForDebug, _ := io.ReadAll(resp.Body)
		// fmt.Printf("DEBUG: Response Body (Page %d): %s\n", currentPage, string(bodyBytesForDebug))
		resp.Body = io.NopCloser(bytes.NewBuffer(bodyBytesForDebug))


		if resp.StatusCode != http.StatusOK {
			bodyBytes, _ := io.ReadAll(resp.Body)
			resp.Body.Close() // ここで明示的に閉じる
			return nil, fmt.Errorf("APIリクエストエラー (page %d, status %d): %s", currentPage, resp.StatusCode, string(bodyBytes))
		}

		var postResponse PostResponse
		if err := json.NewDecoder(resp.Body).Decode(&postResponse); err != nil {
			resp.Body.Close() // デコードエラー時も閉じる
			return nil, fmt.Errorf("レスポンスJSONのデコードに失敗 (page %d): %w", currentPage, err)
		}
		resp.Body.Close() // 正常時もここで閉じる

		if len(postResponse.Posts) == 0 {
			// fmt.Println("DEBUG: No more posts found.") // デバッグ用
			break // 記事がもうない場合は終了
		}

		for _, post := range postResponse.Posts {
			// 記事の作成日時が指定された期間内かチェック
			if (post.CreatedAt.Equal(filterStartDate) || post.CreatedAt.After(filterStartDate)) && post.CreatedAt.Before(filterEndDate) {
				monthKey := post.CreatedAt.Format("2006-01")
				monthlyCounts[monthKey]++
			}
		}

		if postResponse.Meta.NextPage == nil {
			// fmt.Println("DEBUG: No next page.") // デバッグ用
			break // 次のページがない場合は終了
		}

		currentPage++
		// APIレートリミットを考慮 (1分間に5回 -> 1リクエストあたり12秒。マージン含め13秒)
		time.Sleep(c.SleepDuration)
	}

	// fmt.Printf("DEBUG: Total API requests: %d\n", requestCount) // デバッグ用
	return monthlyCounts, nil
}
