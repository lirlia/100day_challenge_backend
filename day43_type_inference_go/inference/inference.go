package inference

import (
	"fmt"
	// Required for some string operations, e.g. in error messages or printing types.
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/ast"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/types"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/unification"
)

// TypeEnvironment は型環境を表します。
// 識別子（変数名）から型スキームへのマッピングです。
type TypeEnvironment map[string]types.TScheme

// NewTypeEnvironment は新しい空の型環境を作成します。
func NewTypeEnvironment() TypeEnvironment {
	return make(TypeEnvironment)
}

// Extend は型環境に新しい束縛を追加した新しい環境を返します。
func (env TypeEnvironment) Extend(name string, scheme types.TScheme) TypeEnvironment {
	newEnv := make(TypeEnvironment, len(env)+1)
	for k, v := range env {
		newEnv[k] = v
	}
	newEnv[name] = scheme
	return newEnv
}

// Lookup は指定された名前の型スキームを型環境から探します。
// 見つからない場合はエラーを返します。
func (env TypeEnvironment) Lookup(name string) (types.TScheme, bool) {
	scheme, ok := env[name]
	return scheme, ok
}

// Apply は代入を型環境内のすべての型スキームに適用します。
func (env TypeEnvironment) Apply(sub unification.Substitution) TypeEnvironment {
	newEnv := NewTypeEnvironment()
	for name, scheme := range env {
		newEnv[name] = ApplyToScheme(sub, scheme)
	}
	return newEnv
}

// FreeTypeVars は型環境全体に含まれるすべての自由な型変数のセットを返します。
func (env TypeEnvironment) FreeTypeVars() types.TVarSet {
	ftvSet := types.NewTVarSet()
	for _, scheme := range env {
		// TSchemeのFreeTypeVarsは既に量化変数を考慮している
		ftvSet = ftvSet.Union(scheme.FreeTypeVars())
	}
	return ftvSet
}

// ApplyToScheme は型代入を型スキームに適用します。
// 型スキームによって束縛されている変数は代入の影響を受けません。
func ApplyToScheme(sub unification.Substitution, scheme types.TScheme) types.TScheme {
	// 束縛されている変数を代入のドメインから取り除くフィルタリングされた代入を作成
	filteredSub := unification.EmptySubstitution()
	quantifiedNames := types.NewTVarSetFromSlice(scheme.QuantifiedVars)

	for varName, typ := range sub {
		if !quantifiedNames.Contains(types.TVar{Name: varName}) {
			filteredSub[varName] = typ
		}
	}
	return types.TScheme{
		QuantifiedVars: scheme.QuantifiedVars,                           // 量化子はそのまま
		BodyType:       unification.Apply(filteredSub, scheme.BodyType), // フィルターされた代入を適用
	}
}

// GeneralizeType は、現在の型環境に対して型を一般化し、型スキームを生成します。
// 環境内で自由でない型変数のみを量化します。
func GeneralizeType(env TypeEnvironment, t types.Type) types.TScheme {
	envFTV := env.FreeTypeVars()
	typeFTV := t.FreeTypeVars()

	quantified := []types.TVar{}
	// typeFTV に含まれ、envFTV には含まれないものを量化する
	for _, ftv := range typeFTV.Difference(envFTV).Values() {
		quantified = append(quantified, ftv)
	}
	return types.TScheme{QuantifiedVars: quantified, BodyType: t}
}

// InstantiateScheme は型スキームをインスタンス化します。
// 量化された各型変数に対し、新しいフレッシュな型変数を生成して置き換えます。
func InstantiateScheme(scheme types.TScheme) (types.Type, error) {
	// 量化された変数に対する新しいフレッシュな型変数のマッピング
	sub := unification.EmptySubstitution()
	for _, qv := range scheme.QuantifiedVars {
		freshVar := types.NewTypeVar()
		sub[qv.Name] = freshVar
	}
	// 型スキームの本体にこの代入を適用
	return unification.Apply(sub, scheme.BodyType), nil
}

// BaseTypeEnv は基本的な型（組み込み関数など）を含む初期型環境を返します。
func BaseTypeEnv() TypeEnvironment {
	return NewTypeEnvironment()
}

var currentGlobalSub unification.Substitution

// Infer はASTノードの型を推論します。
func Infer(env TypeEnvironment, expr ast.Expression) (types.Type, unification.Substitution, error) {
	currentGlobalSub = unification.EmptySubstitution()

	return inferExpr(env, expr, currentGlobalSub)
}

