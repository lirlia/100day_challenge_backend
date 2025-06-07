use crate::ast::{BinaryOp, Expr};
use crate::lexer::{Lexer, Token, TokenType};
use anyhow::{anyhow, Result};

/// 構文解析器
pub struct Parser {
    tokens: Vec<Token>,
    current: usize,
}

impl Parser {
    pub fn new(input: &str) -> Result<Self> {
        let mut lexer = Lexer::new(input);
        let tokens = lexer.tokenize();

        Ok(Self {
            tokens,
            current: 0,
        })
    }

    /// 式を解析してASTを生成
    pub fn parse(&mut self) -> Result<Expr> {
        self.expression()
    }

    /// expression → assignment
    fn expression(&mut self) -> Result<Expr> {
        self.assignment()
    }

    /// assignment → IDENTIFIER "=" assignment | logical_or
    fn assignment(&mut self) -> Result<Expr> {
        let expr = self.logical_or()?;

        if self.match_token(&TokenType::Equal) {
            if let Expr::Variable(name) = expr {
                let value = Box::new(self.assignment()?);
                return Ok(Expr::Assignment { name, value });
            } else {
                return Err(anyhow!("Invalid assignment target"));
            }
        }

        Ok(expr)
    }

    /// logical_or → logical_and ( "||" logical_and )*
    /// (今回は論理演算子は未実装、将来の拡張用)
    fn logical_or(&mut self) -> Result<Expr> {
        self.logical_and()
    }

    /// logical_and → equality ( "&&" equality )*
    /// (今回は論理演算子は未実装、将来の拡張用)
    fn logical_and(&mut self) -> Result<Expr> {
        self.equality()
    }

    /// equality → comparison ( ( "!=" | "==" ) comparison )*
    fn equality(&mut self) -> Result<Expr> {
        let mut expr = self.comparison()?;

        while self.match_tokens(&[TokenType::NotEqual, TokenType::EqualEqual]) {
            let op = match self.previous().token_type {
                TokenType::NotEqual => BinaryOp::NotEqual,
                TokenType::EqualEqual => BinaryOp::Equal,
                _ => unreachable!(),
            };
            let right = Box::new(self.comparison()?);
            expr = Expr::Binary {
                left: Box::new(expr),
                op,
                right,
            };
        }

        Ok(expr)
    }

    /// comparison → term ( ( ">" | ">=" | "<" | "<=" ) term )*
    fn comparison(&mut self) -> Result<Expr> {
        let mut expr = self.term()?;

        while self.match_tokens(&[
            TokenType::Greater,
            TokenType::GreaterEqual,
            TokenType::Less,
            TokenType::LessEqual,
        ]) {
            let op = match self.previous().token_type {
                TokenType::Greater => BinaryOp::Greater,
                TokenType::GreaterEqual => BinaryOp::GreaterEq,
                TokenType::Less => BinaryOp::Less,
                TokenType::LessEqual => BinaryOp::LessEq,
                _ => unreachable!(),
            };
            let right = Box::new(self.term()?);
            expr = Expr::Binary {
                left: Box::new(expr),
                op,
                right,
            };
        }

        Ok(expr)
    }

    /// term → factor ( ( "-" | "+" ) factor )*
    fn term(&mut self) -> Result<Expr> {
        let mut expr = self.factor()?;

        while self.match_tokens(&[TokenType::Minus, TokenType::Plus]) {
            let op = match self.previous().token_type {
                TokenType::Minus => BinaryOp::Sub,
                TokenType::Plus => BinaryOp::Add,
                _ => unreachable!(),
            };
            let right = Box::new(self.factor()?);
            expr = Expr::Binary {
                left: Box::new(expr),
                op,
                right,
            };
        }

        Ok(expr)
    }

    /// factor → unary ( ( "/" | "*" | "%" ) unary )*
    fn factor(&mut self) -> Result<Expr> {
        let mut expr = self.unary()?;

        while self.match_tokens(&[TokenType::Slash, TokenType::Star, TokenType::Percent]) {
            let op = match self.previous().token_type {
                TokenType::Slash => BinaryOp::Div,
                TokenType::Star => BinaryOp::Mul,
                TokenType::Percent => BinaryOp::Mod,
                _ => unreachable!(),
            };
            let right = Box::new(self.unary()?);
            expr = Expr::Binary {
                left: Box::new(expr),
                op,
                right,
            };
        }

        Ok(expr)
    }

    /// unary → ( "!" | "-" ) unary | call
    fn unary(&mut self) -> Result<Expr> {
        if self.match_token(&TokenType::Minus) {
            let expr = self.unary()?;
            return Ok(Expr::Binary {
                left: Box::new(Expr::Number(0)),
                op: BinaryOp::Sub,
                right: Box::new(expr),
            });
        }

        self.call()
    }

    /// call → primary ( "(" arguments? ")" )*
    fn call(&mut self) -> Result<Expr> {
        let mut expr = self.primary()?;

        while self.match_token(&TokenType::LeftParen) {
            if let Expr::Variable(name) = expr {
                let args = self.finish_call()?;
                expr = Expr::FunctionCall { name, args };
            } else {
                return Err(anyhow!("Only identifiers can be called as functions"));
            }
        }

        Ok(expr)
    }

