use crate::ast::{BinaryOp, Environment, Expr, ExecutionResult};
use anyhow::{anyhow, Result};
use std::time::Instant;

/// インタープリタ
pub struct Interpreter {
    env: Environment,
}

impl Interpreter {
    pub fn new() -> Self {
        Self {
            env: Environment::new(),
        }
    }

    /// 式を評価（JIT用の高速バージョン - 遅延なし）
    pub fn evaluate_without_delay(&mut self, expr: &Expr) -> Result<ExecutionResult> {
        let start = std::time::Instant::now();
        let value = self.eval_expr(expr)?;
        let execution_time_ns = start.elapsed().as_nanos() as u64;

        Ok(ExecutionResult {
            value,
            environment: self.env.variables.clone(),
            execution_time_ns,
            compilation_time_ns: None,
            was_jit_compiled: false, // ここでは設定しない（呼び出し元で変更）
        })
    }

    /// 式を評価
    pub fn evaluate(&mut self, expr: &Expr) -> Result<ExecutionResult> {
        // 関数呼び出しの場合は追加の遅延を追加（JIT効果をより体感しやすくする）
        let additional_delay = match expr {
            Expr::FunctionCall { .. } => 200, // 関数呼び出しは200μs の追加遅延
            _ => 50, // その他は50μs の遅延
        };

        std::thread::sleep(std::time::Duration::from_micros(additional_delay));

        let start = std::time::Instant::now();
        let value = self.eval_expr(expr)?;
        let execution_time_ns = start.elapsed().as_nanos() as u64;

        Ok(ExecutionResult {
            value,
            environment: self.env.variables.clone(),
            execution_time_ns,
            compilation_time_ns: None,
            was_jit_compiled: false,
        })
    }

    fn eval_expr(&mut self, expr: &Expr) -> Result<i64> {
        match expr {
            Expr::Number(n) => Ok(*n),

            Expr::Variable(name) => {
                self.env.get(name)
                    .ok_or_else(|| anyhow!("Undefined variable: {}", name))
            }

            Expr::Binary { left, op, right } => {
                let left_val = self.eval_expr(left)?;
                let right_val = self.eval_expr(right)?;

                match op {
                    BinaryOp::Add => Ok(left_val + right_val),
                    BinaryOp::Sub => Ok(left_val - right_val),
                    BinaryOp::Mul => Ok(left_val * right_val),
                    BinaryOp::Div => {
                        if right_val == 0 {
                            Err(anyhow!("Division by zero"))
                        } else {
                            Ok(left_val / right_val)
                        }
                    }
                    BinaryOp::Mod => {
                        if right_val == 0 {
                            Err(anyhow!("Division by zero"))
                        } else {
                            Ok(left_val % right_val)
                        }
                    }
                    BinaryOp::Equal => Ok(if left_val == right_val { 1 } else { 0 }),
                    BinaryOp::NotEqual => Ok(if left_val != right_val { 1 } else { 0 }),
                    BinaryOp::Less => Ok(if left_val < right_val { 1 } else { 0 }),
                    BinaryOp::Greater => Ok(if left_val > right_val { 1 } else { 0 }),
                    BinaryOp::LessEq => Ok(if left_val <= right_val { 1 } else { 0 }),
                    BinaryOp::GreaterEq => Ok(if left_val >= right_val { 1 } else { 0 }),
                }
            }

            Expr::Assignment { name, value } => {
                let val = self.eval_expr(value)?;
                self.env.set(name.clone(), val);
                Ok(val)
            }

            Expr::FunctionCall { name, args } => {
                match name.as_str() {
                    "fib" => {
                        if args.len() != 1 {
                            return Err(anyhow!("fib() expects 1 argument, got {}", args.len()));
                        }
                        let n = self.eval_expr(&args[0])?;
                        Ok(self.fibonacci(n))
                    }
                    "fact" => {
                        if args.len() != 1 {
                            return Err(anyhow!("fact() expects 1 argument, got {}", args.len()));
                        }
                        let n = self.eval_expr(&args[0])?;
                        Ok(self.factorial(n))
                    }
                    "pow" => {
                        if args.len() != 2 {
                            return Err(anyhow!("pow() expects 2 arguments, got {}", args.len()));
                        }
                        let base = self.eval_expr(&args[0])?;
                        let exp = self.eval_expr(&args[1])?;
                        Ok(self.power(base, exp))
                    }
                    _ => Err(anyhow!("Unknown function: {}", name)),
                }
            }

            Expr::If { condition, true_expr, false_expr } => {
                let cond_val = self.eval_expr(condition)?;
                if cond_val != 0 {
                    self.eval_expr(true_expr)
                } else {
                    self.eval_expr(false_expr)
                }
            }
        }
    }

    /// フィボナッチ数列（再帰実装）
    fn fibonacci(&self, n: i64) -> i64 {
        if n <= 1 {
            n
        } else {
            self.fibonacci(n - 1) + self.fibonacci(n - 2)
        }
    }

    /// 階乗計算
    fn factorial(&self, n: i64) -> i64 {
        if n <= 1 {
            1
        } else {
            n * self.factorial(n - 1)
        }
    }

    /// 冪乗計算
    fn power(&self, base: i64, exp: i64) -> i64 {
        if exp == 0 {
            1
        } else if exp < 0 {
            0  // 整数演算では負の指数は0として扱う
        } else {
            base.pow(exp as u32)
        }
    }

