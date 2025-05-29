package main

import (
	"flag"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestGetMonthlyPostCount_Success(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-DocBaseToken") != "test_token" {
			t.Errorf("Expected token 'test_token', got '%s'", r.Header.Get("X-DocBaseToken"))
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		query := r.URL.Query()
		if query.Get("q") != "created_at:2024-07" {
			t.Errorf("Expected q 'created_at:2024-07', got '%s'", query.Get("q"))
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		if query.Get("per_page") != "1" {
			t.Errorf("Expected per_page '1', got '%s'", query.Get("per_page"))
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `{"meta": {"total_count": 15}}`)
	}))
	defer server.Close()

	// テストサーバーのURLからチーム名部分を抽出 (例: http://127.0.0.1:xxxx -> 127.0.0.1:xxxx)
	// 実際にはDocBaseClientは `https://%s.docbase.io` の形式を期待するが、
	// httptest.NewServer は完全なURLを返すため、ここではテスト用にURL全体をteamNameとして扱う
	// ただし、GetMonthlyPostCount内で `fmt.Sprintf(apiEndpointFormat, c.TeamName)` が使われるため、
	// このテストでは `apiEndpointFormat` を書き換えるか、teamNameの扱いを工夫する必要がある。
	// ここでは簡略化のため、apiEndpointFormatが `%s` のみを返すように見せかける。
	originalApiEndpointFormat := apiEndpointFormat
	apiEndpointFormat = "%s" // モックサーバーのURLを直接使うため
	defer func() { apiEndpointFormat = originalApiEndpointFormat }()

	client := NewDocBaseClient(server.URL, "test_token")
	client.Client = server.Client() // Use the test server's client

	count, err := client.GetMonthlyPostCount(2024, 7)
	if err != nil {
		t.Fatalf("GetMonthlyPostCount failed: %v", err)
	}
	if count != 15 {
		t.Errorf("Expected count 15, got %d", count)
	}
}

func TestGetMonthlyPostCount_ApiError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, "Internal Server Error")
	}))
	defer server.Close()

	originalApiEndpointFormat := apiEndpointFormat
	apiEndpointFormat = "%s"
	defer func() { apiEndpointFormat = originalApiEndpointFormat }()

	client := NewDocBaseClient(server.URL, "test_token")
	client.Client = server.Client()

	_, err := client.GetMonthlyPostCount(2024, 1)
	if err == nil {
		t.Fatal("Expected an error, but got nil")
	}
	expectedErrorMsg := "APIリクエストエラー: status code 500"
	if !strings.Contains(err.Error(), expectedErrorMsg) {
		t.Errorf("Expected error message to contain '%s', got '%s'", expectedErrorMsg, err.Error())
	}
}

func TestGetMonthlyPostCount_JsonDecodeError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintln(w, `{"meta": {"total_count": "not_a_number"}}`) // Invalid JSON
	}))
	defer server.Close()

	originalApiEndpointFormat := apiEndpointFormat
	apiEndpointFormat = "%s"
	defer func() { apiEndpointFormat = originalApiEndpointFormat }()

	client := NewDocBaseClient(server.URL, "test_token")
	client.Client = server.Client()

	_, err := client.GetMonthlyPostCount(2024, 1)
	if err == nil {
		t.Fatal("Expected an error, but got nil")
	}
	expectedErrorMsg := "レスポンスJSONのデコードに失敗"
	if !strings.Contains(err.Error(), expectedErrorMsg) {
		t.Errorf("Expected error message to contain '%s', got '%s'", expectedErrorMsg, err.Error())
	}
}

func TestParseArgs_Success(t *testing.T) {
	// Backup and restore original os.Args
	originalArgs := os.Args
	defer func() { os.Args = originalArgs }()

	// Test with command line arguments
	os.Args = []string{"cmd", "-team", "myteam", "-token", "mytoken", "-start-year", "2023", "-start-month", "10", "-end-year", "2024", "-end-month", "5"}
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

    // Test with environment variables
    os.Setenv("DOCBASE_TEAM", "envteam")
    os.Setenv("DOCBASE_TOKEN", "envtoken")
    defer os.Unsetenv("DOCBASE_TEAM")
    defer os.Unsetenv("DOCBASE_TOKEN")
    os.Args = []string{"cmd"} // Reset args to not use command line flags for these
    // Reset flag package state for re-parsing
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ExitOnError)

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
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ExitOnError) // Reset for this test
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
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ExitOnError)
	_, err := parseArgs()
	if err == nil {
		t.Fatal("Expected an error for invalid month, but got nil")
	}
	if !strings.Contains(err.Error(), "開始月は1から12の間で指定してください") {
		t.Errorf("Expected error message for invalid month, got '%s'", err.Error())
	}
}

func TestParseArgs_StartDateAfterEndDate(t *testing.T) {
    originalArgs := os.Args
    defer func() { os.Args = originalArgs }()
    os.Args = []string{"cmd", "-team", "t", "-token", "t", "-start-year", "2025", "-start-month", "1", "-end-year", "2024", "-end-month", "12"}
    flag.CommandLine = flag.NewFlagSet(os.Args[0], flag.ExitOnError)
    _, err := parseArgs()
    if err == nil {
        t.Fatal("Expected an error for start date after end date, but got nil")
    }
    if !strings.Contains(err.Error(), "開始年月が終了年月より後になっています") {
        t.Errorf("Expected error message for start date after end date, got '%s'", err.Error())
    }
}
