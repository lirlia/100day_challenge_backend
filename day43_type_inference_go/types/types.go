package types

import (
	"strconv"
	"strings"
)

// Type は型推論システムにおけるすべての型を表すインターフェースです。
type Type interface {
	String() string // 型を文字列表現で返す
	sealedType()    // このインターフェースが外部のパッケージで実装されるのを防ぐ
}

// TInt は整数型を表します。
type TInt struct{}

func (t TInt) String() string { return "int" }
func (t TInt) sealedType()    {}

// TBool は真偽値型を表します。
type TBool struct{}

func (t TBool) String() string { return "bool" }
func (t TBool) sealedType()    {}

var nextTypeVarID = 0

// NewTypeVar は新しい一意な型変数を生成します。
func NewTypeVar() TVar {
	id := nextTypeVarID
	nextTypeVarID++
	return TVar{Name: "t" + strconv.Itoa(id)}
}

// TVar は型変数 (例: 'a, 'b, t0, t1) を表します。
type TVar struct {
	Name string
}

func (t TVar) String() string { return t.Name }
func (t TVar) sealedType()    {}

// TFunc は関数型 (例: int -> bool, (t0 -> t1) -> t0) を表します。
type TFunc struct {
	ArgType    Type
	ReturnType Type
}

func (t TFunc) String() string {
	argStr := t.ArgType.String()
	if _, ok := t.ArgType.(TFunc); ok {
		argStr = "(" + argStr + ")"
	}

	retStr := t.ReturnType.String()
	if _, ok := t.ReturnType.(TFunc); ok {
		retStr = "(" + retStr + ")"
	}
	return argStr + " -> " + retStr
}
func (t TFunc) sealedType() {}

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

// TODO: 型環境の実装 (TypeEnvironment)
