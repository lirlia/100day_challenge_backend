package parser

import (
	"fmt"
	"testing"
	// "reflect" // 未使用のためコメントアウト

	"github.com/your_username/day20_sql_parser/ast"
	"github.com/your_username/day20_sql_parser/lexer"
)

func TestSelectStatement(t *testing.T) {
	input := `SELECT id, name FROM users WHERE id = 1;`
	l := lexer.New(input)
	p := New(l)

	program := p.ParseProgram()
	checkParserErrors(t, p)

	if len(program.Statements) != 1 {
		t.Fatalf("program.Statements does not contain 1 statements. got=%d", len(program.Statements))
	}

	stmt, ok := program.Statements[0].(*ast.SelectStatement)
	if !ok {
		t.Fatalf("program.Statements[0] is not *ast.SelectStatement. got=%T", program.Statements[0])
	}

	if len(stmt.Columns) != 2 {
		t.Fatalf("stmt.Columns does not contain 2 expressions. got=%d", len(stmt.Columns))
	}

	testIdentifier(t, stmt.Columns[0], "id")
	testIdentifier(t, stmt.Columns[1], "name")

	if stmt.From == nil || stmt.From.Value != "users" {
		t.Fatalf("stmt.From.Value not 'users'. got=%q", stmt.From)
	}

	if stmt.Where == nil {
		t.Fatalf("stmt.Where is nil")
	}

	testInfixExpression(t, stmt.Where, "id", "=", 1)
}

func TestSelectStarStatement(t *testing.T) {
    input := `SELECT * FROM products;`
    l := lexer.New(input)
    p := New(l)

    program := p.ParseProgram()
    checkParserErrors(t, p)

    if len(program.Statements) != 1 {
        t.Fatalf("program.Statements does not contain 1 statements. got=%d", len(program.Statements))
    }

    stmt, ok := program.Statements[0].(*ast.SelectStatement)
    if !ok {
        t.Fatalf("program.Statements[0] is not *ast.SelectStatement. got=%T", program.Statements[0])
    }

    if len(stmt.Columns) != 1 {
        t.Fatalf("stmt.Columns does not contain 1 expression. got=%d", len(stmt.Columns))
    }

    _, ok = stmt.Columns[0].(*ast.AllColumns)
    if !ok {
        t.Fatalf("stmt.Columns[0] is not *ast.AllColumns. got=%T", stmt.Columns[0])
    }

    if stmt.From == nil || stmt.From.Value != "products" {
        t.Fatalf("stmt.From.Value not 'products'. got=%q", stmt.From)
    }
}

func TestParsingPrefixExpressions(t *testing.T) {
	prefixTests := []struct {
		input    string
		operator string
		value    interface{}
	}{
		{"SELECT NOT is_active FROM t;", "NOT", "is_active"},
		{"SELECT -15 FROM t;", "-", 15},
	}

	for _, tt := range prefixTests {
		l := lexer.New(tt.input)
		p := New(l)
		program := p.ParseProgram()
		checkParserErrors(t, p)

		if len(program.Statements) != 1 {
			t.Fatalf("program.Statements does not contain %d statements. got=%d", 1, len(program.Statements))
		}
		stmt, ok := program.Statements[0].(*ast.SelectStatement)
        if !ok {
            t.Fatalf("program.Statements[0] is not *ast.SelectStatement. got=%T", program.Statements[0])
        }
        if len(stmt.Columns) != 1 {
            t.Fatalf("stmt.Columns does not contain 1 expression. got=%d", len(stmt.Columns))
        }

		exp, ok := stmt.Columns[0].(*ast.PrefixExpression)
		if !ok {
			t.Fatalf("stmt.Columns[0] is not ast.PrefixExpression. got=%T", stmt.Columns[0])
		}
		if exp.Operator != tt.operator {
			t.Fatalf("exp.Operator is not '%s'. got=%s", tt.operator, exp.Operator)
		}
		if !testLiteralExpression(t, exp.Right, tt.value) {
			return
		}
	}
}

