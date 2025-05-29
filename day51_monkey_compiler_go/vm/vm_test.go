package vm

import (
	"fmt"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/ast"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/compiler"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/lexer"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/object"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/parser"
)

// vmTestCase はVMのテストケースを定義します。
// input: Monkey言語のソースコード文字列
// expected: スタックトップに期待される値 (object.Object)
// expectedError: VM実行中に期待されるエラーメッセージ。エラーがない場合は空文字列。
type vmTestCase struct {
	input        string
	expected     any // 整数、ブール値、"error"文字列、またはnil (Nullオブジェクト期待)
}

func parse(input string) *ast.Program {
	l := lexer.New(input)
	p := parser.New(l)
	program := p.ParseProgram()
	// テストの前提としてパースエラーはないものとする
	if len(p.Errors()) != 0 {
		panic(fmt.Sprintf("parser error on input '%s': %v", input, p.Errors()))
	}
	return program
}

func testIntegerObject(t *testing.T, expected int64, actual object.Object) bool {
	t.Helper()
	result, ok := actual.(*object.Integer)
	if !ok {
		t.Errorf("object is not Integer. got=%T (%+v)", actual, actual)
		return false
	}
	if result.Value != expected {
		t.Errorf("object has wrong value. got=%d, want=%d", result.Value, expected)
		return false
	}
	return true
}

func testBooleanObject(t *testing.T, expected bool, actual object.Object) bool {
	t.Helper()
	result, ok := actual.(*object.Boolean)
	if !ok {
		t.Errorf("object is not Boolean. got=%T (%+v)", actual, actual)
		return false
	}
	if result.Value != expected {
		t.Errorf("object has wrong value. got=%t, want=%t", result.Value, expected)
		return false
	}
	return true
}

func testStringObject(t *testing.T, expected string, actual object.Object) bool {
	t.Helper()
	result, ok := actual.(*object.String)
	if !ok {
		t.Errorf("object is not String. got=%T (%+v)", actual, actual)
		return false
	}
	if result.Value != expected {
		t.Errorf("object has wrong value. got=%q, want=%q", result.Value, expected)
		return false
	}
	return true
}

func runVmTests(t *testing.T, tests []vmTestCase) {
	t.Helper()

	for _, tt := range tests {
		program := parse(tt.input)
		comp := compiler.New()
		err := comp.Compile(program)
		if err != nil {
			t.Fatalf("compiler error: %s for input: %s", err, tt.input)
		}

		vmInstance := New(comp.Bytecode()) // vmを変数名vmInstanceに変更 (vmパッケージ名との衝突回避)
		err = vmInstance.Run()

		// エラーチェック
		if expectedErrStr, isStr := tt.expected.(string); isStr && expectedErrStr == "error" {
			if err == nil {
				t.Errorf("expected VM error but got none for input: %s", tt.input)
			}
			continue // エラーが期待される場合、スタックトップのチェックは不要
		} else if err != nil {
			t.Fatalf("vm error: %s for input: %s", err, tt.input)
		}

		// スタックトップの値のチェック
		// ほとんどのケースでは、ExpressionStatement の後に OpPop が実行され、
		// その結果が LastPoppedStackElem に格納される。
		// puts 文の場合、puts は Null をスタックに積むので、LastPoppedStackElem は Null になる。
		stackElem := vmInstance.LastPoppedStackElem()
		// fmt.Printf("Input: [%s], Expected type: %T, Got stackElem: %T (%+v)\n", tt.input, tt.expected, stackElem, stackElem)

		switch expectedVal := tt.expected.(type) {
		case int:
			testIntegerObject(t, int64(expectedVal), stackElem)
		case int64: // int64 も直接使えるように
			testIntegerObject(t, expectedVal, stackElem)
		case bool:
			testBooleanObject(t, expectedVal, stackElem)
		case string:
			if expectedVal == "error" {
				// エラーケースは上で処理済み
				continue
			}
			testStringObject(t, expectedVal, stackElem)
		case nil: // 期待値が Go の nil の場合は、Monkey の Null オブジェクトを期待
			if stackElem != Null {
				t.Errorf("expected Null object, got %T (%+v) for input: %s", stackElem, stackElem, tt.input)
			}
		default:
			// "error" の場合は上で処理済み。それ以外はテストケースの定義ミス。
			t.Errorf("unsupported expected type %T for input: %s", tt.expected, tt.input)
		}
	}
}

