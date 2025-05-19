package unification

import (
	"fmt" // エラーメッセージ用

	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/types"
)

// Substitution は型変数から型への代入を表します。
// キーは型変数の名前 (例: "t0", "a") です。
type Substitution map[string]types.Type

// EmptySubstitution は空の代入を返します。
func EmptySubstitution() Substitution {
	return make(Substitution)
}

// Compose は2つの代入 s1 と s2 を合成します。
// s2 を適用した後に s1 を適用するのと同じ効果 (s1 . s2)。
// 具体的には、s2 の各代入 (v -> t) について、t に s1 を適用したもので v を置き換え、
// さらに s1 に含まれる s2 のドメインにない代入を追加します。
func (s1 Substitution) Compose(s2 Substitution) Substitution {
	res := EmptySubstitution()
	// s2 の各代入 (v -> t) について、t に s1 を適用したもので v を置き換える
	for vName, t := range s2 {
		res[vName] = Apply(s1, t)
	}
	// s1 に含まれる代入のうち、s2 のドメインにないものを追加
	for vName, t := range s1 {
		if _, exists := s2[vName]; !exists {
			res[vName] = t
		}
	}
	return res
}

// Apply は型代入を特定の型に適用します。
// 循環参照を防ぐために内部で applyRecursive を呼び出します。
func Apply(sub Substitution, t types.Type) types.Type {
	return applyRecursive(sub, t, make(map[string]struct{}))
}

// applyRecursive は型代入を特定の型に適用する内部関数です。
// resolving は現在解決中の型変数名を追跡し、循環参照による無限ループを防ぎます。
func applyRecursive(sub Substitution, t types.Type, resolving map[string]struct{}) types.Type {
	switch tt := t.(type) {
	case types.TInt:
		return tt
	case types.TBool:
		return tt
	case types.TVar:
		if _, alreadyResolving := resolving[tt.Name]; alreadyResolving {
			// 循環検出: 現在解決中の型変数を再度解決しようとした
			return tt // ループを断ち切るために現在の型変数をそのまま返す
		}
		if replacement, ok := sub[tt.Name]; ok {
			resolving[tt.Name] = struct{}{} // これから tt.Name を解決することをマーク
			resolvedType := applyRecursive(sub, replacement, resolving)
			delete(resolving, tt.Name) // tt.Name の解決が完了したのでマークを解除
			return resolvedType
		}
		return tt // 代入がなければそのまま
	case types.TFunc:
		// 関数型の場合、引数型と戻り値型それぞれに代入を適用する
		return types.TFunc{
			ArgType:    applyRecursive(sub, tt.ArgType, resolving),
			ReturnType: applyRecursive(sub, tt.ReturnType, resolving),
		}
	default:
		// TScheme はここでは扱わない (型スキームへの代入は別の処理が必要な場合がある)
		// または、TScheme の自由変数にのみ適用するなどのルールが必要
		panic(fmt.Sprintf("applyRecursive: unhandled type %T", t))
	}
}

// FreeTypeVars は型 t に含まれる自由な型変数の名前の集合を返します。
func FreeTypeVars(t types.Type) map[string]struct{} {
	vars := make(map[string]struct{})
	collectFreeTypeVars(t, vars)
	return vars
}

func collectFreeTypeVars(t types.Type, vars map[string]struct{}) {
	switch tt := t.(type) {
	case types.TInt, types.TBool:
		// No free variables
	case types.TVar:
		vars[tt.Name] = struct{}{}
	case types.TFunc:
		collectFreeTypeVars(tt.ArgType, vars)
		collectFreeTypeVars(tt.ReturnType, vars)
	default:
		panic(fmt.Sprintf("FreeTypeVars: unhandled type %T", t))
	}
}

// OccursCheck は型変数 v が型 t の自由変数に含まれているか (occurs check) を判定します。
// t は既に現在の代入が適用されたものとします。
func OccursCheck(v types.TVar, t types.Type) bool {
	freeVarsInT := FreeTypeVars(t)
	_, occurs := freeVarsInT[v.Name]
	return occurs
}

// Unify は2つの型 t1 と t2 を単一化しようと試みます。
// 成功すれば MGU (Most General Unifier) を、失敗すればエラーを返します。
func Unify(t1, t2 types.Type) (Substitution, error) {
	switch t1 := t1.(type) {
	case types.TInt:
		if _, ok := t2.(types.TInt); ok {
			return EmptySubstitution(), nil
		}
	case types.TBool:
		if _, ok := t2.(types.TBool); ok {
			return EmptySubstitution(), nil
		}
	case types.TVar:
		return unifyVar(t1, t2)
	case types.TFunc:
		if t2Func, ok := t2.(types.TFunc); ok {
			// Arg1 と Arg2 を単一化
			sub1, err := Unify(t1.ArgType, t2Func.ArgType)
			if err != nil {
				return nil, fmt.Errorf("cannot unify argument types (%s vs %s): %v", t1.ArgType.String(), t2Func.ArgType.String(), err)
			}
			// sub1 を適用した上で Return1 と Return2 を単一化
			// 重要: sub1を適用した型で次の単一化を行う
			sub2, err := Unify(Apply(sub1, t1.ReturnType), Apply(sub1, t2Func.ReturnType))
			if err != nil {
				return nil, fmt.Errorf("cannot unify return types (%s vs %s) after substituting args: %v", Apply(sub1, t1.ReturnType).String(), Apply(sub1, t2Func.ReturnType).String(), err)
			}
			return sub2.Compose(sub1), nil
		}
	}

	// t1 が上記ケースで処理されなかった場合、t2 が型変数かどうかをチェック
	if t2Var, ok := t2.(types.TVar); ok {
		return unifyVar(t2Var, t1) // 引数の順序を入れ替えて unifyVar を呼ぶ
	}

	return nil, fmt.Errorf("type mismatch: cannot unify %s with %s", t1.String(), t2.String())
}

// unifyVar は型変数 v と型 t を単一化します。
func unifyVar(v types.TVar, t types.Type) (Substitution, error) {
	// v と t が同じ型変数なら、何もする必要はない (例: t0 と t0)
	if tVar, ok := t.(types.TVar); ok && v.Name == tVar.Name {
		return EmptySubstitution(), nil
	}
	// Occurs check: v が t の中に現れるか
	// Apply(sub, t) のようなことをするのではなく、現在の t そのものに対してチェックする
	if OccursCheck(v, t) { // t はこの時点ではまだ v を含む代入がされていない生の状態
		return nil, fmt.Errorf("occurs check failed: variable %s occurs in %s", v.String(), t.String())
	}
	// v を t で置き換える代入 [v := t] を作成
	sub := EmptySubstitution()
	sub[v.Name] = t
	return sub, nil
}

// TODO: 型代入を型スキームに適用する ApplyToScheme 関数の実装 (必要であれば)
