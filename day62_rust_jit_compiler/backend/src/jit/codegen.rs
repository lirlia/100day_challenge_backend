// x86-64 コード生成器

use crate::ast::{BinaryOp, Expr};
use anyhow::{anyhow, Result};
use std::collections::HashMap;

/// x86-64レジスタ
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Register {
    Rax = 0, // Return value / accumulator
    Rcx = 1, // Counter
    Rdx = 2, // Data
    Rbx = 3, // Base
    Rsp = 4, // Stack pointer
    Rbp = 5, // Base pointer
    Rsi = 6, // Source index
    Rdi = 7, // Destination index
}

/// 生成されたマシンコード
#[derive(Debug, Clone)]
pub struct CompiledFunction {
    pub code: Vec<u8>,
    pub entry_point: usize,
    pub variables: HashMap<String, i32>, // 変数名 -> スタックオフセット
}

/// x86-64マシンコード生成器
pub struct X86CodeGenerator {
    code: Vec<u8>,
    variables: HashMap<String, i32>,
    stack_offset: i32,
}

impl X86CodeGenerator {
    pub fn new() -> Self {
        Self {
            code: Vec::new(),
            variables: HashMap::new(),
            stack_offset: 0,
        }
    }

    /// ASTからx86-64マシンコードを生成
    pub fn generate(&mut self, expr: &Expr) -> Result<CompiledFunction> {
        self.code.clear();
        self.variables.clear();
        self.stack_offset = 0;

        // 関数プロローグ
        self.emit_prologue();

        // 式を評価（結果はRAXに格納）
        self.compile_expr(expr)?;

        // 関数エピローグ
        self.emit_epilogue();

        Ok(CompiledFunction {
            code: self.code.clone(),
            entry_point: 0,
            variables: self.variables.clone(),
        })
    }

    /// 式をコンパイル（結果はRAXに格納）
    fn compile_expr(&mut self, expr: &Expr) -> Result<()> {
        match expr {
            Expr::Number(n) => {
                // mov rax, immediate
                self.emit_mov_rax_imm(*n);
            }

            Expr::Variable(name) => {
                // 変数をスタックから読み込み
                if let Some(&offset) = self.variables.get(name) {
                    // mov rax, [rbp + offset]
                    self.emit_mov_rax_stack(offset);
                } else {
                    return Err(anyhow!("Undefined variable: {}", name));
                }
            }

            Expr::Binary { left, op, right } => {
                // 右辺を評価してスタックにプッシュ
                self.compile_expr(right)?;
                self.emit_push_rax();

                // 左辺を評価（結果はRAX）
                self.compile_expr(left)?;

                // 右辺をスタックからポップ（RCXへ）
                self.emit_pop_rcx();

                // 演算実行
                match op {
                    BinaryOp::Add => self.emit_add_rax_rcx(),
                    BinaryOp::Sub => self.emit_sub_rax_rcx(),
                    BinaryOp::Mul => self.emit_mul_rax_rcx(),
                    BinaryOp::Div => self.emit_div_rax_rcx(),
                    BinaryOp::Equal => self.emit_cmp_equal(),
                    BinaryOp::Less => self.emit_cmp_less(),
                    BinaryOp::Greater => self.emit_cmp_greater(),
                    _ => return Err(anyhow!("Unsupported binary operation: {:?}", op)),
                }
            }

            Expr::Assignment { name, value } => {
                // 値を評価
                self.compile_expr(value)?;

                // 変数をスタックに保存
                let offset = self.allocate_variable(name.clone());
                // mov [rbp + offset], rax
                self.emit_mov_stack_rax(offset);
            }

            Expr::If { condition, true_expr, false_expr } => {
                // 条件を評価
                self.compile_expr(condition)?;

                // test rax, rax (RAXが0かチェック)
                self.emit_test_rax();

                // jz false_label (0なら偽の式へジャンプ)
                let false_jump_pos = self.emit_jz_placeholder();

                // 真の式
                self.compile_expr(true_expr)?;

                // jmp end_label (終了へジャンプ)
                let end_jump_pos = self.emit_jmp_placeholder();

                // false_label:
                let false_label_pos = self.code.len();
                self.patch_jump(false_jump_pos, false_label_pos);

                // 偽の式
                self.compile_expr(false_expr)?;

                // end_label:
                let end_label_pos = self.code.len();
                self.patch_jump(end_jump_pos, end_label_pos);
            }

            _ => return Err(anyhow!("Unsupported expression type")),
        }

        Ok(())
    }

