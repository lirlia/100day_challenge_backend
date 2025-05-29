package vm

import (
	"fmt"

	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/code"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/compiler"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/object"
)

const (
	StackSize   = 2048
	GlobalsSize = 65536
	MaxFrames   = 1024 // 今回は puts のみなので実質1フレーム
)

var (
	True  = &object.Boolean{Value: true}
	False = &object.Boolean{Value: false}
	Null  = &object.Null{}
)

type VM struct {
	constants []object.Object
	// instructions code.Instructions // コンパイル結果の instructions は bytecode.Instructions に含まれる

	stack []object.Object
	sp    int // スタックポインタ: 常にスタックの次の空きスロットを指す。スタックトップは stack[sp-1]

	globals []object.Object

	frames      []*Frame
	framesIndex int

	// lastPoppedStackElem object.Object // テスト用にポップされた最後の要素を保持する場合に使用
}

type Frame struct {
	ip           int // 命令ポインタ
	instructions code.Instructions
}

func NewFrame(instructions code.Instructions) *Frame {
	return &Frame{
		instructions: instructions,
		ip:           -1, // 最初のインクリメントで0になるように
	}
}

func (f *Frame) Instructions() code.Instructions {
	return f.instructions
}

func New(bytecode *compiler.Bytecode) *VM {
	mainFrame := NewFrame(bytecode.Instructions)
	frames := make([]*Frame, MaxFrames)
	frames[0] = mainFrame

	vm := &VM{
		constants: bytecode.Constants,
		// instructions: bytecode.Instructions,

		stack: make([]object.Object, StackSize),
		sp:    0,

		globals: make([]object.Object, GlobalsSize),

		frames:      frames,
		framesIndex: 1, // mainFrame が frames[0] にあるため、次のフレームは frames[1] から
	}
	return vm
}

func NewWithGlobalsStore(bytecode *compiler.Bytecode, s []object.Object) *VM {
	vm := New(bytecode)
	vm.globals = s
	return vm
}

func (vm *VM) currentFrame() *Frame {
	return vm.frames[vm.framesIndex-1]
}

func (vm *VM) pushFrame(f *Frame) {
	if vm.framesIndex >= MaxFrames {
		// エラーハンドリング: フレームスタックオーバーフロー
		// 今回は単純化のためpanicやエラーログに留める
		panic("frame stack overflow")
	}
	vm.frames[vm.framesIndex] = f
	vm.framesIndex++
}

func (vm *VM) popFrame() *Frame {
	if vm.framesIndex <= 0 { // 最後のフレームはポップできない or ベースフレームは常に残るべき
		// エラーハンドリング
		panic("frame stack underflow or attempt to pop base frame")
	}
	vm.framesIndex--
	return vm.frames[vm.framesIndex]
}

func (vm *VM) StackTop() object.Object {
	if vm.sp == 0 {
		return nil
	}
	return vm.stack[vm.sp-1]
}

// LastPoppedStackElem はテストケースで最後にポップされた要素を取得するメソッドです。
// VM の実行結果（スタックトップの要素）を取得する目的とは異なります。
// 実行結果を取得するには、Run() の後に StackTop() を呼び出すか、
// Run() が最後のスタック要素を返すように変更します。
// 今回のテストケースでは、Run() の後に StackTop() を使ってアサーションします。
// そのため、このメソッドは現在の実装では不要かもしれません。
/*
func (vm *VM) LastPoppedStackElem() object.Object {
	// このフィールドは現在VM構造体にはありません。
	// return vm.lastPoppedStackElem
	return nil // Placeholder
}
*/

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
		// VM内部のロジックでsp=0の状態でpopが呼ばれるのは通常バグ。
		// panic("stack underflow") // より攻撃的なエラー処理
		return nil // またはエラーオブジェクトを返す
	}
	o := vm.stack[vm.sp-1]
	vm.sp--
	// vm.stack[vm.sp] = nil // GCのためにクリアする場合 (オプション)
	// vm.lastPoppedStackElem = o // テスト用に保持する場合
	return o
}

