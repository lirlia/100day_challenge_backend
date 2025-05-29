package compiler

import (
	"fmt"

	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/ast"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/code"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/object"
)

// Bytecode はコンパイル結果を保持する
type Bytecode struct {
	Instructions code.Instructions
	Constants    []object.Object // コンパイル時に生成された定数のプール
}

// EmittedInstruction は最後に発行された命令を追跡するために使用する
type EmittedInstruction struct {
	Opcode   code.Opcode
	Position int
}

// Compiler はASTをバイトコードにコンパイルする
type Compiler struct {
	instructions        code.Instructions
	constants           []object.Object
	symbolTable         *SymbolTable
	lastInstruction     EmittedInstruction
	previousInstruction EmittedInstruction
}

func New() *Compiler {
	symbolTable := NewSymbolTable()
	return &Compiler{
		instructions:        code.Instructions{},
		constants:           []object.Object{},
		symbolTable:         symbolTable,
		lastInstruction:     EmittedInstruction{},
		previousInstruction: EmittedInstruction{},
	}
}

func NewWithState(s *SymbolTable, constants []object.Object) *Compiler {
	compiler := New()
	compiler.symbolTable = s
	compiler.constants = constants
	return compiler
}

func (c *Compiler) Compile(node ast.Node) error {
	switch node := node.(type) {
	case *ast.Program:
		for _, s := range node.Statements {
			err := c.Compile(s)
			if err != nil {
				return err
			}
		}
	case *ast.BlockStatement:
		for _, s := range node.Statements {
			err := c.Compile(s)
			if err != nil {
				return err
			}
		}
	case *ast.ExpressionStatement:
		err := c.Compile(node.Expression)
		if err != nil {
			return err
		}
		// 式文の結果はスタックに残っている必要があるので、Popする
		c.emit(code.OpPop)

	case *ast.InfixExpression:
		err := c.Compile(node.Left)
		if err != nil {
			return err
		}
		err = c.Compile(node.Right)
		if err != nil {
			return err
		}
		switch node.Operator {
		case "+":
			c.emit(code.OpAdd)
		case "-":
			c.emit(code.OpSub)
		case "*":
			c.emit(code.OpMul)
		case "/":
			c.emit(code.OpDiv)
		case ">":
			c.emit(code.OpGreaterThan)
		case "<": // < は > とオペランドを入れ替えて OpGreaterThan を使う
			// 再コンパイルは避け、既存の命令列を操作するのは複雑なので、
			// ここではエラーとしておくか、あるいは別のOpcodeを用意する
			// 簡単のため、エラーとしておく
			return fmt.Errorf("unsupported operator: %s", node.Operator)
		case "==":
			c.emit(code.OpEqual)
		case "!=":
			c.emit(code.OpNotEqual)
		default:
			return fmt.Errorf("unknown operator: %s", node.Operator)
		}
	case *ast.PrefixExpression:
		err := c.Compile(node.Right)
		if err != nil {
			return err
		}
		switch node.Operator {
		case "!":
			c.emit(code.OpBang)
		case "-":
			c.emit(code.OpMinus)
		default:
			return fmt.Errorf("unknown operator: %s", node.Operator)
		}

	case *ast.IntegerLiteral:
		integer := &object.Integer{Value: node.Value}
		c.emit(code.OpConstant, c.addConstant(integer))

	case *ast.Boolean:
		if node.Value {
			c.emit(code.OpTrue)
		} else {
			c.emit(code.OpFalse)
		}

	case *ast.IfExpression:
		err := c.Compile(node.Condition)
		if err != nil {
			return err
		}
		jumpNotTruthyPos := c.emit(code.OpJumpNotTruthy, 9999)

		err = c.Compile(node.Consequence)
		if err != nil {
			return err
		}
		if c.lastInstructionIs(code.OpPop) {
			c.removeLastPop()
		}

		// Emit OpJump first
		jumpPos := c.emit(code.OpJump, 9999)

		// OpJumpNotTruthy should jump to start of Alternative/OpNull block
		c.changeOperand(jumpNotTruthyPos, len(c.instructions))

		// Now emit Alternative or OpNull
		if node.Alternative == nil {
			c.emit(code.OpNull)
		} else {
			err := c.Compile(node.Alternative)
			if err != nil {
				return err
			}
			if c.lastInstructionIs(code.OpPop) {
				c.removeLastPop()
			}
		}

		// OpJump (from Consequence) should jump to *after* Alternative/OpNull block
		c.changeOperand(jumpPos, len(c.instructions))

	case *ast.LetStatement:
		symbol := c.symbolTable.Define(node.Name.Value)
		err := c.Compile(node.Value)
		if err != nil {
			return err
		}
		c.emit(code.OpSetGlobal, symbol.Index)

	case *ast.Identifier:
		symbol, ok := c.symbolTable.Resolve(node.Value)
		if !ok {
			return fmt.Errorf("undefined variable %s", node.Value)
		}
		c.emit(code.OpGetGlobal, symbol.Index)

	case *ast.CallExpression: // puts 専用
		if node.Function.TokenLiteral() != "puts" {
			return fmt.Errorf("unsupported function call: %s", node.Function.TokenLiteral())
		}
		// 引数を評価
		for _, arg := range node.Arguments {
			err := c.Compile(arg)
			if err != nil {
				return err
			}
		}
		// OpCallBuiltin は引数の数をオペランドに取るので、実際の引数の数を渡す
		c.emit(code.OpCallBuiltin, len(node.Arguments)) // 引数の数をオペランドとして渡す

	}
	return nil
}

