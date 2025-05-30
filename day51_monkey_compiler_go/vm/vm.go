package vm

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/code"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/compiler"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/object"
)

const (
	StackSize   = 2048
	GlobalsSize = 65536
	// MaxFrames   = 1024 // フレーム管理は行わないため不要
)

var (
	True  = &object.Boolean{Value: true}
	False = &object.Boolean{Value: false}
	Null  = &object.Null{}
)

type VM struct {
	constants   []object.Object
	instructions code.Instructions

	stack []object.Object
	sp    int // スタックポインタ: 常にスタックの次の空きスロットを指す。スタックトップは stack[sp-1]

	globals []object.Object

	// REPLなどで最後のポップされた要素を検査するために使用
	lastPoppedStackElem object.Object
}

func New(bytecode *compiler.Bytecode) *VM {
	return &VM{
		constants:    bytecode.Constants,
		instructions: bytecode.Instructions,

		stack:        make([]object.Object, StackSize),
		sp:           0,

		globals:      make([]object.Object, GlobalsSize),
		// フレーム関連の初期化は削除
	}
}

func NewWithGlobalsStore(bytecode *compiler.Bytecode, s []object.Object) *VM {
	vm := New(bytecode)
	vm.globals = s
	return vm
}

func (vm *VM) StackTop() object.Object {
	if vm.sp == 0 {
		return nil
	}
	return vm.stack[vm.sp-1]
}

func (vm *VM) push(o object.Object) error {
	if vm.sp >= StackSize {
		return fmt.Errorf("stack overflow")
	}
	vm.stack[vm.sp] = o
	vm.sp++
	return nil
}

func (vm *VM) pop() object.Object {
	if vm.sp == 0 {
		return Null
	}
	o := vm.stack[vm.sp-1]
	vm.sp--
	vm.lastPoppedStackElem = o
	return o
}