func TestParsingInfixExpressions(t *testing.T) {
	infixTests := []struct {
		input      string
		leftValue  interface{}
		operator   string
		rightValue interface{}
	}{
		{"SELECT 5 + 5 FROM t;", 5, "+", 5},
		{"SELECT 5 - 5 FROM t;", 5, "-", 5},
		{"SELECT 5 * 5 FROM t;", 5, "*", 5},
		{"SELECT 5 / 5 FROM t;", 5, "/", 5},
		{"SELECT 5 > 5 FROM t;", 5, ">", 5},
		{"SELECT 5 < 5 FROM t;", 5, "<", 5},
		{"SELECT 5 = 5 FROM t;", 5, "=", 5},
		{"SELECT 5 <> 5 FROM t;", 5, "<>", 5},
        {"SELECT 5 != 5 FROM t;", 5, "!=", 5},
		{"SELECT true = true FROM t;", true, "=", true},
		{"SELECT true <> false FROM t;", true, "<>", false},
		{"SELECT false = false FROM t;", false, "=", false},
        {"SELECT name LIKE 'test%' FROM t;", "name", "LIKE", "test%"},
	}

	for _, tt := range infixTests {
		l := lexer.New(tt.input)
		p := New(l)
		program := p.ParseProgram()
		checkParserErrors(t, p)

		if len(program.Statements) != 1 {
			t.Fatalf("program.Statements does not contain 1 statements. got=%d", len(program.Statements))
		}
        stmt, ok := program.Statements[0].(*ast.SelectStatement)
        if !ok {
            t.Fatalf("program.Statements[0] is not *ast.SelectStatement. got=%T", program.Statements[0])
        }

        var exp ast.Expression
        if stmt.Where != nil {
            exp = stmt.Where
        } else if len(stmt.Columns) > 0 {
            exp = stmt.Columns[0]
        } else {
            t.Fatalf("No expression found in statement for input: %s", tt.input)
        }

		testInfixExpression(t, exp, tt.leftValue, tt.operator, tt.rightValue)
	}
}

func TestOperatorPrecedenceParsing(t *testing.T) {
	tests := []struct {
		input    string
		expected string // AST の String() の結果を期待値とする
	}{
		{
			"SELECT -a * b FROM t;",
			"SELECT ((- a) * b) FROM t;", // PrefixExpression.String() はスペースを含む想定
		},
		{
			"SELECT NOT a FROM t;",
			"SELECT (NOT a) FROM t;",
		},
		{
			"SELECT a + b + c FROM t;",
			"SELECT ((a + b) + c) FROM t;",
		},
		{
			"SELECT a + b - c FROM t;",
			"SELECT ((a + b) - c) FROM t;",
		},
		{
			"SELECT a * b * c FROM t;",
			"SELECT ((a * b) * c) FROM t;",
		},
		{
			"SELECT a * b / c FROM t;",
			"SELECT ((a * b) / c) FROM t;",
		},
		{
			"SELECT a + b / c FROM t;",
			"SELECT (a + (b / c)) FROM t;",
		},
		{
			"SELECT a + b * c + d / e - f FROM t;",
			"SELECT (((a + (b * c)) + (d / e)) - f) FROM t;",
		},
		{
			"SELECT 5 > 4 = 3 < 4 FROM t;",
			"SELECT ((5 > 4) = (3 < 4)) FROM t;",
		},
		{
			"SELECT 5 < 4 <> 3 > 4 FROM t;",
			"SELECT ((5 < 4) <> (3 > 4)) FROM t;",
		},
		{
			"SELECT 3 + 4 * 5 = 3 * 1 + 4 * 5 FROM t;",
			"SELECT ((3 + (4 * 5)) = ((3 * 1) + (4 * 5))) FROM t;",
		},
		{
			"SELECT true FROM t;",
			"SELECT true FROM t;",
		},
		{
			"SELECT false FROM t;",
			"SELECT false FROM t;",
		},
		{
			"SELECT 3 > 5 = false FROM t;",
			"SELECT ((3 > 5) = false) FROM t;",
		},
		{
			"SELECT 3 < 5 = true FROM t;",
			"SELECT ((3 < 5) = true) FROM t;",
		},
        {
            "SELECT 1 + (2 + 3) + 4 FROM t;",
            "SELECT ((1 + (2 + 3)) + 4) FROM t;",
        },
        {
            "SELECT (5 + 5) * 2 FROM t;",
            "SELECT ((5 + 5) * 2) FROM t;",
        },
        {
            "SELECT 2 / (5 + 5) FROM t;",
            "SELECT (2 / (5 + 5)) FROM t;",
        },
        {
            "SELECT -(5 + 5) FROM t;",
            "SELECT (- (5 + 5)) FROM t;",
        },
        {
            "SELECT NOT (true = true) FROM t;",
            "SELECT (NOT (true = true)) FROM t;",
        },
        // {
        //     "SELECT a + add(b * c) + d FROM t;", // 関数呼び出しはまだ未実装
        //     "SELECT ((a + add((b * c))) + d) FROM t;",
        // },
        {
            "SELECT col1 AS alias1, col2 AS alias2 FROM t;",
            "SELECT (col1 AS alias1), (col2 AS alias2) FROM t;",
        },
	}

	for _, tt := range tests {
		l := lexer.New(tt.input)
		p := New(l)
		program := p.ParseProgram()
		checkParserErrors(t, p)

		actual := program.String()
		if actual != tt.expected {
			t.Errorf("input: %s\nexpected=%s\nactual=  %s", tt.input, tt.expected, actual)
		}
	}
}

