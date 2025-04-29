package parser

import (
	"fmt"
	"strconv"

	"github.com/your_username/day20_sql_parser/ast"
	"github.com/your_username/day20_sql_parser/lexer"
	"github.com/your_username/day20_sql_parser/token"
)

// 演算子の優先順位
const (
	_ int = iota
	LOWEST
	EQUALS      // =, <>, !=, IS
	LESSGREATER // >, <, >=, <=
	SUM         // +, -
	PRODUCT     // *, /
	PREFIX      // -X または NOT X
	CALL        // myFunction(X)
	INDEX       // array[index]
	ALIAS       // AS
)

// 優先順位マップ (トークンタイプ -> 優先順位)
var precedences = map[token.TokenType]int{
	token.EQ:       EQUALS,
	token.NOT_EQ:   EQUALS,
	token.LT:       LESSGREATER,
	token.GT:       LESSGREATER,
	token.LT_EQ:    LESSGREATER,
	token.GT_EQ:    LESSGREATER,
	token.ASSIGN:   EQUALS, // SQLの = は比較
	token.IS:       EQUALS,
	token.LIKE:     EQUALS,
	token.BETWEEN:  EQUALS,
	token.IN:       EQUALS,
	token.AND:      EQUALS,
	token.OR:       EQUALS,
	token.PLUS:     SUM,
	token.MINUS:    SUM,
	token.SLASH:    PRODUCT,
	token.ASTERISK: PRODUCT,
	token.LPAREN:   CALL,
	token.AS:       ALIAS,
	// token.DOT: INDEX // ドット演算子によるアクセスも考えられる
}

// パーサーの前置および中置構文解析関数用の型定義
type (
	prefixParseFn func() ast.Expression               // 前置構文解析関数 (例: NOT true)
	infixParseFn  func(ast.Expression) ast.Expression // 中置構文解析関数 (例: 5 + 5)
)

// Parser はレキサーからトークンを受け取り、ASTを構築します。
type Parser struct {
	l      *lexer.Lexer
	errors []string

	curToken  token.Token // 現在のトークン
	peekToken token.Token // 次のトークン

	// 各トークンタイプに対応する構文解析関数を保持するマップ
	prefixParseFns map[token.TokenType]prefixParseFn
	infixParseFns  map[token.TokenType]infixParseFn
}

// New は新しい Parser を作成します。
func New(l *lexer.Lexer) *Parser {
	p := &Parser{
		l:      l,
		errors: []string{},
	}

	p.prefixParseFns = make(map[token.TokenType]prefixParseFn)
	p.registerPrefix(token.IDENT, p.parseIdentifier)
	p.registerPrefix(token.INT, p.parseIntegerLiteral)
	p.registerPrefix(token.STRING, p.parseStringLiteral)
	p.registerPrefix(token.TRUE, p.parseBoolean)
	p.registerPrefix(token.FALSE, p.parseBoolean)
	p.registerPrefix(token.BANG, p.parsePrefixExpression) // ! はGo用だが念のため残す -> SQLでは使わない想定
	p.registerPrefix(token.NOT, p.parsePrefixExpression)   // SQLの NOT
	p.registerPrefix(token.MINUS, p.parsePrefixExpression) // - (単項マイナス)
	p.registerPrefix(token.LPAREN, p.parseGroupedExpression)
	p.registerPrefix(token.ASTERISK, p.parseAllColumns) // SELECT * の *
	p.registerPrefix(token.IDENT, p.parseFunctionCallPrefix) // 関数呼び出し IDENT(..) 形式

	p.infixParseFns = make(map[token.TokenType]infixParseFn)
	p.registerInfix(token.PLUS, p.parseInfixExpression)
	p.registerInfix(token.MINUS, p.parseInfixExpression)
	p.registerInfix(token.SLASH, p.parseInfixExpression)
	p.registerInfix(token.ASTERISK, p.parseInfixExpression)
	p.registerInfix(token.EQ, p.parseInfixExpression)     // Goの ==
	p.registerInfix(token.NOT_EQ, p.parseInfixExpression) // Goの != または SQLの <>
	p.registerInfix(token.LT, p.parseInfixExpression)
	p.registerInfix(token.GT, p.parseInfixExpression)
	p.registerInfix(token.LT_EQ, p.parseInfixExpression)
	p.registerInfix(token.GT_EQ, p.parseInfixExpression)
	p.registerInfix(token.ASSIGN, p.parseInfixExpression) // SQLの = 比較
	p.registerInfix(token.AND, p.parseInfixExpression)    // SQLの AND
	p.registerInfix(token.OR, p.parseInfixExpression)     // SQLの OR
	p.registerInfix(token.LIKE, p.parseInfixExpression)   // SQLの LIKE
	p.registerInfix(token.IS, p.parseInfixExpression)     // SQLの IS (例: IS NULL)
	p.registerInfix(token.AS, p.parseAliasExpression)     // AS
	p.registerInfix(token.LPAREN, p.parseFunctionCallInfix) // 関数呼び出し IDENT(..) の '(' を処理
	// TODO: BETWEEN, IN などの中置演算子を追加

	// トークンを2つ読み込んで curToken と peekToken をセットする
	p.nextToken()
	p.nextToken()

	return p
}