func (vm *VM) Run() error {
	var ip int
	var ins code.Instructions
	var op code.Opcode

	// フレーム管理がなくなったため、vm.instructions を直接参照
	for ip < len(vm.instructions) {
		op = code.Opcode(vm.instructions[ip])
		ins = vm.instructions

		switch op {
		case code.OpConstant:
			constIndex := code.ReadUint16(ins[ip+1:])
			ip += 2
			err := vm.push(vm.constants[constIndex])
			if err != nil {
				return err
			}
		case code.OpAdd, code.OpSub, code.OpMul, code.OpDiv:
			err := vm.executeBinaryOperation(op)
			if err != nil {
				return err
			}
		case code.OpTrue:
			err := vm.push(True)
			if err != nil {
				return err
			}
		case code.OpFalse:
			err := vm.push(False)
			if err != nil {
				return err
			}
		case code.OpEqual, code.OpNotEqual, code.OpGreaterThan, code.OpLessThan:
			err := vm.executeComparison(op)
			if err != nil {
				return err
			}
		case code.OpBang:
			err := vm.executeBangOperator()
			if err != nil {
				return err
			}
		case code.OpMinus:
			err := vm.executeMinusOperator()
			if err != nil {
				return err
			}
		case code.OpPop:
			popped := vm.pop()
			vm.lastPoppedStackElem = popped
		case code.OpJump:
			jumpPos := int(code.ReadUint16(ins[ip+1:]))
			ip = jumpPos - 1
		case code.OpJumpNotTruthy:
			jumpPos := int(code.ReadUint16(ins[ip+1:]))
			ip += 2
			condition := vm.pop()
			if !vm.isTruthy(condition) {
				ip = jumpPos - 1
			}
		case code.OpNull:
			err := vm.push(Null)
			if err != nil {
				return err
			}
		case code.OpSetGlobal:
			globalIndex := code.ReadUint16(ins[ip+1:])
			ip += 2
			vm.globals[globalIndex] = vm.pop()
		case code.OpGetGlobal:
			globalIndex := code.ReadUint16(ins[ip+1:])
			ip += 2
			val := vm.globals[globalIndex]
			if val == nil {
				err := vm.push(Null)
				if err != nil {
					return err
				}
			} else {
				err := vm.push(val)
				if err != nil {
					return err
				}
			}
		case code.OpCallBuiltin:
			numArgs := int(code.ReadUint8(vm.instructions[ip+1:]))
			ip += 1

			if vm.sp < numArgs {
				return fmt.Errorf("not enough arguments on stack: expected %d, got %d", numArgs, vm.sp)
			}

			if numArgs == 0 {
				// input() 関数の場合（引数なし）
				fmt.Print("Input: ")
				scanner := bufio.NewScanner(os.Stdin)
				if scanner.Scan() {
					input := strings.TrimSpace(scanner.Text())
					err := vm.push(&object.String{Value: input})
					if err != nil {
						return err
					}
				} else {
					// 入力エラーまたはEOF
					err := vm.push(&object.String{Value: ""})
					if err != nil {
						return err
					}
				}
			} else {
				// puts() 関数の場合
				args := vm.stack[vm.sp-numArgs : vm.sp]
				vm.sp = vm.sp - numArgs

				// puts の実装
				for _, arg := range args {
					switch obj := arg.(type) {
					case *object.Integer:
						fmt.Println(obj.Value)
					case *object.Boolean:
						fmt.Println(obj.Value)
					case *object.String:
						fmt.Println(obj.Value)
					case *object.Null:
						fmt.Println("null")
					default:
						fmt.Printf("%s\n", obj.Inspect())
					}
				}

				err := vm.push(Null)
				if err != nil {
					return err
				}
			}

		case code.OpCallAtoi:
			numArgs := int(code.ReadUint8(vm.instructions[ip+1:]))
			ip += 1

			if vm.sp < numArgs {
				return fmt.Errorf("not enough arguments on stack: expected %d, got %d", numArgs, vm.sp)
			}

			if numArgs != 1 {
				return fmt.Errorf("atoi expects exactly 1 argument, got %d", numArgs)
			}

			arg := vm.stack[vm.sp-1]
			vm.sp--

			// atoi() の処理: 文字列を整数に変換
			if strObj, ok := arg.(*object.String); ok {
				if intVal, err := strconv.ParseInt(strObj.Value, 10, 64); err == nil {
					err := vm.push(&object.Integer{Value: intVal})
					if err != nil {
						return err
					}
				} else {
					// 変換失敗時は 0 を返す
					err := vm.push(&object.Integer{Value: 0})
					if err != nil {
						return err
					}
				}
			} else {
				return fmt.Errorf("atoi expects string argument, got %T", arg)
			}

		default:
			return fmt.Errorf("unknown opcode %d (%s)", op, op.String())
		}
		ip++
	}
	return nil
}

func (vm *VM) executeBinaryOperation(op code.Opcode) error {
	right := vm.pop()
	left := vm.pop()

	leftType := left.Type()
	rightType := right.Type()

	switch {
	case leftType == object.INTEGER_OBJ && rightType == object.INTEGER_OBJ:
		return vm.executeBinaryIntegerOperation(op, left, right)
	case leftType == object.STRING_OBJ && rightType == object.STRING_OBJ:
		return vm.executeBinaryStringOperation(op, left, right)
	default:
		return fmt.Errorf("unsupported types for binary operation: %T %T", left, right)
	}
}

func (vm *VM) executeBinaryIntegerOperation(op code.Opcode, left, right object.Object) error {
	leftValue := left.(*object.Integer).Value
	rightValue := right.(*object.Integer).Value
	var result int64

	switch op {
	case code.OpAdd:
		result = leftValue + rightValue
	case code.OpSub:
		result = leftValue - rightValue
	case code.OpMul:
		result = leftValue * rightValue
	case code.OpDiv:
		if rightValue == 0 {
			return fmt.Errorf("division by zero")
		}
		result = leftValue / rightValue
	default:
		return fmt.Errorf("unknown integer operator: %d", op)
	}
	return vm.push(&object.Integer{Value: result})
}

