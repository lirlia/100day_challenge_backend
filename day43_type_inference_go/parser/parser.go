package parser

import (
	"github.com/alecthomas/participle/v2"
	"github.com/alecthomas/participle/v2/lexer"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/ast"
)

// MiniLangLexer defines the lexical rules for MiniLang.
var MiniLangLexer = lexer.MustSimple([]lexer.SimpleRule{
	{Name: "Comment", Pattern: "#[^\\n]*"},
	{Name: "LetKw", Pattern: `let`},
	{Name: "InKw", Pattern: `in`},
	{Name: "IfKw", Pattern: `if`},
	{Name: "ThenKw", Pattern: `then`},
	{Name: "ElseKw", Pattern: `else`},
	{Name: "FnKw", Pattern: `fn`},
	{Name: "True", Pattern: `true`},
	{Name: "False", Pattern: `false`},
	{Name: "LogicalAnd", Pattern: `&&`},
	{Name: "LogicalOr", Pattern: `\|\|`},
	{Name: "Arrow", Pattern: `=>`},
	{Name: "Eq", Pattern: `==`},
	{Name: "Assign", Pattern: `=`},
	{Name: "Ident", Pattern: `[a-zA-Z_][a-zA-Z0-9_]*`},
	{Name: "Int", Pattern: `[0-9]+`},
	{Name: "Float", Pattern: `[0-9]+\.[0-9]+`},
	{Name: "String", Pattern: `"(\\.|[^"])*"`},
	{Name: "LParen", Pattern: `\(`},
	{Name: "RParen", Pattern: `\)`},
	{Name: "Operator", Pattern: `[+\-*/><]`},
	{Name: "Punct", Pattern: `[,]`},
	{Name: "Whitespace", Pattern: `\s+`},
})

// Parser holds the participle parser instance.
var langParser *participle.Parser[ast.Program]

func init() {
	var err error
	langParser, err = participle.Build[ast.Program](
		participle.Lexer(MiniLangLexer),
		participle.Elide("Whitespace", "Comment"),
	)
	if err != nil {
		panic("failed to build parser: " + err.Error())
	}
}

// Parse takes a string of MiniLang code and returns the AST or an error.
func Parse(code string) (*ast.Program, error) {
	program, err := langParser.ParseString("", code)
	if err != nil {
		return nil, err
	}
	return program, nil
}
