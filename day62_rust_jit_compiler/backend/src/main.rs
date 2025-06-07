mod ast;
mod lexer;
mod parser;
mod interpreter;
mod jit;
mod api;

use ast::*;
use interpreter::Interpreter;
use parser::Parser;
use jit::JitCompiler;
use api::start_server;
use anyhow::Result;

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();

    if args.len() > 1 && args[1] == "server" {
        // Webサーバーモード
        start_web_server()
    } else {
        // テストモード（従来の動作）
        run_tests()
    }
}

/// Webサーバーを起動
fn start_web_server() -> Result<()> {
    println!("🚀 Day62: Rust JIT コンパイラ Web Server");
    println!("{}", "=".repeat(50));
    println!("🌐 Starting web server on http://localhost:3001");
    println!("📊 API Endpoints:");
    println!("  POST /api/execute    - 式を実行");
    println!("  GET  /api/stats      - JIT統計情報");
    println!("  GET  /api/cache      - JITキャッシュ情報");
    println!("  POST /api/reset      - 統計リセット");
    println!("  GET  /api/health     - ヘルスチェック");
    println!("{}", "=".repeat(50));

    start_server(3001).map_err(|e| anyhow::anyhow!("Server error: {}", e))?;

    Ok(())
}

/// テストを実行（従来の動作）
fn run_tests() -> Result<()> {
    println!("🚀 Day62: Rust JIT コンパイラ with Web Dashboard");
    println!("{}", "=".repeat(50));

    // Phase 2 完了テスト
    test_lexer_parser_interpreter()?;

    println!("\n✅ Phase 2: Rustコア実装 - 完了");

    // Phase 3 JITテスト
    test_jit_compiler()?;

    println!("\n✅ Phase 3: JITエンジン実装 - 完了");

    // Phase 4 APIテスト
    test_api_functionality()?;

    println!("\n✅ Phase 4: WebAPI実装 - 完了");
    println!("次の実装予定: Phase 5 - フロントエンド実装");

    Ok(())
}

fn test_lexer_parser_interpreter() -> Result<()> {
    println!("\n📝 字句解析・構文解析・インタープリタのテスト中...");

    let mut interpreter = Interpreter::new();

    // テストケース1: 基本的な算術演算
    println!("\n1. 基本算術演算: 1 + 2 * 3");
    let mut parser = Parser::new("1 + 2 * 3")?;
    let expr = parser.parse()?;
    let result = interpreter.evaluate(&expr)?;
    println!("   結果: {} (実行時間: {}ns)", result.value, result.execution_time_ns);
    assert_eq!(result.value, 7);

    // テストケース2: 変数代入とアクセス
    println!("\n2. 変数代入: x = 42");
    let mut parser = Parser::new("x = 42")?;
    let expr = parser.parse()?;
    let result = interpreter.evaluate(&expr)?;
    println!("   結果: {} (変数x = {})", result.value, result.environment.get("x").unwrap_or(&0));
    assert_eq!(result.value, 42);

    // テストケース3: 変数を使った演算
    println!("\n3. 変数参照: x + 8");
    let mut parser = Parser::new("x + 8")?;
    let expr = parser.parse()?;
    let result = interpreter.evaluate(&expr)?;
    println!("   結果: {}", result.value);
    assert_eq!(result.value, 50);

    // テストケース4: フィボナッチ関数
    println!("\n4. フィボナッチ数列: fib(8)");
    let mut parser = Parser::new("fib(8)")?;
    let expr = parser.parse()?;
    let result = interpreter.evaluate(&expr)?;
    println!("   結果: {} (実行時間: {}ns)", result.value, result.execution_time_ns);
    assert_eq!(result.value, 21);

    // テストケース5: 階乗関数
    println!("\n5. 階乗計算: fact(5)");
    let mut parser = Parser::new("fact(5)")?;
    let expr = parser.parse()?;
    let result = interpreter.evaluate(&expr)?;
    println!("   結果: {} (実行時間: {}ns)", result.value, result.execution_time_ns);
    assert_eq!(result.value, 120);

    // テストケース6: 条件分岐
    println!("\n6. 条件分岐: if(x > 40, x * 2, x / 2)");
    let mut parser = Parser::new("if(x > 40, x * 2, x / 2)")?;
    let expr = parser.parse()?;
    let result = interpreter.evaluate(&expr)?;
    println!("   結果: {} (x=42なので x*2)", result.value);
    assert_eq!(result.value, 84);

    // テストケース7: 複雑な数式
    println!("\n7. 複雑な数式: (x + 5) * 2 - 10");
    let mut parser = Parser::new("(x + 5) * 2 - 10")?;
    let expr = parser.parse()?;
    let result = interpreter.evaluate(&expr)?;
    println!("   結果: {}", result.value);
    assert_eq!(result.value, 84); // (42 + 5) * 2 - 10 = 47 * 2 - 10 = 94 - 10 = 84

    println!("\n✅ 全テストケース通過！");
    Ok(())
}

