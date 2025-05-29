package object

import "fmt"

type ObjectType string

const (
	INTEGER_OBJ = "INTEGER"
	BOOLEAN_OBJ = "BOOLEAN"
	NULL_OBJ    = "NULL"
	ERROR_OBJ   = "ERROR"
)

type Object interface {
	Type() ObjectType
	Inspect() string
}

// Integer は整数オブジェクト
type Integer struct {
	Value int64
}

func (i *Integer) Inspect() string  { return fmt.Sprintf("%d", i.Value) }
func (i *Integer) Type() ObjectType { return INTEGER_OBJ }

// Boolean は真偽値オブジェクト
type Boolean struct {
	Value bool
}

func (b *Boolean) Inspect() string {
	return fmt.Sprintf("%t", b.Value)
}
func (b *Boolean) Type() ObjectType { return BOOLEAN_OBJ }

// Null は null オブジェクト
type Null struct{}

func (n *Null) Inspect() string  { return "null" }
func (n *Null) Type() ObjectType { return NULL_OBJ }

// Error はエラーオブジェクト
type Error struct {
	Message string
}

func (e *Error) Inspect() string  { return "ERROR: " + e.Message }
func (e *Error) Type() ObjectType { return ERROR_OBJ }

// Bytecode はコンパイル結果を表す
type Bytecode struct {
	Instructions Instructions
	Constants    []Object
}

// Instructions はバイトコード命令のシーケンス
type Instructions []byte

func (ins Instructions) String() string {
	var out string
	for i := 0; i < len(ins); {
		// TODO: 実際のオペコードのフォーマットに応じて実装
		out += fmt.Sprintf("%04d %d\n", i, ins[i])
		i++
	}
	return out
}
