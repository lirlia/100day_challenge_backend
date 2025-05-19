package inference

import (
	"fmt"
	"testing"

	"github.com/alecthomas/participle/v2"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/ast"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/parser"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/types"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/unification"
)

// parseAndGetMainExpression は文字列をパースし、プログラムの主要な式を取得します。
// トップレベルが let 式か、それ以外の式かを判別します。
func parseAndGetMainExpression(input string) (ast.Expression, error) {
	program, err := parser.Parse(input) // Use the global parser from parser package
	if err != nil {
		return nil, err // participle errors are usually informative enough
	}

	if program.Expression == nil {
		return nil, fmt.Errorf("parsed program has no top-level expression")
	}

	// TopLevelExpression から実際の式を取り出す
	if program.Expression.Let != nil {
		return program.Expression.Let, nil
	}
	if program.Expression.Term != nil {
		// Termの中には、Factor, AddTerm, MulTerm, CmpTermなどがネストしている可能性がある
		// ここでは *ast.Term をそのまま返す
		return program.Expression.Term, nil
	}

	// program.Expression.Term がnilで、Letでもない場合 (例: コメントのみの入力)
	// このケースはパーサーレベルでエラーになるか、空のASTになるべき。
	// ここに到達する場合、何かしら予期せぬAST構造になっている可能性がある。
	// ただし、文法上、空の入力やコメントのみの入力が許可されている場合、
	// program.Expression が nil になることはないはず (participle の挙動による)。
	// 通常は program.Expression.Term が何らかの形で存在する。
	// もし本当に何もないなら、テストケースがおかしいか、パーサーの定義を見直す。
	return nil, fmt.Errorf("top-level expression is neither let nor term: %s", program.String())
}

func TestInferLiterals(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected types.Type
		wantErr  bool
	}{
		{"integer", "123", types.TInt{}, false},
		{"true", "true", types.TBool{}, false},
		{"false", "false", types.TBool{}, false},
		{"parenthesized int", "(42)", types.TInt{}, false},
		{"parenthesized bool", "(true)", types.TBool{}, false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			types.ResetTypeVarCounter()
			expr, err := parseAndGetMainExpression(tt.input)
			if err != nil {
				if tt.wantErr {
					if pErr, ok := err.(participle.Error); ok { // Try to assert to participle.Error interface
						t.Logf("Expected parse error: %s (Pos: %s)", pErr.Message(), pErr.Position())
					} else {
						t.Logf("Expected error, got non-participle error: %v", err)
					}
					return
				}
				t.Fatalf("Parse error for input '%s': %v", tt.input, err)
			}

			env := BaseTypeEnv()
			gotType, _, err := Infer(env, expr)

			if (err != nil) != tt.wantErr {
				t.Errorf("Infer() for '%s': error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && gotType.String() != tt.expected.String() {
				t.Errorf("Infer() for '%s': gotType = %s, want %s", tt.input, gotType, tt.expected)
			}
		})
	}
}

func TestInferArithmetic(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected types.Type
		wantErr  bool
	}{
		{"addition", "1 + 2", types.TInt{}, false},
		{"subtraction", "5 - 3", types.TInt{}, false},
		{"multiplication", "2 * 3", types.TInt{}, false},
		{"division", "6 / 2", types.TInt{}, false},
		{"mixed", "1 + 2 * 3 - 4 / 2", types.TInt{}, false},
		{"parentheses", "(1 + 2) * 3", types.TInt{}, false},
		{"type error add", "1 + true", nil, true},
		{"type error mul", "false * 2", nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			types.ResetTypeVarCounter()
			expr, err := parseAndGetMainExpression(tt.input)
			if err != nil {
				if tt.wantErr {
					if pErr, ok := err.(participle.Error); ok {
						t.Logf("Expected parse error: %s", pErr.Message())
					} else {
						t.Logf("Expected error, got non-participle error: %v", err)
					}
					return
				}
				t.Fatalf("Parse error for input '%s': %v", tt.input, err)
			}
			env := BaseTypeEnv()
			gotType, _, err := Infer(env, expr)
			if (err != nil) != tt.wantErr {
				t.Errorf("Infer() for '%s': error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && (gotType == nil || gotType.String() != tt.expected.String()) {
				t.Errorf("Infer() for '%s': gotType = %v, want %v", tt.input, gotType, tt.expected)
			}
		})
	}
}

