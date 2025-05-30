package code

import (
	"bytes"
	"encoding/binary"
	"fmt"
)

type Instructions []byte

func (ins Instructions) String() string {
	var out bytes.Buffer
	i := 0
	for i < len(ins) {
		def, err := Lookup(ins[i])
		if err != nil {
			fmt.Fprintf(&out, "ERROR: %s\n", err)
			continue
		}
		operands, read := ReadOperands(def, ins[i+1:])
		fmt.Fprintf(&out, "%04d %s\n", i, ins.fmtInstruction(def, operands))
		i += 1 + read
	}
	return out.String()
}

func (ins Instructions) fmtInstruction(def *Definition, operands []int) string {
	operandCount := len(def.OperandWidths)
	if len(operands) != operandCount {
		return fmt.Sprintf("ERROR: operand len %d does not match defined %d\n",
			len(operands), operandCount)
	}
	switch operandCount {
	case 0:
		return def.Name
	case 1:
		return fmt.Sprintf("%s %d", def.Name, operands[0])
	// case 2: // Current definitions don't have 2 operands, but if added in future:
	// 	return fmt.Sprintf("%s %d %d", def.Name, operands[0], operands[1])
	}
	// If an opcode has operands but doesn't fit 0 or 1, it's an issue with current definitions
	// or this formatting function needs updating for more operand counts.
	if operandCount > 0 {
	    return fmt.Sprintf("ERROR: unhandled operandCount %d for %s (operands: %v)\n", operandCount, def.Name, operands)
	}
	return fmt.Sprintf("ERROR: unhandled operandCount for %s\n", def.Name)
}

func (op Opcode) String() string {
	def, err := Lookup(byte(op)) // Lookup expects a byte
	if err != nil {
		return "UNKNOWN_OPCODE"
	}
	return def.Name
}

type Opcode byte

const (
	// 定数関連
	OpConstant Opcode = iota // オペランド: 定数プール内のインデックス (2バイト)

	// 算術演算
	OpAdd
	OpSub
	OpMul
	OpDiv

	// 真偽値演算
	OpTrue
	OpFalse

	// 比較演算
	OpEqual
	OpNotEqual
	OpGreaterThan // ">" のみサポート (より大きいか)
	OpLessThan    // "<" を追加

	// 前置演算子
	OpMinus // - (マイナス)
	OpBang  // ! (否定)

	// スタック操作
	OpPop

	// ジャンプ命令
	OpJumpNotTruthy // オペランド: ジャンプ先アドレス (2バイト)
	OpJump          // オペランド: ジャンプ先アドレス (2バイト)

	// 変数
	OpSetGlobal // オペランド: グローバルシンボルテーブルのインデックス (2バイト)
	OpGetGlobal // オペランド: グローバルシンボルテーブルのインデックス (2バイト)

	// 制御フロー
	OpNull // 何もしない (if文でelseがない場合など)

	// 組み込み関数呼び出し (puts 専用)
	OpCallBuiltin // オペランド: 引数の数 (1バイト) - putsは1引数のみ想定
	OpCallAtoi    // オペランド: 引数の数 (1バイト) - atoi専用
	OpReturnValue // (今回はreturn文はVMレベルでは特別扱いしないため、もし使うなら)
)

type Definition struct {
	Name          string
	OperandWidths []int // 各オペランドが占めるバイト数
}

var definitions = map[Opcode]*Definition{
	OpConstant:      {"OpConstant", []int{2}}, // 2バイトのオペランド (定数インデックス)
	OpAdd:           {"OpAdd", []int{}},
	OpSub:           {"OpSub", []int{}},
	OpMul:           {"OpMul", []int{}},
	OpDiv:           {"OpDiv", []int{}},
	OpTrue:          {"OpTrue", []int{}},
	OpFalse:         {"OpFalse", []int{}},
	OpEqual:         {"OpEqual", []int{}},
	OpNotEqual:      {"OpNotEqual", []int{}},
	OpGreaterThan:   {"OpGreaterThan", []int{}},
	OpLessThan:      {"OpLessThan", []int{}},     // OpLessThanの定義を追加
	OpMinus:         {"OpMinus", []int{}},
	OpBang:          {"OpBang", []int{}},
	OpPop:           {"OpPop", []int{}},
	OpJumpNotTruthy: {"OpJumpNotTruthy", []int{2}}, // 2バイトのオペランド (ジャンプ先)
	OpJump:          {"OpJump", []int{2}},          // 2バイトのオペランド (ジャンプ先)
	OpSetGlobal:     {"OpSetGlobal", []int{2}},     // 2バイト (グローバル変数インデックス)
	OpGetGlobal:     {"OpGetGlobal", []int{2}},     // 2バイト (グローバル変数インデックス)
	OpNull:          {"OpNull", []int{}},
	OpCallBuiltin:   {"OpCallBuiltin", []int{1}},   // 1バイト (引数の数)
	OpCallAtoi:      {"OpCallAtoi", []int{1}},      // 1バイト (引数の数)
	OpReturnValue:   {"OpReturnValue", []int{}},
}

func Lookup(op byte) (*Definition, error) {
	def, ok := definitions[Opcode(op)]
	if !ok {
		return nil, fmt.Errorf("opcode %d undefined", op)
	}
	return def, nil
}

func Make(op Opcode, operands ...int) []byte {
	def, ok := definitions[op]
	if !ok {
		return []byte{}
	}

	instructionLen := 1 // オペコード自体のための1バイト
	for _, w := range def.OperandWidths {
		instructionLen += w
	}

	instruction := make([]byte, instructionLen)
	instruction[0] = byte(op)

	offset := 1
	for i, o := range operands {
		width := def.OperandWidths[i]
		switch width {
		case 1: // 1バイトオペランド (例: OpCallBuiltinの引数カウント)
			instruction[offset] = byte(o)
		case 2: // 2バイトオペランド (例: OpConstantのインデックス)
			binary.BigEndian.PutUint16(instruction[offset:], uint16(o))
		}
		offset += width
	}
	return instruction
}

func ReadOperands(def *Definition, ins Instructions) ([]int, int) {
	operands := make([]int, len(def.OperandWidths))
	offset := 0
	for i, width := range def.OperandWidths {
		switch width {
		case 1:
			operands[i] = int(ins[offset])
		case 2:
			operands[i] = int(binary.BigEndian.Uint16(ins[offset:]))
		}
		offset += width
	}
	return operands, offset
}

func ReadUint16(ins Instructions) uint16 {
	return binary.BigEndian.Uint16(ins)
}

func ReadUint8(ins Instructions) uint8 {
	return uint8(ins[0])
}
