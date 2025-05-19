package client

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strings"
	"time"
	// APIサーバーのDTOを直接参照するか、ここで再定義する。
	// 今回はAPIサーバー側の server.CreateTableRequest などを直接は参照せず、
	// clientパッケージ内で必要なリクエスト/レスポンス構造を定義するアプローチを取る。
	// 共通化する場合は internal/types などに移動する。
)

// APIClient は Raft ノードの HTTP API と通信するためのクライアントです。
type APIClient struct {
	httpClient          *http.Client
	baseURL             string // APIサーバーのベースURL (例: "http://127.0.0.1:8100")
	maxRetriesOnForward int    // リーダーフォワーディングの最大リトライ回数
	targetAddr          string // Added for DeleteTable method
}

// NewAPIClient は新しい APIClient を作成します。
func NewAPIClient(targetNodeAddr string) *APIClient {
	return &APIClient{
		httpClient:          &http.Client{Timeout: 10 * time.Second},
		baseURL:             fmt.Sprintf("http://%s", targetNodeAddr),
		maxRetriesOnForward: 1, // デフォルトのリトライ回数は1回
		targetAddr:          targetNodeAddr,
	}
}

// raftToHttpApiAddr はRaftアドレスを対応するHTTP APIアドレスに変換します。
// このマッピングはe2eテストやサーバー起動時の設定と一致している必要があります。
var raftToHttpApiAddrMap = map[string]string{
	"127.0.0.1:7000": "127.0.0.1:8100", // Node0 (本来のRaft Addr)
	"127.0.0.1:7001": "127.0.0.1:8101", // Node1
	"127.0.0.1:7002": "127.0.0.1:8102", // Node2
	"127.0.0.1:8000": "127.0.0.1:8100", // Leader (node0) が 8000番で通知される場合への対応
	// 必要に応じて他のノードのマッピングも追加
}

func getHttpApiAddrFromRaftAddr(raftAddr string) (string, bool) {
	httpAddr, ok := raftToHttpApiAddrMap[raftAddr]
	return httpAddr, ok
}

// --- Request/Response Structs ---

// CreateTableRequest はテーブル作成APIへのリクエストボディです。
type CreateTableRequest struct {
	TableName    string `json:"table_name"`
	PartitionKey string `json:"partition_key_name"`
	SortKey      string `json:"sort_key_name,omitempty"`
}

// PutItemRequest はアイテム登録APIへのリクエストボディです。
type PutItemRequest struct {
	TableName string                 `json:"table_name"`
	Item      map[string]interface{} `json:"item"`
}

// GetItemRequest はアイテム取得APIへのリクエストボディです。
type GetItemRequest struct {
	TableName    string `json:"table_name"`
	PartitionKey string `json:"partition_key"`
	SortKey      string `json:"sort_key,omitempty"`
}

// DeleteItemRequest はアイテム削除APIへのリクエストボディです。
type DeleteItemRequest struct {
	TableName    string `json:"table_name"`
	PartitionKey string `json:"partition_key"`
	SortKey      string `json:"sort_key,omitempty"`
}

// QueryItemsRequest はアイテムクエリAPIへのリクエストボディです。
type QueryItemsRequest struct {
	TableName     string `json:"table_name"`
	PartitionKey  string `json:"partition_key"`
	SortKeyPrefix string `json:"sort_key_prefix,omitempty"`
}

// DeleteTableRequest defines the payload for a delete table request.
// The actual API might just take the table name in the URL path.
type DeleteTableRequest struct {
	TableName string `json:"table_name"`
}

/*
// GenericResponse is a generic structure for API responses that might be success or failure.
// It's less type-safe than specific success/error responses.
type GenericResponse struct {
	Success     bool        `json:"success"`
	Message     string      `json:"message,omitempty"`
	Error       string      `json:"error,omitempty"`
	Data        interface{} `json:"data,omitempty"`
	TableName   string      `json:"table_name,omitempty"`
	ItemKey     string      `json:"item_key,omitempty"`
	Version     int64       `json:"version,omitempty"`
	Item        json.RawMessage `json:"item,omitempty"`
	Items       []map[string]interface{} `json:"items,omitempty"`
	FSMResponse interface{} `json:"fsm_response,omitempty"`
}
*/