func TestInferComparison(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected types.Type
		wantErr  bool
	}{
		{"greater than", "3 > 2", types.TBool{}, false},
		{"less than", "1 < 5", types.TBool{}, false},
		{"equal", "10 == 10", types.TBool{}, false},
		{"type error gt", "1 > true", nil, true},
		{"type error eq", "false == 0", nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			types.ResetTypeVarCounter()
			expr, err := parseAndGetMainExpression(tt.input)
			if err != nil {
				if tt.wantErr {
					if pErr, ok := err.(participle.Error); ok {
						t.Logf("Expected parse error: %s", pErr.Message())
					} else {
						t.Logf("Expected error, got non-participle error: %v", err)
					}
					return
				}
				t.Fatalf("Parse error for input '%s': %v", tt.input, err)
			}
			env := BaseTypeEnv()
			gotType, _, err := Infer(env, expr)
			if (err != nil) != tt.wantErr {
				t.Errorf("Infer() for '%s': error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && (gotType == nil || gotType.String() != tt.expected.String()) {
				t.Errorf("Infer() for '%s': gotType = %v, want %v", tt.input, gotType, tt.expected)
			}
		})
	}
}

func TestInferBooleanLogic(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected types.Type
		wantErr  bool
	}{
		{"and", "true && false", types.TBool{}, false},
		{"or", "true || false", types.TBool{}, false},
		{"mixed", "true && (false || true)", types.TBool{}, false},
		{"type error and", "true && 1", nil, true},
		{"type error or", "0 || false", nil, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			types.ResetTypeVarCounter()
			expr, err := parseAndGetMainExpression(tt.input)
			if err != nil {
				if tt.wantErr {
					if pErr, ok := err.(participle.Error); ok {
						t.Logf("Expected parse error: %s", pErr.Message())
					} else {
						t.Logf("Expected error, got non-participle error: %v", err)
					}
					return
				}
				t.Fatalf("Parse error for input '%s': %v", tt.input, err)
			}
			env := BaseTypeEnv()
			gotType, _, err := Infer(env, expr)
			if (err != nil) != tt.wantErr {
				t.Errorf("Infer() for '%s': error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && (gotType == nil || gotType.String() != tt.expected.String()) {
				t.Errorf("Infer() for '%s': gotType = %v, want %v", tt.input, gotType, tt.expected)
			}
		})
	}
}

func TestInferIf(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected types.Type
		wantErr  bool
	}{
		{"if true", "if true then 1 else 2", types.TInt{}, false},
		{"if false", "if false then 1 else 2", types.TInt{}, false},
		{"if with bool branches", "if 1 > 0 then true else false", types.TBool{}, false},
		{"condition not bool", "if 1 then 10 else 20", nil, true},
		{"branch type mismatch", "if true then 10 else false", nil, true},
		{"if with type var", "let f = fn x => x in if true then f 1 else f 2", types.TInt{}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			types.ResetTypeVarCounter()
			expr, err := parseAndGetMainExpression(tt.input)
			if err != nil {
				if tt.wantErr {
					if pErr, ok := err.(participle.Error); ok {
						t.Logf("Expected parse error: %s", pErr.Message())
					} else {
						t.Logf("Expected error, got non-participle error: %v", err)
					}
					return
				}
				t.Fatalf("Parse error for input '%s': %v", tt.input, err)
			}
			env := BaseTypeEnv()

			finalType, finalSub, err := Infer(env, expr)

			if (err != nil) != tt.wantErr {
				t.Errorf("Infer() for '%s': error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if !tt.wantErr && finalType != nil {
				resultType := unification.Apply(finalSub, finalType)
				if tt.expected == nil { // Should not happen if wantErr is false
					t.Errorf("Infer() for '%s': expected type is nil but no error wanted", tt.input)
				} else if resultType.String() != tt.expected.String() {
					t.Errorf("Infer() for '%s': gotType = %s, want %s", tt.input, resultType, tt.expected)
				}
			} else if !tt.wantErr && finalType == nil {
				t.Errorf("Infer() for '%s': gotType = nil, want %s", tt.input, tt.expected)
			}
		})
	}
}

