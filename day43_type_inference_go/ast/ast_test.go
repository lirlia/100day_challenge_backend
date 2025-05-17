/*
package ast

import (
	"testing"
)

// Helper to create int pointers for literals
func intPtr(i int) *int { return &i }

// Helper to create bool pointers for literals
func boolPtr(b bool) *bool { return &b }

// Helper to create string pointers for literals/vars
func strPtr(s string) *string { return &s }

func TestLiteral_String(t *testing.T) {
	tests := []struct {
		name     string
		literal  Literal
		expected string
	}{
		{
			name:     "Integer Literal",
			literal:  Literal{IntVal: intPtr(123)},
			expected: "123",
		},
		{
			name:     "Boolean True Literal",
			literal:  Literal{BoolVal: boolPtr(true)},
			expected: "true",
		},
		{
			name:     "Boolean False Literal",
			literal:  Literal{BoolVal: boolPtr(false)},
			expected: "false",
		},
		{
			name:     "Variable Literal",
			literal:  Literal{Variable: strPtr("x")},
			expected: "x",
		},
		{
			name: "Parenthesized Integer Literal",
			literal: Literal{
				LParen: strPtr("("),
				SubExpr: &Term{
					Left: &AddTerm{
						Left: &MulTerm{
							Left: &CmpTerm{
								Left: &BoolTerm{
									Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(42)}}},
								},
							},
						},
					},
				},
				RParen: strPtr(")"),
			},
			expected: "(42)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := tt.literal.String(); got != tt.expected {
				t.Errorf("Literal.String() = %v, want %v", got, tt.expected)
			}
		})
	}
}

func TestTerm_String(t *testing.T) {
	// Simple term: 1 + 2
	term1 := Term{
		Left: &AddTerm{
			Left: &MulTerm{
				Left: &CmpTerm{
					Left: &BoolTerm{
						Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(1)}}},
					},
				},
			},
		},
		Right: []*OpAddTerm{
			{
				Operator: "+",
				AddTerm: &AddTerm{
					Left: &MulTerm{
						Left: &CmpTerm{
							Left: &BoolTerm{
								Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(2)}}},
							},
						},
					},
				},
			},
		},
	}
	expected1 := "1 + 2"
	if got1 := term1.String(); got1 != expected1 {
		t.Errorf("Term.String() for '1 + 2' = %v, want %v", got1, expected1)
	}

	// Term with multiplication: 1 * 2 + 3
	term2 := Term{ // Root for the entire expression: (1 * 2) + 3
		Left: &AddTerm{ // Represents the '+' operation, its Left is (1*2), Right is 3
			Left: &MulTerm{ // Represents '1 * 2'
				Left: &CmpTerm{
					Left: &BoolTerm{
						Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(1)}}}, // This is '1'
					},
				},
				Right: []*OpMulTerm{ // This is for the '*' operation
					{
						Operator: "*",
						MulTerm: &MulTerm{ // This is for '2'
							Left: &CmpTerm{
								Left: &BoolTerm{
									Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(2)}}},
								},
							},
						},
					},
				},
			},
			Right: []*OpAddTerm{ // This is for the '+' operation (with 3)
				{
					Operator: "+",
					AddTerm: &AddTerm{ // This is for '3'
						Left: &MulTerm{
							Left: &CmpTerm{
								Left: &BoolTerm{
									Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(3)}}},
								},
							},
						},
					},
				},
			},
		},
	}
	expected2 := "1 * 2 + 3"
	if got2 := term2.String(); got2 != expected2 {
		t.Errorf("Term.String() for '1 * 2 + 3' = %v, want %v", got2, expected2)
	}
}

func TestLet_String(t *testing.T) {
	letExpr := Let{
		VarName: "x",
		BindExpr: &Term{
			Left: &AddTerm{
				Left: &MulTerm{
					Left: &CmpTerm{
						Left: &BoolTerm{
							Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(10)}}},
						},
					},
				},
			},
		},
		BodyExpr: &TopLevelExpression{
			Term: &Term{ // x + 5
				Left: &AddTerm{
					Left: &MulTerm{
						Left: &CmpTerm{
							Left: &BoolTerm{
								Factor: &Factor{Base: &BaseFactor{Literal: &Literal{Variable: strPtr("x")}}},
							},
						},
					},
				},
				Right: []*OpAddTerm{
					{
						Operator: "+",
						AddTerm: &AddTerm{
							Left: &MulTerm{
								Left: &CmpTerm{
									Left: &BoolTerm{
										Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(5)}}},
									},
								},
							},
						},
					},
				},
			},
		},
	}
	expected := "let x = 10 in x + 5"
	if got := letExpr.String(); got != expected {
		t.Errorf("Let.String() = %v, want %v", got, expected)
	}
}

func TestIf_String(t *testing.T) {
	ifExpr := If{
		CondExpr: &Term{ // x > 0
			Left: &AddTerm{
				Left: &MulTerm{
					Left: &CmpTerm{ // For 'x > 0'
						Left: &BoolTerm{
							Factor: &Factor{Base: &BaseFactor{Literal: &Literal{Variable: strPtr("x")}}}, // This is 'x'
						},
						Right: []*OpCmpTerm{{ // For the '>' operation
							Operator: ">",
							CmpTerm: &CmpTerm{ // This is for '0'
								Left: &BoolTerm{
									Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(0)}}},
								},
							},
						}},
					},
				},
			},
		},
		ThenExpr: &Term{
			Left: &AddTerm{
				Left: &MulTerm{
					Left: &CmpTerm{
						Left: &BoolTerm{
							Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(1)}}},
						},
					},
				},
			},
		},
		ElseExpr: &Term{
			Left: &AddTerm{
				Left: &MulTerm{
					Left: &CmpTerm{
						Left: &BoolTerm{
							Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(0)}}},
						},
					},
				},
			},
		},
	}
	expected := "if x > 0 then 1 else 0"
	if got := ifExpr.String(); got != expected {
		t.Errorf("If.String() = %v, want %v", got, expected)
	}
}

func TestLambda_String(t *testing.T) {
	lambdaExpr := Lambda{
		Param: "x",
		BodyExpr: &Term{
			Left: &AddTerm{
				Left: &MulTerm{
					Left: &CmpTerm{
						Left: &BoolTerm{
							Factor: &Factor{Base: &BaseFactor{Literal: &Literal{Variable: strPtr("x")}}},
						},
					},
				},
			},
			Right: []*OpAddTerm{
				{
					Operator: "+",
					AddTerm: &AddTerm{
						Left: &MulTerm{
							Left: &CmpTerm{
								Left: &BoolTerm{
									Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(1)}}},
								},
							},
						},
					},
				},
			},
		},
	}
	expected := "fn x => x + 1"
	if got := lambdaExpr.String(); got != expected {
		t.Errorf("Lambda.String() = %v, want %v", got, expected)
	}
}

func TestFactor_String_FuncApp(t *testing.T) {
	// Test for f(x)
	funcApp := Factor{
		Base: &BaseFactor{
			Literal: &Literal{Variable: strPtr("f")},
		},
		Args: []*Arg{
			{
				Arg: &Term{
					Left: &AddTerm{
						Left: &MulTerm{
							Left: &CmpTerm{
								Left: &BoolTerm{
									Factor: &Factor{Base: &BaseFactor{Literal: &Literal{Variable: strPtr("x")}}},
								},
							},
						},
					},
				},
			},
		},
	}
	expected := "f(x)"
	if got := funcApp.String(); got != expected {
		t.Errorf("Factor.String() for func app 'f(x)' = %v, want %v", got, expected)
	}

	// Test for (fn y => y)(10)
	funcAppLambda := Factor{
		Base: &BaseFactor{
			Lambda: &Lambda{
				Param: "y",
				BodyExpr: &Term{
					Left: &AddTerm{
						Left: &MulTerm{
							Left: &CmpTerm{
								Left: &BoolTerm{
									Factor: &Factor{Base: &BaseFactor{Literal: &Literal{Variable: strPtr("y")}}},
								},
							},
						},
					},
				},
			},
		},
		Args: []*Arg{
			{
				Arg: &Term{
					Left: &AddTerm{
						Left: &MulTerm{
							Left: &CmpTerm{
								Left: &BoolTerm{
									Factor: &Factor{Base: &BaseFactor{Literal: &Literal{IntVal: intPtr(10)}}},
								},
							},
						},
					},
				},
			},
		},
	}
	// Note: Lambda.String() for base, then Arg.String()
	expectedLambdaApp := "fn y => y(10)"
	if got := funcAppLambda.String(); got != expectedLambdaApp {
		t.Errorf("Factor.String() for func app '(fn y => y)(10)' = %v, want %v", got, expectedLambdaApp)
	}
}
*/