    /// primary → NUMBER | IDENTIFIER | "(" expression ")" | "if" "(" expression "," expression "," expression ")"
    fn primary(&mut self) -> Result<Expr> {
        if let Some(token) = self.advance() {
            match &token.token_type {
                TokenType::Number(n) => Ok(Expr::Number(*n)),
                TokenType::Identifier(name) => Ok(Expr::Variable(name.clone())),
                TokenType::LeftParen => {
                    let expr = self.expression()?;
                    if !self.match_token(&TokenType::RightParen) {
                        return Err(anyhow!("Expect ')' after expression"));
                    }
                    Ok(expr)
                }
                TokenType::If => {
                    // if(condition, true_expr, false_expr)
                    if !self.match_token(&TokenType::LeftParen) {
                        return Err(anyhow!("Expect '(' after 'if'"));
                    }

                    let condition = Box::new(self.expression()?);

                    if !self.match_token(&TokenType::Comma) {
                        return Err(anyhow!("Expect ',' after if condition"));
                    }

                    let true_expr = Box::new(self.expression()?);

                    if !self.match_token(&TokenType::Comma) {
                        return Err(anyhow!("Expect ',' after true expression"));
                    }

                    let false_expr = Box::new(self.expression()?);

                    if !self.match_token(&TokenType::RightParen) {
                        return Err(anyhow!("Expect ')' after if expression"));
                    }

                    Ok(Expr::If {
                        condition,
                        true_expr,
                        false_expr,
                    })
                }
                _ => Err(anyhow!("Unexpected token: {:?}", token)),
            }
        } else {
            Err(anyhow!("Unexpected end of input"))
        }
    }

    fn finish_call(&mut self) -> Result<Vec<Expr>> {
        let mut args = Vec::new();

        if !self.check(&TokenType::RightParen) {
            loop {
                args.push(self.expression()?);
                if !self.match_token(&TokenType::Comma) {
                    break;
                }
            }
        }

        if !self.match_token(&TokenType::RightParen) {
            return Err(anyhow!("Expect ')' after arguments"));
        }

        Ok(args)
    }

    fn match_token(&mut self, token_type: &TokenType) -> bool {
        if self.check(token_type) {
            self.advance();
            true
        } else {
            false
        }
    }

    fn match_tokens(&mut self, token_types: &[TokenType]) -> bool {
        for token_type in token_types {
            if self.check(token_type) {
                self.advance();
                return true;
            }
        }
        false
    }

    fn check(&self, token_type: &TokenType) -> bool {
        if self.is_at_end() {
            false
        } else {
            std::mem::discriminant(&self.peek().token_type) == std::mem::discriminant(token_type)
        }
    }

    fn advance(&mut self) -> Option<&Token> {
        if !self.is_at_end() {
            self.current += 1;
        }
        self.previous_option()
    }

    fn is_at_end(&self) -> bool {
        matches!(self.peek().token_type, TokenType::EOF)
    }

    fn peek(&self) -> &Token {
        &self.tokens[self.current]
    }

    fn previous(&self) -> &Token {
        &self.tokens[self.current - 1]
    }

    fn previous_option(&self) -> Option<&Token> {
        if self.current > 0 {
            Some(&self.tokens[self.current - 1])
        } else {
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_number() {
        let mut parser = Parser::new("42").unwrap();
        let expr = parser.parse().unwrap();
        assert_eq!(expr, Expr::Number(42));
    }

    #[test]
    fn test_parse_binary_expression() {
        let mut parser = Parser::new("1 + 2 * 3").unwrap();
        let expr = parser.parse().unwrap();

        // Should parse as 1 + (2 * 3) due to precedence
        match expr {
            Expr::Binary { left, op, right } => {
                assert_eq!(*left, Expr::Number(1));
                assert_eq!(op, BinaryOp::Add);
                match *right {
                    Expr::Binary { left, op, right } => {
                        assert_eq!(*left, Expr::Number(2));
                        assert_eq!(op, BinaryOp::Mul);
                        assert_eq!(*right, Expr::Number(3));
                    }
                    _ => panic!("Expected binary expression"),
                }
            }
            _ => panic!("Expected binary expression"),
        }
    }

    #[test]
    fn test_parse_assignment() {
        let mut parser = Parser::new("x = 42").unwrap();
        let expr = parser.parse().unwrap();

        match expr {
            Expr::Assignment { name, value } => {
                assert_eq!(name, "x");
                assert_eq!(*value, Expr::Number(42));
            }
            _ => panic!("Expected assignment"),
        }
    }

    #[test]
    fn test_parse_function_call() {
        let mut parser = Parser::new("fib(10)").unwrap();
        let expr = parser.parse().unwrap();

        match expr {
            Expr::FunctionCall { name, args } => {
                assert_eq!(name, "fib");
                assert_eq!(args.len(), 1);
                assert_eq!(args[0], Expr::Number(10));
            }
            _ => panic!("Expected function call"),
        }
    }

    #[test]
    fn test_parse_if_expression() {
        let mut parser = Parser::new("if(x > 5, x * 2, x + 1)").unwrap();
        let expr = parser.parse().unwrap();

        match expr {
            Expr::If { condition, true_expr, false_expr } => {
                // condition: x > 5
                match *condition {
                    Expr::Binary { left, op, right } => {
                        assert_eq!(*left, Expr::Variable("x".to_string()));
                        assert_eq!(op, BinaryOp::Greater);
                        assert_eq!(*right, Expr::Number(5));
                    }
                    _ => panic!("Expected binary comparison"),
                }

                // true_expr: x * 2
                match *true_expr {
                    Expr::Binary { left, op, right } => {
                        assert_eq!(*left, Expr::Variable("x".to_string()));
                        assert_eq!(op, BinaryOp::Mul);
                        assert_eq!(*right, Expr::Number(2));
                    }
                    _ => panic!("Expected binary expression"),
                }

                // false_expr: x + 1
                match *false_expr {
                    Expr::Binary { left, op, right } => {
                        assert_eq!(*left, Expr::Variable("x".to_string()));
                        assert_eq!(op, BinaryOp::Add);
                        assert_eq!(*right, Expr::Number(1));
                    }
                    _ => panic!("Expected binary expression"),
                }
            }
            _ => panic!("Expected if expression"),
        }
    }
}