func (vm *VM) executeBinaryStringOperation(op code.Opcode, left, right object.Object) error {
	if op != code.OpAdd {
		return fmt.Errorf("unknown string operator: %d", op)
	}

	leftVal := left.(*object.String).Value
	rightVal := right.(*object.String).Value

	return vm.push(&object.String{Value: leftVal + rightVal})
}

func (vm *VM) executeComparison(op code.Opcode) error {
	right := vm.pop()
	left := vm.pop()

	if left.Type() == object.INTEGER_OBJ && right.Type() == object.INTEGER_OBJ {
		return vm.executeIntegerComparison(op, left, right)
	}

	switch op {
	case code.OpEqual:
		return vm.push(nativeBoolToBooleanObject(right == left))
	case code.OpNotEqual:
		return vm.push(nativeBoolToBooleanObject(right != left))
	default:
		return fmt.Errorf("unsupported types for comparison operator %s: %s %s", op.String(), left.Type(), right.Type())
	}
}

func (vm *VM) executeIntegerComparison(op code.Opcode, left, right object.Object) error {
	leftValue := left.(*object.Integer).Value
	rightValue := right.(*object.Integer).Value

	switch op {
	case code.OpEqual:
		return vm.push(nativeBoolToBooleanObject(leftValue == rightValue))
	case code.OpNotEqual:
		return vm.push(nativeBoolToBooleanObject(leftValue != rightValue))
	case code.OpGreaterThan:
		return vm.push(nativeBoolToBooleanObject(leftValue > rightValue))
	case code.OpLessThan:
		return vm.push(nativeBoolToBooleanObject(leftValue < rightValue))
	default:
		return fmt.Errorf("unknown integer comparison operator: %d (%s)", op, op.String())
	}
}

func nativeBoolToBooleanObject(input bool) *object.Boolean {
	if input {
		return True
	}
	return False
}

func (vm *VM) executeBangOperator() error {
	operand := vm.pop()
	switch operand {
	case True:
		return vm.push(False)
	case False:
		return vm.push(True)
	case Null:
		return vm.push(True)
	default:
		if intVal, ok := operand.(*object.Integer); ok {
			if intVal.Value == 0 { // !0 is true
				return vm.push(True)
			}
			return vm.push(False) // !non-zero-integer is false
		}
		return vm.push(False) // !other-types (e.g. Error) is false, consistent with isTruthy
	}
}

// isTruthy はMonkey言語の条件評価における真偽を決定します。
// - false, null は偽 (falsey)
// - 整数 0 は偽 (falsey)
// - それ以外は全て真 (truthy)
func (vm *VM) isTruthy(obj object.Object) bool {
	switch val := obj.(type) {
	case *object.Boolean:
		return val.Value // Trueならtrue, Falseならfalse
	case *object.Null:
		return false
	case *object.Integer:
		return val.Value != 0 // 0ならfalse, それ以外ならtrue
	default:
		// その他の型（エラーオブジェクトなど、もしあれば）は真として扱う
		return true
	}
}

func (vm *VM) executeMinusOperator() error {
	operand := vm.pop()
	if operand.Type() != object.INTEGER_OBJ {
		return fmt.Errorf("unsupported type for negation: %s", operand.Type())
	}
	value := operand.(*object.Integer).Value
	return vm.push(&object.Integer{Value: -value})
}

func (vm *VM) LastPoppedStackElem() object.Object {
	// REPLはRun()の後にこのメソッドを呼び出して最後の評価結果を取得する
	// OpPopで終わった場合は lastPoppedStackElem に値がある
	// そうでなくスタックに値が残っている場合はスタックトップが結果
	if vm.lastPoppedStackElem != nil {
		// この値は次のRunの前にクリアされるべきだが、
		// REPLが毎回新しいVMを作るなら問題ない
		return vm.lastPoppedStackElem
	}
	if vm.sp > 0 {
		return vm.stack[vm.sp-1]
	}
	return Null // スタックが空で、最後にポップされた要素もない場合
}