func TestInferLet(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		expectedStr    string
		wantErr        bool
		specificChecks func(t *testing.T, finalType types.Type, finalSub unification.Substitution)
	}{
		{name: "let simple", input: "let x = 10 in x + 5", expectedStr: "int", wantErr: false},
		{name: "let bool", input: "let b = true in if b then 1 else 2", expectedStr: "int", wantErr: false},
		{name: "let shadowing", input: "let x = 10 in let x = true in if x then 1 else 0", expectedStr: "int", wantErr: false},
		{name: "let unbound in binding", input: "let x = yyy in x", wantErr: true},
		{
			name: "let poly id", input: "let id = fn x => x in id 10", expectedStr: "int", wantErr: false,
		},
		{name: "let poly id bool", input: "let id = fn x => x in id true", expectedStr: "bool", wantErr: false},
		{
			name:        "let_poly_const",
			input:       "let k = fn x => fn y => x in k 10 true",
			expectedStr: "int",
		},
		{
			name:        "let_non-generic",
			input:       "let x_for_f = 10 in let f = (fn y => x_for_f + y) in f 1",
			expectedStr: "int",
		},
		{name: "complex_let_binding", input: "let add = fn x => fn y => x + y in (add 10) 20", expectedStr: "int", wantErr: false},
		{name: "let id applied to id", input: "let id = fn x => x in id id", expectedStr: "t1 -> t1", wantErr: false,
			specificChecks: func(t *testing.T, finalType types.Type, finalSub unification.Substitution) {
				// Expected: (tX -> tX) after applying substitutions, where tX is a fresh var name like t0 or t1
				// The expectedStr "t1 -> t1" is a placeholder for this structure.
				// ResetTypeVarCounter ensures the *first* TVar generated is t0.
				// `id` is generalized to `forall t0. t0 -> t0`.
				// Outer `id` is instantiated to `t1 -> t1`.
				// Inner `id` is instantiated to `t2 -> t2`.
				// Unify `t1` with `t2 -> t2`. Sub: `{t1 := t2 -> t2}`.
				// Result type (which was `t1`) becomes `t2 -> t2`.
				// So, the actual string should be something like "t2 -> t2" (or "t0 -> t0" if it's the first created after a reset).
				// Let's use checkPolyId for this structure.
				checkPolyId(t, finalType)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			types.ResetTypeVarCounter()
			expr, err := parseAndGetMainExpression(tt.input)
			if err != nil {
				if tt.wantErr {
					if pErr, ok := err.(participle.Error); ok {
						t.Logf("Expected parse error for '%s': %s", tt.input, pErr.Message())
					} else {
						t.Logf("Expected error for '%s', got non-participle error: %v", tt.input, err)
					}
					return
				}
				t.Fatalf("Parse error for input '%s': %v", tt.input, err)
			}

			env := BaseTypeEnv()
			finalType, finalSub, err := Infer(env, expr)

			if (err != nil) != tt.wantErr {
				t.Errorf("Infer() for '%s': error = %v, wantErr %v", tt.input, err, tt.wantErr)
				if err != nil {
					t.Logf("Error details: %s", err.Error())
				}
				return
			}
			if !tt.wantErr && finalType != nil {
				types.ResetTypeVarCounter()
				resultType := unification.Apply(finalSub, finalType)
				actualStr := resultType.String()

				if tt.specificChecks != nil {
					tt.specificChecks(t, resultType, finalSub)
				} else if actualStr != tt.expectedStr {
					t.Errorf("Infer() for '%s': gotType = %s, want %s", tt.input, actualStr, tt.expectedStr)
				}
				t.Logf("Input: '%s', Got: %s, Expected: %s, Sub: %v", tt.input, actualStr, tt.expectedStr, finalSub)

			} else if !tt.wantErr && finalType == nil {
				t.Errorf("Infer() for '%s': gotType = nil, want %s", tt.input, tt.expectedStr)
			}
		})
	}
}

