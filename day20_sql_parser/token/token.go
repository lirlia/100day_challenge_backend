package token

// TokenType はトークンの種類を表す型です。
type TokenType string

// Token は字句解析されたトークンを表す構造体です。
type Token struct {
	Type    TokenType
	Literal string // トークンの実際の文字列
	Line    int    // トークンが現れた行番号
	Column  int    // トークンが現れた列番号
}

// トークンの種類
const (
	ILLEGAL TokenType = "ILLEGAL" // 不正なトークン
	EOF     TokenType = "EOF"     // ファイルの終端

	// 識別子 + リテラル
	IDENT  TokenType = "IDENT"  // add, foobar, x, y, ...
	INT    TokenType = "INT"    // 1343456
	STRING TokenType = "STRING" // "foobar"

	// 演算子
	ASSIGN   TokenType = "="
	PLUS     TokenType = "+"
	MINUS    TokenType = "-"
	BANG     TokenType = "!"
	ASTERISK TokenType = "*"
	SLASH    TokenType = "/"
	LT       TokenType = "<"
	GT       TokenType = ">"
	EQ       TokenType = "==" // Goでは代入と区別するため == とする (SQLの = とは異なる)
	NOT_EQ   TokenType = "!=" // Goでは <> よりも != が一般的
	LT_EQ    TokenType = "<="
	GT_EQ    TokenType = ">="

	// 区切り文字
	COMMA     TokenType = ","
	SEMICOLON TokenType = ";"
	LPAREN    TokenType = "("
	RPAREN    TokenType = ")"
	DOT       TokenType = "."

	// キーワード
	SELECT   TokenType = "SELECT"
	FROM     TokenType = "FROM"
	WHERE    TokenType = "WHERE"
	INSERT   TokenType = "INSERT"
	INTO     TokenType = "INTO"
	VALUES   TokenType = "VALUES"
	UPDATE   TokenType = "UPDATE"
	SET      TokenType = "SET"
	DELETE   TokenType = "DELETE"
	CREATE   TokenType = "CREATE"
	TABLE    TokenType = "TABLE"
	INDEX    TokenType = "INDEX"
	ON       TokenType = "ON"
	AS       TokenType = "AS"
	JOIN     TokenType = "JOIN"
	LEFT     TokenType = "LEFT"
	RIGHT    TokenType = "RIGHT"
	INNER    TokenType = "INNER"
	OUTER    TokenType = "OUTER"
	GROUP    TokenType = "GROUP"
	BY       TokenType = "BY"
	HAVING   TokenType = "HAVING"
	ORDER    TokenType = "ORDER"
	LIMIT    TokenType = "LIMIT"
	AND      TokenType = "AND"
	OR       TokenType = "OR"
	NOT      TokenType = "NOT"
	NULL     TokenType = "NULL"
	TRUE     TokenType = "TRUE"
	FALSE    TokenType = "FALSE"
	IS       TokenType = "IS"
	LIKE     TokenType = "LIKE"
	BETWEEN  TokenType = "BETWEEN"
	IN       TokenType = "IN"
	ASC      TokenType = "ASC"
	DESC     TokenType = "DESC"
)

// keywords はキーワード文字列とトークンタイプのマップです。
var keywords = map[string]TokenType{
	"SELECT": SELECT,
	"FROM":   FROM,
	"WHERE":  WHERE,
	"INSERT": INSERT,
	"INTO":   INTO,
	"VALUES": VALUES,
	"UPDATE": UPDATE,
	"SET":    SET,
	"DELETE": DELETE,
	"CREATE": CREATE,
	"TABLE":  TABLE,
	"INDEX":  INDEX,
	"ON":     ON,
	"AS":     AS,
	"JOIN":   JOIN,
	"LEFT":   LEFT,
	"RIGHT":  RIGHT,
	"INNER":  INNER,
	"OUTER":  OUTER,
	"GROUP":  GROUP,
	"BY":     BY,
	"HAVING": HAVING,
	"ORDER":  ORDER,
	"LIMIT":  LIMIT,
	"AND":    AND,
	"OR":     OR,
	"NOT":    NOT,
	"NULL":   NULL,
	"TRUE":   TRUE,
	"FALSE":  FALSE,
	"IS":     IS,
	"LIKE":   LIKE,
	"BETWEEN": BETWEEN,
	"IN":     IN,
	"ASC":    ASC,
	"DESC":   DESC,
}

// LookupIdent は識別子がキーワードかどうかを判定し、対応するトークンタイプを返します。
// キーワードでない場合は IDENT トークンタイプを返します。
func LookupIdent(ident string) TokenType {
	if tok, ok := keywords[ident]; ok {
		return tok
	}
	return IDENT
}
