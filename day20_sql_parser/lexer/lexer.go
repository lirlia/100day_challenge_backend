package lexer

import (
	"strings"
	"unicode"

	"github.com/your_username/day20_sql_parser/token"
)

// Lexer は SQL 文字列をトークンに分割するレキサーです。
type Lexer struct {
	input        string // 入力 SQL 文字列
	position     int    // 現在の文字の位置 (現在読み込んでいる文字を指す)
	readPosition int    // 次に読み込む文字の位置 (現在の文字の次)
	ch           rune   // 現在検査中の文字
	line         int    // 現在の行番号
	column       int    // 現在の列番号
}

// New は新しい Lexer を作成します。
func New(input string) *Lexer {
	l := &Lexer{input: input, line: 1, column: 0}
	l.readChar() // position, readPosition, ch を初期化
	return l
}

// readChar は入力から次の文字を読み込み、Lexer の状態を更新します。
func (l *Lexer) readChar() {
	if l.readPosition >= len(l.input) {
		l.ch = 0 // EOF (NUL文字で表現)
	} else {
		l.ch = rune(l.input[l.readPosition])
	}
	l.position = l.readPosition
	l.readPosition++

	if l.ch == '\n' {
		l.line++
		l.column = 0
	} else {
		l.column++
	}
}

// peekChar は次の文字を覗き見しますが、位置は進めません。
func (l *Lexer) peekChar() rune {
	if l.readPosition >= len(l.input) {
		return 0
	} else {
		return rune(l.input[l.readPosition])
	}
}

// NextToken は入力から次のトークンを読み取って返します。
func (l *Lexer) NextToken() token.Token {
	var tok token.Token

	l.skipWhitespace()

	startLine := l.line
	startColumn := l.column

	switch l.ch {
	case '=':
		if l.peekChar() == '=' { // Goの比較演算子 ==
			ch := l.ch
			l.readChar()
			literal := string(ch) + string(l.ch)
			tok = token.Token{Type: token.EQ, Literal: literal, Line: startLine, Column: startColumn}
		} else { // SQLの代入/比較 = (パーサーで意味を決定)
			tok = newToken(token.ASSIGN, l.ch, startLine, startColumn)
		}
	case '+':
		tok = newToken(token.PLUS, l.ch, startLine, startColumn)
	case '-':
		tok = newToken(token.MINUS, l.ch, startLine, startColumn)
	case '!':
		if l.peekChar() == '=' { // Goの比較演算子 !=
			ch := l.ch
			l.readChar()
			literal := string(ch) + string(l.ch)
			tok = token.Token{Type: token.NOT_EQ, Literal: literal, Line: startLine, Column: startColumn}
		} else { // NOT はキーワードとして扱う
			tok = newToken(token.ILLEGAL, l.ch, startLine, startColumn) // 単体の ! はSQLでは通常使わない
		}
	case '*':
		tok = newToken(token.ASTERISK, l.ch, startLine, startColumn)
	case '/':
		tok = newToken(token.SLASH, l.ch, startLine, startColumn)
	case '<':
		if l.peekChar() == '=' {
			ch := l.ch
			l.readChar()
			literal := string(ch) + string(l.ch)
			tok = token.Token{Type: token.LT_EQ, Literal: literal, Line: startLine, Column: startColumn}
		} else if l.peekChar() == '>' { // SQLの <> 演算子
			ch := l.ch
			l.readChar()
			literal := string(ch) + string(l.ch)
			tok = token.Token{Type: token.NOT_EQ, Literal: literal, Line: startLine, Column: startColumn} // != と同じ扱い
		} else {
			tok = newToken(token.LT, l.ch, startLine, startColumn)
		}
	case '>':
		if l.peekChar() == '=' {
			ch := l.ch
			l.readChar()
			literal := string(ch) + string(l.ch)
			tok = token.Token{Type: token.GT_EQ, Literal: literal, Line: startLine, Column: startColumn}
		} else {
			tok = newToken(token.GT, l.ch, startLine, startColumn)
		}
	case ',':
		tok = newToken(token.COMMA, l.ch, startLine, startColumn)
	case ';':
		tok = newToken(token.SEMICOLON, l.ch, startLine, startColumn)
	case '(':
		tok = newToken(token.LPAREN, l.ch, startLine, startColumn)
	case ')':
		tok = newToken(token.RPAREN, l.ch, startLine, startColumn)
	case '.':
		tok = newToken(token.DOT, l.ch, startLine, startColumn)
	case '\'': // シングルクォートで囲まれた文字列リテラル
		tok.Type = token.STRING
		tok.Literal = l.readString('\'')
		tok.Line = startLine
		tok.Column = startColumn
	case '"': // ダブルクォートで囲まれた文字列リテラル (方言によるが識別子としても使われる)
		tok.Type = token.STRING // まずは文字列として扱う
		tok.Literal = l.readString('"')
		tok.Line = startLine
		tok.Column = startColumn
	case 0:
		tok.Literal = ""
		tok.Type = token.EOF
		tok.Line = l.line // EOFの位置は最後の行
		tok.Column = l.column
	default:
		if isLetter(l.ch) {
			literal := l.readIdentifier()
			tok.Type = token.LookupIdent(strings.ToUpper(literal)) // SQLキーワードは通常大文字小文字を区別しない
			tok.Literal = literal
			tok.Line = startLine
			tok.Column = startColumn
			return tok // readIdentifier内で readChar を呼ぶため、ここで return
		} else if isDigit(l.ch) {
			tok.Type = token.INT
			tok.Literal = l.readNumber()
			tok.Line = startLine
			tok.Column = startColumn
			return tok // readNumber内で readChar を呼ぶため、ここで return
		} else {
			tok = newToken(token.ILLEGAL, l.ch, startLine, startColumn)
		}
	}

	l.readChar() // 次のトークンのために文字を一つ進める
	return tok
}

// skipWhitespace は空白文字（スペース、タブ、改行）をスキップします。
func (l *Lexer) skipWhitespace() {
	for l.ch == ' ' || l.ch == '\t' || l.ch == '\n' || l.ch == '\r' {
		l.readChar()
	}
}

// readIdentifier は識別子（英字、数字、アンダースコア）を読み取ります。
func (l *Lexer) readIdentifier() string {
	position := l.position
	for isLetter(l.ch) || isDigit(l.ch) || l.ch == '_' {
		l.readChar()
	}
	return l.input[position:l.position]
}

// readNumber は整数リテラルを読み取ります。
func (l *Lexer) readNumber() string {
	position := l.position
	for isDigit(l.ch) {
		l.readChar()
	}
	return l.input[position:l.position]
}

// readString は指定されたクォートで囲まれた文字列リテラルを読み取ります。
func (l *Lexer) readString(quote rune) string {
	position := l.position + 1 // クォートの次の文字から
	for {
		l.readChar()
		if l.ch == quote || l.ch == 0 { // クォートまたはEOFで終了
			break
		}
	}
	// TODO: エスケープシーケンスの処理を追加する ('' など)
	return l.input[position:l.position]
}

// isLetter は文字が英字またはアンダースコアかどうかを判定します。
func isLetter(ch rune) bool {
	return unicode.IsLetter(ch) || ch == '_'
}

// isDigit は文字が数字かどうかを判定します。
func isDigit(ch rune) bool {
	return unicode.IsDigit(ch)
}

// newToken は新しいトークンを作成するヘルパー関数です。
func newToken(tokenType token.TokenType, ch rune, line, column int) token.Token {
	return token.Token{Type: tokenType, Literal: string(ch), Line: line, Column: column}
}
