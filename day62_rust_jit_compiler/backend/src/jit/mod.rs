// JITコンパイラモジュール

pub mod codegen;

use crate::ast::{Environment, Expr, ExecutionResult, JitStats};
use crate::interpreter::Interpreter;
use crate::parser::Parser;
use anyhow::{anyhow, Result};
use codegen::{CompiledFunction, X86CodeGenerator};
use std::collections::HashMap;
use std::time::Instant;

/// 実行可能メモリ管理（シミュレーション版）
///
/// 注意: 実際のJIT実行は安全のため無効化されています。
/// マシンコード生成は正常に動作しますが、実行はインタープリタで行われます。
pub struct ExecutableMemory {
    code: Vec<u8>,
    simulated: bool,
}

impl ExecutableMemory {
    /// 実行可能メモリページを作成（シミュレーション）
    pub fn new(code: &[u8]) -> Result<Self> {
        println!("⚠️  実行可能メモリはシミュレーションモードです");

        Ok(Self {
            code: code.to_vec(),
            simulated: true,
        })
    }

    /// 関数として実行（シミュレーション）
    pub unsafe fn execute(&self) -> i64 {
        // 実際のマシンコード実行は危険なため、ダミー値を返す
        println!("⚡ JIT実行シミュレーション ({}バイトのマシンコード)", self.code.len());
        42 // ダミー値
    }

    /// 生成されたマシンコードを取得
    pub fn get_code(&self) -> &[u8] {
        &self.code
    }
}

/// JIT実行エントリ
#[derive(Debug, Clone)]
pub struct JitEntry {
    pub expr_hash: u64,
    pub execution_count: u64,
    pub compiled_function: Option<CompiledFunction>,
}

/// JITコンパイラ
pub struct JitCompiler {
    stats: JitStats,
    hot_threshold: u64,
    interpreter: Interpreter,
    codegen: X86CodeGenerator,
    jit_cache: HashMap<u64, JitEntry>,
}

impl JitCompiler {
    pub fn new() -> Self {
        Self {
            stats: JitStats::default(),
            hot_threshold: 10,
            interpreter: Interpreter::new(),
            codegen: X86CodeGenerator::new(),
            jit_cache: HashMap::new(),
        }
    }

    /// 式を実行（インタープリタまたはJIT）
    pub fn execute(&mut self, expr: &Expr) -> Result<ExecutionResult> {
        let expr_hash = self.hash_expr(expr);

        // JITキャッシュをチェック
        let should_jit = if let Some(entry) = self.jit_cache.get_mut(&expr_hash) {
            entry.execution_count += 1;
            entry.execution_count >= self.hot_threshold && entry.compiled_function.is_none()
        } else {
            // 新しいエントリを作成
            self.jit_cache.insert(expr_hash, JitEntry {
                expr_hash,
                execution_count: 1,
                compiled_function: None,
            });
            false
        };

        // ホットスポット検出時にJITコンパイル
        if should_jit {
            println!("🔥 ホットスポット検出: JITコンパイル開始 (実行回数: {}回)",
                     self.jit_cache[&expr_hash].execution_count);

            let start = Instant::now();
            match self.codegen.generate(expr) {
                Ok(compiled_func) => {
                    let compilation_time = start.elapsed().as_nanos() as u64;

                    println!("✅ JITコンパイル完了: {}バイトのマシンコード生成 ({}ns)",
                             compiled_func.code.len(), compilation_time);

                    // マシンコードの一部を16進数で表示
                    let code_preview: String = compiled_func.code
                        .iter()
                        .take(16)
                        .map(|b| format!("{:02x}", b))
                        .collect::<Vec<String>>()
                        .join(" ");
                    println!("   生成コード (先頭16バイト): {}", code_preview);

                    // 統計更新
                    self.stats.jit_compilations += 1;
                    self.stats.total_compilation_time_ns += compilation_time;

                    // キャッシュに保存
                    if let Some(entry) = self.jit_cache.get_mut(&expr_hash) {
                        entry.compiled_function = Some(compiled_func);
                    }
                }
                Err(e) => {
                    println!("❌ JITコンパイル失敗: {}", e);
                }
            }
        }

        // 実行
        let start = Instant::now();
        let mut result = if let Some(entry) = self.jit_cache.get(&expr_hash) {
            if let Some(ref compiled_func) = entry.compiled_function {
                // JIT実行をシミュレーション（実際はインタープリタを使用）
                println!("⚡ JIT実行シミュレーション ({}バイトのマシンコード使用予定)",
                         compiled_func.code.len());
                self.interpreter.evaluate(expr)?
            } else {
                // インタープリタ実行
                self.interpreter.evaluate(expr)?
            }
        } else {
            self.interpreter.evaluate(expr)?
        };

        let execution_time = start.elapsed().as_nanos() as u64;

        // JITコンパイル済みの場合は結果にマークを付ける
        let was_jit_compiled = self.jit_cache.get(&expr_hash)
            .map(|entry| entry.compiled_function.is_some())
            .unwrap_or(false);

        // 統計更新
        self.stats.total_executions += 1;
        self.stats.total_execution_time_ns += execution_time;

        result.was_jit_compiled = was_jit_compiled;
        result.execution_time_ns = execution_time;

        Ok(result)
    }