// APISuccessResponse は成功時のAPIレスポンスの基本形です。
// FSMからの具体的なレスポンスは FSMResponse に格納されます。
type APISuccessResponse struct {
	Message     string                   `json:"message"`
	TableName   string                   `json:"table_name,omitempty"`
	ItemKey     string                   `json:"item_key,omitempty"`     // For PutItem, GetItem, DeleteItem
	Version     int64                    `json:"version,omitempty"`      // For GetItem (could also be for PutItem if versions are returned)
	Item        json.RawMessage          `json:"item,omitempty"`         // For GetItem
	Items       []map[string]interface{} `json:"items,omitempty"`        // For QueryItems
	FSMResponse interface{}              `json:"fsm_response,omitempty"` // Raw FSM response, if any
	Tables      []string                 `json:"tables,omitempty"`       // For ListTables
}

// APIErrorResponse はエラー時のAPIレスポンスです。
type APIErrorResponse struct {
	Error       string `json:"error"`
	Message     string `json:"message,omitempty"` // より詳細なユーザー向けメッセージ
	HttpApiAddr string `json:"http_api_addr"`
}

// --- Client Methods ---

// Status はRaftノードのステータスを取得します。
// TODO: Statusレスポンス用の構造体を定義する
func (c *APIClient) Status() (*APISuccessResponse, error) {
	endpoint := c.baseURL + "/status"
	httpResp, err := c.httpClient.Get(endpoint)
	if err != nil {
		return nil, fmt.Errorf("Status HTTP GET request failed: %w", err)
	}
	defer httpResp.Body.Close()

	bodyBytes, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read Status response body: %w", err)
	}

	if httpResp.StatusCode != http.StatusOK {
		var errResp APIErrorResponse
		if unmarshalErr := json.Unmarshal(bodyBytes, &errResp); unmarshalErr == nil && errResp.Error != "" {
			return nil, fmt.Errorf("Status API call failed: status %d, error: %s, message: %s", httpResp.StatusCode, errResp.Error, errResp.Message)
		}
		return nil, fmt.Errorf("Status API call failed: status %d, body: %s", httpResp.StatusCode, string(bodyBytes))
	}

	var resp APISuccessResponse
	if err := json.Unmarshal(bodyBytes, &resp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal Status success response: %w, body: %s", err, string(bodyBytes))
	}
	return &resp, nil
}

// CreateTable は指定されたテーブルを作成するようRaftノードにリクエストします。
func (c *APIClient) CreateTable(tableName, partitionKeyName, sortKeyName string) (*APISuccessResponse, error) {
	reqBody := CreateTableRequest{
		TableName:    tableName,
		PartitionKey: partitionKeyName,
		SortKey:      sortKeyName,
	}
	var apiResp APISuccessResponse
	err := c.makeRequest(http.MethodPost, "/create-table", reqBody, &apiResp)
	if err != nil {
		return nil, err
	}
	return &apiResp, nil
}