// Errors はパース中に発生したエラーのリストを返します。
func (p *Parser) Errors() []string {
	return p.errors
}

// nextToken はレキサーから次のトークンを取得し、p.curToken と p.peekToken を更新します。
func (p *Parser) nextToken() {
	p.curToken = p.peekToken
	p.peekToken = p.l.NextToken()
}

// ParseProgram はSQLプログラム全体をパースし、ASTのルートノード (*ast.Program) を返します。
func (p *Parser) ParseProgram() *ast.Program {
	program := &ast.Program{}
	program.Statements = []ast.Statement{}

	for !p.curTokenIs(token.EOF) {
		stmt := p.parseStatement()

		// stmt が nil インターフェース値か、または非nilインターフェースだが内部ポインタがnilかをチェック
		isNil := stmt == nil
		if !isNil {
			// 型アサーションでポインタ型か確認し、nil チェック
			if selStmt, ok := stmt.(*ast.SelectStatement); ok && selStmt == nil {
				isNil = true
			}
			// TODO: 他のステートメント型も同様にチェックする必要がある
		}

		if !isNil { // isNil が false の場合のみ append
			fmt.Printf("DEBUG: Appending non-nil statement: %T\n", stmt)
			program.Statements = append(program.Statements, stmt)
		} else {
			// デバッグメッセージを修正
			fmt.Printf("DEBUG: ParseProgram encountered nil statement or interface wrapping nil pointer for token: %+v\n", p.curToken)
		}
		p.nextToken()
	}
	return program
}

// parseStatement は現在のトークンに基づいて適切なステートメント解析関数を呼び出します。
func (p *Parser) parseStatement() ast.Statement {
	switch p.curToken.Type {
	case token.SELECT:
		return p.parseSelectStatement()
	// TODO: INSERT, UPDATE, DELETE, CREATE などの他のステートメントをここに追加
	default:
		p.errors = append(p.errors, fmt.Sprintf("unexpected token %s ('%s') found at start of statement (Line: %d, Col: %d)",
            p.curToken.Type, p.curToken.Literal, p.curToken.Line, p.curToken.Column))
		return nil
	}
}

// --- ヘルパー関数 --- //

// curTokenIs は現在のトークンのタイプが期待されるタイプと一致するかどうかを確認します。
func (p *Parser) curTokenIs(t token.TokenType) bool {
	return p.curToken.Type == t
}

// peekTokenIs は次のトークンのタイプが期待されるタイプと一致するかどうかを確認します。
func (p *Parser) peekTokenIs(t token.TokenType) bool {
	return p.peekToken.Type == t
}

// expectPeek は次のトークンのタイプが期待されるタイプと一致するかどうかを確認します。
// 一致する場合はトークンを進め、trueを返します。一致しない場合はエラーを記録し、falseを返します。
func (p *Parser) expectPeek(t token.TokenType) bool {
	if p.peekTokenIs(t) {
		p.nextToken()
		return true
	} else {
		p.peekError(t)
		return false
	}
}

// peekError は次のトークンが期待したものではなかった場合にエラーを追加します。
func (p *Parser) peekError(t token.TokenType) {
	msg := fmt.Sprintf("expected next token to be %s, got %s instead (Line: %d, Col: %d)",
		t, p.peekToken.Type, p.peekToken.Line, p.peekToken.Column)
	p.errors = append(p.errors, msg)
}