// --- ヘルパー関数 --- //

func checkParserErrors(t *testing.T, p *Parser) {
	errors := p.Errors()
	if len(errors) == 0 {
		return
	}

	t.Errorf("parser has %d errors", len(errors))
	for _, msg := range errors {
		t.Errorf("parser error: %q", msg)
	}
	t.FailNow()
}

func testIdentifier(t *testing.T, exp ast.Expression, value string) bool {
	ident, ok := exp.(*ast.Identifier)
	if !ok {
		t.Errorf("exp not *ast.Identifier. got=%T(%s)", exp, exp.String())
		return false
	}
	if ident.Value != value {
		t.Errorf("ident.Value not %s. got=%s", value, ident.Value)
		return false
	}
	if ident.TokenLiteral() != value {
		t.Errorf("ident.TokenLiteral not %s. got=%s", value, ident.TokenLiteral())
		return false
	}
	return true
}

func testIntegerLiteral(t *testing.T, exp ast.Expression, value int64) bool {
	il, ok := exp.(*ast.IntegerLiteral)
	if !ok {
		t.Errorf("exp not *ast.IntegerLiteral. got=%T(%s)", exp, exp.String())
		return false
	}
	if il.Value != value {
		t.Errorf("il.Value not %d. got=%d", value, il.Value)
		return false
	}
	if il.TokenLiteral() != fmt.Sprintf("%d", value) {
		t.Errorf("il.TokenLiteral not %d. got=%s", value, il.TokenLiteral())
		return false
	}
	return true
}

func testStringLiteral(t *testing.T, exp ast.Expression, value string) bool {
    sl, ok := exp.(*ast.StringLiteral)
    if !ok {
        t.Errorf("exp not *ast.StringLiteral. got=%T(%s)", exp, exp.String())
        return false
    }
    if sl.Value != value {
        t.Errorf("sl.Value not %q. got=%q", value, sl.Value)
        return false
    }
    if sl.TokenLiteral() != value {
        t.Errorf("sl.TokenLiteral not %q. got=%q", value, sl.TokenLiteral())
        return false
    }
    return true
}

