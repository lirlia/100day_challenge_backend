package validator

import (
	"fmt"
	"github.com/your_username/day20_sql_parser/ast"
	"github.com/your_username/day20_sql_parser/lexer"
	"github.com/your_username/day20_sql_parser/parser"
	"github.com/your_username/day20_sql_parser/schema"
	"strings"
	"testing"
)

// Helper function to parse SQL and return the AST program
func parseSQL(t *testing.T, sql string) *ast.Program {
	t.Helper()
	l := lexer.New(sql)
	p := parser.New(l)
	program := p.ParseProgram()
	if len(p.Errors()) > 0 {
		t.Logf("Parser errors for SQL: %s\n%v", sql, p.Errors())
	}
	return program
}

// Helper function to check validation errors
func checkValidationErrors(t *testing.T, errors []*ValidationError, expectedErrors []string) {
	t.Helper()
	if len(errors) != len(expectedErrors) {
		var errorMessages []string
		for _, err := range errors {
			errorMessages = append(errorMessages, err.Message)
		}
		t.Fatalf("Expected %d errors, but got %d. Errors: %v", len(expectedErrors), len(errors), errorMessages)
	}

	for i, expected := range expectedErrors {
		if !strings.Contains(errors[i].Message, expected) {
			t.Errorf("Error %d: Expected message containing '%s', but got '%s'", i, expected, errors[i].Message)
		}
	}
}

func TestValidator_ValidQueries(t *testing.T) {
	sampleSchema := schema.SampleSchema()
	v := NewValidator(sampleSchema)

	tests := []struct {
		name string
		sql  string
	}{
		{"Select all columns", "SELECT * FROM users"},
		{"Select specific columns", "SELECT id, name FROM users"},
		{"Select with WHERE clause", "SELECT email FROM users WHERE id = 1"},
		{"Select with alias", "SELECT id as user_id, name FROM users WHERE user_id = 10"},
		{"Select with different table", "SELECT name, price FROM products WHERE price > 1000"},
        {"Select with text comparison", "SELECT name FROM users WHERE name = 'Alice'"},
        {"Select with boolean literal", "SELECT id FROM users WHERE is_active = TRUE"},
        {"Select with boolean comparison", "SELECT id FROM users WHERE is_active = (id > 5)"},
        {"Select with arithmetic ops", "SELECT price * quantity FROM orders WHERE user_id = 1"},
        {"Select with LIKE", "SELECT name FROM users WHERE email LIKE '%@example.com'"},
        {"Select with NOT", "SELECT id FROM users WHERE NOT is_active"},
        {"Select with OR", "SELECT id FROM users WHERE id = 1 OR name = 'Bob'"},
        {"Select with unary minus", "SELECT -price FROM products WHERE id = 1"},
        {"Select COUNT(*) function", "SELECT COUNT(*) FROM orders"},
        {"Select COUNT(column) function", "SELECT COUNT(id) FROM users"},
        {"Select with IS NULL", "SELECT id FROM users WHERE email IS NULL"},
        {"Select with ORDER BY single column", "SELECT id, name FROM users ORDER BY name"},
        {"Select with ORDER BY multiple columns DESC/ASC", "SELECT id, name, email FROM users ORDER BY name DESC, id ASC"},
        {"Select with ORDER BY alias", "SELECT id AS uid, name FROM users ORDER BY uid DESC"},
        {"Select with ORDER BY expression", "SELECT id, price * quantity AS total FROM orders ORDER BY total DESC"},
        {"Select with LIMIT", "SELECT id FROM users LIMIT 10"},
        {"Select with ORDER BY and LIMIT", "SELECT name FROM products ORDER BY price DESC LIMIT 5"},
        // TODO: Add more valid queries (GROUP BY, etc.)
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			program := parseSQL(t, tt.sql)
			errors := v.Validate(program)
			checkValidationErrors(t, errors, []string{}) // Expect no errors
		})
	}
}

