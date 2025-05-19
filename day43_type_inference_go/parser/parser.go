package parser

import (
	"github.com/alecthomas/participle/v2"
	"github.com/alecthomas/participle/v2/lexer"
	"github.com/lirlia/100day_challenge_backend/day43_type_inference_go/ast"
)

var MiniLangLexer = lexer.MustStateful(lexer.Rules{
	"Root": {
		// Keywords
		{Name: "LetKw", Pattern: `let`},
		{Name: "InKw", Pattern: `in`},
		{Name: "IfKw", Pattern: `if`},
		{Name: "ThenKw", Pattern: `then`},
		{Name: "ElseKw", Pattern: `else`},
		{Name: "FnKw", Pattern: `fn`},
		{Name: "True", Pattern: `true`},
		{Name: "False", Pattern: `false`},

		// Identifiers and Literals
		{Name: "Ident", Pattern: `[a-zA-Z_][a-zA-Z0-9_]*`},
		{Name: "Int", Pattern: `\d+`}, // Raw string: \d+ is correct for one or more digits

		// Named tokens / Operators / Symbols - all raw strings, regex escapes as needed
		{Name: "Arrow", Pattern: `=>`},
		{Name: "Eq", Pattern: `==`},
		{Name: "Assign", Pattern: `=`},
		{Name: "LogicalAnd", Pattern: `&&`},
		{Name: "LogicalOr", Pattern: `\|\|`}, // Raw string: \|\| for literal ||
		{Name: "Plus", Pattern: `\+`},        // Raw string: \+ for literal +
		{Name: "Minus", Pattern: `-`},
		{Name: "Multiply", Pattern: `\*`}, // Raw string: \* for literal *
		{Name: "Divide", Pattern: `/`},
		{Name: "GreaterThan", Pattern: `>`},
		{Name: "LessThan", Pattern: `<`},
		{Name: "LParen", Pattern: `\(`}, // Raw string: \( for literal (
		{Name: "RParen", Pattern: `\)`}, // Raw string: \) for literal )

		// Tokens to be discarded
		{Name: "Comment", Pattern: `#[^\n]*`}, // Raw string: [^\n]* for not newline
		{Name: "Whitespace", Pattern: `\s+`},  // Raw string: \s+ for one or more spaces
	},
})

var langParser = participle.MustBuild[ast.Program](
	participle.Lexer(MiniLangLexer),
	participle.Elide("Comment", "Whitespace"),
	// participle.Unquote("String"), // No string literals in use yet
	participle.UseLookahead(2), // Added lookahead
)

// Global parser instance
var globalParser *participle.Parser[ast.Program]

func init() {
	var err error
	globalParser, err = participle.Build[ast.Program](
		participle.Lexer(MiniLangLexer),
		participle.Elide("Comment", "Whitespace"),
		participle.UseLookahead(2),
	)
	if err != nil {
		panic(err)
	}
}

func Parse(code string) (*ast.Program, error) {
	// program := &ast.Program{} // Not needed if using globalParser.ParseString
	// It's generally better to use the MustBuild result directly or handle the error from Build.
	// The init() function now handles the parser build and panics on error.
	return globalParser.ParseString("", code)
}
