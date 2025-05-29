package db

import (
	"database/sql"
	// "encoding/json" // 不要になった
	"fmt"
	"log"
	// "net/http" // 不要になった
	"os"
	"path/filepath"
	"time" // time.Time を使うために追加

	_ "github.com/mattn/go-sqlite3" // SQLiteドライバー
)

var DB *sql.DB

// InitDB はデータベース接続を初期化し、スキーマを適用します。
func InitDB(dataSourceName string) error {
	// データベースファイルが置かれるディレクトリが存在しない場合は作成
	dbDir := filepath.Dir(dataSourceName)
	if _, err := os.Stat(dbDir); os.IsNotExist(err) {
		err = os.MkdirAll(dbDir, 0755)
		if err != nil {
			return fmt.Errorf("failed to create database directory %s: %w", dbDir, err)
		}
		log.Printf("Created database directory: %s", dbDir)
	}

	var err error
	DB, err = sql.Open("sqlite3", dataSourceName)
	if err != nil {
		return fmt.Errorf("failed to open database: %w", err)
	}

	if err = DB.Ping(); err != nil {
		return fmt.Errorf("failed to connect to database: %w", err)
	}

	log.Printf("Successfully connected to database: %s", dataSourceName)

	// スキーマの読み込みと実行
	schemaPath := "db/schema.sql" // main.goからの相対パスを想定
	schema, err := os.ReadFile(schemaPath)
	if err != nil {
		return fmt.Errorf("failed to read schema file %s: %w", schemaPath, err)
	}

	_, err = DB.Exec(string(schema))
	if err != nil {
		return fmt.Errorf("failed to apply schema: %w", err)
	}

	log.Println("Database schema applied successfully")
	return nil
}

// CloseDB はデータベース接続を閉じます。
func CloseDB() {
	if DB != nil {
		if err := DB.Close(); err != nil {
			log.Printf("Error closing database: %v", err)
		} else {
			log.Println("Database connection closed.")
		}
	}
}

// CachedResponseForDB はDB操作用の構造体です。
// proxy.CachedResponse と似ていますが、ResponseHeaders はJSON文字列として扱います。
type CachedResponseForDB struct {
	ID               int64
	RequestKey       string
	Method           string
	RequestURL       string
	StatusCode       int
	ResponseHeaders  string // JSON文字列
	ResponseBody     []byte
	CreatedAt        time.Time
	ExpiresAt        time.Time
	ETag             sql.NullString // NULL許容
	LastModified     sql.NullString // NULL許容
	LastAccessedAt   time.Time
}

// InsertOrUpdateCache はキャッシュアイテムをDBに挿入または更新します。
func InsertOrUpdateCache(item CachedResponseForDB) error {
	query := `
        INSERT INTO http_cache (
            request_key, method, request_url, status_code, response_headers, response_body,
            created_at, expires_at, etag, last_modified, last_accessed_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(request_key) DO UPDATE SET
            method = excluded.method,
            request_url = excluded.request_url,
            status_code = excluded.status_code,
            response_headers = excluded.response_headers,
            response_body = excluded.response_body,
            created_at = excluded.created_at,
            expires_at = excluded.expires_at,
            etag = excluded.etag,
            last_modified = excluded.last_modified,
            last_accessed_at = excluded.last_accessed_at;
    `
	stmt, err := DB.Prepare(query)
	if err != nil {
		return fmt.Errorf("failed to prepare statement for http_cache upsert: %w", err)
	}
	defer stmt.Close()

	_, err = stmt.Exec(
		item.RequestKey,
		item.Method,
		item.RequestURL,
		item.StatusCode,
		item.ResponseHeaders,
		item.ResponseBody,
		item.CreatedAt,
		item.ExpiresAt,
		item.ETag,
		item.LastModified,
		item.LastAccessedAt,
	)
	if err != nil {
		return fmt.Errorf("failed to execute upsert statement for http_cache: %w", err)
	}
	return nil
}

// GetCacheByKey はリクエストキーに一致するキャッシュアイテムをDBから取得します。
func GetCacheByKey(requestKey string) (*CachedResponseForDB, error) {
	query := `
        SELECT id, request_key, method, request_url, status_code, response_headers, response_body,
               created_at, expires_at, etag, last_modified, last_accessed_at
        FROM http_cache
        WHERE request_key = ?;
    `
	row := DB.QueryRow(query, requestKey)

	var dbItem CachedResponseForDB
	err := row.Scan(
		&dbItem.ID,
		&dbItem.RequestKey,
		&dbItem.Method,
		&dbItem.RequestURL,
		&dbItem.StatusCode,
		&dbItem.ResponseHeaders,
		&dbItem.ResponseBody,
		&dbItem.CreatedAt,
		&dbItem.ExpiresAt,
		&dbItem.ETag,
		&dbItem.LastModified,
		&dbItem.LastAccessedAt,
	)

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // キャッシュなし
		}
		return nil, fmt.Errorf("failed to scan http_cache row: %w", err)
	}
	return &dbItem, nil
}

