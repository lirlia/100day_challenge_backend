package main

import (
	"fmt"
	"os"
	"os/user"

	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/compiler"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/lexer"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/object"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/parser"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/repl"
	"github.com/lirlia/100day_challenge_backend/day51_monkey_compiler_go/vm"
)

func main() {
	if len(os.Args) > 2 {
		fmt.Fprintln(os.Stderr, "Usage: ./day51_monkey_compiler_go [script_file]")
		os.Exit(1)
	}

	if len(os.Args) == 2 { // ファイルパスが引数として与えられた場合
		filePath := os.Args[1]
		executeFile(filePath)
	} else { // 引数がない場合はREPLを起動
		currentUser, err := user.Current()
		if err != nil {
			// REPL起動時のユーザー名取得エラーは致命的ではないかもしれない
			// panic(err) // またはエラーメッセージ表示してデフォルト名を使うなど
			fmt.Fprintf(os.Stderr, "Warning: could not get current user: %v\n", err)
			fmt.Println("Hello! This is the Monkey programming language with Compiler and VM! (REPL mode)")
		} else {
			fmt.Printf("Hello %s! This is the Monkey programming language with Compiler and VM! (REPL mode)\n", currentUser.Username)
		}
		fmt.Printf("Feel free to type in commands\n")
		repl.Start(os.Stdin, os.Stdout)
	}
}

func executeFile(filePath string) {
	data, err := os.ReadFile(filePath) // Go 1.16+
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error reading file %s: %s\n", filePath, err)
		os.Exit(1)
	}

	l := lexer.New(string(data))
	p := parser.New(l)
	program := p.ParseProgram()

	if len(p.Errors()) != 0 {
		fmt.Fprintf(os.Stderr, "Parser errors:\n")
		for _, msg := range p.Errors() {
			fmt.Fprintf(os.Stderr, "\t%s\n", msg)
		}
		os.Exit(1)
	}

	// ファイル実行時は状態を共有しない新しいコンパイラとVMインスタンスを使用
	comp := compiler.New()
	err = comp.Compile(program)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Compilation failed:\n %s\n", err)
		os.Exit(1)
	}

	// ファイル実行時はグローバル変数のストアも新規作成
	globals := make([]object.Object, vm.GlobalsSize)
	machine := vm.NewWithGlobalsStore(comp.Bytecode(), globals)

	err = machine.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Executing bytecode failed:\n %s\n", err)
		os.Exit(1)
	}

	// ファイル実行の場合、明示的な puts による出力以外は行わない。
	// スクリプトの最後の式の値は表示しない。
	// エラーがなければ正常終了とする。
}
