package types

import (
	"strconv"
	"strings"
)

// Type は型推論システムにおけるすべての型を表すインターフェースです。
type Type interface {
	String() string        // 型を文字列表現で返す
	sealedType()           // このインターフェースが外部のパッケージで実装されるのを防ぐ
	FreeTypeVars() TVarSet // 型に含まれる自由な型変数のセットを返す
}

// TInt は整数型を表します。
type TInt struct{}

func (t TInt) String() string        { return "int" }
func (t TInt) sealedType()           {}
func (t TInt) FreeTypeVars() TVarSet { return NewTVarSet() } // 整数リテラルに自由変数はなし

// TBool は真偽値型を表します。
type TBool struct{}

func (t TBool) String() string        { return "bool" }
func (t TBool) sealedType()           {}
func (t TBool) FreeTypeVars() TVarSet { return NewTVarSet() } // 真偽値リテラルに自由変数はなし

var nextTypeVarID = 0

// NewTypeVar は新しい一意な型変数を生成します。
func NewTypeVar() TVar {
	id := nextTypeVarID
	nextTypeVarID++
	return TVar{Name: "t" + strconv.Itoa(id)}
}

// ResetTypeVarCounter はテスト用に型変数IDカウンターをリセットします。
func ResetTypeVarCounter() {
	nextTypeVarID = 0
}

// TVar は型変数 (例: \'a, \'b, t0, t1) を表します。
type TVar struct {
	Name string
}

func (t TVar) String() string { return t.Name }
func (t TVar) sealedType()    {}
func (t TVar) FreeTypeVars() TVarSet {
	set := NewTVarSet()
	set.Add(t)
	return set
}

// TFunc は関数型 (例: int -> bool, (t0 -> t1) -> t0) を表します。
type TFunc struct {
	ArgType    Type
	ReturnType Type
}

func (t TFunc) String() string {
	argStr := t.ArgType.String()
	if _, ok := t.ArgType.(TFunc); ok { // 引数型が関数型なら括弧で囲む
		argStr = "(" + argStr + ")"
	}

	retStr := t.ReturnType.String()
	if _, ok := t.ReturnType.(TFunc); ok { // 戻り値型が関数型なら括弧で囲む (テストケースの期待に合わせる)
		retStr = "(" + retStr + ")"
	}
	return argStr + " -> " + retStr
}
func (t TFunc) sealedType() {}
func (t TFunc) FreeTypeVars() TVarSet {
	return t.ArgType.FreeTypeVars().Union(t.ReturnType.FreeTypeVars())
}

// TScheme は型スキーム (例: forall a. a -> a) を表します。
// let多相を実現するために使われます。
type TScheme struct {
	QuantifiedVars []TVar // 束縛する型変数のリスト
	BodyType       Type   // 本体となる型
}

func (ts TScheme) String() string {
	if len(ts.QuantifiedVars) == 0 {
		return ts.BodyType.String()
	}
	var varNames []string
	for _, v := range ts.QuantifiedVars {
		varNames = append(varNames, v.Name)
	}
	return "forall " + strings.Join(varNames, " ") + ". " + ts.BodyType.String()
}

// FreeTypeVars は型スキーム内の自由な型変数を返します。
// これは、本体の型の自由変数から、このスキームによって量化された変数を除いたものです。
func (ts TScheme) FreeTypeVars() TVarSet {
	bodyFreeVars := ts.BodyType.FreeTypeVars()
	quantifiedSet := NewTVarSetFromSlice(ts.QuantifiedVars)
	return bodyFreeVars.Difference(quantifiedSet)
}

// TVarSet は型変数のセットを表す型です。
type TVarSet map[string]struct{} // 型変数名をキーとするマップ

// NewTVarSet は新しい空の型変数セットを作成します。
func NewTVarSet() TVarSet {
	return make(TVarSet)
}

// NewTVarSetFromSlice は型変数のスライスから型変数セットを作成します。
func NewTVarSetFromSlice(vars []TVar) TVarSet {
	set := NewTVarSet()
	for _, v := range vars {
		set.Add(v)
	}
	return set
}

// Add はセットに型変数を追加します。
func (s TVarSet) Add(tv TVar) {
	s[tv.Name] = struct{}{}
}

// Contains はセットが指定された型変数を含むか確認します。
func (s TVarSet) Contains(tv TVar) bool {
	_, exists := s[tv.Name]
	return exists
}

// Union は2つの型変数セットの和集合を返します。
func (s TVarSet) Union(other TVarSet) TVarSet {
	result := NewTVarSet()
	for name := range s {
		result.Add(TVar{Name: name})
	}
	for name := range other {
		result.Add(TVar{Name: name})
	}
	return result
}

// Difference は s から other に含まれる要素を取り除いた差集合を返します (s - other)。
func (s TVarSet) Difference(other TVarSet) TVarSet {
	result := NewTVarSet()
	for name := range s {
		if _, existsInOther := other[name]; !existsInOther {
			result.Add(TVar{Name: name})
		}
	}
	return result
}

// Values はセット内の型変数をスライスとして返します。順序は保証されません。
func (s TVarSet) Values() []TVar {
	vars := make([]TVar, 0, len(s))
	for name := range s {
		vars = append(vars, TVar{Name: name})
	}
	return vars
}

// TODO: 型環境の実装 (TypeEnvironment) - これは inference パッケージにあります