// UpdateCacheAccessTime は指定されたキーのキャッシュアイテムの最終アクセス日時を更新します。
func UpdateCacheAccessTime(requestKey string, accessTime time.Time) error {
	query := `UPDATE http_cache SET last_accessed_at = ? WHERE request_key = ?;`
	stmt, err := DB.Prepare(query)
	if err != nil {
		return fmt.Errorf("failed to prepare statement for updating access time: %w", err)
	}
	defer stmt.Close()

	_, err = stmt.Exec(accessTime, requestKey)
	if err != nil {
		return fmt.Errorf("failed to execute statement for updating access time: %w", err)
	}
	return nil
}

// DeleteCacheByKey は指定されたキーのキャッシュアイテムを削除します。
func DeleteCacheByKey(requestKey string) error {
	query := `DELETE FROM http_cache WHERE request_key = ?;`
	stmt, err := DB.Prepare(query)
	if err != nil {
		return fmt.Errorf("failed to prepare statement for deleting cache item: %w", err)
	}
	defer stmt.Close()

	_, err = stmt.Exec(requestKey)
	if err != nil {
		return fmt.Errorf("failed to execute statement for deleting cache item: %w", err)
	}
	return nil
}

// PruneOldCache は指定されたサイズ上限 (MB) に基づいて、古いキャッシュを削除します (LRU)。
// また、有効期限切れのキャッシュも削除します。
func PruneCache(maxSizeBytes int64, defaultTTLSeconds int) error {
	// 1. 有効期限切れのアイテムを削除
	now := time.Now()
	deleteExpiredQuery := `DELETE FROM http_cache WHERE expires_at < ?;`
	_, err := DB.Exec(deleteExpiredQuery, now)
	if err != nil {
		return fmt.Errorf("failed to delete expired cache items: %w", err)
	}

	// 2. DBサイズが上限を超えている場合、LRUで削除
	// DBファイルサイズを取得 (プラットフォーム依存の可能性あり、単純化のためSQLiteのpragmaを利用)
	var currentDBSize int64
	// PRAGMA page_count と page_size を使ってファイルサイズを概算
	var pageCount int64
	var pageSize int64
	err = DB.QueryRow("PRAGMA page_count;").Scan(&pageCount)
	if err != nil {
		return fmt.Errorf("failed to get page_count: %w", err)
	}
	err = DB.QueryRow("PRAGMA page_size;").Scan(&pageSize)
	if err != nil {
		return fmt.Errorf("failed to get page_size: %w", err)
	}
	currentDBSize = pageCount * pageSize

	if currentDBSize > maxSizeBytes {
		log.Printf("[Cache Prune] Current DB size (%d bytes) exceeds max size (%d bytes). Pruning LRU items...", currentDBSize, maxSizeBytes)
		// 削除すべきおおよそのアイテム数を計算 (response_bodyの平均サイズが不明なので単純なループで対応)
		// 厳密なサイズ管理は難しいので、ある程度余裕を持たせる
		bytesToDelete := currentDBSize - maxSizeBytes
		var totalDeletedSize int64

		// last_accessed_at が古い順に取得して削除 (一度に多く取得しすぎないように注意)
		selectLRUQuery := `SELECT id, request_key, length(response_body) FROM http_cache ORDER BY last_accessed_at ASC LIMIT 100;`
		for totalDeletedSize < bytesToDelete {
			rows, err_ := DB.Query(selectLRUQuery)
			if err_ != nil {
				return fmt.Errorf("failed to select LRU items: %w", err_)
			}
			defer rows.Close()

			var itemCountInBatch int
			for rows.Next() {
				itemCountInBatch++
				var id int64
				var key string
				var bodyLength sql.NullInt64
				if err_ := rows.Scan(&id, &key, &bodyLength); err_ != nil {
					log.Printf("[Cache Prune] Error scanning LRU item: %v", err_)
					continue
				}
				if err_ := DeleteCacheByID(id); err_ != nil {
					log.Printf("[Cache Prune] Error deleting LRU item (ID: %d, Key: %s): %v", id, key, err_)
				} else {
					if bodyLength.Valid {
						totalDeletedSize += bodyLength.Int64
					}
					log.Printf("[Cache Prune] Deleted LRU item (ID: %d, Key: %s, Size: %v)", id, key, bodyLength.Int64)
				}
				if totalDeletedSize >= bytesToDelete {
					break
				}
			}
			if itemCountInBatch == 0 { // これ以上削除するアイテムがない
				break
			}
			if err_ := rows.Err(); err_ != nil { // rows.Next()ループ中のエラーチェック
				log.Printf("[Cache Prune] Error iterating LRU items: %v", err_)
			}
		}
		log.Printf("[Cache Prune] Pruning complete. Deleted approx %d bytes.", totalDeletedSize)
	}
	return nil
}

// DeleteCacheByID はIDでキャッシュアイテムを削除します (PruneCacheのヘルパー)
func DeleteCacheByID(id int64) error {
	query := `DELETE FROM http_cache WHERE id = ?;`
	_, err := DB.Exec(query, id)
	if err != nil {
		return fmt.Errorf("failed to delete cache item by ID %d: %w", id, err)
	}
	return nil
}

// Helper functions for sql.NullString
func ToNullString(s string) sql.NullString {
	if s == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: s, Valid: true}
}

func FromNullString(ns sql.NullString) string {
	if !ns.Valid {
		return ""
	}
	return ns.String
}