// DeleteTable sends a request to delete a table.
func (c *APIClient) DeleteTable(tableName string) (*APISuccessResponse, error) {
	if tableName == "" {
		return nil, errors.New("table name cannot be empty for DeleteTable")
	}

	// Ensure targetAddr includes the scheme (http://)
	finalTargetAddr := c.targetAddr
	if !strings.HasPrefix(finalTargetAddr, "http://") && !strings.HasPrefix(finalTargetAddr, "https://") {
		finalTargetAddr = "http://" + finalTargetAddr
	}
	reqURL := fmt.Sprintf("%s/tables/%s", finalTargetAddr, tableName)
	log.Printf("[CLI] DeleteTable: Requesting DELETE %s", reqURL)

	httpReq, err := http.NewRequest("DELETE", reqURL, nil)
	if err != nil {
		log.Printf("[CLI] DeleteTable: Failed to create HTTP request: %v", err)
		return nil, fmt.Errorf("failed to create DeleteTable request: %w", err)
	}

	// Use c.httpClient if it's already initialized and configured (e.g., in NewAPIClient).
	httpClientToUse := c.httpClient
	if httpClientToUse == nil {
		httpClientToUse = &http.Client{Timeout: 10 * time.Second} // Fallback if not initialized
	}

	httpResp, err := httpClientToUse.Do(httpReq)
	if err != nil {
		log.Printf("[CLI] DeleteTable: Failed to execute request: %v", err)
		return nil, fmt.Errorf("failed to execute DeleteTable request: %w", err)
	}
	defer httpResp.Body.Close()

	log.Printf("[CLI] DeleteTable: Response Status: %s", httpResp.Status)

	if httpResp.StatusCode != http.StatusOK {
		// Use the existing handleErrorResponse method
		return nil, c.handleErrorResponse(httpResp)
	}

	body, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read DeleteTable response body (status %d): %v", httpResp.StatusCode, err)
	}

	var successResp APISuccessResponse
	if err := json.Unmarshal(body, &successResp); err != nil {
		return nil, fmt.Errorf("failed to unmarshal DeleteTable success response (status %d, body: %s): %v", httpResp.StatusCode, string(body), err)
	}

	return &successResp, nil
}

// PutItem は指定されたテーブルにアイテムを登録/更新するようRaftノードにリクエストします。
func (c *APIClient) PutItem(tableName string, itemData map[string]interface{}) (*APISuccessResponse, error) {
	reqPayload := PutItemRequest{
		TableName: tableName,
		Item:      itemData,
	}
	var apiResp APISuccessResponse
	err := c.makeRequest(http.MethodPost, "/put-item", reqPayload, &apiResp)
	if err != nil {
		return nil, err
	}
	return &apiResp, nil
}

// GetItem はアイテム取得APIを呼び出します。
func (c *APIClient) GetItem(tableName, partitionKey, sortKey string) (*APISuccessResponse, error) {
	reqPayload := GetItemRequest{
		TableName:    tableName,
		PartitionKey: partitionKey,
		SortKey:      sortKey,
	}
	var apiResp APISuccessResponse
	err := c.makeRequest(http.MethodPost, "/get-item", reqPayload, &apiResp) // API側はPOSTで実装
	if err != nil {
		return nil, err
	}
	return &apiResp, nil
}

// DeleteItem はアイテム削除APIを呼び出します。
func (c *APIClient) DeleteItem(tableName, partitionKey, sortKey string) (*APISuccessResponse, error) {
	reqPayload := DeleteItemRequest{
		TableName:    tableName,
		PartitionKey: partitionKey,
		SortKey:      sortKey,
	}
	var apiResp APISuccessResponse
	err := c.makeRequest(http.MethodPost, "/delete-item", reqPayload, &apiResp) // API側はPOSTで実装
	if err != nil {
		return nil, err
	}
	return &apiResp, nil
}

// QueryItems はアイテムクエリAPIを呼び出します。
func (c *APIClient) QueryItems(tableName, partitionKey, sortKeyPrefix string) (*APISuccessResponse, error) {
	reqPayload := QueryItemsRequest{
		TableName:     tableName,
		PartitionKey:  partitionKey,
		SortKeyPrefix: sortKeyPrefix,
	}
	var apiResp APISuccessResponse
	err := c.makeRequest(http.MethodPost, "/query-items", reqPayload, &apiResp) // API側はPOSTで実装
	if err != nil {
		return nil, err
	}
	return &apiResp, nil
}

func (c *APIClient) makeRequest(method, path string, body interface{}, responseDest interface{}) error {
	return c.makeRequestRecursive(method, path, body, responseDest, 0)
}