// エラーハンドリング: パース関数が見つからない場合
func (p *Parser) noPrefixParseFnError(t token.TokenType) {
	msg := fmt.Sprintf("no prefix parse function for %s ('%s') found (Line: %d, Col: %d)",
		t, p.curToken.Literal, p.curToken.Line, p.curToken.Column)
	p.errors = append(p.errors, msg)
}

// --- パーサー登録関数 --- //

func (p *Parser) registerPrefix(tokenType token.TokenType, fn prefixParseFn) {
	p.prefixParseFns[tokenType] = fn
}

func (p *Parser) registerInfix(tokenType token.TokenType, fn infixParseFn) {
	p.infixParseFns[tokenType] = fn
}

// --- 式のパース --- //

// parseExpression は式をパースします。
// Pratt構文解析のアプローチに基づいています。
func (p *Parser) parseExpression(precedence int) ast.Expression {
	prefix := p.prefixParseFns[p.curToken.Type]
	if prefix == nil {
		p.noPrefixParseFnError(p.curToken.Type)
		return nil
	}
	leftExp := prefix()

	// 中置演算子が続く限りパースを続ける
	for !p.peekTokenIs(token.SEMICOLON) && precedence < p.peekPrecedence() {
		infix := p.infixParseFns[p.peekToken.Type]
		if infix == nil {
			return leftExp
		}

		p.nextToken()
		leftExp = infix(leftExp)
	}

	return leftExp
}

// peekPrecedence は次のトークンの優先順位を返します。
func (p *Parser) peekPrecedence() int {
	if p, ok := precedences[p.peekToken.Type]; ok {
		return p
	}
	return LOWEST
}

// curPrecedence は現在のトークンの優先順位を返します。
func (p *Parser) curPrecedence() int {
	if p, ok := precedences[p.curToken.Type]; ok {
		return p
	}
	return LOWEST
}

// --- 前置パース関数 --- //

func (p *Parser) parseIdentifier() ast.Expression {
	return &ast.Identifier{Token: p.curToken, Value: p.curToken.Literal}
}

func (p *Parser) parseIntegerLiteral() ast.Expression {
	lit := &ast.IntegerLiteral{Token: p.curToken}

	value, err := strconv.ParseInt(p.curToken.Literal, 0, 64)
	if err != nil {
		msg := fmt.Sprintf("could not parse %q as integer (Line: %d, Col: %d)",
			p.curToken.Literal, p.curToken.Line, p.curToken.Column)
		p.errors = append(p.errors, msg)
		return nil
	}
	lit.Value = value
	return lit
}

func (p *Parser) parseStringLiteral() ast.Expression {
	return &ast.StringLiteral{Token: p.curToken, Value: p.curToken.Literal}
}

func (p *Parser) parseBoolean() ast.Expression {
	return &ast.BooleanLiteral{Token: p.curToken, Value: p.curTokenIs(token.TRUE)}
}

func (p *Parser) parsePrefixExpression() ast.Expression {
	expression := &ast.PrefixExpression{
		Token:    p.curToken,
		Operator: p.curToken.Literal,
	}
	p.nextToken()
	expression.Right = p.parseExpression(PREFIX)
	return expression
}

func (p *Parser) parseGroupedExpression() ast.Expression {
	p.nextToken() // '(' を消費

	exp := p.parseExpression(LOWEST)

	if !p.expectPeek(token.RPAREN) {
		return nil // エラー: 閉じ括弧がない
	}
	return exp
}

func (p *Parser) parseAllColumns() ast.Expression {
	// SELECT * のケース。 '*' トークン自体が式として扱われる
    return &ast.AllColumns{Token: p.curToken}
}

// parseFunctionCallPrefix は IDENT(...) 形式の関数呼び出しをパースする前置関数
func (p *Parser) parseFunctionCallPrefix() ast.Expression {
    ident := p.parseIdentifier().(*ast.Identifier)
    // 次が LPAREN でなければ、ただの識別子
    if !p.peekTokenIs(token.LPAREN) {
        return ident
    }
    // IDENT の後に LPAREN が続く場合は、関数呼び出しとして処理
    p.nextToken() // LPAREN へ
    return p.parseFunctionCallInfix(ident)
}

// --- 中置パース関数 --- //

