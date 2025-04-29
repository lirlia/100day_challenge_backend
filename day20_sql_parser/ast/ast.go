package ast

import (
	"strings"

	"github.com/your_username/day20_sql_parser/token"
)

// Node はASTのすべてのノードが実装するインターフェースです。
type Node interface {
	TokenLiteral() token.Token // デバッグとテストのためにトークン全体を返すように変更
	String() string
}

// Statement はSQLステートメントを表すノードです。
// (例: SELECT, INSERT, UPDATE, DELETE)
type Statement interface {
	Node
	statementNode()
}

// Expression は値を生成するノードです。
// (例: リテラル, 識別子, 算術式, 比較式)
type Expression interface {
	Node
	expressionNode()
}

// --- Program --- //

// Program はASTのルートノードです。
// 一つ以上のSQLステートメントを含みます。
type Program struct {
	Statements []Statement
}

// TokenLiteral はプログラムの最初のステートメントのトークンリテラルを返します。
// ステートメントがない場合は "" を返します。
func (p *Program) TokenLiteral() token.Token {
	if len(p.Statements) > 0 {
		return p.Statements[0].TokenLiteral()
	}
	return token.Token{} // 空のトークンを返す
}

// String はプログラムのすべてのステートメントの文字列表現を結合して返します。
func (p *Program) String() string {
	var out string
	for _, s := range p.Statements {
		out += s.String() + "\n"
	}
	return out
}

// --- Statements --- //

// SelectStatement は SELECT 文を表します。
// SELECT columns FROM table WHERE condition ORDER BY order LIMIT limit;
type SelectStatement struct {
	Token   token.Token    // SELECT トークン
	Columns []Expression   // SELECT句のカラムリスト (Expression に変更)
	From    *Identifier    // FROM句のテーブル名 ( Identifier のポインタに変更)
	Where   Expression     // WHERE句の条件式 (nil の場合あり)
	OrderBy []*OrderByExpression // ORDER BY 句 (nil の場合あり) - スライスに変更
	Limit   *LimitClause   // LIMIT 句 (nil の場合あり)
	// TODO: JOIN句などを追加
}

func (ss *SelectStatement) statementNode() {}

// TokenLiteral は SELECT トークンのリテラルを返します。
func (ss *SelectStatement) TokenLiteral() token.Token { return ss.Token }

// String は SELECT 文の文字列表現を返します。
func (ss *SelectStatement) String() string {
	var out string
	out += ss.TokenLiteral().Literal + " "

	columns := []string{}
	for _, c := range ss.Columns {
		columns = append(columns, c.String())
	}
	out += strings.Join(columns, ", ")

	if ss.From != nil {
		out += " FROM " + ss.From.String()
	}

	if ss.Where != nil {
		out += " WHERE " + ss.Where.String()
	}

	if len(ss.OrderBy) > 0 {
		out += " ORDER BY "
		orders := []string{}
		for _, ob := range ss.OrderBy {
			orders = append(orders, ob.String())
		}
		out += strings.Join(orders, ", ")
	}

	if ss.Limit != nil {
		out += " " + ss.Limit.String()
	}

	return out
}

// --- Expressions --- //

// Identifier は識別子（テーブル名、カラム名など）を表します。
type Identifier struct {
	Token token.Token // IDENT トークン
	Value string      // 識別子の名前
}

func (i *Identifier) expressionNode() {}

// TokenLiteral は識別子トークンのリテラルを返します。
func (i *Identifier) TokenLiteral() token.Token { return i.Token }

// String は識別子の名前を返します。
func (i *Identifier) String() string { return i.Value }

// IntegerLiteral は整数リテラルを表します。
type IntegerLiteral struct {
	Token token.Token // INT トークン
	Value int64
}

func (il *IntegerLiteral) expressionNode() {}

// TokenLiteral は整数リテラルトークンを返します。
func (il *IntegerLiteral) TokenLiteral() token.Token { return il.Token }

// String は整数リテラルの文字列表現を返します。
func (il *IntegerLiteral) String() string { return il.Token.Literal }

// StringLiteral は文字列リテラルを表します。
type StringLiteral struct {
	Token token.Token // STRING トークン
	Value string
}

func (sl *StringLiteral) expressionNode() {}

// TokenLiteral は文字列リテラルトークンを返します。
func (sl *StringLiteral) TokenLiteral() token.Token { return sl.Token }

// String は文字列リテラルの値（クォートなし）を返します。
func (sl *StringLiteral) String() string { return "'" + sl.Value + "'" } // 表示用にクォートを追加

// BooleanLiteral は真偽値リテラル (TRUE, FALSE) を表します。
type BooleanLiteral struct {
	Token token.Token // TRUE または FALSE トークン
	Value bool
}

