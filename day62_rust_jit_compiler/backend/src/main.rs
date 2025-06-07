mod ast;
mod lexer;
mod parser;
mod interpreter;
mod jit;

use ast::*;
use interpreter::Interpreter;
use parser::Parser;
use anyhow::Result;

fn main() -> Result<()> {
    println!("🚀 Day62: Rust JIT コンパイラ with Web Dashboard");
    println!("{}", "=".repeat(50));

    // Phase 2 完了テスト
    test_lexer_parser_interpreter()?;

    println!("\n✅ Phase 2: Rustコア実装 - 完了");
    println!("次の実装予定: Phase 3 - JITエンジン実装");

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_integration() {
        test_lexer_parser_interpreter().unwrap();
    }
}