func (c *Compiler) Bytecode() *Bytecode {
	return &Bytecode{
		Instructions: c.instructions,
		Constants:    c.constants,
	}
}

func (c *Compiler) addConstant(obj object.Object) int {
	c.constants = append(c.constants, obj)
	return len(c.constants) - 1
}

func (c *Compiler) emit(op code.Opcode, operands ...int) int {
	ins := code.Make(op, operands...)
	pos := c.addInstruction(ins)

	c.setLastInstruction(op, pos)

	return pos
}

func (c *Compiler) addInstruction(ins []byte) int {
	posNewInstruction := len(c.instructions)
	c.instructions = append(c.instructions, ins...)
	return posNewInstruction
}

func (c *Compiler) setLastInstruction(op code.Opcode, pos int) {
	previous := c.lastInstruction
	last := EmittedInstruction{Opcode: op, Position: pos}

	c.previousInstruction = previous
	c.lastInstruction = last
}

func (c *Compiler) lastInstructionIs(op code.Opcode) bool {
	if len(c.instructions) == 0 {
		return false
	}
	return c.lastInstruction.Opcode == op
}

func (c *Compiler) removeLastPop() {
	if c.lastInstructionIs(code.OpPop) { // 追加：OpPopであることを確認
	    c.instructions = c.instructions[:c.lastInstruction.Position]
	    c.lastInstruction = c.previousInstruction
    }
}

func (c *Compiler) changeOperand(opPos int, operand int) {
	op := code.Opcode(c.instructions[opPos])
	newInstruction := code.Make(op, operand)
	c.replaceInstruction(opPos, newInstruction)
}

func (c *Compiler) replaceInstruction(pos int, newInstruction []byte) {
	// 古い命令の長さを特定する必要があるが、Opcode定義からわかる
	// 簡単のため、ここでは新しい命令が古い命令と同じ長さであることを仮定するか、
	// より堅牢にするには古い命令の長さを計算する。
	// 今回のケース(OpJumpNotTruthy, OpJump)はオペランド長が固定なので、直接置き換え可能。
	for i := 0; i < len(newInstruction); i++ {
		c.instructions[pos+i] = newInstruction[i]
	}
}