func (bl *BooleanLiteral) expressionNode() {}

// TokenLiteral は真偽値リテラルトークンを返します。
func (bl *BooleanLiteral) TokenLiteral() token.Token { return bl.Token }

// String は真偽値リテラルの文字列表現を返します。
func (bl *BooleanLiteral) String() string { return bl.Token.Literal }

// PrefixExpression は前置演算子式を表します。
// (例: -5, NOT TRUE)
type PrefixExpression struct {
	Token    token.Token // 前置演算子トークン (例: "-", "NOT")
	Operator string      // 演算子
	Right    Expression  // 右辺の式
}

func (pe *PrefixExpression) expressionNode() {}

// TokenLiteral は前置演算子トークンを返します。
func (pe *PrefixExpression) TokenLiteral() token.Token { return pe.Token }

// String は前置演算子式の文字列表現を返します。
func (pe *PrefixExpression) String() string {
	return "(" + pe.Operator + pe.Right.String() + ")"
}

// InfixExpression は中置演算子式を表します。
// (例: a + b, x = 10)
type InfixExpression struct {
	Token    token.Token // 中置演算子トークン (例: "+", "=")
	Left     Expression  // 左辺の式
	Operator string      // 演算子
	Right    Expression  // 右辺の式
}

func (ie *InfixExpression) expressionNode() {}

// TokenLiteral は中置演算子トークンを返します。
func (ie *InfixExpression) TokenLiteral() token.Token { return ie.Token }

// String は中置演算子式の文字列表現を返します。
func (ie *InfixExpression) String() string {
	return "(" + ie.Left.String() + " " + ie.Operator + " " + ie.Right.String() + ")"
}

// OrderByExpression は ORDER BY 句内の単一の式を表します。
type OrderByExpression struct {
	Token     token.Token // 最初のトークン（通常は式の一部）
	Column    Expression  // ソート対象のカラムまたは式
	Direction string      // "ASC" または "DESC" (省略時は "ASC")
}

func (oe *OrderByExpression) expressionNode() {}

// TokenLiteral は関連する最初のトークンを返します。
func (oe *OrderByExpression) TokenLiteral() token.Token { return oe.Token }

// String は ORDER BY 式の文字列表現を返します。
func (oe *OrderByExpression) String() string {
	str := oe.Column.String()
	if oe.Direction != "" {
		str += " " + oe.Direction
	}
	return str
}

// LimitClause は LIMIT 句を表します。
type LimitClause struct {
	Token token.Token    // LIMIT トークン
	Value Expression   // 行数を示す式 (通常は IntegerLiteral)
	// TODO: OFFSET のサポート
}

func (lc *LimitClause) expressionNode() {} // Expressionではないが、Walkのため便宜上
func (lc *LimitClause) TokenLiteral() token.Token { return lc.Token }
func (lc *LimitClause) String() string {
	return "LIMIT " + lc.Value.String()
}

// AllColumns は SELECT * の '*' を表します。
type AllColumns struct {
	Token token.Token // ASTERISK トークン
}

func (ac *AllColumns) expressionNode() {}

// TokenLiteral は ASTERISK トークンを返します。
func (ac *AllColumns) TokenLiteral() token.Token { return ac.Token }

// String は "*" を返します。
func (ac *AllColumns) String() string { return "*" }

// FunctionCall は関数呼び出しを表します。
// (例: COUNT(*), SUBSTR(name, 1, 3))
type FunctionCall struct {
	Token     token.Token  // 関数名のトークン (IDENT)
	Name      *Identifier  // 関数名
	Arguments []Expression // 引数のリスト
}

func (fc *FunctionCall) expressionNode() {}

// TokenLiteral は関数名のトークンを返します。
func (fc *FunctionCall) TokenLiteral() token.Token { return fc.Token }

// String は関数呼び出しの文字列表現を返します。
func (fc *FunctionCall) String() string {
	args := []string{}
	for _, a := range fc.Arguments {
		args = append(args, a.String())
	}
	return fc.Name.String() + "(" + strings.Join(args, ", ") + ")"
}

// AliasExpression はカラムや式に別名をつける `AS` 構文を表します。
// (例: column AS alias, expression AS alias)
type AliasExpression struct {
	Token      token.Token // 最初のトークン (式の開始 or AS)
	Expression Expression  // 元の式
	Alias      *Identifier // 別名
}

func (ae *AliasExpression) expressionNode() {}

// TokenLiteral は元の式のトークンを返します。
func (ae *AliasExpression) TokenLiteral() token.Token { return ae.Expression.TokenLiteral() }

// String は `expression AS alias` の形式の文字列表現を返します。
func (ae *AliasExpression) String() string {
	return ae.Expression.String() + " AS " + ae.Alias.String()
}