    /// 式のハッシュ値を計算（簡易版）
    fn hash_expr(&self, expr: &Expr) -> u64 {
        // 簡易的な実装：式を文字列化してハッシュ
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let expr_str = format!("{:?}", expr);
        let mut hasher = DefaultHasher::new();
        expr_str.hash(&mut hasher);
        hasher.finish()
    }

    /// 文字列からパースして実行
    pub fn execute_string(&mut self, code: &str) -> Result<ExecutionResult> {
        let mut parser = Parser::new(code)?;
        let expr = parser.parse()?;
        self.execute(&expr)
    }

    /// 統計情報を取得
    pub fn get_stats(&self) -> &JitStats {
        &self.stats
    }

    /// 統計をリセット
    pub fn reset_stats(&mut self) {
        self.stats = JitStats::default();
        self.jit_cache.clear();
        self.interpreter.reset();
    }

    /// JITキャッシュの情報を取得
    pub fn get_jit_cache_info(&self) -> Vec<(u64, u64, bool)> {
        self.jit_cache
            .values()
            .map(|entry| (
                entry.expr_hash,
                entry.execution_count,
                entry.compiled_function.is_some(),
            ))
            .collect()
    }

    /// 詳細統計を表示
    pub fn print_detailed_stats(&self) {
        println!("\n📊 JIT統計情報:");
        println!("  総実行回数: {}", self.stats.total_executions);
        println!("  JITコンパイル回数: {}", self.stats.jit_compilations);
        println!("  総実行時間: {}μs", self.stats.total_execution_time_ns / 1000);
        println!("  総コンパイル時間: {}μs", self.stats.total_compilation_time_ns / 1000);

        if self.stats.total_executions > 0 {
            println!("  平均実行時間: {}ns",
                     self.stats.total_execution_time_ns / self.stats.total_executions);
        }

        if self.stats.jit_compilations > 0 {
            println!("  平均コンパイル時間: {}ns",
                     self.stats.total_compilation_time_ns / self.stats.jit_compilations);
        }

        if !self.jit_cache.is_empty() {
            println!("\n🔍 JITキャッシュ情報:");
            for (hash, entry) in &self.jit_cache {
                println!("  Hash: {:#x}, 実行回数: {}, JITコンパイル済み: {}",
                         hash, entry.execution_count, entry.compiled_function.is_some());

                if let Some(ref compiled_func) = entry.compiled_function {
                    println!("    マシンコードサイズ: {}バイト", compiled_func.code.len());
                    println!("    変数: {:?}", compiled_func.variables);
                }
            }
        }
    }

    /// 生成されたマシンコードを16進ダンプ表示
    pub fn dump_machine_code(&self, expr_hash: u64) -> Option<String> {
        if let Some(entry) = self.jit_cache.get(&expr_hash) {
            if let Some(ref compiled_func) = entry.compiled_function {
                let mut dump = String::new();
                dump.push_str(&format!("マシンコード ({}バイト):\n", compiled_func.code.len()));

                for (i, chunk) in compiled_func.code.chunks(16).enumerate() {
                    dump.push_str(&format!("{:08x}: ", i * 16));

                    // 16進数表示
                    for (j, byte) in chunk.iter().enumerate() {
                        dump.push_str(&format!("{:02x} ", byte));
                        if j == 7 {
                            dump.push(' '); // 8バイトごとにスペース
                        }
                    }

                    // パディング
                    for _ in chunk.len()..16 {
                        dump.push_str("   ");
                    }
                    if chunk.len() <= 8 {
                        dump.push(' ');
                    }

                    dump.push('\n');
                }

                return Some(dump);
            }
        }
        None
    }
}

impl Default for JitCompiler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_jit_hotspot_detection() {
        let mut jit = JitCompiler::new();

        // 同じ式を10回実行してホットスポット検出をテスト
        for i in 1..=12 {
            let result = jit.execute_string("1 + 2 * 3").unwrap();
            assert_eq!(result.value, 7);

            if i == 10 {
                // 10回目でJITコンパイルが実行されるはず
                assert!(jit.stats.jit_compilations > 0);
            }
        }

        let stats = jit.get_stats();
        assert!(stats.total_executions >= 12);
        assert!(stats.jit_compilations >= 1);
    }

    #[test]
    fn test_different_expressions() {
        let mut jit = JitCompiler::new();

        // 異なる式は別々にカウントされる
        jit.execute_string("1 + 2").unwrap();
        jit.execute_string("3 * 4").unwrap();
        jit.execute_string("1 + 2").unwrap();

        let cache_info = jit.get_jit_cache_info();
        assert_eq!(cache_info.len(), 2); // 2つの異なる式

        // "1 + 2" は2回実行されているはず
        let expr1_count = cache_info.iter()
            .find(|(_, count, _)| *count == 2)
            .map(|(_, count, _)| *count);
        assert_eq!(expr1_count, Some(2));
    }

    #[test]
    fn test_variable_expressions() {
        let mut jit = JitCompiler::new();

        // 変数代入と参照（同じ実行コンテキスト内で）
        let result = jit.execute_string("x = 42").unwrap();
        assert_eq!(result.value, 42);

        // 変数なしの算術演算でホットスポット検出テスト
        for _ in 0..12 {
            let result = jit.execute_string("10 * 2 + 5").unwrap();
            assert_eq!(result.value, 25); // 10 * 2 + 5 = 25
        }

        assert!(jit.stats.jit_compilations > 0);
        jit.print_detailed_stats();
    }
}