func (vm *VM) Run() error {
	var ip int
	var ins code.Instructions
	var op code.Opcode

	for vm.currentFrame().ip < len(vm.currentFrame().Instructions())-1 {
		vm.currentFrame().ip++

		ip = vm.currentFrame().ip
		ins = vm.currentFrame().Instructions()

		if ip >= len(ins) { // 安全チェック：ipが命令の範囲外に出ないように
			return fmt.Errorf("instruction pointer out of bounds: ip=%d, len(ins)=%d", ip, len(ins))
		}
		op = code.Opcode(ins[ip])

		switch op {
		case code.OpConstant:
			constIndex := code.ReadUint16(ins[ip+1:])
			vm.currentFrame().ip += 2
			if int(constIndex) >= len(vm.constants) {
				return fmt.Errorf("invalid constant index: %d", constIndex)
			}
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
			vm.pop() // OpPopは評価結果を捨てるので、返り値は不要
		case code.OpJump:
			jumpPos := int(code.ReadUint16(ins[ip+1:]))
			vm.currentFrame().ip = jumpPos - 1 // ループの最後でインクリメントされるため -1
		case code.OpJumpNotTruthy:
			jumpPos := int(code.ReadUint16(ins[ip+1:]))
			vm.currentFrame().ip += 2 // jumpPosを読むためにipを進める

			condition := vm.pop()
			if condition == nil { // popが失敗した場合（スタックが空など）
				return fmt.Errorf("stack underflow when evaluating condition for OpJumpNotTruthy")
			}
			if !vm.isTruthy(condition) {
				vm.currentFrame().ip = jumpPos - 1
			}

		case code.OpSetGlobal:
			globalIndex := code.ReadUint16(ins[ip+1:])
			vm.currentFrame().ip += 2
			valToSet := vm.pop()
			if valToSet == nil { // popが失敗した場合
				return fmt.Errorf("stack underflow when setting global variable")
			}
			if int(globalIndex) >= len(vm.globals) {
				return fmt.Errorf("global index out of bounds: %d", globalIndex)
			}
			vm.globals[globalIndex] = valToSet
		case code.OpGetGlobal:
			globalIndex := code.ReadUint16(ins[ip+1:])
			vm.currentFrame().ip += 2
			if int(globalIndex) >= len(vm.globals) {
				return fmt.Errorf("global index out of bounds: %d", globalIndex)
			}
			val := vm.globals[globalIndex]
			if val == nil {
				// 未定義のグローバル変数を参照しようとした場合。
				// Monkey言語ではエラーにするか、nil (Nullオブジェクト) を返すか。
				// ここではNullをプッシュする方針も考えられるが、エラーの方が厳密。
				// return fmt.Errorf("undefined global variable at index %d", globalIndex)
				// Monkeyでは未定義変数はエラーなので、それを模倣する。
				// ただし、コンパイラが未定義変数を検出するので、ここまで到達するのは稀。
				// もし到達した場合、初期化されていないグローバル領域を参照している可能性。
				// ここではNullをプッシュして進めることもできるが、より安全なのはエラー。
				// 今回は、初期化されていない場合は nil (Goのnil) のままなので、それを push する。
				// オブジェクトシステムとしては object.Null を使うべき。
				return vm.push(Null) // 未定義グローバルはNullとして扱う (REPLでの挙動に近い)
			}
			err := vm.push(val)
			if err != nil {
				return err
			}
		case code.OpNull:
			err := vm.push(Null)
			if err != nil {
				return err
			}
		case code.OpCallBuiltin:
			// numArgs := int(ins[ip+1]) // 1バイトのオペランド
			// vm.currentFrame().ip += 1   // オペランド分ipを進める
			// オペランドの読み込みは ReadOperands を使うべきだが、今回は1バイト固定なので直接読む
			if ip+1 >= len(ins) {
				return fmt.Errorf("operand missing for OpCallBuiltin")
			}
			numArgs := int(ins[ip+1])
			vm.currentFrame().ip++


			// 現在は 'puts' のみサポート
			// 将来的には組み込み関数のインデックスもオペランドに含める
			// builtinIndex := ins[ip+1] (仮)
			// numArgs := ins[ip+2] (仮)
			// vm.currentFrame().ip += 2 (仮)

			if numArgs != 1 { // puts は引数1つ
				return fmt.Errorf("wrong number of arguments for puts: got=%d, want=1", numArgs)
			}

			// 引数をスタックから取得 (ただし、まだpopしない)
			// 実際には、引数の数だけループしてargsスライスに集めるのが一般的
			if vm.sp < numArgs {
				return fmt.Errorf("stack underflow for builtin call arguments")
			}
			arg := vm.stack[vm.sp-numArgs] // 引数はスタックの sp-numArgs から sp-1 の間にある

			// putsの実装
			// fmt.Println(arg.Inspect()) // どんなオブジェクトでも表示できるようにInspectを使うのが堅牢

			// Monkeyのputsは値を表示し、nullを返す仕様
			// 表示処理
			switch actualArg := arg.(type) {
			case *object.Integer:
				fmt.Println(actualArg.Value)
			case *object.Boolean:
				fmt.Println(actualArg.Value)
			// Stringは現在サポート外だが、もしあれば
			// case *object.String:
			// 	fmt.Println(actualArg.Value)
			case *object.Null:
				fmt.Println("null")
			default:
				// その他の型や、エラーオブジェクトなどもInspectで表示
				fmt.Println(arg.Inspect())
			}

			// 引数をスタックから消費
			// OpCallBuiltinの直前に、引数評価のOpPopがあるはずなので、ここでは不要？
			// いや、コンパイラは引数評価のコードを生成し、最後にOpCallBuiltinを出す。
			// その時点で引数の値はスタックに積まれている。
			// 組み込み関数がそれらを消費する。
			vm.sp -= numArgs // 引数を消費

			// putsはnullを返すので、nullをスタックにプッシュ
			err := vm.push(Null)
			if err != nil {
				return err
			}


		default:
			def, err := code.Lookup(byte(op))
			if err != nil {
				return fmt.Errorf("opcode %d not found in definitions: %w", op, err)
			}
			return fmt.Errorf("opcode %s (%d) not yet implemented", def.Name, op)
		}
	}
	return nil
}