    /// 変数用のスタック領域を確保
    fn allocate_variable(&mut self, name: String) -> i32 {
        if let Some(&offset) = self.variables.get(&name) {
            offset
        } else {
            self.stack_offset -= 8; // 8バイト（64ビット）
            self.variables.insert(name, self.stack_offset);
            self.stack_offset
        }
    }

    // === x86-64命令エミット関数 ===

    /// 関数プロローグ
    fn emit_prologue(&mut self) {
        // push rbp
        self.code.push(0x55);
        // mov rbp, rsp
        self.code.extend_from_slice(&[0x48, 0x89, 0xe5]);
    }

    /// 関数エピローグ
    fn emit_epilogue(&mut self) {
        // mov rsp, rbp
        self.code.extend_from_slice(&[0x48, 0x89, 0xec]);
        // pop rbp
        self.code.push(0x5d);
        // ret
        self.code.push(0xc3);
    }

    /// mov rax, immediate
    fn emit_mov_rax_imm(&mut self, value: i64) {
        if value >= -128 && value <= 127 {
            // mov eax, imm32 (32ビット即値、上位32ビットは0クリア)
            self.code.push(0xb8);
            self.code.extend_from_slice(&(value as u32).to_le_bytes());
        } else {
            // mov rax, imm64
            self.code.extend_from_slice(&[0x48, 0xb8]);
            self.code.extend_from_slice(&(value as u64).to_le_bytes());
        }
    }

    /// push rax
    fn emit_push_rax(&mut self) {
        self.code.push(0x50);
    }

    /// pop rcx
    fn emit_pop_rcx(&mut self) {
        self.code.push(0x59);
    }

    /// add rax, rcx
    fn emit_add_rax_rcx(&mut self) {
        self.code.extend_from_slice(&[0x48, 0x01, 0xc8]);
    }

    /// sub rax, rcx
    fn emit_sub_rax_rcx(&mut self) {
        self.code.extend_from_slice(&[0x48, 0x29, 0xc8]);
    }

    /// mul rcx (rax = rax * rcx)
    fn emit_mul_rax_rcx(&mut self) {
        self.code.extend_from_slice(&[0x48, 0xf7, 0xe1]);
    }

    /// div rcx (rax = rax / rcx)
    fn emit_div_rax_rcx(&mut self) {
        // xor rdx, rdx (商を0で初期化)
        self.code.extend_from_slice(&[0x48, 0x31, 0xd2]);
        // div rcx
        self.code.extend_from_slice(&[0x48, 0xf7, 0xf1]);
    }

    /// test rax, rax
    fn emit_test_rax(&mut self) {
        self.code.extend_from_slice(&[0x48, 0x85, 0xc0]);
    }

    /// 比較命令（等価）
    fn emit_cmp_equal(&mut self) {
        // cmp rax, rcx
        self.code.extend_from_slice(&[0x48, 0x39, 0xc8]);
        // sete al (等しければ1、異なれば0をALに設定)
        self.code.extend_from_slice(&[0x0f, 0x94, 0xc0]);
        // movzx rax, al (ALを64ビットに拡張)
        self.code.extend_from_slice(&[0x48, 0x0f, 0xb6, 0xc0]);
    }

    /// 比較命令（より小さい）
    fn emit_cmp_less(&mut self) {
        // cmp rax, rcx
        self.code.extend_from_slice(&[0x48, 0x39, 0xc8]);
        // setl al
        self.code.extend_from_slice(&[0x0f, 0x9c, 0xc0]);
        // movzx rax, al
        self.code.extend_from_slice(&[0x48, 0x0f, 0xb6, 0xc0]);
    }