func TestValidator_InvalidQueries(t *testing.T) {
	sampleSchema := schema.SampleSchema()
	v := NewValidator(sampleSchema)

	tests := []struct {
		name           string
		sql            string
		expectedErrors []string
	}{
		{
			"Table not found",
			"SELECT * FROM non_existent_table",
			[]string{"Table 'non_existent_table' not found"},
		},
		{
			"Column not found",
			"SELECT non_existent_column FROM users",
			[]string{"Column or alias 'non_existent_column' not found"},
		},
		{
			"Column not found in WHERE",
			"SELECT id FROM users WHERE non_existent_column = 1",
			[]string{"Column or alias 'non_existent_column' not found"},
		},
        {
            "Column not found in ORDER BY",
            "SELECT id FROM users ORDER BY non_existent_column",
            []string{"Column or alias 'non_existent_column' not found"},
        },
        {
            "Ambiguous column without FROM",
            "SELECT id",
            []string{"Cannot resolve identifier 'id' without a valid FROM clause"},
        },
        {
             "Asterisk (*) without FROM",
             "SELECT *",
             []string{"Cannot use '*' without a FROM clause"},
        },
        {
            "Type mismatch in WHERE (= integer, text)",
            "SELECT id FROM users WHERE id = 'abc'",
            []string{"Comparison operator '=' requires operands of the same type, got INTEGER and TEXT"},
        },
        {
            "Type mismatch in WHERE (> boolean, integer)",
            "SELECT id FROM users WHERE is_active > 5",
            []string{"Comparison operator '>' requires INTEGER or TEXT operands of the same type, got BOOLEAN and INTEGER"},
        },
        {
            "Type mismatch in arithmetic (+ integer, text)",
            "SELECT id FROM users WHERE id = id + 'a'",
            []string{"Arithmetic operator '+' requires INTEGER operands, got INTEGER and TEXT"},
        },
        {
            "Type mismatch in logical (AND integer, boolean)",
            "SELECT id FROM users WHERE id = 1 AND is_active",
            []string{"Logical operator 'AND' requires BOOLEAN operands, got BOOLEAN and BOOLEAN"}, // id=1 is BOOLEAN
        },
        {
            "Type mismatch in NOT (NOT integer)",
            "SELECT id FROM users WHERE NOT id",
            []string{"Operator NOT requires a BOOLEAN expression, got INTEGER"},
        },
        {
            "Type mismatch in LIKE (LIKE integer, text)",
            "SELECT name FROM products WHERE id LIKE 'abc%'",
            []string{"Operator LIKE requires TEXT operands, got INTEGER and TEXT"},
        },
        {
            "Unary minus on non-integer",
            "SELECT -name FROM users WHERE id = 1",
            []string{"Unary operator '-' requires an INTEGER expression, got TEXT"},
        },
        {
            "Unknown function",
            "SELECT UNKNOWN_FUNC(id) FROM users",
            []string{"Unknown function: UNKNOWN_FUNC"},
        },
        {
            "Invalid arguments for COUNT (0 args)",
            "SELECT COUNT() FROM users",
            []string{"Invalid number of arguments for function COUNT"},
        },
        {
            "Invalid arguments for COUNT (2 args)",
            "SELECT COUNT(id, name) FROM users",
            []string{"Invalid number of arguments for function COUNT"},
        },
        {
            "IS requires NULL keyword (currently)",
            "SELECT id FROM users WHERE email IS 'not null'",
            []string{"Operator IS currently only supports IS NULL/IS NOT NULL syntax"},
        },
        {
             "Order by boolean",
             "SELECT id FROM users ORDER BY is_active",
             []string{"Ordering by BOOLEAN expression ('is_active') is not allowed"},
        },
        {
            "Invalid LIMIT value (string)",
            "SELECT id FROM users LIMIT 'abc'",
            []string{"LIMIT clause requires a non-negative integer value, got TEXT ('abc')"},
        },
         {
            "Invalid LIMIT value (boolean)",
            "SELECT id FROM users LIMIT TRUE",
            []string{"LIMIT clause requires a non-negative integer value, got BOOLEAN (TRUE)"},
        },
        // TODO: Add tests for negative LIMIT value
        // TODO: Add tests for invalid ORDER BY alias reference
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Reset validator state for each test case if necessary (it is reset in Validate)
			program := parseSQL(t, tt.sql)
			errors := v.Validate(program)
			checkValidationErrors(t, errors, tt.expectedErrors)
		})
	}
}

// Helper to create a basic SELECT statement AST for testing specific expressions
func createSelect(columns []ast.Expression, from ast.Identifier, where ast.Expression) *ast.Program {
	return &ast.Program{
		Statements: []ast.Statement{
			&ast.SelectStatement{
				Columns: columns,
				From:    &from,
				Where:   where,
			},
		},
	}
}

