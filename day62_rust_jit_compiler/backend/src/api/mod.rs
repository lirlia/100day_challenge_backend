// Web API モジュール（標準ライブラリベース）

use crate::jit::JitCompiler;
use serde::{Deserialize, Serialize};
use std::io::prelude::*;
use std::net::{TcpListener, TcpStream};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

/// APIレスポンス用のJIT統計情報
#[derive(Serialize, Debug)]
pub struct ApiJitStats {
    pub total_executions: u64,
    pub jit_compilations: u64,
    pub total_execution_time_ns: u64,
    pub total_compilation_time_ns: u64,
    pub average_execution_time_ns: u64,
    pub average_compilation_time_ns: u64,
    pub cache_entries: usize,
}

/// 式実行リクエスト
#[derive(Deserialize, Debug)]
pub struct ExecuteRequest {
    pub code: String,
}

/// 式実行レスポンス
#[derive(Serialize, Debug)]
pub struct ExecuteResponse {
    pub result: i64,
    pub execution_time_ns: u64,
    pub was_jit_compiled: bool,
    pub message: Option<String>,
}

/// JITキャッシュエントリ情報
#[derive(Serialize, Debug)]
pub struct CacheEntry {
    pub hash: String,
    pub execution_count: u64,
    pub is_compiled: bool,
    pub code_size_bytes: Option<usize>,
}

/// JITキャッシュ情報レスポンス
#[derive(Serialize, Debug)]
pub struct CacheResponse {
    pub entries: Vec<CacheEntry>,
    pub total_entries: usize,
}

/// エラーレスポンス
#[derive(Serialize, Debug)]
pub struct ErrorResponse {
    pub error: String,
    pub details: Option<String>,
}

/// アプリケーションの状態
pub type AppState = Arc<Mutex<JitCompiler>>;

/// タイムアウト付きロック獲得ヘルパー
fn try_lock_with_timeout<T>(
    mutex: &Arc<Mutex<T>>,
    timeout: Duration,
) -> Result<std::sync::MutexGuard<T>, String> {
    let start = Instant::now();
    loop {
        match mutex.try_lock() {
            Ok(guard) => return Ok(guard),
            Err(_) => {
                if start.elapsed() > timeout {
                    return Err("Lock timeout".to_string());
                }
                thread::sleep(Duration::from_millis(1));
            }
        }
    }
}

/// HTTPサーバーを開始
pub fn start_server(port: u16) -> std::io::Result<()> {
    let listener = TcpListener::bind(format!("127.0.0.1:{}", port))?;
    let jit_compiler = Arc::new(Mutex::new(JitCompiler::new()));

    println!("🌐 HTTP Server listening on http://127.0.0.1:{}", port);

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let jit_clone = Arc::clone(&jit_compiler);
                thread::spawn(move || {
                    handle_connection(stream, jit_clone);
                });
            }
            Err(e) => {
                eprintln!("Connection failed: {}", e);
            }
        }
    }

    Ok(())
}

/// 接続を処理
fn handle_connection(mut stream: TcpStream, jit_compiler: AppState) {
    let mut buffer = [0; 4096];

    if let Ok(bytes_read) = stream.read(&mut buffer) {
        let request = String::from_utf8_lossy(&buffer[..bytes_read]);

        // HTTPリクエストをパース
        let (method, path, body) = parse_http_request(&request);

        // ルーティング
        let response = match (method.as_str(), path.as_str()) {
            ("GET", "/api/health") => handle_health(),
            ("GET", "/api/stats") => handle_get_stats(jit_compiler),
            ("GET", "/api/cache") => handle_get_cache(jit_compiler),
            ("POST", "/api/execute") => handle_execute(body, jit_compiler),
            ("POST", "/api/reset") => handle_reset(jit_compiler),
            ("OPTIONS", _) => handle_options(), // CORS preflight
            _ => handle_not_found(),
        };

        if let Err(e) = stream.write_all(response.as_bytes()) {
            eprintln!("Failed to send response: {}", e);
        }
    }
}

/// HTTPリクエストを簡易パース
fn parse_http_request(request: &str) -> (String, String, String) {
    let lines: Vec<&str> = request.split('\n').collect();
    if lines.is_empty() {
        return ("GET".to_string(), "/".to_string(), "".to_string());
    }

    // リクエストライン（例: "GET /api/health HTTP/1.1"）
    let request_line_parts: Vec<&str> = lines[0].split_whitespace().collect();
    let method = request_line_parts.get(0).unwrap_or(&"GET").to_string();
    let path = request_line_parts.get(1).unwrap_or(&"/").to_string();

    // ボディを抽出（簡易実装）
    let body = if let Some(body_start) = request.find("\r\n\r\n") {
        request[body_start + 4..].to_string()
    } else if let Some(body_start) = request.find("\n\n") {
        request[body_start + 2..].to_string()
    } else {
        "".to_string()
    };

    (method, path, body)
}

/// ヘルスチェック
fn handle_health() -> String {
    let response_body = serde_json::json!({
        "status": "healthy",
        "service": "rust-jit-compiler",
        "version": "0.1.0"
    });

    create_http_response(200, "OK", &response_body.to_string())
}

