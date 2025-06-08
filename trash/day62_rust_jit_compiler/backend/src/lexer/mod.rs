use serde::{Deserialize, Serialize};

/// トークンの種類
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum TokenType {
    // リテラル
    Number(i64),
    Identifier(String),

    // 演算子
    Plus,         // +
    Minus,        // -
    Star,         // *
    Slash,        // /
    Percent,      // %
    Equal,        // =
    EqualEqual,   // ==
    NotEqual,     // !=
    Less,         // <
    Greater,      // >
    LessEqual,    // <=
    GreaterEqual, // >=

    // デリミタ
    LeftParen,    // (
    RightParen,   // )
    Comma,        // ,
    Semicolon,    // ;

    // キーワード
    If,

    // その他
    Whitespace,
    EOF,
}

/// トークン
#[derive(Debug, Clone, PartialEq)]
pub struct Token {
    pub token_type: TokenType,
    pub lexeme: String,
    pub position: usize,
}

/// 字句解析器
pub struct Lexer {
    input: Vec<char>,
    current: usize,
    position: usize,
}

impl Lexer {
    pub fn new(input: &str) -> Self {
        Self {
            input: input.chars().collect(),
            current: 0,
            position: 0,
        }
    }

    /// 次のトークンを取得
    pub fn next_token(&mut self) -> Token {
        self.skip_whitespace();

        if self.is_at_end() {
            return Token {
                token_type: TokenType::EOF,
                lexeme: String::new(),
                position: self.position,
            };
        }

        let start_pos = self.position;
        let c = self.advance();

        let token_type = match c {
            '+' => TokenType::Plus,
            '-' => TokenType::Minus,
            '*' => TokenType::Star,
            '/' => TokenType::Slash,
            '%' => TokenType::Percent,
            '(' => TokenType::LeftParen,
            ')' => TokenType::RightParen,
            ',' => TokenType::Comma,
            ';' => TokenType::Semicolon,
            '=' => {
                if self.match_char('=') {
                    TokenType::EqualEqual
                } else {
                    TokenType::Equal
                }
            }
            '!' => {
                if self.match_char('=') {
                    TokenType::NotEqual
                } else {
                    // 単体の '!' はエラーとして扱う
                    panic!("Unexpected character: !");
                }
            }
            '<' => {
                if self.match_char('=') {
                    TokenType::LessEqual
                } else {
                    TokenType::Less
                }
            }
            '>' => {
                if self.match_char('=') {
                    TokenType::GreaterEqual
                } else {
                    TokenType::Greater
                }
            }
            _ if c.is_ascii_digit() => {
                let number = self.read_number(c);
                TokenType::Number(number)
            }
            _ if c.is_ascii_alphabetic() || c == '_' => {
                let identifier = self.read_identifier(c);
                match identifier.as_str() {
                    "if" => TokenType::If,
                    _ => TokenType::Identifier(identifier),
                }
            }
            _ => panic!("Unexpected character: {}", c),
        };

        let lexeme = self.input[start_pos..self.position].iter().collect();

        Token {
            token_type,
            lexeme,
            position: start_pos,
        }
    }

    /// すべてのトークンを取得
    pub fn tokenize(&mut self) -> Vec<Token> {
        let mut tokens = Vec::new();

        loop {
            let token = self.next_token();
            let is_eof = matches!(token.token_type, TokenType::EOF);
            tokens.push(token);

            if is_eof {
                break;
            }
        }

        tokens
    }

    fn is_at_end(&self) -> bool {
        self.current >= self.input.len()
    }

    fn advance(&mut self) -> char {
        let c = self.input[self.current];
        self.current += 1;
        self.position += 1;
        c
    }

    fn peek(&self) -> char {
        if self.is_at_end() {
            '\0'
        } else {
            self.input[self.current]
        }
    }

    fn match_char(&mut self, expected: char) -> bool {
        if self.is_at_end() || self.input[self.current] != expected {
            false
        } else {
            self.current += 1;
            self.position += 1;
            true
        }
    }

    fn skip_whitespace(&mut self) {
        while !self.is_at_end() && self.peek().is_whitespace() {
            self.advance();
        }
    }

    fn read_number(&mut self, first_digit: char) -> i64 {
        let mut number_str = String::new();
        number_str.push(first_digit);

        while !self.is_at_end() && self.peek().is_ascii_digit() {
            number_str.push(self.advance());
        }

        number_str.parse().unwrap_or(0)
    }

    fn read_identifier(&mut self, first_char: char) -> String {
        let mut identifier = String::new();
        identifier.push(first_char);

        while !self.is_at_end() && (self.peek().is_ascii_alphanumeric() || self.peek() == '_') {
            identifier.push(self.advance());
        }

        identifier
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_arithmetic() {
        let mut lexer = Lexer::new("1 + 2 * 3");
        let tokens = lexer.tokenize();

        assert_eq!(tokens.len(), 6); // 1, +, 2, *, 3, EOF
        assert_eq!(tokens[0].token_type, TokenType::Number(1));
        assert_eq!(tokens[1].token_type, TokenType::Plus);
        assert_eq!(tokens[2].token_type, TokenType::Number(2));
        assert_eq!(tokens[3].token_type, TokenType::Star);
        assert_eq!(tokens[4].token_type, TokenType::Number(3));
        assert_eq!(tokens[5].token_type, TokenType::EOF);
    }

    #[test]
    fn test_variables_and_assignment() {
        let mut lexer = Lexer::new("x = 42");
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].token_type, TokenType::Identifier("x".to_string()));
        assert_eq!(tokens[1].token_type, TokenType::Equal);
        assert_eq!(tokens[2].token_type, TokenType::Number(42));
    }

    #[test]
    fn test_function_call() {
        let mut lexer = Lexer::new("fib(10)");
        let tokens = lexer.tokenize();

        assert_eq!(tokens[0].token_type, TokenType::Identifier("fib".to_string()));
        assert_eq!(tokens[1].token_type, TokenType::LeftParen);
        assert_eq!(tokens[2].token_type, TokenType::Number(10));
        assert_eq!(tokens[3].token_type, TokenType::RightParen);
    }
}