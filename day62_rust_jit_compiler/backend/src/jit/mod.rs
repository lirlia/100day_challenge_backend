// JITコンパイラモジュール（Phase 3で実装予定）

pub mod codegen;

use crate::ast::{Expr, ExecutionResult, JitStats};
use anyhow::Result;

/// JITコンパイラ
pub struct JitCompiler {
    stats: JitStats,
    hot_threshold: u64,  // JITコンパイル開始する実行回数閾値
}

impl JitCompiler {
    pub fn new() -> Self {
        Self {
            stats: JitStats::default(),
            hot_threshold: 10,  // 10回実行でJITコンパイル
        }
    }

    /// 式を実行（インタープリタまたはJIT）
    pub fn execute(&mut self, _expr: &Expr) -> Result<ExecutionResult> {
        // Phase 3で実装予定
        // 現在はプレースホルダー
        todo!("JIT execution will be implemented in Phase 3")
    }

    /// 統計情報を取得
    pub fn get_stats(&self) -> &JitStats {
        &self.stats
    }

    /// 統計をリセット
    pub fn reset_stats(&mut self) {
        self.stats = JitStats::default();
    }
}

impl Default for JitCompiler {
    fn default() -> Self {
        Self::new()
    }
}