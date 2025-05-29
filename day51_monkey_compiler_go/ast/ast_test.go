package ast

import (
	"testing"

	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/token"
)

func TestString(t *testing.T) {
	program := &Program{
		Statements: []Statement{
			&LetStatement{
				Token: token.Token{Type: token.LET, Literal: "let"},
				Name: &Identifier{
					Token: token.Token{Type: token.IDENT, Literal: "myVar"},
					Value: "myVar",
				},
				Value: &Identifier{
					Token: token.Token{Type: token.IDENT, Literal: "anotherVar"},
					Value: "anotherVar",
				},
			},
		},
	}

	if program.String() != "let myVar = anotherVar;" {
		t.Errorf("program.String() wrong. got=%q", program.String())
	}
}

func TestIntegerLiteralString(t *testing.T) {
	il := &IntegerLiteral{
		Token: token.Token{Type: token.INT, Literal: "123"},
		Value: 123,
	}

	if il.String() != "123" {
		t.Errorf("il.String() wrong. got=%q", il.String())
	}
}

func TestBooleanString(t *testing.T) {
	b := &Boolean{
		Token: token.Token{Type: token.TRUE, Literal: "true"},
		Value: true,
	}

	if b.String() != "true" {
		t.Errorf("b.String() wrong. got=%q", b.String())
	}
}

func TestPrefixExpressionString(t *testing.T) {
	pe := &PrefixExpression{
		Token:    token.Token{Type: token.BANG, Literal: "!"},
		Operator: "!",
		Right: &Boolean{
			Token: token.Token{Type: token.TRUE, Literal: "true"},
			Value: true,
		},
	}

	if pe.String() != "(!true)" {
		t.Errorf("pe.String() wrong. got=%q", pe.String())
	}
}

func TestInfixExpressionString(t *testing.T) {
	ie := &InfixExpression{
		Token: token.Token{Type: token.PLUS, Literal: "+"},
		Left: &IntegerLiteral{
			Token: token.Token{Type: token.INT, Literal: "5"},
			Value: 5,
		},
		Operator: "+",
		Right: &IntegerLiteral{
			Token: token.Token{Type: token.INT, Literal: "10"},
			Value: 10,
		},
	}

	if ie.String() != "(5 + 10)" {
		t.Errorf("ie.String() wrong. got=%q", ie.String())
	}
}

func TestIfExpressionString(t *testing.T) {
	ifExp := &IfExpression{
		Token: token.Token{Type: token.IF, Literal: "if"},
		Condition: &InfixExpression{
			Token: token.Token{Type: token.LT, Literal: "<"},
			Left: &Identifier{
				Token: token.Token{Type: token.IDENT, Literal: "x"},
				Value: "x",
			},
			Operator: "<",
			Right: &IntegerLiteral{
				Token: token.Token{Type: token.INT, Literal: "10"},
				Value: 10,
			},
		},
		Consequence: &BlockStatement{
			Token: token.Token{Type: token.LBRACE, Literal: "{"},
			Statements: []Statement{
				&ExpressionStatement{
					Token: token.Token{Type: token.IDENT, Literal: "x"},
					Expression: &Identifier{
						Token: token.Token{Type: token.IDENT, Literal: "x"},
						Value: "x",
					},
				},
			},
		},
	}

	if ifExp.String() != "if(x < 10) x" {
		t.Errorf("ifExp.String() wrong. got=%q", ifExp.String())
	}
}

func TestCallExpressionString(t *testing.T) {
	ce := &CallExpression{
		Token: token.Token{Type: token.IDENT, Literal: "puts"},
		Function: &Identifier{
			Token: token.Token{Type: token.IDENT, Literal: "puts"},
			Value: "puts",
		},
		Arguments: []Expression{
			&IntegerLiteral{
				Token: token.Token{Type: token.INT, Literal: "42"},
				Value: 42,
			},
			&Boolean{
				Token: token.Token{Type: token.TRUE, Literal: "true"},
				Value: true,
			},
		},
	}

	if ce.String() != "puts(42, true)" {
		t.Errorf("ce.String() wrong. got=%q", ce.String())
	}
}

func TestTokenLiteral(t *testing.T) {
	program := &Program{
		Statements: []Statement{
			&LetStatement{
				Token: token.Token{Type: token.LET, Literal: "let"},
				Name: &Identifier{
					Token: token.Token{Type: token.IDENT, Literal: "x"},
					Value: "x",
				},
				Value: &IntegerLiteral{
					Token: token.Token{Type: token.INT, Literal: "5"},
					Value: 5,
				},
			},
		},
	}

	if program.TokenLiteral() != "let" {
		t.Errorf("program.TokenLiteral() wrong. got=%q", program.TokenLiteral())
	}

	// 空のプログラム
	emptyProgram := &Program{Statements: []Statement{}}
	if emptyProgram.TokenLiteral() != "" {
		t.Errorf("emptyProgram.TokenLiteral() wrong. got=%q", emptyProgram.TokenLiteral())
	}
}