func (vm *VM) executeBinaryOperation(op code.Opcode) error {
	right := vm.pop()
	left := vm.pop()

	if left == nil || right == nil {
		return fmt.Errorf("stack underflow during binary operation")
	}

	leftType := left.Type()
	rightType := right.Type()

	if leftType == object.INTEGER_OBJ && rightType == object.INTEGER_OBJ {
		return vm.executeBinaryIntegerOperation(op, left.(*object.Integer), right.(*object.Integer))
	}
	// boolean同士の演算は通常ない (+, -, *, / など)
	// もしサポートするならここで分岐
	// if leftType == object.BOOLEAN_OBJ && rightType == object.BOOLEAN_OBJ { ... }

	return fmt.Errorf("unsupported types for binary operation %s: %s %s", code.Opcode(op), leftType, rightType)
}

func (vm *VM) executeBinaryIntegerOperation(op code.Opcode, left, right *object.Integer) error {
	var result int64
	switch op {
	case code.OpAdd:
		result = left.Value + right.Value
	case code.OpSub:
		result = left.Value - right.Value
	case code.OpMul:
		result = left.Value * right.Value
	case code.OpDiv:
		if right.Value == 0 {
			return fmt.Errorf("division by zero")
		}
		result = left.Value / right.Value
	default:
		return fmt.Errorf("unknown integer operator: %d (%s)", op, code.Opcode(op))
	}
	return vm.push(&object.Integer{Value: result})
}

func (vm *VM) executeComparison(op code.Opcode) error {
	right := vm.pop()
	left := vm.pop()

	if left == nil || right == nil {
		return fmt.Errorf("stack underflow during comparison")
	}

	// 整数同士の比較
	if left.Type() == object.INTEGER_OBJ && right.Type() == object.INTEGER_OBJ {
		return vm.executeIntegerComparison(op, left.(*object.Integer), right.(*object.Integer))
	}

	// ブール同士の比較 (==, != のみ)
	if left.Type() == object.BOOLEAN_OBJ && right.Type() == object.BOOLEAN_OBJ {
		leftVal := left.(*object.Boolean).Value
		rightVal := right.(*object.Boolean).Value
		switch op {
		case code.OpEqual:
			return vm.push(nativeBoolToBooleanObject(leftVal == rightVal))
		case code.OpNotEqual:
			return vm.push(nativeBoolToBooleanObject(leftVal != rightVal))
		// OpGreaterThan, OpLessThanはブールには適用不可
		default:
			return fmt.Errorf("unknown operator for booleans: %s (%s %s)", op, left.Type(), right.Type())
		}
	}

	// その他の型の比較 (例: null == null は true になるべきだが、現在の OpEqual/OpNotEqual はポインタ比較)
	// null 同士、または boolean と null の比較など、より詳細な型チェックが必要な場合がある。
	// ここでは、同じ型のオブジェクトインスタンス（True, False, Null）の比較を特別扱いする
	switch op {
	case code.OpEqual:
		return vm.push(nativeBoolToBooleanObject(left == right)) // シングルトンなのでポインタ比較でOK
	case code.OpNotEqual:
		return vm.push(nativeBoolToBooleanObject(left != right)) // シングルトンなのでポインタ比較でOK
	}

	return fmt.Errorf("unsupported types for comparison %s: %s %s",
		op, left.Type(), right.Type())
}

func (vm *VM) executeIntegerComparison(op code.Opcode, left, right *object.Integer) error {
	switch op {
	case code.OpEqual:
		return vm.push(nativeBoolToBooleanObject(left.Value == right.Value))
	case code.OpNotEqual:
		return vm.push(nativeBoolToBooleanObject(left.Value != right.Value))
	case code.OpGreaterThan:
		return vm.push(nativeBoolToBooleanObject(left.Value > right.Value))
	case code.OpLessThan:
		return vm.push(nativeBoolToBooleanObject(left.Value < right.Value))
	default:
		return fmt.Errorf("unknown integer comparison operator: %s", op)
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
	if operand == nil {
		return fmt.Errorf("stack underflow for bang operator")
	}

	// isTruthy に基づいて反転させるのが一貫性がある
	if vm.isTruthy(operand) {
		return vm.push(False)
	}
	return vm.push(True)
}

func (vm *VM) executeMinusOperator() error {
	operand := vm.pop()
	if operand == nil {
		return fmt.Errorf("stack underflow for minus operator")
	}
	if operand.Type() != object.INTEGER_OBJ {
		return fmt.Errorf("unsupported type for negation: %s", operand.Type())
	}
	value := operand.(*object.Integer).Value
	return vm.push(&object.Integer{Value: -value})
}

// isTruthy はMonkey言語の真偽値評価ルールに従います。
// false と null のみが偽で、それ以外は真です。数値の0も真です。
func (vm *VM) isTruthy(obj object.Object) bool {
	switch obj {
	case False:
		return false
	case Null:
		return false
	default:
		// Integer(0) も true
		return true
	}
}
