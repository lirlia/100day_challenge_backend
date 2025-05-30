package compiler

import (
	"fmt"
	"testing"

	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/ast"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/code"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/lexer"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/object"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/parser"
)

type compilerTestCase struct {
	input                string
	expectedConstants    []interface{}
	expectedInstructions []code.Instructions
}

func TestIntegerArithmetic(t *testing.T) {
	tests := []compilerTestCase{
		{
			input:             "1 + 2",
			expectedConstants: []interface{}{1, 2},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpAdd),
				code.Make(code.OpPop), // ExpressionStatement の結果をPop
			},
		},
		{
			input:             "1; 2",
			expectedConstants: []interface{}{1, 2},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpPop),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "1 - 2",
			expectedConstants: []interface{}{1, 2},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpSub),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "2 * 3",
			expectedConstants: []interface{}{2, 3},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpMul),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "4 / 2",
			expectedConstants: []interface{}{4, 2},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpDiv),
				code.Make(code.OpPop),
			},
		},
	}
	runCompilerTests(t, tests)
}

func TestBooleanExpressions(t *testing.T) {
	tests := []compilerTestCase{
		{
			input:             "true",
			expectedConstants: []interface{}{},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpTrue),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "false",
			expectedConstants: []interface{}{},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpFalse),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "1 > 2",
			expectedConstants: []interface{}{1, 2},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpGreaterThan),
				code.Make(code.OpPop),
			},
		},
		// Monkey言語の < はサポート外 (OpLessThanがないため)
		// {
		// 	input:             "1 < 2",
		// 	expectedConstants: []interface{}{2, 1}, // Swapped for OpGreaterThan
		// 	expectedInstructions: []code.Instructions{
		// 		code.Make(code.OpConstant, 0),
		// 		code.Make(code.OpConstant, 1),
		// 		code.Make(code.OpGreaterThan), // Actually less than, but using GT with swapped operands
		// 		code.Make(code.OpPop),
		// 	},
		// },
		{
			input:             "1 == 2",
			expectedConstants: []interface{}{1, 2},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpEqual),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "1 != 2",
			expectedConstants: []interface{}{1, 2},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpNotEqual),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "true == false",
			expectedConstants: []interface{}{},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpTrue),
				code.Make(code.OpFalse),
				code.Make(code.OpEqual),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "true != false",
			expectedConstants: []interface{}{},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpTrue),
				code.Make(code.OpFalse),
				code.Make(code.OpNotEqual),
				code.Make(code.OpPop),
			},
		},
	}
	runCompilerTests(t, tests)
}

func TestPrefixExpressions(t *testing.T) {
	tests := []compilerTestCase{
		{
			input:             "!true",
			expectedConstants: []interface{}{},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpTrue),
				code.Make(code.OpBang),
				code.Make(code.OpPop),
			},
		},
		{
			input:             "-1",
			expectedConstants: []interface{}{1},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpMinus),
				code.Make(code.OpPop),
			},
		},
	}
	runCompilerTests(t, tests)
}

func TestConditionals(t *testing.T) {
	tests := []compilerTestCase{
		{
			input: `
			if (true) { 10 }; 3333;
			`,
			expectedConstants: []interface{}{10, 3333},
			expectedInstructions: []code.Instructions{
				// 0000
				code.Make(code.OpTrue),
				// 0001
				code.Make(code.OpJumpNotTruthy, 10), // Jump to 0010 (OpNull after consequence)
				// 0004
				code.Make(code.OpConstant, 0), // 10
				// 0007
				code.Make(code.OpJump, 11), // Jump to 0011 (after OpNull)
				// 0010
				code.Make(code.OpNull), // Alternative is nil
				// 0011
				code.Make(code.OpPop), // Pop the result of if
				// 0012
				code.Make(code.OpConstant, 1), // 3333
				// 0015
				code.Make(code.OpPop),
			},
		},
		{
			input: `
			if (true) { 10 } else { 20 }; 3333;
			`,
			expectedConstants: []interface{}{10, 20, 3333},
			expectedInstructions: []code.Instructions{
				// 0000
				code.Make(code.OpTrue),
				// 0001
				code.Make(code.OpJumpNotTruthy, 10), // Jump to OpConstant 20
				// 0004
				code.Make(code.OpConstant, 0), // 10
				// 0007
				code.Make(code.OpJump, 13), // Jump to after alternative (OpPop)
				// 0010
				code.Make(code.OpConstant, 1), // 20
				// 0013
				code.Make(code.OpPop), // Pop the result of if
				// 0014
				code.Make(code.OpConstant, 2), // 3333
				// 0017
				code.Make(code.OpPop),
			},
		},
	}
	runCompilerTests(t, tests)
}

func TestGlobalLetStatements(t *testing.T) {
	tests := []compilerTestCase{
		{
			input: `
			let one = 1;
			let two = 2;
			`,
			expectedConstants: []interface{}{1, 2},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpSetGlobal, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpSetGlobal, 1),
			},
		},
		{
			input: `
			let one = 1;
			one;
			`,
			expectedConstants: []interface{}{1},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpSetGlobal, 0),
				code.Make(code.OpGetGlobal, 0),
				code.Make(code.OpPop),
			},
		},
		{
			input: `
			let one = 1;
			let two = one;
			two;
			`,
			expectedConstants: []interface{}{1},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0), // 1
				code.Make(code.OpSetGlobal, 0), // one = 1
				code.Make(code.OpGetGlobal, 0), // one (value of one)
				code.Make(code.OpSetGlobal, 1), // two = one
				code.Make(code.OpGetGlobal, 1), // two
				code.Make(code.OpPop),
			},
		},
	}
	runCompilerTests(t, tests)
}