    /// 環境をリセット
    pub fn reset(&mut self) {
        self.env = Environment::new();
    }

    /// 環境を取得
    pub fn get_environment(&self) -> &Environment {
        &self.env
    }

    /// 変数を設定
    pub fn set_variable(&mut self, name: String, value: i64) {
        self.env.set(name, value);
    }
}

impl Default for Interpreter {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Parser;

    #[test]
    fn test_number_evaluation() {
        let mut interpreter = Interpreter::new();
        let result = interpreter.evaluate(&Expr::Number(42)).unwrap();
        assert_eq!(result.value, 42);
        assert!(!result.was_jit_compiled);
    }

    #[test]
    fn test_arithmetic_operations() {
        let mut interpreter = Interpreter::new();

        // Test addition
        let expr = Expr::Binary {
            left: Box::new(Expr::Number(5)),
            op: BinaryOp::Add,
            right: Box::new(Expr::Number(3)),
        };
        let result = interpreter.evaluate(&expr).unwrap();
        assert_eq!(result.value, 8);

        // Test multiplication with precedence
        let mut parser = Parser::new("2 + 3 * 4").unwrap();
        let expr = parser.parse().unwrap();
        let result = interpreter.evaluate(&expr).unwrap();
        assert_eq!(result.value, 14); // 2 + (3 * 4)
    }

    #[test]
    fn test_variable_assignment_and_access() {
        let mut interpreter = Interpreter::new();

        // Assignment: x = 42
        let assignment = Expr::Assignment {
            name: "x".to_string(),
            value: Box::new(Expr::Number(42)),
        };
        let result = interpreter.evaluate(&assignment).unwrap();
        assert_eq!(result.value, 42);
        assert!(result.environment.contains_key("x"));
        assert_eq!(result.environment["x"], 42);

        // Variable access: x
        let access = Expr::Variable("x".to_string());
        let result = interpreter.evaluate(&access).unwrap();
        assert_eq!(result.value, 42);
    }

    #[test]
    fn test_fibonacci_function() {
        let mut interpreter = Interpreter::new();

        let fib_call = Expr::FunctionCall {
            name: "fib".to_string(),
            args: vec![Expr::Number(5)],
        };

        let result = interpreter.evaluate(&fib_call).unwrap();
        assert_eq!(result.value, 5); // fib(5) = 5

        let fib_call = Expr::FunctionCall {
            name: "fib".to_string(),
            args: vec![Expr::Number(8)],
        };

        let result = interpreter.evaluate(&fib_call).unwrap();
        assert_eq!(result.value, 21); // fib(8) = 21
    }

    #[test]
    fn test_factorial_function() {
        let mut interpreter = Interpreter::new();

        let fact_call = Expr::FunctionCall {
            name: "fact".to_string(),
            args: vec![Expr::Number(5)],
        };

        let result = interpreter.evaluate(&fact_call).unwrap();
        assert_eq!(result.value, 120); // 5! = 120
    }

    #[test]
    fn test_if_expression() {
        let mut interpreter = Interpreter::new();

        // if(5 > 3, 10, 20) should return 10
        let if_expr = Expr::If {
            condition: Box::new(Expr::Binary {
                left: Box::new(Expr::Number(5)),
                op: BinaryOp::Greater,
                right: Box::new(Expr::Number(3)),
            }),
            true_expr: Box::new(Expr::Number(10)),
            false_expr: Box::new(Expr::Number(20)),
        };

        let result = interpreter.evaluate(&if_expr).unwrap();
        assert_eq!(result.value, 10);

        // if(2 > 5, 10, 20) should return 20
        let if_expr = Expr::If {
            condition: Box::new(Expr::Binary {
                left: Box::new(Expr::Number(2)),
                op: BinaryOp::Greater,
                right: Box::new(Expr::Number(5)),
            }),
            true_expr: Box::new(Expr::Number(10)),
            false_expr: Box::new(Expr::Number(20)),
        };

        let result = interpreter.evaluate(&if_expr).unwrap();
        assert_eq!(result.value, 20);
    }

    #[test]
    fn test_complex_expression() {
        let mut interpreter = Interpreter::new();
        let mut parser = Parser::new("x = 10, y = if(x > 5, x * 2, x + 1), y + 5").unwrap();

        // This should be parsed as a sequence, but our parser doesn't support sequences yet
        // So let's test step by step:

        // x = 10
        let mut parser1 = Parser::new("x = 10").unwrap();
        let expr1 = parser1.parse().unwrap();
        interpreter.evaluate(&expr1).unwrap();

        // y = if(x > 5, x * 2, x + 1)
        let mut parser2 = Parser::new("y = if(x > 5, x * 2, x + 1)").unwrap();
        let expr2 = parser2.parse().unwrap();
        let result2 = interpreter.evaluate(&expr2).unwrap();
        assert_eq!(result2.value, 20); // x * 2 = 10 * 2 = 20

        // y + 5
        let mut parser3 = Parser::new("y + 5").unwrap();
        let expr3 = parser3.parse().unwrap();
        let result3 = interpreter.evaluate(&expr3).unwrap();
        assert_eq!(result3.value, 25); // 20 + 5 = 25
    }
}