func (p *Parser) parseInfixExpression(left ast.Expression) ast.Expression {
	expression := &ast.InfixExpression{
		Token:    p.curToken,
		Operator: p.curToken.Literal,
		Left:     left,
	}

	precedence := p.curPrecedence()
	p.nextToken()
	expression.Right = p.parseExpression(precedence)

	return expression
}

func (p *Parser) parseAliasExpression(left ast.Expression) ast.Expression {
    // AS の左辺はリテラル、識別子、関数呼び出しなど様々
    // ここでは型チェックは行わず、そのまま受け入れる

    expression := &ast.AliasExpression{
        Token:      p.curToken, // AS token
        Expression: left,
    }

    if !p.expectPeek(token.IDENT) {
        // AS の後にはエイリアス名 (IDENT) が必要
        return nil
    }

    expression.Alias = &ast.Identifier{Token: p.curToken, Value: p.curToken.Literal}

    return expression
}

// parseFunctionCallInfix は IDENT の後にある LPAREN を処理する中置パーサー
func (p *Parser) parseFunctionCallInfix(function ast.Expression) ast.Expression {
    ident, ok := function.(*ast.Identifier)
    if !ok {
        p.errors = append(p.errors, fmt.Sprintf("expected function name identifier before '(', got %T", function))
        return nil
    }

    call := &ast.FunctionCall{
        Token: p.curToken, // LPAREN トークン
        Name:  ident,
    }

    args, err := p.parseExpressionList(token.RPAREN)
    if err != nil {
        // エラーは parseExpressionList 内で記録される
        return nil
    }
    call.Arguments = args

    return call
}

// parseExpressionList は式のリスト（例：関数引数）をパースします。
func (p *Parser) parseExpressionList(end token.TokenType) ([]ast.Expression, error) {
    list := []ast.Expression{}

    if p.peekTokenIs(end) {
        p.nextToken() // 終了トークンを消費
        return list, nil // 空リスト
    }

    p.nextToken() // 最初の引数の開始へ
    expr := p.parseExpression(LOWEST)
    if expr == nil {
        return nil, fmt.Errorf("failed to parse first expression in list")
    }
    list = append(list, expr)

    for p.peekTokenIs(token.COMMA) {
        p.nextToken() // , を消費
        p.nextToken() // 次の引数へ
        expr = p.parseExpression(LOWEST)
        if expr == nil {
             return nil, fmt.Errorf("failed to parse expression after comma in list")
        }
        list = append(list, expr)
    }

    if !p.expectPeek(end) {
        return nil, fmt.Errorf("expected %s at end of expression list, got %s", end, p.peekToken.Type)
    }

    return list, nil
}

// --- ステートメントパース関数 --- //

// parseSelectStatement は SELECT 文をパースします。
func (p *Parser) parseSelectStatement() *ast.SelectStatement {
	stmt := &ast.SelectStatement{Token: p.curToken}

	p.nextToken() // SELECT を消費

	stmt.Columns = p.parseSelectList()

	// parseSelectListの後、curTokenはリストの最後の要素のはず
	// 次のトークンが FROM であることを期待する
	if !p.expectPeek(token.FROM) {
		// FROM が必須でなければエラーメッセージのみ記録
		p.peekError(token.FROM) // FROMがない場合のエラーを具体的に
		// return nil // FROM句がない場合でも解析を続ける場合
	} else {
		// FROM を消費したので、p.curToken は FROM
		// 次のトークン (p.peekToken) がテーブル名 (IDENT) であることを期待
		if !p.peekTokenIs(token.IDENT) {
			p.peekError(token.IDENT) // テーブル名がないエラー
			return nil             // FROM の後にはテーブル名が必須
		}
		p.nextToken() // テーブル名 (IDENT) へ進む
		stmt.From = &ast.Identifier{Token: p.curToken, Value: p.curToken.Literal}
	}

	// WHERE句 (オプション)
	if p.peekTokenIs(token.WHERE) {
		p.nextToken() // WHEREを消費
		p.nextToken() // WHEREの次のトークン (式の開始) へ
		stmt.Where = p.parseExpression(LOWEST)
	}

	// ORDER BY 句のパース (オプション)
	if p.peekTokenIs(token.ORDER) {
		p.nextToken() // ORDER
		if !p.expectPeek(token.BY) {
			return nil // ORDER の後は BY が必須
		}
		// BY を消費したので、curToken は BY
		p.nextToken() // 式の開始へ
		stmt.OrderBy = p.parseOrderByExpressions()
		if stmt.OrderBy == nil { // パースエラーがあればnilが返る
			return nil
		}
	}

	// LIMIT 句のパース (オプション)
	if p.peekTokenIs(token.LIMIT) {
		p.nextToken() // LIMIT へ進む
		stmt.Limit = p.parseLimitClause()
		if stmt.Limit == nil { // パースエラーがあればnilが返る
			return nil
		}
	}

	// 文の終わり (SEMICOLON) を確認する (オプション)
	if p.peekTokenIs(token.SEMICOLON) {
		p.nextToken() // セミコロンを消費
	}

	return stmt // エラーがあってもなくても stmt を返す (エラーは p.errors に蓄積)
}