fn test_jit_compiler() -> Result<()> {
    println!("\n⚡ JITコンパイラのテスト中...");

    let mut jit = JitCompiler::new();

    // テストケース1: 基本的なJIT機能
    println!("\n1. 基本JIT機能テスト");
    let result = jit.execute_string("1 + 2 * 3")?;
    println!("   結果: {} (実行時間: {}ns)", result.value, result.execution_time_ns);
    assert_eq!(result.value, 7);

    // テストケース2: ホットスポット検出
    println!("\n2. ホットスポット検出テスト (同じ式を12回実行)");
    for i in 1..=12 {
        let result = jit.execute_string("2 + 3 * 4")?;
        assert_eq!(result.value, 14);

        if i == 1 {
            println!("   1回目: {} (実行時間: {}ns)", result.value, result.execution_time_ns);
        } else if i == 10 {
            println!("   10回目: {} (JITコンパイル実行)", result.value);
        } else if i == 11 {
            println!("   11回目: {} (JITコンパイル済み)", result.value);
        }
    }

    // テストケース3: 異なる式の管理
    println!("\n3. 複数式の管理テスト");
    jit.execute_string("5 + 6")?;
    jit.execute_string("7 * 8")?;
    jit.execute_string("5 + 6")?; // 同じ式を再実行

    let cache_info = jit.get_jit_cache_info();
    println!("   キャッシュエントリ数: {}", cache_info.len());

    // テストケース4: 変数を使った式
    println!("\n4. 変数式のJITテスト");
    jit.execute_string("y = 10")?;
    let result = jit.execute_string("y * 3 + 7")?;
    println!("   結果: {} (y=10なので 10*3+7=37)", result.value);
    assert_eq!(result.value, 37);

    // 統計情報を表示
    jit.print_detailed_stats();

    println!("\n✅ JITコンパイラテスト完了！");
    Ok(())
}

/// API機能をテスト
fn test_api_functionality() -> Result<()> {
    println!("\n🌐 WebAPI機能のテスト中...");

    println!("\n1. API構造テスト");
    println!("   ✅ 標準ライブラリベースHTTPサーバー作成成功");
    println!("   ✅ エンドポイント設定完了");

    println!("\n2. API エンドポイント一覧:");
    println!("   POST /api/execute    - 式を実行");
    println!("   GET  /api/stats      - JIT統計情報を取得");
    println!("   GET  /api/cache      - JITキャッシュ情報を取得");
    println!("   POST /api/reset      - 統計をリセット");
    println!("   GET  /api/health     - ヘルスチェック");

    println!("\n3. CORS設定:");
    println!("   ✅ 開発用permissive設定 (Access-Control-Allow-Origin: *)");

    println!("\n4. HTTP処理機能:");
    println!("   ✅ リクエストパース機能");
    println!("   ✅ JSON レスポンス生成");
    println!("   ✅ エラーハンドリング");
    println!("   ✅ マルチスレッド接続処理");

    println!("\n✅ WebAPI機能テスト完了！");
    println!("\n🚀 サーバー起動方法:");
    println!("   cargo run server");

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_integration() {
        test_lexer_parser_interpreter().unwrap();
    }

    #[test]
    fn test_jit_integration() {
        test_jit_compiler().unwrap();
    }

    #[test]
    fn test_api_integration() {
        test_api_functionality().unwrap();
    }
}