    /// 比較命令（より大きい）
    fn emit_cmp_greater(&mut self) {
        // cmp rax, rcx
        self.code.extend_from_slice(&[0x48, 0x39, 0xc8]);
        // setg al
        self.code.extend_from_slice(&[0x0f, 0x9f, 0xc0]);
        // movzx rax, al
        self.code.extend_from_slice(&[0x48, 0x0f, 0xb6, 0xc0]);
    }

    /// mov [rbp + offset], rax
    fn emit_mov_stack_rax(&mut self, offset: i32) {
        if offset >= -128 && offset <= 127 {
            // mov [rbp + disp8], rax
            self.code.extend_from_slice(&[0x48, 0x89, 0x45]);
            self.code.push(offset as u8);
        } else {
            // mov [rbp + disp32], rax
            self.code.extend_from_slice(&[0x48, 0x89, 0x85]);
            self.code.extend_from_slice(&offset.to_le_bytes());
        }
    }

    /// mov rax, [rbp + offset]
    fn emit_mov_rax_stack(&mut self, offset: i32) {
        if offset >= -128 && offset <= 127 {
            // mov rax, [rbp + disp8]
            self.code.extend_from_slice(&[0x48, 0x8b, 0x45]);
            self.code.push(offset as u8);
        } else {
            // mov rax, [rbp + disp32]
            self.code.extend_from_slice(&[0x48, 0x8b, 0x85]);
            self.code.extend_from_slice(&offset.to_le_bytes());
        }
    }

    /// jz (jump if zero) - プレースホルダー
    fn emit_jz_placeholder(&mut self) -> usize {
        self.code.extend_from_slice(&[0x0f, 0x84]); // jz rel32
        let pos = self.code.len();
        self.code.extend_from_slice(&[0, 0, 0, 0]); // プレースホルダー
        pos
    }

    /// jmp (unconditional jump) - プレースホルダー
    fn emit_jmp_placeholder(&mut self) -> usize {
        self.code.push(0xe9); // jmp rel32
        let pos = self.code.len();
        self.code.extend_from_slice(&[0, 0, 0, 0]); // プレースホルダー
        pos
    }

    /// ジャンプ先アドレスをパッチ
    fn patch_jump(&mut self, jump_pos: usize, target_pos: usize) {
        let offset = (target_pos as i32) - (jump_pos as i32) - 4;
        let bytes = offset.to_le_bytes();
        self.code[jump_pos..jump_pos + 4].copy_from_slice(&bytes);
    }
}

impl Default for X86CodeGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::parser::Parser;

    #[test]
    fn test_simple_number_generation() {
        let mut codegen = X86CodeGenerator::new();
        let result = codegen.generate(&Expr::Number(42)).unwrap();

        // コードが生成されていることを確認
        assert!(!result.code.is_empty());
        println!("Generated code length: {} bytes", result.code.len());

        // プロローグとエピローグが含まれていることを確認
        assert!(result.code.contains(&0x55)); // push rbp
        assert!(result.code.contains(&0xc3)); // ret
    }

    #[test]
    fn test_binary_expression_generation() {
        let mut codegen = X86CodeGenerator::new();
        let mut parser = Parser::new("1 + 2").unwrap();
        let expr = parser.parse().unwrap();

        let result = codegen.generate(&expr).unwrap();
        assert!(!result.code.is_empty());
        println!("Generated code for '1 + 2': {} bytes", result.code.len());
    }

    #[test]
    fn test_variable_assignment_generation() {
        let mut codegen = X86CodeGenerator::new();
        let mut parser = Parser::new("x = 42").unwrap();
        let expr = parser.parse().unwrap();

        let result = codegen.generate(&expr).unwrap();
        assert!(!result.code.is_empty());
        assert!(result.variables.contains_key("x"));
        println!("Generated code for 'x = 42': {} bytes", result.code.len());
    }
}