func TestIntegerArithmetic(t *testing.T) {
	tests := []vmTestCase{
		{"1", 1},
		{"2", 2},
		{"1 + 2", 3},
		{"1 - 2", -1},
		{"2 * 3", 6},
		{"4 / 2", 2},
		{"50 / 2 * 2 + 10 - 5", 55},
		{"5 + 5 + 5 + 5 - 10", 10},
		{"2 * 2 * 2 * 2 * 2", 32},
		{"5 * 2 + 10", 20},
		{"5 + 2 * 10", 25},
		{"5 * (2 + 10)", 60},
		{"-5", -5},
		{"-10", -10},
		{"-50 + 100 + -50", 0},
		{"(5 + 10 * 2 + 15 / 3) * 2 + -10", 50},
		{"0 / 1", 0},
		{"1 / 0", "error"}, // Division by zero
	}
	runVmTests(t, tests)
}

func TestBooleanExpressions(t *testing.T) {
	tests := []vmTestCase{
		{"true", true},
		{"false", false},
		{"1 < 2", true},
		{"1 > 2", false},
		{"1 < 1", false},
		{"1 > 1", false},
		{"1 == 1", true},
		{"1 != 1", false},
		{"1 == 2", false},
		{"1 != 2", true},
		{"true == true", true},
		{"false == false", true},
		{"true == false", false},
		{"true != false", true},
		{"false != true", true},
		{"(1 < 2) == true", true},
		{"(1 < 2) == false", false},
		{"(1 > 2) == true", false},
		{"(1 > 2) == false", true},
		{"!true", false},
		{"!false", true},
		{"!5", false},
		{"!!true", true},
		{"!!false", false},
		{"!!5", true},
		{"!0", true},
		{"!!0", false},
		{"!(1 < 2)", false},
		{"!null", true},
		{"!!null", false},
	}
	runVmTests(t, tests)
}

func TestConditionals(t *testing.T) {
	tests := []vmTestCase{
		{"if (true) { 10 }", 10},
		{"if (true) { 10 } else { 20 }", 10},
		{"if (false) { 10 } else { 20 }", 20},
		{"if (1) { 10 }", 10},
		{"if (1 < 2) { 10 }", 10},
		{"if (1 < 2) { 10 } else { 20 }", 10},
		{"if (1 > 2) { 10 } else { 20 }", 20},
		{"if (0) { 10 } else { 20 }", 20},
		{"if (false) { 10 }", nil},
		{"if (1 > 2) { 10 }", nil},
		{"if (null) { 10 } else {20}", 20},
		{"if (true) { if (false) { 1 } else { 100 }} else {200}", 100},
	}
	runVmTests(t, tests)
}

func TestGlobalLetStatements(t *testing.T) {
	tests := []vmTestCase{
		{"let one = 1; one", 1},
		{"let one = 1; let two = 2; one + two", 3},
		{"let one = 1; let two = one + one; one + two", 3},
		{"let a = 1; let b = a; let c = a + b + 5; c", 7},
		// {"let x = 5; if (x > 1) { x = x + 10; }; x", 15}, // 再代入はサポート外
	}
	runVmTests(t, tests)
}

func TestNullExpression(t *testing.T) {
	tests := []vmTestCase{
		{"null", nil},
	}
	runVmTests(t, tests)
}

func TestPutsStatement(t *testing.T) {
	tests := []vmTestCase{
		{"puts(123)", nil},
		{"puts(true)", nil},
		{"puts(null)", nil},
		{"let x = 10; puts(x)", nil},
		{"puts(1+2)", nil},
	}
	runVmTests(t, tests)
}

func TestStringExpressions(t *testing.T) {
	tests := []vmTestCase{
		{`"monkey"`, "monkey"},
		{`"mon" + "key"`, "monkey"},
		{`"mon" + "key" + "banana"`, "monkeybanana"},
	}

	runVmTests(t, tests)
}
