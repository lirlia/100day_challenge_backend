package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// createMockPost はテスト用のPostオブジェクトを作成します。
func createMockPost(id int, createdAtStr string) Post {
	t, _ := time.Parse(time.RFC3339, createdAtStr)
	return Post{ID: id, CreatedAt: t}
}

func TestGetMonthlyPostCountsViaPagination_Success(t *testing.T) {
	// モックサーバーのハンドラ
	mockResponses := []PostResponse{
		{ // Page 1
			Posts: []Post{
				createMockPost(1, "2024-01-10T10:00:00+09:00"),
				createMockPost(2, "2024-01-15T10:00:00+09:00"),
				createMockPost(3, "2024-02-05T10:00:00+09:00"),
			},
			Meta: PostMeta{Total: 5, NextPage: func() *string { s := "dummy_next_page_url_for_page_2"; return &s }()},
		},
		{ // Page 2
			Posts: []Post{
				createMockPost(4, "2024-02-20T10:00:00+09:00"),
				createMockPost(5, "2023-12-01T10:00:00+09:00"), // 期間外
			},
			Meta: PostMeta{Total: 5, NextPage: nil}, // Last page
		},
	}
	pageCounter := 0

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-DocBaseToken") != "test_token" {
			t.Errorf("Expected token 'test_token', got '%s'", r.Header.Get("X-DocBaseToken"))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		if r.URL.Path != "/teams/testteam/posts" { // チーム名を固定してテスト
			t.Errorf("Expected URL path '/teams/testteam/posts', got '%s'", r.URL.Path)
			w.WriteHeader(http.StatusBadRequest)
			return
		}

		// pageStr := r.URL.Query().Get("page") // pageクエリの厳密なチェックは省略
		if pageCounter < len(mockResponses) {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(mockResponses[pageCounter])
			pageCounter++
		} else {
			json.NewEncoder(w).Encode(PostResponse{Posts: []Post{}, Meta: PostMeta{NextPage: nil}})
		}
	}))
	defer server.Close()

	originalApiEndpointFormat := apiEndpointFormat
	apiEndpointFormat = server.URL + "/teams/%s/posts"
	defer func() { apiEndpointFormat = originalApiEndpointFormat }()

	client := NewDocBaseClient("testteam", "test_token")
	client.Client = server.Client()
	client.SleepDuration = 0 // テスト時はスリープしない

	counts, err := client.GetMonthlyPostCountsViaPagination(2024, 1, 2024, 2)
	if err != nil {
		t.Fatalf("GetMonthlyPostCountsViaPagination failed: %v", err)
	}

	if counts == nil {
		t.Fatalf("Expected counts map, got nil")
	}

	expectedJanCount := 2
	if counts["2024-01"] != expectedJanCount {
		t.Errorf("Expected 2024-01 count %d, got %d", expectedJanCount, counts["2024-01"])
	}

	expectedFebCount := 2
	if counts["2024-02"] != expectedFebCount {
		t.Errorf("Expected 2024-02 count %d, got %d", expectedFebCount, counts["2024-02"])
	}

	if len(counts) != 2 {
		t.Errorf("Expected counts map to have 2 entries, got %d", len(counts))
	}
}

func TestGetMonthlyPostCountsViaPagination_ApiError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()

	originalApiEndpointFormat := apiEndpointFormat
	apiEndpointFormat = server.URL + "/teams/%s/posts"
	defer func() { apiEndpointFormat = originalApiEndpointFormat }()

	client := NewDocBaseClient("testteam", "test_token")
	client.Client = server.Client()
	client.SleepDuration = 0 // テスト時はスリープしない

	_, err := client.GetMonthlyPostCountsViaPagination(2024, 1, 2024, 1)
	if err == nil {
		t.Fatal("Expected an error, but got nil")
	}
	if !strings.Contains(err.Error(), "APIリクエストエラー") {
		t.Errorf("Expected error message to contain 'APIリクエストエラー', got '%s'", err.Error())
	}
}