func TestInferLambdaAndApp(t *testing.T) {
	tests := []struct {
		name           string
		input          string
		expectedStr    string
		wantErr        bool
		checkStructure func(t *testing.T, ty types.Type)
	}{
		{name: "id function", input: "fn x => x", expectedStr: "t0 -> t0", checkStructure: checkPolyId},
		{name: "const function", input: "fn x => 10", expectedStr: "t0 -> int"},
		{name: "apply id int", input: "(fn x => x) 123", expectedStr: "int"},
		{name: "apply id bool", input: "(fn x => x) true", expectedStr: "bool"},
		{name: "apply const", input: "(fn x => 10) true", expectedStr: "int"},
		{name: "apply add", input: "(fn x => fn y => x + y) 5 3", expectedStr: "int"},
		{name: "apply to non-function", input: "123 456", wantErr: true},
		{name: "arity mismatch too few (partial app)", input: "(fn x => fn y => x + y) 5", expectedStr: "int -> int"},
		{name: "arity mismatch too many", input: "(fn x => x + 1) 5 3", wantErr: true},
		{name: "type mismatch in app", input: "(fn x => x + 1) true", wantErr: true},
		{name: "nested lambda", input: "fn x => fn y => x", expectedStr: "t0 -> (t1 -> t0)", checkStructure: checkPolyConst},
		{name: "lambda in let", input: "let f = fn x => x + 1 in f 10", expectedStr: "int"},
		{name: "if in lambda", input: "fn x => if x then 1 else 0", expectedStr: "bool -> int"},
		{name: "factorial like (no rec)", input: "let fac = fn n => if n == 0 then 1 else n * 1 in fac 3", expectedStr: "int", wantErr: false},
		{name: "Y combinator sketch (type error expected)", input: "let Y = fn f => (fn x => f (x x)) (fn x => f (x x)) in Y", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			types.ResetTypeVarCounter()
			exprNode, err := parseAndGetMainExpression(tt.input)
			if err != nil {
				if tt.wantErr {
					if pErr, ok := err.(participle.Error); ok {
						t.Logf("Expected parse error for '%s': %v", tt.input, pErr.Message())
					} else {
						t.Logf("Expected error for '%s', got non-participle error: %v", tt.input, err)
					}
					return
				}
				t.Fatalf("Parse error for input '%s': %v", tt.input, err)
			}

			env := BaseTypeEnv()
			finalType, finalSub, err := Infer(env, exprNode)

			if (err != nil) != tt.wantErr {
				t.Errorf("Infer() for '%s': error = %v, wantErr %v", tt.input, err, tt.wantErr)
				if err != nil {
					t.Logf("Error details: %s", err.Error())
				}
				return
			}
			if !tt.wantErr && finalType != nil {
				types.ResetTypeVarCounter()
				resultType := unification.Apply(finalSub, finalType)
				actualTypeStr := resultType.String()

				if tt.checkStructure != nil {
					tt.checkStructure(t, resultType)
				} else if actualTypeStr != tt.expectedStr {
					t.Errorf("Infer() for '%s': gotType = %s, want %s", tt.input, actualTypeStr, tt.expectedStr)
				}
				t.Logf("Input: '%s', Got: %s, Expected: %s, Sub: %v", tt.input, actualTypeStr, tt.expectedStr, finalSub)

			} else if !tt.wantErr && finalType == nil {
				t.Errorf("Infer() for '%s': gotType = nil, want %s", tt.input, tt.expectedStr)
			}
		})
	}
}

func checkPolyId(t *testing.T, ty types.Type) {
	t.Helper()
	fnTy, ok := ty.(types.TFunc)
	if !ok {
		t.Errorf("checkPolyId: expected TFunc, got %T (%s)", ty, ty.String())
		return
	}
	argTy, okArg := fnTy.ArgType.(types.TVar)
	if !okArg {
		t.Errorf("checkPolyId: expected ArgType TVar, got %T (%s)", fnTy.ArgType, fnTy.ArgType.String())
		return
	}
	retTy, okRet := fnTy.ReturnType.(types.TVar)
	if !okRet {
		t.Errorf("checkPolyId: expected ReturnType TVar, got %T (%s)", fnTy.ReturnType, fnTy.ReturnType.String())
		return
	}
	if argTy.Name != retTy.Name {
		t.Errorf("checkPolyId: expected ArgType and ReturnType to be the same TVar, got %s -> %s", argTy.Name, retTy.Name)
	}
}