func (c *APIClient) makeRequestRecursive(method, path string, body interface{}, responseDest interface{}, attempt int) error {
	var reqBody []byte
	var err error
	if body != nil {
		reqBody, err = json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to marshal request body: %w", err)
		}
	}

	currentBaseURL := c.baseURL
	fullURL := currentBaseURL + path
	log.Printf("APIClient: Attempt %d: Sending %s request to %s", attempt+1, method, fullURL)

	req, err := http.NewRequest(method, fullURL, bytes.NewBuffer(reqBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request to %s: %w", fullURL, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 { // エラーレスポンス
		var errResp APIErrorResponse
		// まずAPIErrorResponseとしてパースを試みる
		if unmarshalErr := json.Unmarshal(respBody, &errResp); unmarshalErr != nil {
			// パースに失敗したら、ボディ全体をエラーメッセージとして返す
			return fmt.Errorf("API error (status %d): %s (failed to parse error response: %v)", resp.StatusCode, string(respBody), unmarshalErr)
		}

		// リーダーフォワーディング処理
		if resp.StatusCode == http.StatusMisdirectedRequest && attempt < c.maxRetriesOnForward {
			log.Printf("APIClient: Received 421 Misdirected Request from %s. Attempting to forward (attempt %d/%d). Body: %s", fullURL, attempt+1, c.maxRetriesOnForward, string(respBody))
			// エラーメッセージからリーダーのRaftアドレスを抽出
			// APIErrorResponse.Error に格納されていると期待
			re := regexp.MustCompile(`leader [^ ]+ \(([^)]+)\)`)
			matches := re.FindStringSubmatch(errResp.Error) // errResp.Error を使用
			if len(matches) < 2 {
				// もし APIErrorResponse.Error が期待した形式でない場合、レスポンスボディ全体から探す
				matches = re.FindStringSubmatch(string(respBody))
			}

			if len(matches) >= 2 {
				leaderRaftAddr := matches[1]
				log.Printf("APIClient: Extracted leader Raft address: %s", leaderRaftAddr)
				if leaderHttpApiAddr, ok := getHttpApiAddrFromRaftAddr(leaderRaftAddr); ok {
					log.Printf("APIClient: Found corresponding HTTP API address for leader: %s. Retrying request.", leaderHttpApiAddr)
					originalBaseURL := c.baseURL
					c.baseURL = fmt.Sprintf("http://%s", leaderHttpApiAddr)
					// makeRequestRecursive の呼び出し前にエラーをクリア
					err = c.makeRequestRecursive(method, path, body, responseDest, attempt+1)
					c.baseURL = originalBaseURL // baseURLを元に戻す
					return err                  // 再帰呼び出しの結果をそのまま返す
				}
				log.Printf("APIClient: Could not find HTTP API address mapping for Raft address: %s. Forwarding failed.", leaderRaftAddr)
			} else {
				log.Printf("APIClient: Could not extract leader Raft address from 421 response: %s. Forwarding failed.", string(respBody))
			}
		}

		// フォワーディングしなかった、またはできなかった場合、またはその他の400以上のエラー
		errMsg := fmt.Sprintf("API error (status %d): %s", resp.StatusCode, errResp.Error)
		if errResp.Message != "" {
			errMsg += fmt.Sprintf(" (Details: %s)", errResp.Message)
		}
		return fmt.Errorf(errMsg)
	}

	// 成功レスポンス (2xx)
	if responseDest != nil {
		if err := json.Unmarshal(respBody, responseDest); err != nil {
			return fmt.Errorf("failed to unmarshal successful response body: %w. Body: %s", err, string(respBody))
		}
	}
	return nil
}

func (c *APIClient) handleErrorResponse(resp *http.Response) error {
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read error response body: %w", err)
	}

	var errResp APIErrorResponse
	if unmarshalErr := json.Unmarshal(body, &errResp); unmarshalErr != nil {
		return fmt.Errorf("failed to parse error response: %w", unmarshalErr)
	}

	errMsg := fmt.Sprintf("API error (status %d): %s", resp.StatusCode, errResp.Error)
	if errResp.Message != "" {
		errMsg += fmt.Sprintf(" (Details: %s)", errResp.Message)
	}
	return fmt.Errorf(errMsg)
}