/// 統計情報を取得
fn handle_get_stats(jit_compiler: AppState) -> String {
    match try_lock_with_timeout(&jit_compiler, Duration::from_secs(5)) {
        Ok(jit) => {
            let stats = jit.get_stats();
            let cache_info = jit.get_jit_cache_info();

            let api_stats = ApiJitStats {
                total_executions: stats.total_executions,
                jit_compilations: stats.jit_compilations,
                total_execution_time_ns: stats.total_execution_time_ns,
                total_compilation_time_ns: stats.total_compilation_time_ns,
                average_execution_time_ns: if stats.total_executions > 0 {
                    stats.total_execution_time_ns / stats.total_executions
                } else {
                    0
                },
                average_compilation_time_ns: if stats.jit_compilations > 0 {
                    stats.total_compilation_time_ns / stats.jit_compilations
                } else {
                    0
                },
                cache_entries: cache_info.len(),
            };

            match serde_json::to_string(&api_stats) {
                Ok(json) => create_http_response(200, "OK", &json),
                Err(_) => create_error_response(500, "JSON serialization failed"),
            }
        }
        Err(msg) => create_error_response(503, &msg),
    }
}

/// キャッシュ情報を取得
fn handle_get_cache(jit_compiler: AppState) -> String {
    match try_lock_with_timeout(&jit_compiler, Duration::from_secs(5)) {
        Ok(jit) => {
            let cache_info = jit.get_jit_cache_info();
            let entries: Vec<CacheEntry> = cache_info
                .into_iter()
                .map(|(hash, count, is_compiled)| CacheEntry {
                    hash: format!("{:#x}", hash),
                    execution_count: count,
                    is_compiled,
                    code_size_bytes: None,
                })
                .collect();

            let cache_response = CacheResponse {
                total_entries: entries.len(),
                entries,
            };

            match serde_json::to_string(&cache_response) {
                Ok(json) => create_http_response(200, "OK", &json),
                Err(_) => create_error_response(500, "JSON serialization failed"),
            }
        }
        Err(msg) => create_error_response(503, &msg),
    }
}

/// 式を実行
fn handle_execute(body: String, jit_compiler: AppState) -> String {
    // JSONをパース
    let request: ExecuteRequest = match serde_json::from_str(&body) {
        Ok(req) => req,
        Err(_) => return create_error_response(400, "Invalid JSON"),
    };

    match try_lock_with_timeout(&jit_compiler, Duration::from_secs(10)) {
        Ok(mut jit) => {
            match jit.execute_string(&request.code) {
                Ok(result) => {
                    let response = ExecuteResponse {
                        result: result.value,
                        execution_time_ns: result.execution_time_ns,
                        was_jit_compiled: result.was_jit_compiled,
                        message: if result.was_jit_compiled {
                            Some("JIT compiled".to_string())
                        } else {
                            None
                        },
                    };

                    match serde_json::to_string(&response) {
                        Ok(json) => create_http_response(200, "OK", &json),
                        Err(_) => create_error_response(500, "JSON serialization failed"),
                    }
                }
                Err(e) => create_error_response(400, &format!("Execution failed: {}", e)),
            }
        }
        Err(msg) => create_error_response(503, &msg),
    }
}

/// 統計をリセット
fn handle_reset(jit_compiler: AppState) -> String {
    match try_lock_with_timeout(&jit_compiler, Duration::from_secs(5)) {
        Ok(mut jit) => {
            jit.reset_stats();

            let response = serde_json::json!({
                "status": "success",
                "message": "Statistics reset successfully"
            });

            create_http_response(200, "OK", &response.to_string())
        }
        Err(msg) => create_error_response(503, &msg),
    }
}

/// CORS プリフライトリクエストを処理
fn handle_options() -> String {
    let response = "HTTP/1.1 200 OK\r\n\
                   Access-Control-Allow-Origin: *\r\n\
                   Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n\
                   Access-Control-Allow-Headers: Content-Type\r\n\
                   Content-Length: 0\r\n\r\n";
    response.to_string()
}

/// 404を処理
fn handle_not_found() -> String {
    create_error_response(404, "Not Found")
}

/// HTTPレスポンスを作成
fn create_http_response(status_code: u16, status_text: &str, body: &str) -> String {
    format!(
        "HTTP/1.1 {} {}\r\n\
         Content-Type: application/json\r\n\
         Access-Control-Allow-Origin: *\r\n\
         Content-Length: {}\r\n\r\n{}",
        status_code,
        status_text,
        body.len(),
        body
    )
}

/// エラーレスポンスを作成
fn create_error_response(status_code: u16, message: &str) -> String {
    let error_response = ErrorResponse {
        error: message.to_string(),
        details: None,
    };

    let body = serde_json::to_string(&error_response).unwrap_or_else(|_| {
        format!(r#"{{"error":"{}"}}"#, message)
    });

    let status_text = match status_code {
        400 => "Bad Request",
        404 => "Not Found",
        500 => "Internal Server Error",
        503 => "Service Unavailable",
        _ => "Error",
    };

    create_http_response(status_code, status_text, &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_http_request() {
        let request = "GET /api/health HTTP/1.1\r\nHost: localhost:3001\r\n\r\n";
        let (method, path, body) = parse_http_request(request);

        assert_eq!(method, "GET");
        assert_eq!(path, "/api/health");
        assert_eq!(body, "");
    }

    #[test]
    fn test_parse_post_request() {
        let request = "POST /api/execute HTTP/1.1\r\nContent-Type: application/json\r\n\r\n{\"code\":\"1+2\"}";
        let (method, path, body) = parse_http_request(request);

        assert_eq!(method, "POST");
        assert_eq!(path, "/api/execute");
        assert_eq!(body, r#"{"code":"1+2"}"#);
    }

    #[test]
    fn test_health_response() {
        let response = handle_health();
        assert!(response.contains("200 OK"));
        assert!(response.contains("healthy"));
    }
}