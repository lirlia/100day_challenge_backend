package token

type TokenType string

type Token struct {
	Type    TokenType
	Literal string
}

const (
	ILLEGAL = "ILLEGAL"
	EOF     = "EOF"

	// 識別子 + リテラル
	IDENT = "IDENT" // add, foobar, x, y, ...
	INT   = "INT"   // 1343456

	// 演算子
	ASSIGN   = "="
	PLUS     = "+"
	MINUS    = "-"
	BANG     = "!"
	ASTERISK = "*"
	SLASH    = "/"

	LT = "<"
	GT = ">"

	EQ     = "=="
	NOT_EQ = "!="

	// デリミタ
	COMMA     = ","
	SEMICOLON = ";"

	LPAREN = "("
	RPAREN = ")"
	LBRACE = "{"
	RBRACE = "}"

	// キーワード
	// FUNCTION = "FUNCTION" // 削除
	LET = "LET"
	TRUE    = "TRUE"
	FALSE   = "FALSE"
	IF      = "IF"
	ELSE    = "ELSE"
	// RETURN   = "RETURN" // 削除
	NULL = "NULL"
	// PUTS     = "PUTS" // 削除
)

var keywords = map[string]TokenType{
	// "fn":     FUNCTION, // 削除
	"let":   LET,
	"true":  TRUE,
	"false": FALSE,
	"if":    IF,
	"else":  ELSE,
	// "return": RETURN, // 削除
	"null":  NULL,
	// "puts":   PUTS, // 削除
}

func LookupIdent(ident string) TokenType {
	if tok, ok := keywords[ident]; ok {
		return tok
	}
	return IDENT
}