func TestGetMonthlyPostCountsViaPagination_JsonDecodeError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `{"posts": "this is not an array"`)
	}))
	defer server.Close()

	originalApiEndpointFormat := apiEndpointFormat
	apiEndpointFormat = server.URL + "/teams/%s/posts"
	defer func() { apiEndpointFormat = originalApiEndpointFormat }()

	client := NewDocBaseClient("testteam", "test_token")
	client.Client = server.Client()
	client.SleepDuration = 0 // テスト時はスリープしない

	_, err := client.GetMonthlyPostCountsViaPagination(2024, 1, 2024, 1)
	if err == nil {
		t.Fatal("Expected an error, but got nil")
	}
	if !strings.Contains(err.Error(), "レスポンスJSONのデコードに失敗") {
		t.Errorf("Expected error message to contain 'レスポンスJSONのデコードに失敗', got '%s'", err.Error())
	}
}

func TestParseArgs_Success(t *testing.T) {
	originalArgs := os.Args
	defer func() { os.Args = originalArgs }()
	os.Args = []string{"cmd", "-team", "myteam", "-token", "mytoken", "-start-year", "2023", "-start-month", "10", "-end-year", "2024", "-end-month", "5"}
	// Reset flag package state for re-parsing, as it's global
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	config, err := parseArgs()
	if err != nil {
		t.Fatalf("parseArgs failed: %v", err)
	}
	if config.TeamName != "myteam" {
		t.Errorf("Expected team 'myteam', got '%s'", config.TeamName)
	}
	if config.Token != "mytoken" {
		t.Errorf("Expected token 'mytoken', got '%s'", config.Token)
	}
	if config.StartYear != 2023 {
		t.Errorf("Expected start year 2023, got %d", config.StartYear)
	}
    if config.StartMonth != 10 {
		t.Errorf("Expected start month 10, got %d", config.StartMonth)
	}
    if config.EndYear != 2024 {
		t.Errorf("Expected end year 2024, got %d", config.EndYear)
	}
    if config.EndMonth != 5 {
		t.Errorf("Expected end month 5, got %d", config.EndMonth)
	}

    os.Setenv("DOCBASE_TEAM", "envteam")
    os.Setenv("DOCBASE_TOKEN", "envtoken")
    defer os.Unsetenv("DOCBASE_TEAM")
    defer os.Unsetenv("DOCBASE_TOKEN")
    os.Args = []string{"cmd"}
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
    config, err = parseArgs()
    if err != nil {
        t.Fatalf("parseArgs with env vars failed: %v", err)
    }
    if config.TeamName != "envteam" {
        t.Errorf("Expected team 'envteam', got '%s'", config.TeamName)
    }
    if config.Token != "envtoken" {
        t.Errorf("Expected token 'envtoken', got '%s'", config.Token)
    }
}

func TestParseArgs_MissingTeam(t *testing.T) {
	originalArgs := os.Args
	defer func() { os.Args = originalArgs }()
	os.Args = []string{"cmd", "-token", "mytoken"}
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	_, err := parseArgs()
	if err == nil {
		t.Fatal("Expected an error for missing team, but got nil")
	}
	if !strings.Contains(err.Error(), "チーム名が指定されていません") {
		t.Errorf("Expected error message for missing team, got '%s'", err.Error())
	}
}

func TestParseArgs_InvalidMonth(t *testing.T) {
	originalArgs := os.Args
	defer func() { os.Args = originalArgs }()
	os.Args = []string{"cmd", "-team", "t", "-token", "t", "-start-month", "13"}
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
	_, err := parseArgs()
	if err == nil {
		t.Fatal("Expected an error for invalid month, but got nil")
	}
	if !strings.Contains(err.Error(), "月は1から12の間で指定してください") {
		t.Errorf("Expected error message for invalid month, got '%s'", err.Error())
	}
}

func TestParseArgs_StartDateAfterEndDate(t *testing.T) {
    originalArgs := os.Args
    defer func() { os.Args = originalArgs }()
    os.Args = []string{"cmd", "-team", "t", "-token", "t", "-start-year", "2025", "-start-month", "1", "-end-year", "2024", "-end-month", "12"}
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ContinueOnError)
    _, err := parseArgs()
    if err == nil {
        t.Fatal("Expected an error for start date after end date, but got nil")
    }
    if !strings.Contains(err.Error(), "開始年月が終了年月より後になっています") {
        t.Errorf("Expected error message for start date after end date, got '%s'", err.Error())
    }
}