func TestValidator_ExpressionTypeEvaluation(t *testing.T) {
    sampleSchema := schema.SampleSchema()
    v := NewValidator(sampleSchema)

    tests := []struct {
        name         string
        sql          string
        expectedType schema.DataType
        expectError  bool // Whether validation itself should produce errors
    }{
        {"Integer Literal", "SELECT 1 FROM users", schema.INTEGER, false},
        {"String Literal", "SELECT 'hello' FROM users", schema.TEXT, false},
        {"Boolean Literal True", "SELECT TRUE FROM users", schema.BOOLEAN, false},
        {"Boolean Literal False", "SELECT FALSE FROM users", schema.BOOLEAN, false},
        {"Column ID (Integer)", "SELECT id FROM users", schema.INTEGER, false},
        {"Column Name (Text)", "SELECT name FROM users", schema.TEXT, false},
        {"Column IsActive (Boolean)", "SELECT is_active FROM users", schema.BOOLEAN, false},
        {"Alias Expression (original type)", "SELECT id AS user_identifier FROM users", schema.INTEGER, false},
        {"Arithmetic Expression (+)", "SELECT id + 1 FROM users", schema.INTEGER, false},
        {"Arithmetic Expression (*)", "SELECT price * quantity FROM orders", schema.INTEGER, false},
        {"Comparison Expression (=)", "SELECT id = 1 FROM users", schema.BOOLEAN, false},
        {"Comparison Expression (>)", "SELECT price > 100 FROM products", schema.BOOLEAN, false},
        {"Logical Expression (AND)", "SELECT is_active AND (id > 0) FROM users", schema.BOOLEAN, false},
        {"Logical Expression (OR)", "SELECT (name = 'A') OR (name = 'B') FROM users", schema.BOOLEAN, false},
        {"Prefix Expression (NOT)", "SELECT NOT is_active FROM users", schema.BOOLEAN, false},
        {"Prefix Expression (-)", "SELECT -id FROM users", schema.INTEGER, false},
        {"LIKE Expression", "SELECT name LIKE '%a' FROM users", schema.BOOLEAN, false},
        {"IS NULL Expression", "SELECT email IS NULL FROM users", schema.BOOLEAN, false},
        {"Function Call COUNT(*) ", "SELECT COUNT(*) FROM users", schema.INTEGER, false},
        {"Function Call COUNT(col)", "SELECT COUNT(id) FROM users", schema.INTEGER, false},
        {"Unknown Column Type", "SELECT unknown_col FROM users", schema.UNKNOWN, true},
        {"Arithmetic with Type Error", "SELECT id + 'a' FROM users", schema.INTEGER, true}, // Result type is INTEGER, but validation fails
        {"Logical with Type Error", "SELECT id AND TRUE FROM users", schema.BOOLEAN, true}, // Result type is BOOLEAN, but validation fails
        {"Nested Expression", "SELECT (id + 5) * 2 = 10 FROM users", schema.BOOLEAN, false},
    }

    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            program := parseSQL(t, tt.sql)
            errors := v.Validate(program)

            if tt.expectError && len(errors) == 0 {
                t.Errorf("Expected validation errors, but got none")
            } else if !tt.expectError && len(errors) > 0 {
                 var errorMessages []string
                 for _, err := range errors {
                     errorMessages = append(errorMessages, err.Message)
                 }
                t.Errorf("Expected no validation errors, but got: %v", errorMessages)
            }

            // Get the type of the first select column expression
            if len(program.Statements) > 0 {
                if selStmt, ok := program.Statements[0].(*ast.SelectStatement); ok {
                    if len(selStmt.Columns) > 0 {
                        // Use the validator's internal map to get the evaluated type
                        // We need to retrieve the *specific* expression node from the parsed AST
                        exprNode := selStmt.Columns[0]
                        resultType := schema.UNKNOWN
                        var found bool

                        // If it's an alias, get the underlying expression's type
                        if aliasExpr, isAlias := exprNode.(*ast.AliasExpression); isAlias {
                            resultType, found = v.expressionTypes[aliasExpr.Expression] // Check cache for underlying expression
                            if !found {
                                resultType = v.evaluateType(aliasExpr.Expression) // Evaluate if not in cache
                            }
                        } else {
                            resultType, found = v.expressionTypes[exprNode] // Check cache for the expression itself
                             if !found {
                                 resultType = v.evaluateType(exprNode) // Evaluate if not in cache
                             }
                        }

                        if resultType != tt.expectedType {
                            t.Errorf("Expected expression type %s, but got %s (from cache/eval)", tt.expectedType, resultType)
                        }
                    } else {
                        // This case should likely error during parsing or validation already
                         // t.Error("No columns found in SELECT statement")
                    }
                } else {
                    t.Error("First statement is not a SELECT statement")
                }
            } else {
                 // This case should likely error during parsing or validation already
                // t.Error("No statements found in program")
            }
        })
    }
}