func checkPolyConst(t *testing.T, ty types.Type) {
	t.Helper() // fn x => fn y => x  should be t0 -> (t1 -> t0)
	fnTy1, ok1 := ty.(types.TFunc)
	if !ok1 {
		t.Errorf("checkPolyConst: expected outer TFunc, got %T (%s)", ty, ty.String())
		return
	}
	tVarX, okX := fnTy1.ArgType.(types.TVar)
	if !okX {
		t.Errorf("checkPolyConst: expected outer ArgType TVar, got %T (%s)", fnTy1.ArgType, fnTy1.ArgType.String())
		return
	}

	fnTy2, ok2 := fnTy1.ReturnType.(types.TFunc)
	if !ok2 {
		t.Errorf("checkPolyConst: expected ReturnType to be TFunc, got %T (%s)", fnTy1.ReturnType, fnTy1.ReturnType.String())
		return
	}

	// TVarY can be any type variable, its specific name doesn't need to be checked against tVarX for t0 -> (t1 -> t0)
	_, okY := fnTy2.ArgType.(types.TVar)
	if !okY {
		t.Errorf("checkPolyConst: expected inner ArgType TVar, got %T (%s)", fnTy2.ArgType, fnTy2.ArgType.String())
		return
	}

	retTyFinal, okRetFinal := fnTy2.ReturnType.(types.TVar)
	if !okRetFinal {
		t.Errorf("checkPolyConst: expected final ReturnType TVar, got %T (%s)", fnTy2.ReturnType, fnTy2.ReturnType.String())
		return
	}

	if tVarX.Name != retTyFinal.Name {
		t.Errorf("checkPolyConst: expected outer Arg TVar (%s) to match final Return TVar (%s)", tVarX.Name, retTyFinal.Name)
	}
}

// Helper for TestInferLet with `id id` case
// This check might need to be removed or simplified if `let id = fn x => x in id id` is too complex or ambiguous for the current parser/inferencer.
// The expected type `t1 -> t1` for `id id` assumes `id` is `forall t0. t0 -> t0` and application `id(id)` works as expected.
func checkIdIdType(t *testing.T, ty types.Type) {
	t.Helper()
	// Expects a structure like (tX -> tX) after ResetTypeVarCounter and substitutions.
	// Example: id : forall a. a->a. Outer id (t0->t0), inner id (t1->t1). Unify t0 = (t1->t1). Result t0 is (t1->t1).
	// So the final type will be some tvar substituted by a function from some *other* tvar to itself.
	// E.g. (t1 -> t1)
	fnOuter, okOuter := ty.(types.TFunc)
	if !okOuter {
		t.Errorf("checkIdIdType: Expected TFunc, got %T (%s)", ty, ty.String())
		return
	}

	// The argument to the outer function (which was the first instantiation of 'id') is not necessarily a TVar here.
	// It would have been unified with the second instantiation of 'id'.
	// So, fnOuter.ArgType should be a TFunc itself, like (tY -> tY)
	argFn, okArgFn := fnOuter.ArgType.(types.TFunc)
	if !okArgFn {
		t.Errorf("checkIdIdType: Expected ArgType of outer func to be TFunc, got %T (%s)", fnOuter.ArgType, fnOuter.ArgType.String())
		return
	}
	argFn_arg, ok_AFA := argFn.ArgType.(types.TVar)
	argFn_ret, ok_AFR := argFn.ReturnType.(types.TVar)
	if !ok_AFA || !ok_AFR || argFn_arg.Name != argFn_ret.Name {
		t.Errorf("checkIdIdType: ArgType of outer func expected to be tY->tY, got %s", argFn.String())
	}

	// The return type of the outer function should also be a TFunc like (tY -> tY)
	// and structurally identical to argFn
	if fnOuter.ReturnType.String() != argFn.String() { // Simple string check for structural identity here
		t.Errorf("checkIdIdType: Expected ReturnType of outer func (%s) to be structurally tY->tY, same as ArgType (%s)", fnOuter.ReturnType.String(), argFn.String())
	}
}