func testBooleanLiteral(t *testing.T, exp ast.Expression, value bool) bool {
	bl, ok := exp.(*ast.BooleanLiteral)
	if !ok {
		t.Errorf("exp not *ast.BooleanLiteral. got=%T(%s)", exp, exp.String())
		return false
	}
	if bl.Value != value {
		t.Errorf("bl.Value not %t. got=%t", value, bl.Value)
		return false
	}
	expectedLiteral := "false"
	if value {
		expectedLiteral = "true"
	}
	if bl.TokenLiteral() != expectedLiteral {
		t.Errorf("bl.TokenLiteral not %s. got=%s", expectedLiteral, bl.TokenLiteral())
		return false
	}
	return true
}

func testLiteralExpression(t *testing.T, exp ast.Expression, expected interface{}) bool {
	switch v := expected.(type) {
	case int:
		return testIntegerLiteral(t, exp, int64(v))
	case int64:
		return testIntegerLiteral(t, exp, v)
	case string:
        if _, ok := exp.(*ast.Identifier); ok {
            return testIdentifier(t, exp, v)
        } else if _, ok := exp.(*ast.StringLiteral); ok {
            return testStringLiteral(t, exp, v)
        } else {
            t.Errorf("type of exp not Identifier or StringLiteral. got=%T for expected string %q", exp, v)
            return false
        }
	case bool:
		return testBooleanLiteral(t, exp, v)
	}
	t.Errorf("type of expected value not handled: %T (%v)", expected, expected)
	return false
}

func testInfixExpression(t *testing.T, exp ast.Expression, expectedLeft interface{}, expectedOperator string, expectedRight interface{}) bool {
	opExp, ok := exp.(*ast.InfixExpression)
	if !ok {
		t.Errorf("exp is not ast.InfixExpression. got=%T(%s)", exp, exp.String())
		return false
	}

    if !testExpression(t, opExp.Left, expectedLeft) {
        return false
    }

	if opExp.Operator != expectedOperator {
		t.Errorf("exp.Operator is not '%s'. got=%q", expectedOperator, opExp.Operator)
		return false
	}

    if !testExpression(t, opExp.Right, expectedRight) {
        return false
    }

	return true
}

func testExpression(t *testing.T, exp ast.Expression, expected interface{}) bool {
    switch v := expected.(type) {
    case int:
        return testIntegerLiteral(t, exp, int64(v))
    case int64:
        return testIntegerLiteral(t, exp, v)
    case string:
        if _, ok := exp.(*ast.Identifier); ok {
            return testIdentifier(t, exp, v)
        } else if _, ok := exp.(*ast.StringLiteral); ok {
            return testStringLiteral(t, exp, v)
        } else {
             t.Errorf("expression not Identifier or StringLiteral for expected string. got=%T", exp)
            return false
        }
    case bool:
        return testBooleanLiteral(t, exp, v)
    case *ast.Identifier:
        return testIdentifier(t, exp, v.Value)
    case *ast.IntegerLiteral:
        return testIntegerLiteral(t, exp, v.Value)
    case *ast.StringLiteral:
        return testStringLiteral(t, exp, v.Value)
    case *ast.BooleanLiteral:
        return testBooleanLiteral(t, exp, v.Value)
    case *ast.PrefixExpression:
        prefixExp, ok := exp.(*ast.PrefixExpression)
        if !ok {
            t.Errorf("exp not *ast.PrefixExpression. got=%T", exp)
            return false
        }
        if prefixExp.Operator != v.Operator {
            t.Errorf("PrefixExpression operator mismatch. expected=%s, got=%s", v.Operator, prefixExp.Operator)
            return false
        }
        return testExpression(t, prefixExp.Right, v.Right)
    case *ast.InfixExpression:
        return testInfixExpression(t, exp, v.Left, v.Operator, v.Right)
    // case *ast.FunctionCall:
    //     // TODO: 関数呼び出しのテスト
    default:
        t.Errorf("unsupported type for expected value: %T (%v)", expected, expected)
        return false
    }
}
