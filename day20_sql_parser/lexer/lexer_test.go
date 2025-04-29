package lexer

import (
	"testing"

	"github.com/your_username/day20_sql_parser/token"
)

func TestNextTokenSimple(t *testing.T) {
	input := `SELECT id, name FROM users WHERE id = 1;`

	tests := []struct {
		expectedType    token.TokenType
		expectedLiteral string
		expectedLine    int
		expectedColumn  int
	}{
		{token.SELECT, "SELECT", 1, 1},
		{token.IDENT, "id", 1, 8},
		{token.COMMA, ",", 1, 10},
		{token.IDENT, "name", 1, 12},
		{token.FROM, "FROM", 1, 17},
		{token.IDENT, "users", 1, 22},
		{token.WHERE, "WHERE", 1, 28},
		{token.IDENT, "id", 1, 34},
		{token.ASSIGN, "=", 1, 37},
		{token.INT, "1", 1, 39},
		{token.SEMICOLON, ";", 1, 40},
		{token.EOF, "", 1, 41},
	}

	l := New(input)

	for i, tt := range tests {
		tok := l.NextToken()

		if tok.Type != tt.expectedType {
			t.Fatalf("tests[%d] - tokentype wrong. expected=%q, got=%q (Literal: %q, Line: %d, Col: %d)",
				i, tt.expectedType, tok.Type, tok.Literal, tok.Line, tok.Column)
		}

		if tok.Literal != tt.expectedLiteral {
			t.Fatalf("tests[%d] - literal wrong. expected=%q, got=%q (Type: %q, Line: %d, Col: %d)",
				i, tt.expectedLiteral, tok.Literal, tok.Type, tok.Line, tok.Column)
		}
		if tok.Line != tt.expectedLine {
			t.Fatalf("tests[%d] - line wrong. expected=%d, got=%d (Type: %q, Literal: %q)",
				i, tt.expectedLine, tok.Line, tok.Type, tok.Literal)
		}
		if tok.Column != tt.expectedColumn {
			t.Fatalf("tests[%d] - column wrong. expected=%d, got=%d (Type: %q, Literal: %q)",
				i, tt.expectedColumn, tok.Column, tok.Type, tok.Literal)
		}
	}
}

func TestNextTokenComplex(t *testing.T) {
	input := `
SELECT
    u.id,
    p.name AS product_name,
    COUNT(*) AS order_count
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.email LIKE '%@example.com'
GROUP BY u.id
HAVING COUNT(*) > 0
ORDER BY u.id DESC
LIMIT 10;
`

	tests := []struct {
		expectedType    token.TokenType
		expectedLiteral string
	}{
		{token.SELECT, "SELECT"},
		{token.IDENT, "u"},
		{token.DOT, "."},
		{token.IDENT, "id"},
		{token.COMMA, ","},
		{token.IDENT, "p"},
		{token.DOT, "."},
		{token.IDENT, "name"},
		{token.AS, "AS"},
		{token.IDENT, "product_name"},
		{token.COMMA, ","},
		{token.IDENT, "COUNT"},
		{token.LPAREN, "("},
		{token.ASTERISK, "*"},
		{token.RPAREN, ")"},
		{token.AS, "AS"},
		{token.IDENT, "order_count"},
		{token.FROM, "FROM"},
		{token.IDENT, "users"},
		{token.IDENT, "u"},
		{token.LEFT, "LEFT"},
		{token.JOIN, "JOIN"},
		{token.IDENT, "orders"},
		{token.IDENT, "o"},
		{token.ON, "ON"},
		{token.IDENT, "u"},
		{token.DOT, "."},
		{token.IDENT, "id"},
		{token.ASSIGN, "="},
		{token.IDENT, "o"},
		{token.DOT, "."},
		{token.IDENT, "user_id"},
		{token.WHERE, "WHERE"},
		{token.IDENT, "u"},
		{token.DOT, "."},
		{token.IDENT, "email"},
		{token.LIKE, "LIKE"},
		{token.STRING, "%@example.com"}, // シングルクォートの中身
		{token.GROUP, "GROUP"},
		{token.BY, "BY"},
		{token.IDENT, "u"},
		{token.DOT, "."},
		{token.IDENT, "id"},
		{token.HAVING, "HAVING"},
		{token.IDENT, "COUNT"},
		{token.LPAREN, "("},
		{token.ASTERISK, "*"},
		{token.RPAREN, ")"},
		{token.GT, ">"},
		{token.INT, "0"},
		{token.ORDER, "ORDER"},
		{token.BY, "BY"},
		{token.IDENT, "u"},
		{token.DOT, "."},
		{token.IDENT, "id"},
		{token.IDENT, "DESC"}, // ORDER BY DESC はキーワードとして扱うか？ -> 現状IDENT
		{token.LIMIT, "LIMIT"},
		{token.INT, "10"},
		{token.SEMICOLON, ";"},
		{token.EOF, ""},
	}

	l := New(input)

	for i, tt := range tests {
		tok := l.NextToken()
		if tok.Type != tt.expectedType {
			t.Fatalf("tests[%d] - tokentype wrong. expected=%q, got=%q (Literal: %q, Line: %d, Col: %d)",
				i, tt.expectedType, tok.Type, tok.Literal, tok.Line, tok.Column)
		}
		if tok.Literal != tt.expectedLiteral {
			t.Fatalf("tests[%d] - literal wrong. expected=%q, got=%q (Type: %q, Line: %d, Col: %d)",
				i, tt.expectedLiteral, tok.Literal, tok.Type, tok.Line, tok.Column)
		}
	}
}

func TestNextTokenOperators(t *testing.T) {
	input := `=+-!*/<> <= >= == !=`
	tests := []struct {
		expectedType    token.TokenType
		expectedLiteral string
	}{
		{token.ASSIGN, "="},
		{token.PLUS, "+"},
		{token.MINUS, "-"},
		{token.ILLEGAL, "!"}, // 単独の ! は ILLEGAL
		{token.ASTERISK, "*"},
		{token.SLASH, "/"},
		{token.NOT_EQ, "<>"}, // <> は NOT_EQ として認識
		{token.LT_EQ, "<="},
		{token.GT_EQ, ">="},
		{token.EQ, "=="},
		{token.NOT_EQ, "!="},
		{token.EOF, ""},
	}

	l := New(input)

	for i, tt := range tests {
		tok := l.NextToken()
		if tok.Type != tt.expectedType {
			t.Fatalf("tests[%d] - tokentype wrong. expected=%q, got=%q", i, tt.expectedType, tok.Type)
		}
		if tok.Literal != tt.expectedLiteral {
			t.Fatalf("tests[%d] - literal wrong. expected=%q, got=%q", i, tt.expectedLiteral, tok.Literal)
		}
	}
}
