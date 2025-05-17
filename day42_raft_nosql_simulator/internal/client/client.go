package client

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"net/http"
	"time"
	// APIサーバーのDTOを直接参照するか、ここで再定義する。
	// 今回はAPIサーバー側の server.CreateTableRequest などを直接は参照せず、
	// clientパッケージ内で必要なリクエスト/レスポンス構造を定義するアプローチを取る。
	// 共通化する場合は internal/types などに移動する。
)

// APIClient はNoSQL DBのHTTP APIと通信するためのクライアントです。
type APIClient struct {
	httpClient *http.Client
	baseURL    string // APIサーバーのベースURL (例: "http://127.0.0.1:8100")
}

// NewAPIClient は新しいAPIClientインスタンスを作成します。
func NewAPIClient(targetNodeAddr string) *APIClient {
	return &APIClient{
		httpClient: &http.Client{Timeout: 10 * time.Second},
		baseURL:    fmt.Sprintf("http://%s", targetNodeAddr),
	}
}

// --- DTOs (クライアント側で使用するリクエスト/レスポンス構造) ---
// server/http_api.go のDTOと対応するが、重複を許容してここで定義

type CreateTableRequest struct {
	TableName        string `json:"tableName"`
	PartitionKeyName string `json:"partitionKeyName"`
	SortKeyName      string `json:"sortKeyName,omitempty"`
}

type PutItemRequest struct {
	TableName string                 `json:"tableName"`
	Item      map[string]interface{} `json:"item"`
}

type GetItemRequest struct {
	TableName    string `json:"tableName"`
	PartitionKey string `json:"partitionKey"`
	SortKey      string `json:"sortKey,omitempty"`
}

type DeleteItemRequest struct {
	TableName    string `json:"tableName"`
	PartitionKey string `json:"partitionKey"`
	SortKey      string `json:"sortKey,omitempty"`
}

type QueryItemsRequest struct {
	TableName     string `json:"tableName"`
	PartitionKey  string `json:"partitionKey"`
	SortKeyPrefix string `json:"sortKeyPrefix,omitempty"`
}

// 汎用的なAPIレスポンス (成功時、FSMからのレスポンスを含む場合など)
type APISuccessResponse struct {
	Message     string      `json:"message"`
	FSMResponse interface{} `json:"fsm_response,omitempty"` // Raft経由の操作の場合
	// GetItem/QueryItems用
	Item    json.RawMessage          `json:"item,omitempty"`
	Items   []map[string]interface{} `json:"items,omitempty"`
	Version int64                    `json:"version,omitempty"`
}

// APIエラーレスポンス
type APIErrorResponse struct {
	Error string `json:"error"`
}

// --- Client Methods ---

func (c *APIClient) makeRequest(method, path string, body interface{}, responseDest interface{}) error {
	var reqBody []byte
	var err error
	if body != nil {
		reqBody, err = json.Marshal(body)
		if err != nil {
			return fmt.Errorf("failed to marshal request body: %w", err)
		}
	}

	req, err := http.NewRequest(method, c.baseURL+path, bytes.NewBuffer(reqBody))
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("failed to execute request to %s%s: %w", c.baseURL, path, err)
	}
	defer resp.Body.Close()

	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode >= 400 { // エラーレスポンス
		var errResp APIErrorResponse
		if jsonErr := json.Unmarshal(respBody, &errResp); jsonErr == nil && errResp.Error != "" {
			return fmt.Errorf("API error (status %d): %s", resp.StatusCode, errResp.Error)
		}
		return fmt.Errorf("API error (status %d): %s", resp.StatusCode, string(respBody))
	}

	if responseDest != nil {
		if err := json.Unmarshal(respBody, responseDest); err != nil {
			return fmt.Errorf("failed to unmarshal successful response body: %w. Body: %s", err, string(respBody))
		}
	}
	return nil
}

// CreateTable はテーブル作成APIを呼び出します。
func (c *APIClient) CreateTable(tableName, partitionKeyName, sortKeyName string) (*APISuccessResponse, error) {
	reqPayload := CreateTableRequest{
		TableName:        tableName,
		PartitionKeyName: partitionKeyName,
		SortKeyName:      sortKeyName,
	}
	var apiResp APISuccessResponse
	err := c.makeRequest(http.MethodPost, "/create-table", reqPayload, &apiResp)
	if err != nil {
		return nil, err
	}
	return &apiResp, nil
}

// PutItem はアイテム書き込みAPIを呼び出します。
func (c *APIClient) PutItem(tableName string, item map[string]interface{}) (*APISuccessResponse, error) {
	reqPayload := PutItemRequest{
		TableName: tableName,
		Item:      item,
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

// GetStatus はノードのステータス取得APIを呼び出します。
func (c *APIClient) GetStatus() (map[string]interface{}, error) {
	var statusResp map[string]interface{}
	err := c.makeRequest(http.MethodGet, "/status", nil, &statusResp)
	if err != nil {
		return nil, err
	}
	return statusResp, nil
}
