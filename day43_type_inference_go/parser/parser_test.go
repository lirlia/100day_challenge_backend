package parser

import (
	"strings"
	"testing"
)

func TestParse_LiteralsAndSimpleExpr(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected string // Expected string representation of the parsed AST
		hasError bool
	}{
		{"Integer", "123", "123", false},
		{"Boolean True", "true", "true", false},
		{"Boolean False", "false", "false", false},
		{"Identifier", "x", "x", false},
		{"Parenthesized Integer", "(42)", "(42)", false},
		{"Simple Addition", "1 + 2", "1 + 2", false},
		{"Simple Multiplication", "3 * 4", "3 * 4", false},
		{"Mixed Operators", "1 + 2 * 3", "1 + 2 * 3", false},
		{"Parentheses and Operators", "(1 + 2) * 3", "(1 + 2) * 3", false},
		{"Comparison GT", "a > b", "a > b", false},
		{"Comparison LT", "a < b", "a < b", false},
		{"Comparison EQ", "a == b", "a == b", false},
		{"Logical AND", "true && false", "true && false", false},
		{"Logical OR", "x || y", "x || y", false},
		{"Comment only", "# this is a comment", "", false}, // Expect empty string for comment-only or whitespace-only
		{"Whitespace only", "   \n  ", "", false},
		{"Comment and expr", "1 + 1 # comment", "1 + 1", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			program, err := Parse(tt.code)
			if tt.hasError {
				if err == nil {
					t.Errorf("Parse(%q) expected error, got nil", tt.code)
				}
				return // Don't check AST if error is expected
			}
			if err != nil {
				t.Errorf("Parse(%q) returned error: %v", tt.code, err)
				return
			}
			if program == nil && tt.expected != "" { // Allow empty program for comment/whitespace only
				t.Errorf("Parse(%q) returned nil program, want %q", tt.code, tt.expected)
				return
			}

			var got string
			if program != nil && program.Expression != nil {
				got = program.Expression.String()
			} else {
				got = "" // For empty inputs like comments or whitespace
			}

			if got != tt.expected {
				t.Errorf("Parse(%q).String() = %q, want %q", tt.code, got, tt.expected)
			}
		})
	}
}

func TestParse_CompoundExpressions(t *testing.T) {
	tests := []struct {
		name     string
		code     string
		expected string
		hasError bool
	}{
		{
			name:     "Let Expression",
			code:     "let x = 10 in x + 5",
			expected: "let x = 10 in x + 5",
			hasError: false,
		},
		{
			name:     "Nested Let Expression",
			code:     "let x = 1 in let y = 2 in x + y",
			expected: "let x = 1 in let y = 2 in x + y",
			hasError: false,
		},
		{
			name:     "If Expression",
			code:     "if x > 0 then 1 else 0 - 1",
			expected: "if x > 0 then 1 else 0 - 1",
			hasError: false,
		},
		{
			name:     "Lambda Expression",
			code:     "fn x => x + 1",
			expected: "fn x => x + 1",
			hasError: false,
		},
		{
			name:     "Function Application",
			code:     "myFunc(10)",
			expected: "myFunc(10)",
			hasError: false,
		},
		{
			name:     "Lambda Application",
			code:     "(fn x => x * x)(5)",
			expected: "(fn x => x * x)(5)",
			hasError: false,
		},
		{
			name:     "Curried Function Application",
			code:     "add(3)(4)",
			expected: "add(3)(4)",
			hasError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			program, err := Parse(tt.code)
			if tt.hasError {
				if err == nil {
					t.Errorf("Parse(%q) expected error, got nil", tt.code)
				}
				return
			}
			if err != nil {
				t.Errorf("Parse(%q) returned error: %v", tt.code, err)
				return
			}
			if program == nil || program.Expression == nil {
				t.Errorf("Parse(%q) returned nil program or expression", tt.code)
				return
			}

			got := program.Expression.String()
			if got != tt.expected {
				t.Errorf("Parse(%q).String() = %q, want %q", tt.code, got, tt.expected)
			}
		})
	}
}

func TestParse_Errors(t *testing.T) {
	tests := []struct {
		name             string
		code             string
		wantErrSubstring string // Substring expected in the error message
	}{
		{
			name:             "Unmatched_Parenthesis",
			code:             "(1 + 2",
			wantErrSubstring: "expected \")\"",
		},
		{
			name:             "Incomplete_Let",
			code:             "let x = 10",
			wantErrSubstring: "expected <inkw>",
		},
		{
			name:             "Missing_In_in_Let",
			code:             "let x = 10 x + 1",
			wantErrSubstring: "expected <inkw>",
		},
		{
			name:             "If_without_Then",
			code:             "if true 1 else 0",
			wantErrSubstring: "expected <thenkw>",
		},
		{
			name:             "If_without_Else",
			code:             "if true then 1",
			wantErrSubstring: "expected <elsekw>",
		},
		{
			name:             "Invalid_token",
			code:             "1 $ 2",
			wantErrSubstring: "lexer: invalid input text",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := Parse(tt.code)
			if err == nil {
				t.Errorf("Parse(%q) expected error, got nil", tt.code)
				return
			}
			if !strings.Contains(err.Error(), tt.wantErrSubstring) {
				t.Errorf("Parse(%q) error = %q, want substring %q", tt.code, err.Error(), tt.wantErrSubstring)
			}
		})
	}
}