// inferExpr は実際の型推論ロジックを含むヘルパー関数です。代入を累積していきます。
func inferExpr(env TypeEnvironment, expr ast.Expression, sub unification.Substitution) (types.Type, unification.Substitution, error) {
	switch e := expr.(type) {
	case *ast.Literal:
		if e.IntVal != nil {
			return types.TInt{}, sub, nil
		}
		if e.TrueTag != nil || e.FalseTag != nil {
			return types.TBool{}, sub, nil
		}
		if e.Variable != nil {
			scheme, ok := env.Lookup(*e.Variable)
			if !ok {
				// もし環境になければ、自由な型変数として扱うこともできるが、
				// ここでは未束縛エラーとする。
				return nil, sub, fmt.Errorf("unbound variable: %s", *e.Variable)
			}
			freshType, err := InstantiateScheme(scheme)
			if err != nil {
				return nil, sub, fmt.Errorf("failed to instantiate scheme for %s: %w", *e.Variable, err)
			}
			return freshType, sub, nil
		}
		if e.SubExpr != nil { // Parenthesized expression
			return inferExpr(env, e.SubExpr, sub)
		}
		return nil, sub, fmt.Errorf("unknown literal structure: %s", expr.String())

	case *ast.Factor: // 関数適用 (f arg1 arg2 ...)
		// e.Function is *ast.BaseFactor which implements ast.Expression
		// Infer the type of the function part, passing the current substitution 'sub'
		funcType, s1, err := inferExpr(env, e.Function, sub) // Pass incoming 'sub'
		if err != nil {
			return nil, sub, fmt.Errorf("type error in function part of application: %w at pos %d", err, e.Pos()) // Return incoming 'sub' on error
		}

		currentEnv := env.Apply(s1)
		currentType := unification.Apply(s1, funcType)
		totalSub := s1 // Initialize totalSub with the substitution from inferring the function part

		if len(e.Args) == 0 { // 引数がない場合は、関数/ベースファクター自体の型を返す
			return currentType, totalSub, nil
		}

		// 引数がある場合は、適用ロジックを進める
		for _, argExpr := range e.Args { // argExpr is *ast.BaseFactor
			if argExpr == nil { // Should not happen if parser is correct
				return nil, totalSub, fmt.Errorf("nil argument basefactor in factor application at pos %d", e.Pos())
			}
			// argExpr is *ast.BaseFactor, which implements Expression.
			// Pass the current accumulated substitution 'totalSub'
			argType, sArg, err := inferExpr(currentEnv, argExpr, totalSub)
			if err != nil {
				return nil, totalSub, fmt.Errorf("type error in argument: %w at pos %d", err, argExpr.Pos())
			}

			currentEnv = currentEnv.Apply(sArg) // Apply sArg to env for subsequent args, though sArg should be composed into totalSub first.
			totalSub = totalSub.Compose(sArg)   // Accumulate substitutions

			currentType = unification.Apply(totalSub, currentType) // Apply fully accumulated substitutions
			argType = unification.Apply(totalSub, argType)

			resultVar := types.NewTypeVar()
			expectedFuncType := types.TFunc{ArgType: argType, ReturnType: resultVar}

			sUnify, errUnify := unification.Unify(currentType, expectedFuncType)
			if errUnify != nil {
				return nil, totalSub, fmt.Errorf(
					"function application error: expected function type compatible with %s -> %s, but got %s. Unification error: %w at pos %d",
					argType.String(), resultVar.String(), currentType.String(), errUnify, e.Pos(),
				)
			}

			totalSub = totalSub.Compose(sUnify)
			currentType = unification.Apply(totalSub, resultVar) // The new currentType is the return type of the function, after unification and substitution
			currentEnv = env.Apply(totalSub)                     // Update env with the most current substitution for the next iteration or for outer scopes if needed.
		}
		return unification.Apply(totalSub, currentType), totalSub, nil

	// Binary operations: Term, AddTerm, MulTerm, CmpTerm
	// These are left-associative, so we infer the left, then iteratively apply ops with the right.
	case *ast.Term, *ast.AddTerm, *ast.MulTerm, *ast.CmpTerm:
		var leftOperand ast.Expression
		var opTermsList interface{} // Will hold the list of *OpAddTerm, *OpMulTerm etc.

		// Dynamically get Left and Right based on actual type
		switch node := expr.(type) {
		case *ast.Term:
			leftOperand = node.Left
			opTermsList = node.Right
		case *ast.AddTerm:
			leftOperand = node.Left
			opTermsList = node.Right
		case *ast.MulTerm:
			leftOperand = node.Left
			opTermsList = node.Right
		case *ast.CmpTerm:
			leftOperand = node.Left
			opTermsList = node.Right
		default:
			return nil, sub, fmt.Errorf("unhandled binary operation node type: %T", expr)
		}

		currentType, sCurrent, err := inferExpr(env, leftOperand, sub)
		if err != nil {
			return nil, sCurrent, fmt.Errorf("type inference failed for left operand of binary operation: %w", err)
		}

		currentType = unification.Apply(sCurrent, currentType)

		processOp := func(op string, rightNode ast.Expression) error {
			rightType, sRight, errRight := inferExpr(env.Apply(sCurrent), rightNode, sCurrent)
			if errRight != nil {
				return fmt.Errorf("type inference failed for right operand of '%s': %w", op, errRight)
			}
			sCurrent = sCurrent.Compose(sRight)

			// Apply substitutions before unification
			resolvedLeftType := unification.Apply(sCurrent, currentType)
			resolvedRightType := unification.Apply(sCurrent, rightType)

			var expectedOperandType types.Type
			var expectedResultType types.Type

			switch op {
			case "+", "-", "*", "/":
				expectedOperandType = types.TInt{}
				expectedResultType = types.TInt{}
			case ">", "<", "==", "!=", ">=", "<=": // Note: MiniLang AST might only have '==' etc. Adjust as per ast.go
				// For comparison, operands could be other types too if language supports (e.g. bool for ==)
				// For now, assume Int for all comparisons for simplicity.
				expectedOperandType = types.TInt{} // Or a fresh type var if more general comparison needed
				expectedResultType = types.TBool{}
			case "&&", "||":
				expectedOperandType = types.TBool{}
				expectedResultType = types.TBool{}
			default:
				return fmt.Errorf("unknown operator: %s", op)
			}

			sUnify1, errUnify1 := unification.Unify(resolvedLeftType, expectedOperandType)
			if errUnify1 != nil {
				return fmt.Errorf("type mismatch for left operand of '%s': expected %s, got %s. Error: %w", op, expectedOperandType, resolvedLeftType, errUnify1)
			}
			sCurrent = sCurrent.Compose(sUnify1)
			resolvedRightType = unification.Apply(sCurrent, resolvedRightType) // Update right type with new substitutions

			sUnify2, errUnify2 := unification.Unify(resolvedRightType, expectedOperandType)
			if errUnify2 != nil {
				return fmt.Errorf("type mismatch for right operand of '%s': expected %s, got %s. Error: %w", op, expectedOperandType, resolvedRightType, errUnify2)
			}
			sCurrent = sCurrent.Compose(sUnify2)
			currentType = unification.Apply(sCurrent, expectedResultType) // Result of this op becomes left for next
			return nil
		}

		switch ops := opTermsList.(type) {
		case []*ast.OpAddTerm:
			for _, opTerm := range ops {
				if err := processOp(opTerm.Operator, opTerm.AddTerm); err != nil {
					return nil, sCurrent, err
				}
			}
		case []*ast.OpMulTerm:
			for _, opTerm := range ops {
				if err := processOp(opTerm.Operator, opTerm.MulTerm); err != nil {
					return nil, sCurrent, err
				}
			}
		case []*ast.OpCmpTerm:
			for _, opTerm := range ops {
				if err := processOp(opTerm.Operator, opTerm.CmpTerm); err != nil {
					return nil, sCurrent, err
				}
			}
		case []*ast.OpBoolTerm: // For '&&', '||'
			for _, opTerm := range ops {
				// opTerm.BoolTerm is the right operand
				if err := processOp(opTerm.Operator, opTerm.BoolTerm); err != nil {
					return nil, sCurrent, err
				}
			}
		default:
			// No operations, or unknown operation list type.
			// The type is just currentType (from the left operand).
		}
		return currentType, sCurrent, nil

	case *ast.If:
		// CondExpr: Term, ThenExpr: Term, ElseExpr: Term
		condType, sCond, err := inferExpr(env, e.CondExpr, sub)
		if err != nil {
			return nil, sCond, fmt.Errorf("type inference failed for if condition: %w", err)
		}
		sCurrent := sCond
		condType = unification.Apply(sCurrent, condType)

		sUnifyCond, errUnifyCond := unification.Unify(condType, types.TBool{})
		if errUnifyCond != nil {
			return nil, sCurrent, fmt.Errorf("if condition must be boolean, got %s: %w", condType, errUnifyCond)
		}
		sCurrent = sCurrent.Compose(sUnifyCond)

		envForBranches := env.Apply(sCurrent)
		thenType, sThen, errThen := inferExpr(envForBranches, e.ThenExpr, sCurrent)
		if errThen != nil {
			return nil, sThen, fmt.Errorf("type inference failed for then branch: %w", errThen)
		}
		sCurrent = sCurrent.Compose(sThen)
		thenType = unification.Apply(sCurrent, thenType)

		elseType, sElse, errElse := inferExpr(env.Apply(sCurrent), e.ElseExpr, sCurrent)
		if errElse != nil {
			return nil, sElse, fmt.Errorf("type inference failed for else branch: %w", errElse)
		}
		sCurrent = sCurrent.Compose(sElse)
		elseType = unification.Apply(sCurrent, elseType)

		// Unify then and else branches
		sUnifyBranches, errUnifyBranches := unification.Unify(thenType, elseType)
		if errUnifyBranches != nil {
			return nil, sCurrent, fmt.Errorf("type mismatch between then (%s) and else (%s) branches: %w", thenType, elseType, errUnifyBranches)
		}
		sCurrent = sCurrent.Compose(sUnifyBranches)

		return unification.Apply(sCurrent, thenType), sCurrent, nil // Result type is the unified type of branches

	case *ast.Let:
		// VarName: string, BindExpr: Term, BodyExpr: TopLevelExpression
		// For non-recursive let:
		// 1. Infer type of BindExpr in current env
		bindExprType, sBind, err := inferExpr(env, e.BindExpr, sub)
		if err != nil {
			return nil, sBind, fmt.Errorf("type inference failed for let binding of '%s': %w", e.VarName, err)
		}
		sCurrent := sBind
		bindExprType = unification.Apply(sCurrent, bindExprType) // Apply substitutions to the binding's type

		// 2. Generalize bindExprType with respect to (env + sCurrent)
		//    The environment used for generalization should have sCurrent applied.
		generalizedScheme := GeneralizeType(env.Apply(sCurrent), bindExprType)

		// 3. Extend environment: env' = env + {VarName: generalizedScheme}
		//    The extended environment should also have sCurrent applied before body inference.
		extendedEnv := env.Apply(sCurrent).Extend(e.VarName, generalizedScheme)

		// 4. Infer type of BodyExpr in extendedEnv
		//    Pass sCurrent along, as body inference might add to it.
		bodyType, sBody, errBody := inferExpr(extendedEnv, e.BodyExpr, sCurrent)
		if errBody != nil {
			return nil, sBody, fmt.Errorf("type inference failed for let body: %w", errBody)
		}
		sCurrent = sCurrent.Compose(sBody) // Compose substitutions from body

		return unification.Apply(sCurrent, bodyType), sCurrent, nil

	case *ast.Lambda: // Param: string, BodyExpr: Term
		paramType := types.NewTypeVar()

		// Extend environment with param: paramType (not a scheme, so QuantifiedVars is empty)
		// For `let id = fn x => x`, `id` becomes polymorphic. `x` itself is monomorphic within `fn x => x`.
		paramScheme := types.TScheme{BodyType: paramType} // No quantified vars for lambda param initially
		extendedEnv := env.Extend(e.Param, paramScheme)

		// Infer body type in extended environment. Start with the current substitution 'sub'.
		bodyType, sBody, err := inferExpr(extendedEnv, e.BodyExpr, sub)
		if err != nil {
			return nil, sBody, fmt.Errorf("type inference failed for lambda body: %w", err)
		}
		sCurrent := sBody // Substitutions from body inference

		// Apply the substitutions from body inference to the parameter's type variable
		finalParamType := unification.Apply(sCurrent, paramType)
		finalBodyType := unification.Apply(sCurrent, bodyType)

		return types.TFunc{ArgType: finalParamType, ReturnType: finalBodyType}, sCurrent, nil

	case *ast.Program:
		if e.Expression != nil {
			return inferExpr(env, e.Expression, sub)
		}
		// Or handle as error, or return a placeholder type like TVar
		return types.NewTypeVar(), sub, fmt.Errorf("empty program")

	case *ast.TopLevelExpression:
		if e.Let != nil {
			return inferExpr(env, e.Let, sub)
		}
		if e.Term != nil {
			return inferExpr(env, e.Term, sub)
		}
		return types.NewTypeVar(), sub, fmt.Errorf("empty top-level expression")

	case *ast.BaseFactor: // Literal, Lambda, If (or parenthesized via Literal.SubExpr)
		if e.Literal != nil {
			return inferExpr(env, e.Literal, sub)
		}
		if e.Lambda != nil {
			return inferExpr(env, e.Lambda, sub)
		}
		if e.If != nil {
			return inferExpr(env, e.If, sub)
		}
		return nil, sub, fmt.Errorf("unknown base factor structure: %s", expr.String())

	case *ast.BoolTerm: // Factor
		if e.Factor != nil {
			return inferExpr(env, e.Factor, sub)
		}
		return nil, sub, fmt.Errorf("empty bool term")

	default:
		// This should ideally not be reached if all AST nodes are handled.
		// Placeholder for any unhandled ast.Expression types.
		return nil, sub, fmt.Errorf("unhandled AST node type in inference: %T (%s)", expr, expr.String())
	}
}