// parseSelectList は SELECT 文のカラムリストをパースします。
// この関数を抜けるとき、curToken はリストの最後の要素を指している
func (p *Parser) parseSelectList() []ast.Expression {
	list := []ast.Expression{}

	if p.curTokenIs(token.EOF) {
		p.errors = append(p.errors, "unexpected EOF while parsing select list")
		return nil
	}

    // 最初の式をパース
    expr := p.parseExpression(LOWEST)
    if expr == nil {
        return nil // エラーは parseExpression 内で記録される
    }
    list = append(list, expr)

	// コンマが続く限りカラムをパース
	for p.peekTokenIs(token.COMMA) {
		p.nextToken() // , を消費
		p.nextToken() // 次のカラム/式の開始トークンへ
		 expr = p.parseExpression(LOWEST)
        if expr == nil {
            return nil // エラー
        }
		list = append(list, expr)
	}

	return list
}

// parseOrderByExpressions は ORDER BY 句の式リストをパースします。
func (p *Parser) parseOrderByExpressions() []*ast.OrderByExpression {
    expressions := []*ast.OrderByExpression{}

    expr := p.parseOrderByExpression()
    if expr == nil {
        return nil // パースエラー
    }
    expressions = append(expressions, expr)

    for p.peekTokenIs(token.COMMA) {
        p.nextToken() // COMMA
        p.nextToken() // 次の式の開始へ
        expr = p.parseOrderByExpression()
        if expr == nil {
            return nil // パースエラー
        }
        expressions = append(expressions, expr)
    }

    // ORDER BY の後には LIMIT か セミコロン か EOF が来るはず
    // ここで他のキーワードが来たらエラーとするべきかもしれないが、一旦省略

    return expressions
}

// parseOrderByExpression は ORDER BY 句の単一の式 (カラム/式 [ASC|DESC]) をパースします。
func (p *Parser) parseOrderByExpression() *ast.OrderByExpression {
    // curToken は ORDER BY の後の最初の式の開始トークンのはず
    expr := &ast.OrderByExpression{}
    expr.Column = p.parseExpression(LOWEST) // まず式をパース
    if expr.Column == nil {
        return nil // 式のパースに失敗
    }
    expr.Token = expr.Column.TokenLiteral() // 式の開始トークンを設定

    // ASC または DESC をチェック (オプション)
    if p.peekTokenIs(token.ASC) || p.peekTokenIs(token.DESC) {
        p.nextToken()
        // 大文字小文字を区別しないかもしれないので、Literalをそのまま使う
        expr.Direction = p.curToken.Literal
    }

    return expr
}

// parseLimitClause は LIMIT 句をパースします。
func (p *Parser) parseLimitClause() *ast.LimitClause {
    // curToken は LIMIT キーワードのはず
    clause := &ast.LimitClause{Token: p.curToken}
    p.nextToken() // LIMIT の次、値へ

    // LIMIT の値は通常 IntegerLiteral であるべきだが、ここではExpressionとしてパース
    clause.Value = p.parseExpression(LOWEST)
    if clause.Value == nil {
        p.errors = append(p.errors, fmt.Sprintf("Expected expression after LIMIT, got %s (Line: %d, Col: %d)",
             p.curToken.Type, p.curToken.Line, p.curToken.Column))
        return nil
    }

    // バリデーションフェーズで clause.Value が整数リテラルかチェックする
    // TODO: OFFSET のパースを追加するならここ

    return clause
}