// TestValidateTableExistence はテーブル存在チェックをテストします
// (TestValidator_InvalidQueries でカバーされている部分もあるが、個別に残す)
func TestValidateTableExistence(t *testing.T) {
	sampleSchema := schema.SampleSchema()

	tests := []struct {
		input       string
		expectedErrors int
		expectedMsg string // エラーがある場合に期待されるメッセージの一部
	}{
		{
			"SELECT id FROM users;",
			0,
			"",
		},
		{
			"SELECT * FROM products;",
			0,
			"",
		},
		{
			"SELECT name FROM non_existent_table;",
			1,
			"Table 'non_existent_table' not found in schema",
		},
        {
            "SELECT name;", // FROM句がないケース
            1,
             // FROM句がない場合のエラーメッセージは 'Cannot resolve identifier' になる
             "Cannot resolve identifier 'name' without a valid FROM clause",
        },
	}

	for i, tt := range tests {
		t.Run(fmt.Sprintf("test_%d", i), func(t *testing.T) {
			v := NewValidator(sampleSchema)
			program := parseSQL(t, tt.input)
			errors := v.Validate(program)

			if len(errors) != tt.expectedErrors {
				t.Errorf("wrong number of errors. expected=%d, got=%d", tt.expectedErrors, len(errors))
				for _, e := range errors {
					t.Errorf("  error: %s", e.Error())
				}
				return // エラー数が違う場合は以降のチェックはスキップ
			}

			if tt.expectedErrors > 0 {
                found := false
                for _, err := range errors {
                    if strings.Contains(err.Message, tt.expectedMsg) {
                        found = true
                        break
                    }
                }
                if !found {
                    t.Errorf("expected error message containing %q not found. Got: %v", tt.expectedMsg, errors)
                }
			}
		})
	}
}

// TestValidateColumnExistence はカラム存在チェックをテストします
// (TestValidator_InvalidQueries でカバーされている部分もある)
func TestValidateColumnExistence(t *testing.T) {
	sampleSchema := schema.SampleSchema()

	tests := []struct {
		input          string
		expectedErrors int
		expectedMessages []string // エラーがある場合に期待されるメッセージ (部分一致可)
	}{
		{
			"SELECT id, name FROM users;", // OK
			0,
			[]string{},
		},
		{
			"SELECT user_id, total_amount FROM orders WHERE status = 'completed';", // OK
			0,
			[]string{},
		},
		{
			"SELECT id, non_existent_col FROM users;", // NG: non_existent_col
			1,
			[]string{"Column or alias 'non_existent_col' not found"},
		},
		{
			"SELECT id FROM users WHERE non_existent = 1;", // NG: non_existent in WHERE
			1,
			[]string{"Column or alias 'non_existent' not found"},
		},
		{
			"SELECT invalid_1 FROM users WHERE invalid_2 = 'abc';", // NG: 2つエラー
			2,
			[]string{
				"Column or alias 'invalid_1' not found",
				"Column or alias 'invalid_2' not found",
			},
		},
        {
            "SELECT * FROM users WHERE non_existent = 1;", // SELECT * でも WHERE はチェック
            1,
            []string{"Column or alias 'non_existent' not found"},
        },
        {
             "SELECT name FROM non_existent_table WHERE id = 1;", // Tableエラーのみ
             1,
             []string{"Table 'non_existent_table' not found"},
        },
        {
            "SELECT id AS user_id FROM users ORDER BY user_id;", // OK: Order by alias
            0,
            []string{},
        },
        {
             "SELECT id FROM users ORDER BY invalid_alias;", // NG: Order by invalid alias
             1,
             []string{"Column or alias 'invalid_alias' not found"},
        },
	}

	for i, tt := range tests {
		t.Run(fmt.Sprintf("test_%d", i), func(t *testing.T) {
            v := NewValidator(sampleSchema)
			program := parseSQL(t, tt.input)
			errors := v.Validate(program)

			if len(errors) != tt.expectedErrors {
				t.Errorf("wrong number of errors. expected=%d, got=%d", tt.expectedErrors, len(errors))
                t.Log("Got errors:")
                for _, e := range errors {
                    t.Logf("  - %s", e.Error())
                }
				return // エラー数が違う場合は以降のチェックはスキップ
			}

			if tt.expectedErrors > 0 {
                errorMessages := make(map[string]bool)
                for _, e := range errors {
                    errorMessages[e.Message] = true
                }

                for _, expectedMsg := range tt.expectedMessages {
                    found := false
                    for msg := range errorMessages {
                        // 部分一致でチェック
                        if strings.Contains(msg, expectedMsg) {
                            found = true
                            delete(errorMessages, msg) // 一致したらマップから削除
                            break
                        }
                    }
                    if !found {
                        t.Errorf("expected error message containing %q not found. Got: %v", expectedMsg, errors)
                    }
                }
                // 想定外のエラーがないかチェック
                if len(errorMessages) > 0 {
                     t.Errorf("unexpected errors found:")
                     for msg := range errorMessages {
                         t.Errorf("  - %s", msg)
                     }
                }
			}
		})
	}
}

// TODO: カラム存在チェック、型チェックなどのテストを追加
