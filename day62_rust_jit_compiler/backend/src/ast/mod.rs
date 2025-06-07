use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 数式言語のAST（抽象構文木）定義
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum Expr {
    /// 整数リテラル: 42
    Number(i64),

    /// 変数参照: x
    Variable(String),

    /// 二項演算: left op right
    Binary {
        left: Box<Expr>,
        op: BinaryOp,
        right: Box<Expr>,
    },

    /// 変数代入: x = expr
    Assignment {
        name: String,
        value: Box<Expr>,
    },

    /// 関数呼び出し: func(arg1, arg2, ...)
    FunctionCall {
        name: String,
        args: Vec<Expr>,
    },

    /// 条件分岐: if(condition, true_expr, false_expr)
    If {
        condition: Box<Expr>,
        true_expr: Box<Expr>,
        false_expr: Box<Expr>,
    },
}

/// 二項演算子
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum BinaryOp {
    Add,      // +
    Sub,      // -
    Mul,      // *
    Div,      // /
    Mod,      // %
    Equal,    // ==
    NotEqual, // !=
    Less,     // <
    Greater,  // >
    LessEq,   // <=
    GreaterEq,// >=
}

/// 実行環境（変数の値を保持）
#[derive(Debug, Clone, Default)]
pub struct Environment {
    pub variables: HashMap<String, i64>,
}

impl Environment {
    pub fn new() -> Self {
        Self {
            variables: HashMap::new(),
        }
    }

    pub fn set(&mut self, name: String, value: i64) {
        self.variables.insert(name, value);
    }

    pub fn get(&self, name: &str) -> Option<i64> {
        self.variables.get(name).copied()
    }
}

/// 実行結果
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExecutionResult {
    pub value: i64,
    pub environment: HashMap<String, i64>,
    pub execution_time_ns: u64,
    pub compilation_time_ns: Option<u64>,
    pub was_jit_compiled: bool,
}

/// JIT統計情報
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JitStats {
    pub total_executions: u64,
    pub jit_compilations: u64,
    pub total_execution_time_ns: u64,
    pub total_compilation_time_ns: u64,
    pub hot_functions: HashMap<String, u64>, // 関数名 -> 実行回数
}

impl Default for JitStats {
    fn default() -> Self {
        Self {
            total_executions: 0,
            jit_compilations: 0,
            total_execution_time_ns: 0,
            total_compilation_time_ns: 0,
            hot_functions: HashMap::new(),
        }
    }
}