func TestPutsStatement(t *testing.T) {
	tests := []compilerTestCase{
		{
			input:             `puts(1);`,
			expectedConstants: []interface{}{1},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpCallBuiltin, 1),
				// OpCallBuiltin for puts might leave Null on stack or nothing.
				// If it leaves Null, ExpressionStatement Pop will remove it.
				// If it leaves nothing, this Pop is for the ExpressionStatement itself.
				code.Make(code.OpPop),
			},
		},
		{
			input:             `puts(1, 2+3);`,
			expectedConstants: []interface{}{1, 2, 3},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0), // 1
				code.Make(code.OpConstant, 1), // 2
				code.Make(code.OpConstant, 2), // 3
				code.Make(code.OpAdd),
				code.Make(code.OpCallBuiltin, 2),
				code.Make(code.OpPop),
			},
		},
	}
	runCompilerTests(t, tests)
}

func TestInputStatement(t *testing.T) {
	tests := []compilerTestCase{
		{
			input:             `input()`,
			expectedConstants: []interface{}{},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpCallBuiltin, 0),
				code.Make(code.OpPop),
			},
		},
		{
			input:             `let name = input(); puts(name);`,
			expectedConstants: []interface{}{},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpCallBuiltin, 0),  // input()
				code.Make(code.OpSetGlobal, 0),    // let name =
				code.Make(code.OpGetGlobal, 0),    // name
				code.Make(code.OpCallBuiltin, 1),  // puts(name)
				code.Make(code.OpPop),
			},
		},
	}

	runCompilerTests(t, tests)
}

func TestStringExpressions(t *testing.T) {
	tests := []compilerTestCase{
		{
			input:             `"monkey"`,
			expectedConstants: []interface{}{"monkey"},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpPop),
			},
		},
		{
			input:             `"mon" + "key"`,
			expectedConstants: []interface{}{"mon", "key"},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpConstant, 1),
				code.Make(code.OpAdd),
				code.Make(code.OpPop),
			},
		},
	}

	runCompilerTests(t, tests)
}

func TestAtoiStatement(t *testing.T) {
	tests := []compilerTestCase{
		{
			input:             `atoi("123")`,
			expectedConstants: []interface{}{"123"},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpCallAtoi, 1),
				code.Make(code.OpPop),
			},
		},
		{
			input:             `let num = atoi("456");`,
			expectedConstants: []interface{}{"456"},
			expectedInstructions: []code.Instructions{
				code.Make(code.OpConstant, 0),
				code.Make(code.OpCallAtoi, 1),
				code.Make(code.OpSetGlobal, 0),
			},
		},
	}

	runCompilerTests(t, tests)
}

func runCompilerTests(t *testing.T, tests []compilerTestCase) {
	t.Helper()

	for _, tt := range tests {
		program := parse(tt.input)
		compiler := New()
		err := compiler.Compile(program)
		if err != nil {
			t.Fatalf("compiler error on input %s: %s", tt.input, err)
		}

		bytecode := compiler.Bytecode()
		err = testInstructions(tt.expectedInstructions, bytecode.Instructions)
		if err != nil {
			t.Fatalf("testInstructions failed for input %s: %s", tt.input, err)
		}

		err = testConstants(t, tt.expectedConstants, bytecode.Constants)
		if err != nil {
			t.Fatalf("testConstants failed for input %s: %s", tt.input, err)
		}
	}
}

func parse(input string) *ast.Program {
	l := lexer.New(input)
	p := parser.New(l)
	return p.ParseProgram()
}

func testInstructions(expected []code.Instructions, actual code.Instructions) error {
	concatted := code.Instructions{}
	for _, ins := range expected {
		concatted = append(concatted, ins...)
	}

	if len(actual) != len(concatted) {
		return fmt.Errorf("wrong instructions length.\nwant=%q (%d)\ngot =%q (%d)",
			concatted, len(concatted), actual, len(actual))
	}

	for i, ins := range concatted {
		if actual[i] != ins {
			return fmt.Errorf("wrong instruction at %d.\nwant=%q\ngot =%q",
				i, concatted, actual)
		}
	}
	return nil
}

func testConstants(t *testing.T, expected []interface{}, actual []object.Object) error {
	t.Helper()
	if len(expected) != len(actual) {
		return fmt.Errorf("wrong number of constants. got=%d, want=%d",
			len(actual), len(expected))
	}

	for i, constant := range expected {
		switch constant := constant.(type) {
		case int:
			err := testIntegerObject(int64(constant), actual[i])
			if err != nil {
				return fmt.Errorf("constant %d - testIntegerObject failed: %s",
					i, err)
			}
		// 他の型の定数 (文字列など) があればここに追加
		}
	}
	return nil
}

func testIntegerObject(expected int64, actual object.Object) error {
	result, ok := actual.(*object.Integer)
	if !ok {
		return fmt.Errorf("object is not Integer. got=%T (%+v)",
			actual, actual)
	}
	if result.Value != expected {
		return fmt.Errorf("object has wrong value. got=%d, want=%d",
			result.Value, expected)
	}
	return nil
}
