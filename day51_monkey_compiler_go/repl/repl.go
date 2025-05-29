package repl

import (
	"bufio"
	"fmt"
	"io"

	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/compiler"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/lexer"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/object"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/parser"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/vm"
)

const PROMPT = ">> "

func Start(in io.Reader, out io.Writer) {
	scanner := bufio.NewScanner(in)

	// REPLセッションで状態を保持するためのコンポーネント
	constants := []object.Object{}
	symbolTable := compiler.NewSymbolTable()
	globals := make([]object.Object, vm.GlobalsSize)

	for {
		fmt.Fprint(out, PROMPT)
		scanned := scanner.Scan()
		if !scanned {
			return // EOFまたはエラー
		}

		line := scanner.Text()
		l := lexer.New(line)
		p := parser.New(l)
		program := p.ParseProgram()

		if len(p.Errors()) != 0 {
			printParserErrors(out, p.Errors())
			continue
		}

		// REPLでは、前回の状態を引き継ぐコンパイラを使用
		comp := compiler.NewWithState(symbolTable, constants)
		err := comp.Compile(program)
		if err != nil {
			fmt.Fprintf(out, "Woops! Compilation failed:\n %s\n", err)
			continue
		}

		// コンパイル結果（特に定数プール）を次のイテレーションのために更新
		constants = comp.Bytecode().Constants

		// REPLでは、前回のグローバル変数の状態を引き継ぐVMを使用
		machine := vm.NewWithGlobalsStore(comp.Bytecode(), globals)
		err = machine.Run()
		if err != nil {
			fmt.Fprintf(out, "Woops! Executing bytecode failed:\n %s\n", err)
			continue
		}

		// VM実行後の最後の評価結果を取得して表示
		// OpPop によって lastPoppedStackElem に値が設定されることを期待
		lastPopped := machine.LastPoppedStackElem()
		if lastPopped != nil && lastPopped != vm.Null { // Nullは表示しない（putsの結果など）
			// ただし、ユーザーが明示的に `null;` と入力した場合は表示したい。
			// ここでは簡単のため、Nullでないものだけ表示。
			// 厳密には、ExpressionStatementでOpPopされたものだけ表示すべき。
			// REPLで `let x = 1;` のような文は何も表示しないのが一般的。
			// 現在の実装では、LetStatementの後にもOpPopが入るため、その値 (通常は代入された値) が表示される。
			// ここでは、最後の評価結果を表示するシンプルな方針とする。
			// putsの結果はNullなので、この条件では表示されない。
			io.WriteString(out, lastPopped.Inspect())
			io.WriteString(out, "\n")
		}
	}
}

func printParserErrors(out io.Writer, errors []string) {
	io.WriteString(out, " parser errors:\n")
	for _, msg := range errors {
		io.WriteString(out, "\t"+msg+"\n")
	}
}
